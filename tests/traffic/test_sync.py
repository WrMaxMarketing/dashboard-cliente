"""Testes do sync (stdlib unittest).

    python3 -m unittest discover -s tests/traffic -v

O teste ponta a ponta só roda se TRAFFIC_TEST_PG (DSN do psql) estiver definido:
ele aplica a migration num Postgres local com stub do schema auth do Supabase.
"""
from __future__ import annotations

import io
import json
import os
import subprocess
import sys
import unittest
import urllib.error
import urllib.parse
from datetime import date, datetime, timezone

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.join(ROOT, "api"))

from _traffic import transform as T  # noqa: E402
from _traffic.jobs import run  # noqa: E402
from _traffic.meta import MetaClient, RateLimited, usage_from_headers  # noqa: E402

FP_MAPPING = [
    {"pattern": "multiunidade", "unidade": "Geral", "prioridade": 10},
    {"pattern": "hugo napoleao", "unidade": "Leste", "prioridade": 20},
    {"pattern": "leste", "unidade": "Leste", "prioridade": 30},
    {"pattern": "valter alencar", "unidade": "Sul", "prioridade": 20},
    {"pattern": "sul", "unidade": "Sul", "prioridade": 30},
    {"pattern": "joaquim nelson", "unidade": "Dirceu", "prioridade": 20},
    {"pattern": "dirceu", "unidade": "Dirceu", "prioridade": 30},
    {"pattern": "dom severino", "unidade": "Dom Severino", "prioridade": 20},
]


class TransformTests(unittest.TestCase):
    def test_units_real_campaign_names(self):
        m = T.UnitMapper(FP_MAPPING)
        cases = {
            "conversao-tuigo-hugo_napoleao-18_08_26": "Leste",
            "conversao-tuigo-valter_alencar-26_08_26": "Sul",
            "conversao-tuigo-dom_severino-26_08_26": "Dom Severino",
            "conversao-tuigo-dirceu-26_08_26": "Dirceu",
            "[19/08/26] [CONVERSÃO] [LESTE] [TOP 5 CRIATIVOS] [BASE DE CLIENTES]": "Leste",
            "[CONVERSÃO] [SUL] [ANIVERSÁRIO DA FORNO] [CARDÁPIO DIGITAL]": "Sul",
            "conversao-tuigo-promo_seg_qua-multiunidade-28_09_26": "Geral",
            "[EVENTOS] [ANIVERSÁRIO] [MENSAGENS] 11/08/26 - CONSOLIDADO": "Geral",
            "[WRMAX][VENDA][MIX][2]": "Geral",
            "Consultoria sulamericana": "Geral",  # "sul" só como palavra inteira
        }
        for name, expected in cases.items():
            self.assertEqual(m.unit_for(name), expected, name)

    def test_unit_fallback_to_campaign(self):
        m = T.UnitMapper(FP_MAPPING)
        self.assertEqual(m.unit_for("Conjunto aberto 25-45", fallback="Dirceu"), "Dirceu")

    def test_metrics_uses_single_purchase_type(self):
        row = {
            "spend": "207.85", "impressions": "24301", "reach": "8466", "frequency": "2.87",
            "clicks": "300", "inline_link_clicks": "131", "inline_link_click_ctr": "0.539",
            "cost_per_inline_link_click": "1.586", "cpm": "8.55",
            "actions": [
                {"action_type": "landing_page_view", "value": "98"},
                {"action_type": "omni_purchase", "value": "33"},
                {"action_type": "offsite_conversion.fb_pixel_purchase", "value": "33"},
                {"action_type": "purchase", "value": "33"},
                {"action_type": "offsite_conversion.fb_pixel_view_content", "value": "342"},
                {"action_type": "omni_view_content", "value": "342"},
                {"action_type": "offsite_conversion.fb_pixel_add_to_cart", "value": "84"},
                {"action_type": "offsite_conversion.fb_pixel_initiate_checkout", "value": "40"},
            ],
            "action_values": [
                {"action_type": "omni_purchase", "value": "2647.36"},
                {"action_type": "offsite_conversion.fb_pixel_purchase", "value": "2647.36"},
            ],
        }
        m = T.metrics_from_insight(row, "offsite_conversion.fb_pixel_purchase")
        self.assertEqual(m["purchases"], 33)  # não 99
        self.assertEqual(m["purchase_value"], 2647.36)
        self.assertEqual((m["view_content"], m["add_to_cart"], m["initiate_checkout"]), (342, 84, 40))
        self.assertEqual(m["landing_page_views"], 98)
        self.assertAlmostEqual(m["roas"], 12.7369, places=3)
        self.assertEqual(m["link_clicks"], 131)

    def test_metrics_zero_spend(self):
        m = T.metrics_from_insight({"spend": "0"}, "offsite_conversion.fb_pixel_purchase")
        self.assertIsNone(m["roas"])
        self.assertEqual(m["purchases"], 0)
        self.assertIsNone(m["reach"])

    def test_parse_hour_and_budget(self):
        self.assertEqual(T.parse_hour("13:00:00 - 13:59:59"), 13)
        self.assertEqual(T.parse_hour("00:00:00 - 00:59:59"), 0)
        self.assertEqual(T.minor_to_major("12345"), 123.45)
        self.assertIsNone(T.minor_to_major(None))

    def test_today_in_fortaleza(self):
        now = datetime(2026, 9, 29, 2, 30, tzinfo=timezone.utc)  # 23:30 de 28/09 em Fortaleza
        self.assertEqual(T.today_in("America/Fortaleza", now), date(2026, 9, 28))

    def test_chunks(self):
        ch = T.daterange_chunks(date(2026, 1, 1), date(2026, 1, 31), 15)
        self.assertEqual(ch[0], (date(2026, 1, 1), date(2026, 1, 15)))
        self.assertEqual(ch[-1], (date(2026, 1, 31), date(2026, 1, 31)))

    def test_usage_header(self):
        hdr = {"x-business-use-case-usage": json.dumps({"123": [{"type": "ads_insights", "call_count": 91,
                                                                 "total_cputime": 10, "total_time": 12,
                                                                 "estimated_time_to_regain_access": 0}]})}
        self.assertEqual(usage_from_headers(hdr), (91.0, 0))

    def test_ad_account_usage_is_seconds_and_only_when_blocked(self):
        # reset_time_duration vem SEMPRE e em segundos: com uso baixo não é bloqueio.
        low = {"x-ad-account-usage": json.dumps({"acc_id_util_pct": 3.2, "reset_time_duration": 40})}
        self.assertEqual(usage_from_headers(low), (3.2, 0))
        full = {"x-ad-account-usage": json.dumps({"acc_id_util_pct": 100, "reset_time_duration": 40})}
        self.assertEqual(usage_from_headers(full), (100.0, 40))
        buc = {"x-business-use-case-usage": json.dumps({"1": [{"call_count": 100, "estimated_time_to_regain_access": 2}]})}
        self.assertEqual(usage_from_headers(buc), (100.0, 120))


