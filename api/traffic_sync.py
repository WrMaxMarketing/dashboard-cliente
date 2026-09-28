"""Vercel Python Function — /api/traffic_sync

Disparada pelo Vercel Cron (ver vercel.json):
  GET /api/traffic_sync?job=intraday   a cada 15 min  (hoje: horário + campanhas)
  GET /api/traffic_sync?job=daily      madrugada      (re-sync dos últimos 7 dias)
Manual (admin):
  GET /api/traffic_sync?job=backfill&since=YYYY-MM-DD&until=YYYY-MM-DD[&account=act_...]
  (para 90 dias completos prefira o CLI: scripts/traffic/run_sync.py backfill)

Autenticação: header "Authorization: Bearer $CRON_SECRET" (a Vercel envia
automaticamente nos crons quando CRON_SECRET está definida no projeto).
"""
from __future__ import annotations

import hmac
import json
import os
import sys
import time
from datetime import date
from http.server import BaseHTTPRequestHandler
from urllib.parse import parse_qs, urlparse

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from _traffic.jobs import run  # noqa: E402
from _traffic.meta import MetaClient  # noqa: E402
from _traffic.store import SupabaseStore  # noqa: E402

# Orçamento de tempo: deixa folga antes do maxDuration da função (vercel.json).
TIME_BUDGET_S = int(os.environ.get("TRAFFIC_SYNC_TIME_BUDGET", "270"))


def _authorized(header: str | None) -> bool:
    secret = os.environ.get("CRON_SECRET", "")
    if not secret or not header:
        return False
    return hmac.compare_digest(header.encode(), f"Bearer {secret}".encode())


class handler(BaseHTTPRequestHandler):  # noqa: N801 — nome exigido pela Vercel
    def _send(self, status: int, payload: dict) -> None:
        body = json.dumps(payload, ensure_ascii=False, default=str).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self) -> None:  # noqa: N802
        if not _authorized(self.headers.get("Authorization")):
            self._send(401, {"error": "unauthorized"})
            return
        qs = {k: v[0] for k, v in parse_qs(urlparse(self.path).query).items()}
        job = qs.get("job", "intraday")
        if job not in ("intraday", "daily", "backfill"):
            self._send(400, {"error": "job inválido"})
            return
        token = os.environ.get("META_SYSTEM_USER_TOKEN")
        if not token:
            self._send(500, {"error": "META_SYSTEM_USER_TOKEN ausente"})
            return
        try:
            since = date.fromisoformat(qs["since"]) if qs.get("since") else None
            until = date.fromisoformat(qs["until"]) if qs.get("until") else None
        except ValueError:
            self._send(400, {"error": "since/until devem ser YYYY-MM-DD"})
            return
        started = time.monotonic()
        meta = MetaClient(token, deadline=started + TIME_BUDGET_S)
        try:
            results = run(job, meta=meta, store=SupabaseStore(), only_account=qs.get("account"),
                          since=since, until=until, days=int(qs.get("days", "90")))
        except Exception as e:  # noqa: BLE001
            self._send(500, {"error": f"{type(e).__name__}: {e}"})
            return
        failed = [r for r in results if r.get("status") != "success"]
        self._send(500 if failed else 200, {
            "job": job, "seconds": round(time.monotonic() - started, 1), "results": results,
        })
