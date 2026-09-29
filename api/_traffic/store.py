"""Acesso ao Supabase via PostgREST com a service role (só servidor)."""
from __future__ import annotations

import http.client
import json
import time
import os
import urllib.error
import urllib.parse
import urllib.request
from typing import Any, Callable


class StoreError(Exception):
    pass


class SupabaseStore:
    def __init__(self, url: str | None = None, key: str | None = None, opener: Callable[..., Any] | None = None):
        url = url or os.environ.get("SUPABASE_URL") or os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
        key = key or os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
        if not url or not key:
            raise StoreError("Faltam NEXT_PUBLIC_SUPABASE_URL e/ou SUPABASE_SERVICE_ROLE_KEY")
        self.base = url.rstrip("/") + "/rest/v1"
        self.key = key
        self.opener = opener or urllib.request.urlopen

    def _call(self, method: str, table: str, *, query: dict | None = None, body: Any = None, prefer: str = "") -> Any:
        url = f"{self.base}/{table}"
        if query:
            url += "?" + urllib.parse.urlencode(query)
        headers = {
            "apikey": self.key,
            "Authorization": f"Bearer {self.key}",
            "Content-Type": "application/json",
        }
        if prefer:
            headers["Prefer"] = prefer
        data = json.dumps(body, default=str).encode() if body is not None else None
        for attempt in range(4):
            req = urllib.request.Request(url, data=data, headers=headers, method=method)
            try:
                with self.opener(req, timeout=60) as resp:
                    raw = resp.read().decode("utf-8")
                    return json.loads(raw) if raw else None
            except urllib.error.HTTPError as e:
                if e.code >= 500 and attempt < 3:
                    time.sleep(2 ** attempt)
                    continue
                raise StoreError(f"{method} {table}: HTTP {e.code} {e.read().decode('utf-8', 'replace')[:500]}") from None
            except (urllib.error.URLError, TimeoutError, ConnectionError, http.client.HTTPException) as e:
                if attempt < 3:
                    time.sleep(2 ** attempt)
                    continue
                raise StoreError(f"{method} {table}: falha de rede {getattr(e, 'reason', e)}") from None

    def select(self, table: str, query: dict) -> list[dict]:
        return self._call("GET", table, query=query) or []

    def upsert(self, table: str, rows: list[dict], on_conflict: str, chunk: int = 500) -> int:
        if not rows:
            return 0
        # PostgREST exige o mesmo conjunto de chaves em todos os objetos do lote.
        keys = sorted({k for r in rows for k in r})
        norm = [{k: r.get(k) for k in keys} for r in rows]
        for i in range(0, len(norm), chunk):
            self._call(
                "POST", table,
                query={"on_conflict": on_conflict},
                body=norm[i:i + chunk],
                prefer="resolution=merge-duplicates,return=minimal",
            )
        return len(norm)

    def insert_ignore(self, table: str, rows: list[dict], on_conflict: str) -> int:
        """Insere só o que não existe (não sobrescreve metadados já sincronizados)."""
        if not rows:
            return 0
        keys = sorted({k for r in rows for k in r})
        self._call("POST", table, query={"on_conflict": on_conflict},
                   body=[{k: r.get(k) for k in keys} for r in rows],
                   prefer="resolution=ignore-duplicates,return=minimal")
        return len(rows)

    def insert_returning(self, table: str, row: dict) -> dict:
        out = self._call("POST", table, body=row, prefer="return=representation")
        return out[0] if isinstance(out, list) and out else {}

    def update(self, table: str, match: dict, values: dict) -> None:
        self._call("PATCH", table, query={k: f"eq.{v}" for k, v in match.items()}, body=values, prefer="return=minimal")
