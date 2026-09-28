"""Cliente mínimo da Meta Marketing API (Graph) com rate limit e async jobs."""
from __future__ import annotations

import json
import os
import time
import urllib.error
import urllib.parse
import urllib.request
from typing import Any, Callable, Iterator

GRAPH_VERSION = os.environ.get("META_GRAPH_VERSION", "v23.0")
BASE = f"https://graph.facebook.com/{GRAPH_VERSION}"

# Códigos de erro de throttling / transitórios da Graph API.
RATE_LIMIT_CODES = {4, 17, 32, 613} | set(range(80000, 80015))
TRANSIENT_CODES = {1, 2}

# Acima desse % de uso (qualquer métrica do header) fazemos uma pausa.
USAGE_PAUSE_PCT = 85


class MetaError(Exception):
    def __init__(self, message: str, code: int | None = None, subcode: int | None = None):
        super().__init__(message)
        self.code = code
        self.subcode = subcode


class RateLimited(MetaError):
    """A Meta pediu para esperar mais do que o orçamento de tempo do job permite."""


def usage_from_headers(headers: Any) -> tuple[float, int]:
    """Retorna (maior % de uso, minutos p/ recuperar acesso) dos headers de uso."""
    top_pct = 0.0
    regain_min = 0
    for name in ("x-business-use-case-usage", "x-ad-account-usage", "x-app-usage"):
        raw = headers.get(name) if headers else None
        if not raw:
            continue
        try:
            data = json.loads(raw)
        except json.JSONDecodeError:
            continue
        entries: list[dict] = []
        if name == "x-business-use-case-usage" and isinstance(data, dict):
            for v in data.values():
                if isinstance(v, list):
                    entries.extend(e for e in v if isinstance(e, dict))
        elif isinstance(data, dict):
            entries.append(data)
        for e in entries:
            for k in ("call_count", "total_cputime", "total_time", "acc_id_util_pct", "call_volume"):
                v = e.get(k)
                if isinstance(v, (int, float)):
                    top_pct = max(top_pct, float(v))
            regain = e.get("estimated_time_to_regain_access") or e.get("reset_time_duration") or 0
            if isinstance(regain, (int, float)):
                regain_min = max(regain_min, int(regain))
    return top_pct, regain_min


class MetaClient:
    def __init__(
        self,
        token: str,
        *,
        deadline: float | None = None,
        sleep: Callable[[float], None] = time.sleep,
        opener: Callable[..., Any] | None = None,
        log: Callable[[str], None] = print,
    ):
        self.token = token
        self.deadline = deadline  # time.monotonic() limite; None = sem limite
        self.sleep = sleep
        self.opener = opener or urllib.request.urlopen
        self.log = log

    # ------------------------------------------------------------ baixo nível
    def _remaining(self) -> float:
        return float("inf") if self.deadline is None else self.deadline - time.monotonic()

    def _wait(self, seconds: float, why: str) -> None:
        if seconds > self._remaining() - 5:
            raise RateLimited(f"{why}: precisaria esperar {seconds:.0f}s, sem tempo no job")
        self.log(f"[meta] {why}; aguardando {seconds:.0f}s")
        self.sleep(seconds)

    def request(self, method: str, path: str, params: dict | None = None, retries: int = 5) -> dict:
        params = dict(params or {})
        params["access_token"] = self.token
        encoded = urllib.parse.urlencode(
            {k: (json.dumps(v) if isinstance(v, (dict, list)) else v) for k, v in params.items()}
        )
        url = path if path.startswith("http") else f"{BASE}/{path.lstrip('/')}"
        delay = 2.0
        for attempt in range(retries + 1):
            if method == "GET":
                req = urllib.request.Request(f"{url}?{encoded}" if "?" not in url else url, method="GET")
            else:
                req = urllib.request.Request(url, data=encoded.encode(), method=method)
            try:
                with self.opener(req, timeout=90) as resp:
                    body = json.loads(resp.read().decode("utf-8"))
                    pct, regain = usage_from_headers(resp.headers)
                    if regain > 0:
                        self._wait(regain * 60, f"uso da API bloqueado por {regain} min")
                    elif pct >= USAGE_PAUSE_PCT:
                        self._wait(min(60.0, 10 + pct / 2), f"uso da API em {pct:.0f}%")
                    return body
            except urllib.error.HTTPError as e:
                raw = e.read().decode("utf-8", "replace")
                try:
                    err = json.loads(raw).get("error", {})
                except json.JSONDecodeError:
                    err = {"message": raw[:500]}
                code = err.get("code")
                msg = err.get("message") or f"HTTP {e.code}"
                retryable = code in RATE_LIMIT_CODES or code in TRANSIENT_CODES or e.code >= 500
                if retryable and attempt < retries:
                    self._wait(delay, f"erro {code or e.code} ({msg[:80]})")
                    delay *= 2
                    continue
                cls = RateLimited if code in RATE_LIMIT_CODES else MetaError
                raise cls(msg, code, err.get("error_subcode")) from None
            except urllib.error.URLError as e:
                if attempt < retries:
                    self._wait(delay, f"falha de rede ({e.reason})")
                    delay *= 2
                    continue
                raise MetaError(f"falha de rede: {e.reason}") from None
        raise MetaError("tentativas esgotadas")

    def get(self, path: str, params: dict | None = None) -> dict:
        return self.request("GET", path, params)

    def paginate(self, path: str, params: dict | None = None) -> Iterator[dict]:
        data = self.get(path, params)
        while True:
            yield from data.get("data", [])
            nxt = data.get("paging", {}).get("next")
            if not nxt:
                return
            # "next" já traz todos os parâmetros (inclusive o token); só seguimos.
            data = self.request("GET", nxt, {})

    # ------------------------------------------------------------ insights
    def insights(self, account_id: str, params: dict, *, use_async: bool = False) -> list[dict]:
        if not use_async:
            return list(self.paginate(f"{account_id}/insights", params))
        run = self.request("POST", f"{account_id}/insights", params)
        run_id = run.get("report_run_id")
        if not run_id:
            raise MetaError(f"async report sem report_run_id: {run}")
        wait = 2.0
        while True:
            status = self.get(run_id, {"fields": "async_status,async_percent_completion"})
            st = status.get("async_status")
            if st == "Job Completed":
                break
            if st in ("Job Failed", "Job Skipped"):
                raise MetaError(f"async report {run_id} terminou como {st}")
            self._wait(wait, f"async report {status.get('async_percent_completion', 0)}%")
            wait = min(wait * 1.5, 20)
        return list(self.paginate(f"{run_id}/insights", {"limit": 500}))