# ------------------------------------------------------------------ Meta fake
class FakeResp:
    def __init__(self, payload, status=200, headers=None):
        self._b = json.dumps(payload).encode()
        self.headers = headers or {}
        self.status = status

    def read(self):
        return self._b

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False


CAMPAIGNS = [
    {"id": "c1", "name": "conversao-tuigo-dirceu-26_08_26", "status": "ACTIVE", "effective_status": "ACTIVE",
     "objective": "OUTCOME_SALES", "daily_budget": "3000"},
    {"id": "c2", "name": "conversao-tuigo-valter_alencar-26_08_26", "status": "ACTIVE",
     "effective_status": "ACTIVE", "objective": "OUTCOME_SALES", "daily_budget": "2000"},
]
ADSETS = [
    {"id": "s1", "name": "Aberto", "campaign_id": "c1", "status": "ACTIVE", "effective_status": "ACTIVE"},
    {"id": "s2", "name": "Base", "campaign_id": "c2", "status": "ACTIVE", "effective_status": "ACTIVE"},
]
ADS = [
    {"id": "a1", "name": "Pizza 1", "campaign_id": "c1", "adset_id": "s1", "status": "ACTIVE",
     "effective_status": "ACTIVE", "creative": {"id": "cr1", "thumbnail_url": "https://x/t1.jpg"}},
    {"id": "a2", "name": "Pizza 2", "campaign_id": "c2", "adset_id": "s2", "status": "PAUSED",
     "effective_status": "PAUSED", "creative": {"id": "cr2", "image_url": "https://x/i2.jpg"}},
]


