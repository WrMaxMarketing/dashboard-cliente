#!/usr/bin/env python3
"""
ETAPA 1 — Validação de acesso à Meta Marketing API (Painel de Tráfego WRMax).

Só leitura. Não grava nada no Supabase nem altera nada na Meta.

  1. GET act_<id> (name, currency, timezone_name, account_status, business)
  2. GET act_<id>/insights — últimos 7 dias, nível campanha — e imprime a
     resposta crua de `actions`, `action_values` e `purchase_roas`.
  3. Resume quais action_types de compra a conta devolve, para escolhermos
     UM deles (sem somar duplicados).

Uso (Python 3.9+, só biblioteca padrão):
    export META_SYSTEM_USER_TOKEN=...        # nunca commitar
    python3 scripts/meta/validate_meta_access.py
    python3 scripts/meta/validate_meta_access.py --account act_2869812946623860 --raw

Variáveis opcionais:
    META_GRAPH_VERSION   (padrão v23.0 — troque pela versão estável mais recente)
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

DEFAULT_ACCOUNT = "act_2869812946623860"  # CA - Forno Paulista
GRAPH_VERSION = os.environ.get("META_GRAPH_VERSION", "v23.0")
BASE = f"https://graph.facebook.com/{GRAPH_VERSION}"

PURCHASE_TYPES = (
    "purchase",
    "omni_purchase",
    "offsite_conversion.fb_pixel_purchase",
    "onsite_web_purchase",
    "onsite_conversion.purchase",
)
FUNNEL_TYPES = (
    "landing_page_view",
    "view_content",
    "omni_view_content",
    "offsite_conversion.fb_pixel_view_content",
    "add_to_cart",
    "omni_add_to_cart",
    "offsite_conversion.fb_pixel_add_to_cart",
    "initiate_checkout",
    "omni_initiated_checkout",
    "offsite_conversion.fb_pixel_initiate_checkout",
)
ACCOUNT_STATUS = {
    1: "ACTIVE", 2: "DISABLED", 3: "UNSETTLED", 7: "PENDING_RISK_REVIEW",
    8: "PENDING_SETTLEMENT", 9: "IN_GRACE_PERIOD", 100: "PENDING_CLOSURE",
    101: "CLOSED", 201: "ANY_ACTIVE", 202: "ANY_CLOSED",
}


def graph_get(path: str, params: dict, token: str, retries: int = 4) -> dict:
    """GET na Graph API com backoff exponencial em rate limit / erro transitório."""
    q = dict(params, access_token=token)
    url = f"{BASE}/{path}?{urllib.parse.urlencode(q)}"
    delay = 2
    for attempt in range(retries + 1):
        try:
            with urllib.request.urlopen(url, timeout=60) as resp:
                usage = resp.headers.get("x-business-use-case-usage")
                if usage:
                    print(f"   [x-business-use-case-usage] {usage}")
                return json.loads(resp.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            body = e.read().decode("utf-8", "replace")
            try:
                err = json.loads(body).get("error", {})
            except json.JSONDecodeError:
                err = {"message": body}
            code = err.get("code")
            # 4/17/32/613/80000-80014 = rate limit; 1/2 = transitório
            transient = code in (1, 2, 4, 17, 32, 613) or (
                isinstance(code, int) and 80000 <= code <= 80014
            )
            if transient and attempt < retries:
                print(f"   rate limit/transitório (code={code}); aguardando {delay}s…")
                time.sleep(delay)
                delay *= 2
                continue
            raise SystemExit(
                "\n❌ ERRO DA META — PARE AQUI e avise a WRMax.\n"
                f"   HTTP {e.code} · code={code} · subcode={err.get('error_subcode')}\n"
                f"   {err.get('message')}\n"
                "   Se for permissão (code 10/200/190/100 com 'permission'), o Usuário do\n"
                "   Sistema precisa receber a conta como ativo no BM correto (lembrete: a API\n"
                "   aponta 'BM 2 - Forno Paulista', mas as campanhas são geridas pelo BM 1)."
            )
        except urllib.error.URLError as e:
            if attempt < retries:
                print(f"   falha de rede ({e.reason}); aguardando {delay}s…")
                time.sleep(delay)
                delay *= 2
                continue
            raise SystemExit(f"❌ Sem conexão com graph.facebook.com: {e.reason}")
    raise SystemExit("❌ Esgotou as tentativas.")


def paginate(path: str, params: dict, token: str) -> list[dict]:
    out: list[dict] = []
    data = graph_get(path, params, token)
    out.extend(data.get("data", []))
    after = data.get("paging", {}).get("cursors", {}).get("after")
    while data.get("paging", {}).get("next") and after:
        data = graph_get(path, dict(params, after=after), token)
        out.extend(data.get("data", []))
        after = data.get("paging", {}).get("cursors", {}).get("after")
    return out


def as_map(items: list[dict] | None) -> dict[str, float]:
    return {i["action_type"]: float(i["value"]) for i in (items or [])}


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--account", default=DEFAULT_ACCOUNT)
    ap.add_argument("--raw", action="store_true", help="imprime o JSON cru completo")
    args = ap.parse_args()

    token = os.environ.get("META_SYSTEM_USER_TOKEN")
    if not token:
        sys.exit("Defina META_SYSTEM_USER_TOKEN no ambiente (nunca no código).")
    account = args.account if args.account.startswith("act_") else f"act_{args.account}"

    print(f"Graph API {GRAPH_VERSION}\n")
    print(f"1) GET {account}")
    acc = graph_get(
        account,
        {"fields": "name,currency,timezone_name,account_status,business{id,name},owner"},
        token,
    )
    status = acc.get("account_status")
    print(json.dumps(acc, ensure_ascii=False, indent=2))
    print(f"   → status: {ACCOUNT_STATUS.get(status, status)}")
    if acc.get("currency") != "BRL" or acc.get("timezone_name") != "America/Fortaleza":
        print("   ⚠️  moeda/fuso diferente do esperado (BRL / America/Fortaleza)")
    print("   ✅ o token enxerga a conta.\n")

    print("2) GET insights · last_7d · level=campaign")
    rows = paginate(
        f"{account}/insights",
        {
            "level": "campaign",
            "date_preset": "last_7d",
            "fields": ",".join([
                "campaign_id", "campaign_name", "spend", "impressions", "reach",
                "frequency", "clicks", "inline_link_clicks", "ctr", "cpc", "cpm",
                "actions", "action_values", "purchase_roas", "website_purchase_roas",
            ]),
            "limit": 100,
        },
        token,
    )
    print(f"   {len(rows)} campanha(s) com entrega no período.\n")

    seen: dict[str, dict[str, float]] = {}
    for r in rows:
        print(f"── {r.get('campaign_name')} ({r.get('campaign_id')}) · spend R$ {r.get('spend')}")
        if args.raw:
            print(json.dumps(r, ensure_ascii=False, indent=2))
        else:
            for key in ("actions", "action_values"):
                m = as_map(r.get(key))
                rel = {k: v for k, v in m.items() if k in PURCHASE_TYPES + FUNNEL_TYPES}
                print(f"   {key}: {json.dumps(rel, ensure_ascii=False)}")
            print(f"   purchase_roas: {json.dumps(r.get('purchase_roas'))}")
        for t, v in as_map(r.get("actions")).items():
            if t in PURCHASE_TYPES:
                seen.setdefault(t, {"count": 0.0, "value": 0.0})["count"] += v
        for t, v in as_map(r.get("action_values")).items():
            if t in PURCHASE_TYPES:
                seen.setdefault(t, {"count": 0.0, "value": 0.0})["value"] += v

    print("\n3) Resumo dos action_types de compra (somatório 7d, NÃO somar entre tipos):")
    for t, agg in sorted(seen.items()):
        print(f"   {t:<42} compras={agg['count']:>7.0f}  valor=R$ {agg['value']:,.2f}")
    if not seen:
        print("   (nenhum action_type de compra retornado)")
    print(
        "\nRecomendação: usar `offsite_conversion.fb_pixel_purchase` (pixel da loja Tuigo)"
        "\nde forma consistente, se ele aparecer acima com os mesmos números de omni_purchase."
    )


if __name__ == "__main__":
    main()
