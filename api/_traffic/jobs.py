"""Jobs de sincronização: intraday (15 min), daily (madrugada) e backfill (90 dias)."""
from __future__ import annotations

import time
import traceback
from datetime import date, datetime, timedelta, timezone
from typing import Callable

from .meta import MetaClient
from .store import SupabaseStore
from .transform import (
    UnitMapper,
    client_tz,
    daterange_chunks,
    metrics_from_insight,
    minor_to_major,
    parse_hour,
    today_in,
)

LEVELS = ("account", "campaign", "adset", "ad")
INSIGHT_FIELDS = [
    "account_id", "campaign_id", "campaign_name", "adset_id", "adset_name", "ad_id", "ad_name", "date_start",
    "spend", "impressions", "reach", "frequency", "clicks", "inline_link_clicks",
    "inline_link_click_ctr", "cost_per_inline_link_click", "cpm",
    "actions", "action_values",
]
HOURLY_FIELDS = ["spend", "impressions", "clicks", "inline_link_clicks", "actions", "action_values"]
HOURLY_BREAKDOWN = "hourly_stats_aggregated_by_advertiser_time_zone"


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


class AccountSync:
    """Sincroniza UMA conta de anúncio. Estado de unidades/metadados fica em memória."""

    def __init__(self, meta: MetaClient, store: SupabaseStore, account: dict, client: dict,
                 mapping: list[dict], log: Callable[[str], None] = print):
        self.meta = meta
        self.store = store
        self.account_id = account["account_id"]
        self.client = client
        self.tz = client.get("fuso") or account.get("timezone") or "America/Fortaleza"
        self.purchase_type = client.get("purchase_action_type") or "offsite_conversion.fb_pixel_purchase"
        self.units = UnitMapper(mapping)
        self.log = log
        self.unit_by_campaign: dict[str, str] = {}
        self.unit_by_adset: dict[str, str] = {}
        self.unit_by_ad: dict[str, str] = {}
        self.rows = 0

    # ------------------------------------------------------------ metadados
    def sync_metadata(self) -> None:
        now = _now_iso()
        camps = []
        for c in self.meta.paginate(f"{self.account_id}/campaigns", {
            "fields": "id,name,status,effective_status,objective,daily_budget,lifetime_budget,created_time",
            "limit": 500,
        }):
            unidade = self.units.unit_for(c.get("name"))
            self.unit_by_campaign[c["id"]] = unidade
            camps.append({
                "campaign_id": c["id"], "account_id": self.account_id, "name": c.get("name"),
                "status": c.get("status"), "effective_status": c.get("effective_status"),
                "objective": c.get("objective"),
                "daily_budget": minor_to_major(c.get("daily_budget")),
                "lifetime_budget": minor_to_major(c.get("lifetime_budget")),
                "unidade": unidade, "created_time": c.get("created_time"), "updated_at": now,
            })
        self.rows += self.store.upsert("traffic_campaigns", camps, "campaign_id")

        adsets = []
        for s in self.meta.paginate(f"{self.account_id}/adsets", {
            "fields": "id,name,campaign_id,status,effective_status,daily_budget,lifetime_budget",
            "limit": 500,
        }):
            unidade = self.units.unit_for(s.get("name"), fallback=self.unit_by_campaign.get(s.get("campaign_id")))
            self.unit_by_adset[s["id"]] = unidade
            adsets.append({
                "adset_id": s["id"], "account_id": self.account_id, "campaign_id": s.get("campaign_id"),
                "name": s.get("name"), "status": s.get("status"),
                "effective_status": s.get("effective_status"),
                "daily_budget": minor_to_major(s.get("daily_budget")),
                "lifetime_budget": minor_to_major(s.get("lifetime_budget")),
                "unidade": unidade, "updated_at": now,
            })
        self.rows += self.store.upsert("traffic_adsets", adsets, "adset_id")

        ads = []
        for a in self.meta.paginate(f"{self.account_id}/ads", {
            "fields": "id,name,campaign_id,adset_id,status,effective_status,creative{id,thumbnail_url,image_url}",
            "thumbnail_width": 320, "thumbnail_height": 320,
            "limit": 200,
        }):
            cr = a.get("creative") or {}
            unidade = self.unit_by_adset.get(a.get("adset_id")) or self.unit_by_campaign.get(a.get("campaign_id")) or UnitMapper.DEFAULT
            self.unit_by_ad[a["id"]] = unidade
            ads.append({
                "ad_id": a["id"], "account_id": self.account_id,
                "campaign_id": a.get("campaign_id"), "adset_id": a.get("adset_id"),
                "name": a.get("name"), "status": a.get("status"),
                "effective_status": a.get("effective_status"),
                "creative_id": cr.get("id"),
                "thumbnail_url": cr.get("thumbnail_url") or cr.get("image_url"),
                "unidade": unidade, "updated_at": now,
            })
        self.rows += self.store.upsert("traffic_ads", ads, "ad_id")
        self.log(f"[{self.account_id}] metadados: {len(camps)} campanhas, {len(adsets)} conjuntos, {len(ads)} anúncios")

    def _ensure_units(self) -> None:
        """Carrega unidades do banco quando o job não sincronizou metadados agora."""
        if self.unit_by_campaign:
            return
        for c in self.store.select("traffic_campaigns", {"select": "campaign_id,unidade", "account_id": f"eq.{self.account_id}"}):
            self.unit_by_campaign[c["campaign_id"]] = c.get("unidade") or UnitMapper.DEFAULT
        for s in self.store.select("traffic_adsets", {"select": "adset_id,unidade", "account_id": f"eq.{self.account_id}"}):
            self.unit_by_adset[s["adset_id"]] = s.get("unidade") or UnitMapper.DEFAULT
        for a in self.store.select("traffic_ads", {"select": "ad_id,unidade", "account_id": f"eq.{self.account_id}"}):
            self.unit_by_ad[a["ad_id"]] = a.get("unidade") or UnitMapper.DEFAULT

    # ------------------------------------------------------------ insights diários
    def _unit_for_row(self, level: str, r: dict) -> str | None:
        if level == "campaign":
            return self.unit_by_campaign.get(r.get("campaign_id"), UnitMapper.DEFAULT)
        if level == "adset":
            return self.unit_by_adset.get(r.get("adset_id")) or self.unit_by_campaign.get(r.get("campaign_id"), UnitMapper.DEFAULT)
        if level == "ad":
            return (self.unit_by_ad.get(r.get("ad_id")) or self.unit_by_adset.get(r.get("adset_id"))
                    or self.unit_by_campaign.get(r.get("campaign_id"), UnitMapper.DEFAULT))
        return None

    def sync_daily(self, since: date, until: date, *, use_async: bool = False) -> None:
        self._ensure_units()
        now = _now_iso()
        for level in LEVELS:
            fields = [f for f in INSIGHT_FIELDS if not (
                (f.startswith("campaign_") and level == "account") or
                (f.startswith("adset_") and level in ("account", "campaign")) or
                (f.startswith("ad_") and level != "ad"))]
            raw = self.meta.insights(self.account_id, {
                "level": level,
                "time_range": {"since": since.isoformat(), "until": until.isoformat()},
                "time_increment": 1,
                "fields": ",".join(fields),
                "use_account_attribution_setting": "true",
                "limit": 500,
            }, use_async=use_async)
            self._learn_missing(level, raw)
            out = []
            for r in raw:
                out.append({
                    "account_id": self.account_id,
                    "level": level,
                    "campaign_id": r.get("campaign_id", "") if level != "account" else "",
                    "adset_id": r.get("adset_id", "") if level in ("adset", "ad") else "",
                    "ad_id": r.get("ad_id", "") if level == "ad" else "",
                    "date": r["date_start"],
                    "unidade": self._unit_for_row(level, r),
                    **metrics_from_insight(r, self.purchase_type),
                    "synced_at": now,
                })
            self.rows += self.store.upsert(
                "traffic_insights_daily", out, "account_id,level,campaign_id,adset_id,ad_id,date")
            self.log(f"[{self.account_id}] {level} {since}..{until}: {len(out)} linhas")

    def _learn_missing(self, level: str, raw: list[dict]) -> None:
        """Objetos arquivados/excluídos não vêm nas listas de metadados, mas os insights
        trazem o nome: criamos o metadado mínimo (sem sobrescrever o que já existe) e
        derivamos a unidade pelo nome, para não caírem em "Geral" nem aparecerem só com ID."""
        now = _now_iso()
        camps, sets, ads = {}, {}, {}
        for r in raw:
            cid = r.get("campaign_id")
            if cid and cid not in self.unit_by_campaign and level != "account":
                self.unit_by_campaign[cid] = self.units.unit_for(r.get("campaign_name"))
                camps[cid] = {"campaign_id": cid, "account_id": self.account_id, "name": r.get("campaign_name"),
                              "unidade": self.unit_by_campaign[cid], "updated_at": now}
            sid = r.get("adset_id")
            if sid and sid not in self.unit_by_adset and level in ("adset", "ad"):
                self.unit_by_adset[sid] = self.units.unit_for(
                    r.get("adset_name"), fallback=self.unit_by_campaign.get(cid))
                sets[sid] = {"adset_id": sid, "account_id": self.account_id, "campaign_id": cid,
                             "name": r.get("adset_name"), "unidade": self.unit_by_adset[sid], "updated_at": now}
            aid = r.get("ad_id")
            if aid and aid not in self.unit_by_ad and level == "ad":
                self.unit_by_ad[aid] = self.unit_by_adset.get(sid) or self.unit_by_campaign.get(cid) or UnitMapper.DEFAULT
                ads[aid] = {"ad_id": aid, "account_id": self.account_id, "campaign_id": cid, "adset_id": sid,
                            "name": r.get("ad_name"), "unidade": self.unit_by_ad[aid], "updated_at": now}
        self.store.insert_ignore("traffic_campaigns", list(camps.values()), "campaign_id")
        self.store.insert_ignore("traffic_adsets", list(sets.values()), "adset_id")
        self.store.insert_ignore("traffic_ads", list(ads.values()), "ad_id")

    # ------------------------------------------------------------ por hora
    def sync_hourly(self, day: date) -> None:
        raw = self.meta.insights(self.account_id, {
            "level": "account",
            "time_range": {"since": day.isoformat(), "until": day.isoformat()},
            "breakdowns": HOURLY_BREAKDOWN,
            "fields": ",".join(HOURLY_FIELDS),
            "use_account_attribution_setting": "true",
            "limit": 100,
        })
        now = _now_iso()
        out = []
        for r in raw:
            hour = parse_hour(r.get(HOURLY_BREAKDOWN))
            if hour is None:
                continue
            m = metrics_from_insight(r, self.purchase_type)
            out.append({
                "account_id": self.account_id, "date": day.isoformat(), "hour": hour,
                "spend": m["spend"], "impressions": m["impressions"], "clicks": m["clicks"],
                "link_clicks": m["link_clicks"], "purchases": m["purchases"],
                "purchase_value": m["purchase_value"], "synced_at": now,
            })
        self.rows += self.store.upsert("traffic_insights_hourly", out, "account_id,date,hour")
        self.log(f"[{self.account_id}] horário {day}: {len(out)} horas")

    # ------------------------------------------------------------ frequência 7d
    def sync_snapshots(self) -> None:
        """Reach/frequência não somam por dia: guardamos o recorte de 7 dias pronto."""
        now = _now_iso()
        acc = self.meta.insights(self.account_id, {
            "level": "account", "date_preset": "last_7d", "fields": "reach,frequency",
        })
        if acc:
            self.store.update("traffic_ad_accounts", {"account_id": self.account_id}, {
                "frequency_7d": acc[0].get("frequency"), "reach_7d": acc[0].get("reach"), "snapshot_at": now,
            })
        # Conjunto sem entrega nos últimos 7 dias não volta na resposta: zera o valor
        # antigo para não manter um alerta de fadiga "fantasma".
        self.store.update("traffic_adsets", {"account_id": self.account_id}, {"frequency_7d": None, "reach_7d": None})
        rows = self.meta.insights(self.account_id, {
            "level": "adset", "date_preset": "last_7d",
            "fields": "adset_id,campaign_id,reach,frequency", "limit": 500,
        })
        self.rows += self.store.upsert("traffic_adsets", [
            {"adset_id": r["adset_id"], "account_id": self.account_id,
             "frequency_7d": r.get("frequency"), "reach_7d": r.get("reach")}
            for r in rows if r.get("adset_id")
        ], "adset_id")