def _ins(extra, spend="100", purchases="5", value="500"):
    return {**extra, "spend": spend, "impressions": "1000", "reach": "600", "frequency": "1.6667",
            "clicks": "40", "inline_link_clicks": "20", "inline_link_click_ctr": "2", "cost_per_inline_link_click": "5",
            "cpm": "100",
            "actions": [{"action_type": "offsite_conversion.fb_pixel_purchase", "value": purchases},
                        {"action_type": "omni_purchase", "value": purchases},
                        {"action_type": "landing_page_view", "value": "15"},
                        {"action_type": "offsite_conversion.fb_pixel_view_content", "value": "12"},
                        {"action_type": "offsite_conversion.fb_pixel_add_to_cart", "value": "8"},
                        {"action_type": "offsite_conversion.fb_pixel_initiate_checkout", "value": "6"}],
            "action_values": [{"action_type": "offsite_conversion.fb_pixel_purchase", "value": value}]}


class FakeMeta:
    def __init__(self, throttle_once=False):
        self.calls: list[tuple[str, dict]] = []
        self.throttle_once = throttle_once

    def __call__(self, req, timeout=None):
        url = urllib.parse.urlparse(req.full_url)
        params = {k: v[0] for k, v in urllib.parse.parse_qs(url.query or (req.data or b"").decode()).items()}
        path = url.path.split("/", 2)[2]  # tira /vXX.X/
        self.calls.append((req.get_method() + " " + path, params))
        if self.throttle_once:
            self.throttle_once = False
            raise urllib.error.HTTPError(req.full_url, 400, "x", {}, io.BytesIO(
                json.dumps({"error": {"code": 17, "message": "User request limit reached"}}).encode()))
        if path.endswith("/campaigns"):
            return FakeResp({"data": CAMPAIGNS})
        if path.endswith("/adsets"):
            return FakeResp({"data": ADSETS})
        if path.endswith("/ads"):
            return FakeResp({"data": ADS})
        if path.endswith("/insights") and req.get_method() == "POST":
            return FakeResp({"report_run_id": "run1"})
        if path == "run1":
            return FakeResp({"async_status": "Job Completed", "async_percent_completion": 100})
        if path in ("run1/insights", "act_1/insights"):
            if path == "run1/insights":  # async: usa os parâmetros do POST que criou o relatório
                params = self.calls[-3][1]
            level = params.get("level", "campaign")
            if params.get("date_preset") == "last_7d":
                if level == "account":
                    return FakeResp({"data": [{"reach": "5000", "frequency": "3.8"}]})
                return FakeResp({"data": [{"adset_id": "s1", "campaign_id": "c1", "reach": "2000", "frequency": "3.9"}]})
            if params.get("breakdowns"):
                return FakeResp({"data": [
                    {**_ins({}, spend="10", purchases="1", value="80"),
                     "hourly_stats_aggregated_by_advertiser_time_zone": f"{h:02d}:00:00 - {h:02d}:59:59"}
                    for h in (9, 10, 11)]})
            tr = json.loads(params.get("time_range", '{"since":"2026-09-28"}'))
            d = tr["since"]
            rows = {
                "account": [_ins({"account_id": "1", "date_start": d}, spend="300")],
                "campaign": [_ins({"campaign_id": "c9", "campaign_name": "[ARQUIVADA] [DOM SEVERINO] promo", "date_start": d},
                                  spend="1", purchases="0", value="0"),
                             _ins({"campaign_id": "c1", "date_start": d}),
                             _ins({"campaign_id": "c2", "date_start": d}, spend="200", purchases="0", value="0")],
                "adset": [_ins({"campaign_id": "c1", "adset_id": "s1", "date_start": d})],
                "ad": [_ins({"campaign_id": "c1", "adset_id": "s1", "ad_id": "a1", "date_start": d})],
            }[level]
            return FakeResp({"data": rows}, headers={"x-business-use-case-usage": json.dumps(
                {"1": [{"call_count": 10, "total_cputime": 5, "total_time": 5, "estimated_time_to_regain_access": 0}]})})
        raise AssertionError(f"chamada inesperada: {path} {params}")


