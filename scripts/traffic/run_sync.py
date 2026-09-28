#!/usr/bin/env python3
"""CLI dos jobs de sync do Painel de Tráfego (mesmo código da função da Vercel).

Uso (Python 3.9+, sem dependências):
    export META_SYSTEM_USER_TOKEN=...            # nunca commitar
    export NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
    export SUPABASE_SERVICE_ROLE_KEY=...

    python3 scripts/traffic/run_sync.py backfill                 # 90 dias, todas as contas ativas
    python3 scripts/traffic/run_sync.py backfill --days 30 --account act_2869812946623860
    python3 scripts/traffic/run_sync.py daily
    python3 scripts/traffic/run_sync.py intraday
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from datetime import date

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.join(ROOT, "api"))

from _traffic.jobs import run  # noqa: E402
from _traffic.meta import MetaClient  # noqa: E402
from _traffic.store import SupabaseStore  # noqa: E402


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("job", choices=["intraday", "daily", "backfill"])
    ap.add_argument("--account", help="act_... (padrão: todas as contas ativas)")
    ap.add_argument("--days", type=int, default=90)
    ap.add_argument("--since", type=date.fromisoformat)
    ap.add_argument("--until", type=date.fromisoformat)
    args = ap.parse_args()

    token = os.environ.get("META_SYSTEM_USER_TOKEN")
    if not token:
        sys.exit("Defina META_SYSTEM_USER_TOKEN no ambiente.")
    results = run(args.job, meta=MetaClient(token), store=SupabaseStore(), only_account=args.account,
                  days=args.days, since=args.since, until=args.until)
    print(json.dumps(results, ensure_ascii=False, indent=2))
    if any(r.get("status") != "success" for r in results):
        sys.exit(1)


if __name__ == "__main__":
    main()