# ====================================================================== runner
def _load_accounts(store: SupabaseStore, only_account: str | None = None) -> list[tuple[dict, dict, list[dict]]]:
    query = {"select": "account_id,timezone,client_id,ativo,traffic_clients(*)", "ativo": "eq.true", "platform": "eq.meta"}
    if only_account:
        query["account_id"] = f"eq.{only_account}"
    accounts = store.select("traffic_ad_accounts", query)
    out = []
    for a in accounts:
        client = a.get("traffic_clients") or {}
        if not client.get("ativo", True):
            continue
        mapping = store.select("traffic_unit_mapping", {
            "select": "pattern,unidade,prioridade", "client_id": f"eq.{a['client_id']}",
        })
        out.append((a, client, mapping))
    return out


def run(job: str, *, meta: MetaClient, store: SupabaseStore, only_account: str | None = None,
        days: int = 90, since: date | None = None, until: date | None = None,
        log: Callable[[str], None] = print) -> list[dict]:
    """Executa o job para todas as contas ativas. Um erro numa conta não derruba as outras."""
    results = []
    for account, client, mapping in _load_accounts(store, only_account):
        acc_id = account["account_id"]
        try:
            entry = store.insert_returning("traffic_sync_log", {"account_id": acc_id, "job": job, "status": "running"})
        except Exception:  # noqa: BLE001 — sem log não impede o sync
            log(traceback.format_exc())
            entry = {}

        def finish(values: dict) -> None:
            if not entry.get("id"):
                return
            try:
                store.update("traffic_sync_log", {"id": entry["id"]}, values)
            except Exception:  # noqa: BLE001 — falha no log não derruba as outras contas
                log(traceback.format_exc())

        sync = AccountSync(meta, store, account, client, mapping, log=log)
        t0 = time.monotonic()
        try:
            today = today_in(sync.tz)
            if job == "intraday":
                sync.sync_metadata()
                sync.sync_daily(today, today)
                sync.sync_hourly(today)
                # Até 3h da manhã (fuso do cliente) a Meta ainda fecha o dia anterior.
                if datetime.now(timezone.utc).astimezone(client_tz(sync.tz)).hour < 3:
                    sync.sync_daily(today - timedelta(days=1), today - timedelta(days=1))
                    sync.sync_hourly(today - timedelta(days=1))
                sync.sync_snapshots()
            elif job == "daily":
                # Único cron do dia: re-sync dos últimos 7 dias (a Meta ajusta conversões
                # retroativamente) + o parcial de hoje.
                sync.sync_metadata()
                sync.sync_daily(today - timedelta(days=7), today)
                sync.sync_hourly(today - timedelta(days=1))
                sync.sync_hourly(today)
                sync.sync_snapshots()
            elif job == "backfill":
                sync.sync_metadata()
                start = since or (today - timedelta(days=days))
                end = until or today
                for a, b in daterange_chunks(start, end, 15):
                    sync.sync_daily(a, b, use_async=True)
            else:
                raise ValueError(f"job desconhecido: {job}")
            finish({"status": "success", "finished_at": _now_iso(), "rows_written": sync.rows})
            results.append({"account_id": acc_id, "status": "success", "rows": sync.rows,
                            "seconds": round(time.monotonic() - t0, 1)})
        except Exception as e:  # noqa: BLE001 — qualquer falha vai para o traffic_sync_log
            log(traceback.format_exc())
            finish({"status": "error", "finished_at": _now_iso(), "rows_written": sync.rows,
                    "error": f"{type(e).__name__}: {e}"[:2000]})
            results.append({"account_id": acc_id, "status": "error", "error": str(e)})
    return results