class MetaClientTests(unittest.TestCase):
    def test_success_with_usage_header_is_kept(self):
        """Achado da revisão: resposta OK com x-ad-account-usage normal não pode virar RateLimited."""
        import time as _t
        hdr = {"x-ad-account-usage": json.dumps({"acc_id_util_pct": 3.2, "reset_time_duration": 40})}
        opener = lambda req, timeout=None: FakeResp({"data": [{"id": "x"}]}, headers=hdr)  # noqa: E731
        cli = MetaClient("t", opener=opener, sleep=lambda s: None, deadline=_t.monotonic() + 270, log=lambda *_: None)
        self.assertEqual(cli.get("act_1/campaigns")["data"][0]["id"], "x")
        self.assertEqual(cli.get("act_1/campaigns")["data"][0]["id"], "x")

    def test_block_pauses_next_call_not_current(self):
        slept = []
        hdr = {"x-business-use-case-usage": json.dumps({"1": [{"call_count": 100, "estimated_time_to_regain_access": 1}]})}
        opener = lambda req, timeout=None: FakeResp({"ok": 1}, headers=hdr)  # noqa: E731
        cli = MetaClient("t", opener=opener, sleep=slept.append, log=lambda *_: None)
        self.assertEqual(cli.get("x"), {"ok": 1})
        self.assertEqual(slept, [])
        cli.get("x")
        self.assertTrue(slept and 55 <= slept[0] <= 60)

    def test_retry_on_throttle(self):
        slept = []
        fake = FakeMeta(throttle_once=True)
        cli = MetaClient("t", opener=fake, sleep=slept.append, log=lambda *_: None)
        self.assertEqual(len(list(cli.paginate("act_1/campaigns", {}))), 2)
        self.assertEqual(slept, [2.0])

    def test_throttle_without_time_budget(self):
        import time as _t
        cli = MetaClient("t", opener=FakeMeta(throttle_once=True), sleep=lambda s: None,
                         deadline=_t.monotonic() + 3, log=lambda *_: None)
        with self.assertRaises(RateLimited):
            cli.get("act_1/campaigns")


# ------------------------------------------------------------------ Postgres store
class PgStore:
    """Emula o upsert/select do PostgREST direto no Postgres local (via psql)."""

    def __init__(self, dsn: str):
        self.dsn = dsn

    def sql(self, q: str) -> str:
        return subprocess.run(["psql", self.dsn, "-q", "-At", "-v", "ON_ERROR_STOP=1", "-c", q],
                              check=True, capture_output=True, text=True).stdout.strip()

    @staticmethod
    def lit(v):
        if v is None:
            return "NULL"
        if isinstance(v, bool):
            return "true" if v else "false"
        return "'" + str(v).replace("'", "''") + "'"

    def upsert(self, table, rows, on_conflict, chunk=500):
        if not rows:
            return 0
        keys = sorted({k for r in rows for k in r})
        vals = ",".join("(" + ",".join(self.lit(r.get(k)) for k in keys) + ")" for r in rows)
        conflict = [c.strip() for c in on_conflict.split(",")]
        upd = ",".join(f"{k}=EXCLUDED.{k}" for k in keys if k not in conflict) or f"{conflict[0]}=EXCLUDED.{conflict[0]}"
        # colunas NOT NULL com default não podem receber NULL explícito (PostgREST idem)
        self.sql(f"insert into public.{table} ({','.join(keys)}) values {vals} on conflict ({on_conflict}) do update set {upd}")
        return len(rows)

    def select(self, table, query):
        where = [f"{k} = {self.lit(v[3:])}" for k, v in query.items() if k != "select" and v.startswith("eq.")]
        w = (" where " + " and ".join(where)) if where else ""
        if table == "traffic_ad_accounts":
            q = (f"select coalesce(json_agg(x),'[]') from (select a.account_id,a.timezone,a.client_id,a.ativo,"
                 f"row_to_json(c) as traffic_clients from traffic_ad_accounts a join traffic_clients c on c.id=a.client_id"
                 f"{w.replace('account_id', 'a.account_id').replace('ativo', 'a.ativo')}) x")
        else:
            q = f"select coalesce(json_agg(t),'[]') from public.{table} t{w}"
        return json.loads(self.sql(q))

    def insert_ignore(self, table, rows, on_conflict):
        if not rows:
            return 0
        keys = sorted({k for r in rows for k in r})
        vals = ",".join("(" + ",".join(self.lit(r.get(k)) for k in keys) + ")" for r in rows)
        self.sql(f"insert into public.{table} ({','.join(keys)}) values {vals} on conflict ({on_conflict}) do nothing")
        return len(rows)

    def insert_returning(self, table, row):
        keys = list(row)
        out = self.sql(f"insert into public.{table} ({','.join(keys)}) values ({','.join(self.lit(row[k]) for k in keys)}) returning row_to_json({table})")
        return json.loads(out)

    def update(self, table, match, values):
        sets = ",".join(f"{k}={self.lit(v)}" for k, v in values.items())
        where = " and ".join(f"{k}={self.lit(v)}" for k, v in match.items())
        self.sql(f"update public.{table} set {sets} where {where}")


