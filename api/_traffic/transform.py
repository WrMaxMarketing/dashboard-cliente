"""Transformações puras: action_types, métricas, unidades e datas no fuso do cliente."""
from __future__ import annotations

import re
import unicodedata
from datetime import date, datetime, timedelta, timezone, tzinfo

try:
    from zoneinfo import ZoneInfo
except ImportError:  # pragma: no cover
    ZoneInfo = None  # type: ignore

# Fusos sem horário de verão usados pelos clientes (fallback se o runtime não tiver tzdata).
FIXED_OFFSETS = {
    "America/Fortaleza": -3, "America/Sao_Paulo": -3, "America/Recife": -3,
    "America/Belem": -3, "America/Bahia": -3, "America/Maceio": -3,
    "America/Manaus": -4, "America/Cuiaba": -4, "America/Rio_Branco": -5,
}


def client_tz(name: str) -> tzinfo:
    if ZoneInfo is not None:
        try:
            return ZoneInfo(name)
        except Exception:
            pass
    return timezone(timedelta(hours=FIXED_OFFSETS.get(name, -3)))


def today_in(tz_name: str, now: datetime | None = None) -> date:
    now = now or datetime.now(timezone.utc)
    return now.astimezone(client_tz(tz_name)).date()


# ---------------------------------------------------------------- action types
# Família de eventos do funil coerente com o action_type de compra escolhido,
# para NUNCA misturar pixel com omni (que duplicariam contagens).
FUNNEL_FAMILIES = {
    "offsite_conversion.fb_pixel_purchase": {
        "view_content": "offsite_conversion.fb_pixel_view_content",
        "add_to_cart": "offsite_conversion.fb_pixel_add_to_cart",
        "initiate_checkout": "offsite_conversion.fb_pixel_initiate_checkout",
        "landing_page_views": "landing_page_view",
    },
    "omni_purchase": {
        "view_content": "omni_view_content",
        "add_to_cart": "omni_add_to_cart",
        "initiate_checkout": "omni_initiated_checkout",
        "landing_page_views": "omni_landing_page_view",
    },
    "purchase": {
        "view_content": "view_content",
        "add_to_cart": "add_to_cart",
        "initiate_checkout": "initiate_checkout",
        "landing_page_views": "landing_page_view",
    },
}


def _action_map(items: list[dict] | None) -> dict[str, float]:
    out: dict[str, float] = {}
    for it in items or []:
        try:
            out[it["action_type"]] = float(it.get("value", 0) or 0)
        except (KeyError, TypeError, ValueError):
            continue
    return out


def _f(v) -> float:
    try:
        return float(v)
    except (TypeError, ValueError):
        return 0.0


def _opt(v) -> float | None:
    try:
        return None if v is None or v == "" else float(v)
    except (TypeError, ValueError):
        return None


def metrics_from_insight(row: dict, purchase_type: str) -> dict:
    """Converte uma linha de /insights nas colunas numéricas do painel."""
    family = FUNNEL_FAMILIES.get(purchase_type, FUNNEL_FAMILIES["offsite_conversion.fb_pixel_purchase"])
    actions = _action_map(row.get("actions"))
    values = _action_map(row.get("action_values"))
    spend = round(_f(row.get("spend")), 2)
    impressions = int(_f(row.get("impressions")))
    link_clicks = int(_f(row.get("inline_link_clicks")))
    purchases = int(actions.get(purchase_type, 0))
    purchase_value = round(values.get(purchase_type, 0.0), 2)
    lpv = actions.get(family["landing_page_views"])
    if lpv is None and family["landing_page_views"] != "landing_page_view":
        lpv = actions.get("landing_page_view")
    return {
        "spend": spend,
        "impressions": impressions,
        "reach": int(_f(row["reach"])) if row.get("reach") not in (None, "") else None,
        "frequency": _opt(row.get("frequency")),
        "clicks": int(_f(row.get("clicks"))),
        "link_clicks": link_clicks,
        # CTR/CPC do painel são "de link" (inline_link_click_ctr / cost_per_inline_link_click)
        "ctr": _opt(row.get("inline_link_click_ctr")),
        "cpc": _opt(row.get("cost_per_inline_link_click")),
        "cpm": _opt(row.get("cpm")),
        "landing_page_views": int(lpv or 0),
        "view_content": int(actions.get(family["view_content"], 0)),
        "add_to_cart": int(actions.get(family["add_to_cart"], 0)),
        "initiate_checkout": int(actions.get(family["initiate_checkout"], 0)),
        "purchases": purchases,
        "purchase_value": purchase_value,
        # ROAS calculado com o MESMO action_type de compra (não usamos purchase_roas).
        "roas": round(purchase_value / spend, 4) if spend > 0 else None,
    }


def parse_hour(bucket: str | None) -> int | None:
    """'13:00:00 - 13:59:59' -> 13."""
    if not bucket:
        return None
    m = re.match(r"\s*(\d{1,2}):", bucket)
    return int(m.group(1)) if m else None


# ---------------------------------------------------------------- unidades
def normalize(text: str | None) -> str:
    t = unicodedata.normalize("NFKD", text or "")
    t = "".join(c for c in t if not unicodedata.combining(c)).lower()
    t = re.sub(r"[_\-\[\]\(\)\|/.,:;]+", " ", t)
    return re.sub(r"\s+", " ", t).strip()


class UnitMapper:
    DEFAULT = "Geral"

    def __init__(self, mapping: list[dict]):
        rules = sorted(mapping, key=lambda m: (m.get("prioridade", 100), -len(m.get("pattern", ""))))
        self.rules = [
            (re.compile(r"(?<![a-z0-9])" + re.escape(normalize(m["pattern"])) + r"(?![a-z0-9])"), m["unidade"])
            for m in rules if normalize(m.get("pattern"))
        ]

    def match(self, *names: str | None) -> str | None:
        for name in names:
            n = normalize(name)
            if not n:
                continue
            for rx, unidade in self.rules:
                if rx.search(n):
                    return unidade
        return None

    def unit_for(self, *names: str | None, fallback: str | None = None) -> str:
        return self.match(*names) or fallback or self.DEFAULT


def minor_to_major(v) -> float | None:
    """Orçamentos vêm em centavos (string)."""
    try:
        return round(int(v) / 100, 2) if v not in (None, "") else None
    except (TypeError, ValueError):
        return None


def daterange_chunks(since: date, until: date, days: int) -> list[tuple[date, date]]:
    out = []
    cur = since
    while cur <= until:
        end = min(cur + timedelta(days=days - 1), until)
        out.append((cur, end))
        cur = end + timedelta(days=1)
    return out