@unittest.skipUnless(os.environ.get("TRAFFIC_TEST_PG"), "defina TRAFFIC_TEST_PG para o teste com Postgres")
class EndToEndTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.pg = PgStore(os.environ["TRAFFIC_TEST_PG"])
        cls.pg.sql("delete from traffic_insights_daily; delete from traffic_insights_hourly; delete from traffic_sync_log;"
                   "delete from traffic_ads; delete from traffic_adsets; delete from traffic_campaigns;"
                   "delete from traffic_unit_mapping; delete from traffic_ad_accounts; delete from traffic_clients;")
        cls.pg.sql("insert into traffic_clients(cliente_key,nome,verba_mensal) values ('Teste','Teste',10000)")
        cls.pg.sql("insert into traffic_ad_accounts(client_id,account_id) select id,'act_1' from traffic_clients")
        for m in FP_MAPPING:
            cls.pg.sql(f"insert into traffic_unit_mapping(client_id,pattern,unidade,prioridade) select id,"
                       f"'{m['pattern']}','{m['unidade']}',{m['prioridade']} from traffic_clients")

    def _meta(self):
        return MetaClient("t", opener=FakeMeta(), sleep=lambda s: None, log=lambda *_: None)

    def test_intraday_then_daily_then_backfill(self):
        res = run("intraday", meta=self._meta(), store=self.pg, log=lambda *_: None)
        self.assertEqual(res[0]["status"], "success", res)
        self.assertEqual(self.pg.sql("select unidade from traffic_campaigns where campaign_id='c2'"), "Sul")
        self.assertEqual(self.pg.sql("select thumbnail_url from traffic_ads where ad_id='a2'"), "https://x/i2.jpg")
        self.assertEqual(self.pg.sql("select daily_budget from traffic_campaigns where campaign_id='c1'"), "30.00")
        self.assertEqual(self.pg.sql("select count(*) from traffic_insights_hourly"), "3")
        self.assertEqual(self.pg.sql("select frequency_7d from traffic_ad_accounts"), "3.8000")
        self.assertEqual(self.pg.sql("select frequency_7d from traffic_adsets where adset_id='s1'"), "3.9000")
        self.assertEqual(self.pg.sql(
            "select string_agg(level||':'||purchases||':'||coalesce(unidade,'-'),',' order by level,campaign_id) from traffic_insights_daily"),
            "account:5:-,ad:5:Dirceu,adset:5:Dirceu,campaign:5:Dirceu,campaign:0:Sul,campaign:0:Dom Severino")
        # campanha arquivada (fora da lista de metadados) ganha nome e unidade pelo insight
        self.assertEqual(self.pg.sql("select name||'|'||unidade from traffic_campaigns where campaign_id='c9'"),
                         "[ARQUIVADA] [DOM SEVERINO] promo|Dom Severino")
        self.assertEqual(self.pg.sql("select status from traffic_sync_log order by id desc limit 1"), "success")

        # re-rodar não duplica (upsert)
        run("intraday", meta=self._meta(), store=self.pg, log=lambda *_: None)
        self.assertEqual(self.pg.sql("select count(*) from traffic_insights_daily where level='campaign'"), "3")

        res = run("daily", meta=self._meta(), store=self.pg, log=lambda *_: None)
        self.assertEqual(res[0]["status"], "success", res)
        res = run("backfill", meta=self._meta(), store=self.pg, since=date(2026, 7, 1), until=date(2026, 7, 20),
                  log=lambda *_: None)
        self.assertEqual(res[0]["status"], "success", res)
        # 2 blocos de 15 dias → 2 datas (o fake devolve só a data inicial de cada bloco)
        self.assertEqual(self.pg.sql(
            "select count(distinct date) from traffic_insights_daily where date between '2026-07-01' and '2026-07-20'"), "2")

    def test_error_is_logged(self):
        class Boom(FakeMeta):
            def __call__(self, req, timeout=None):
                raise urllib.error.HTTPError(req.full_url, 400, "x", {}, io.BytesIO(json.dumps(
                    {"error": {"code": 200, "message": "(#200) Permissions error"}}).encode()))
        meta = MetaClient("t", opener=Boom(), sleep=lambda s: None, log=lambda *_: None)
        res = run("intraday", meta=meta, store=self.pg, log=lambda *_: None)
        self.assertEqual(res[0]["status"], "error")
        self.assertIn("Permissions error", self.pg.sql(
            "select error from traffic_sync_log order by id desc limit 1"))


if __name__ == "__main__":
    unittest.main()
