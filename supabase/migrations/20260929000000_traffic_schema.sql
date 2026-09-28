-- =============================================================================
-- Painel de Tráfego WRMax — schema ADITIVO (prefixo traffic_)
--
-- Não altera, renomeia nem apaga nada que já exista no projeto Supabase do
-- portal. Só CREATE ... IF NOT EXISTS / CREATE OR REPLACE de objetos traffic_*.
--
-- Modelo de permissão (o mesmo do portal):
--   * cliente  = usuário Supabase com app_metadata.cliente = '<chave>'
--                (a mesma string que o portal já usa para o Notion);
--   * admin    = usuário Supabase listado em traffic_admins (equipe WRMax).
--   * escrita  = só service role (jobs de sync em Python). Nenhuma policy de
--                INSERT/UPDATE/DELETE para anon/authenticated.
-- =============================================================================

-- ---------------------------------------------------------------- clientes
CREATE TABLE IF NOT EXISTS public.traffic_clients (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- = auth.users.raw_app_meta_data->>'cliente' (valor do select "Cliente" do Notion)
  cliente_key          text NOT NULL UNIQUE,
  nome                 text NOT NULL,
  logo_url             text,
  verba_mensal         numeric(14,2),
  meta_roas            numeric(8,2),
  meta_cpa             numeric(14,2),
  fuso                 text NOT NULL DEFAULT 'America/Fortaleza',
  -- action_type de compra usado de forma consistente (sem somar duplicados)
  purchase_action_type text NOT NULL DEFAULT 'offsite_conversion.fb_pixel_purchase',
  ativo                boolean NOT NULL DEFAULT true,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------- admins WRMax
CREATE TABLE IF NOT EXISTS public.traffic_admins (
  user_id    uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------- contas de anúncio
CREATE TABLE IF NOT EXISTS public.traffic_ad_accounts (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id   uuid NOT NULL REFERENCES public.traffic_clients(id) ON DELETE CASCADE,
  platform    text NOT NULL DEFAULT 'meta' CHECK (platform IN ('meta')),
  account_id  text NOT NULL UNIQUE,            -- 'act_2869812946623860'
  nome        text,
  currency    text,
  timezone    text,
  ativo       boolean NOT NULL DEFAULT true,
  -- snapshot de frequência dos últimos 7 dias no nível conta (reach não soma por dia)
  frequency_7d numeric(10,4),
  reach_7d     bigint,
  snapshot_at  timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS traffic_ad_accounts_client_idx ON public.traffic_ad_accounts(client_id);

-- ---------------------------------------------------------------- mapeamento de unidades
CREATE TABLE IF NOT EXISTS public.traffic_unit_mapping (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id  uuid NOT NULL REFERENCES public.traffic_clients(id) ON DELETE CASCADE,
  -- texto buscado no nome (sem acento, minúsculo, '_' e '-' viram espaço, palavra inteira)
  pattern    text NOT NULL,
  unidade    text NOT NULL,
  prioridade int  NOT NULL DEFAULT 100,        -- menor = testado primeiro
  UNIQUE (client_id, pattern)
);

-- ---------------------------------------------------------------- metadados
CREATE TABLE IF NOT EXISTS public.traffic_campaigns (
  campaign_id      text PRIMARY KEY,
  account_id       text NOT NULL REFERENCES public.traffic_ad_accounts(account_id) ON DELETE CASCADE,
  name             text,
  status           text,
  effective_status text,
  objective        text,
  daily_budget     numeric(14,2),
  lifetime_budget  numeric(14,2),
  unidade          text,
  created_time     timestamptz,
  updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS traffic_campaigns_account_idx ON public.traffic_campaigns(account_id);

CREATE TABLE IF NOT EXISTS public.traffic_adsets (
  adset_id         text PRIMARY KEY,
  account_id       text NOT NULL REFERENCES public.traffic_ad_accounts(account_id) ON DELETE CASCADE,
  campaign_id      text,
  name             text,
  status           text,
  effective_status text,
  daily_budget     numeric(14,2),
  lifetime_budget  numeric(14,2),
  unidade          text,
  frequency_7d     numeric(10,4),
  reach_7d         bigint,
  updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS traffic_adsets_account_idx ON public.traffic_adsets(account_id);

CREATE TABLE IF NOT EXISTS public.traffic_ads (
  ad_id            text PRIMARY KEY,
  account_id       text NOT NULL REFERENCES public.traffic_ad_accounts(account_id) ON DELETE CASCADE,
  campaign_id      text,
  adset_id         text,
  name             text,
  status           text,
  effective_status text,
  creative_id      text,
  thumbnail_url    text,
  unidade          text,
  updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS traffic_ads_account_idx ON public.traffic_ads(account_id);

-- ---------------------------------------------------------------- insights diários
-- Uma linha por (conta, nível, objeto, dia). level: account|campaign|adset|ad.
-- campaign_id/adset_id/ad_id ficam '' quando não se aplicam (chave única simples).
CREATE TABLE IF NOT EXISTS public.traffic_insights_daily (
  account_id          text NOT NULL REFERENCES public.traffic_ad_accounts(account_id) ON DELETE CASCADE,
  level               text NOT NULL CHECK (level IN ('account','campaign','adset','ad')),
  campaign_id         text NOT NULL DEFAULT '',
  adset_id            text NOT NULL DEFAULT '',
  ad_id               text NOT NULL DEFAULT '',
  date                date NOT NULL,
  unidade             text,
  spend               numeric(14,2) NOT NULL DEFAULT 0,
  impressions         bigint        NOT NULL DEFAULT 0,
  reach               bigint,
  frequency           numeric(10,4),
  clicks              bigint        NOT NULL DEFAULT 0,
  link_clicks         bigint        NOT NULL DEFAULT 0,
  ctr                 numeric(10,4),
  cpc                 numeric(14,4),
  cpm                 numeric(14,4),
  landing_page_views  bigint        NOT NULL DEFAULT 0,
  view_content        bigint        NOT NULL DEFAULT 0,
  add_to_cart         bigint        NOT NULL DEFAULT 0,
  initiate_checkout   bigint        NOT NULL DEFAULT 0,
  purchases           bigint        NOT NULL DEFAULT 0,
  purchase_value      numeric(14,2) NOT NULL DEFAULT 0,
  roas                numeric(12,4),
  synced_at           timestamptz   NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, level, campaign_id, adset_id, ad_id, date)
);
CREATE INDEX IF NOT EXISTS traffic_insights_daily_lookup_idx
  ON public.traffic_insights_daily(account_id, level, date);

-- ---------------------------------------------------------------- insights por hora (nível conta)
CREATE TABLE IF NOT EXISTS public.traffic_insights_hourly (
  account_id      text NOT NULL REFERENCES public.traffic_ad_accounts(account_id) ON DELETE CASCADE,
  date            date NOT NULL,
  hour            smallint NOT NULL CHECK (hour BETWEEN 0 AND 23),
  spend           numeric(14,2) NOT NULL DEFAULT 0,
  impressions     bigint        NOT NULL DEFAULT 0,
  clicks          bigint        NOT NULL DEFAULT 0,
  link_clicks     bigint        NOT NULL DEFAULT 0,
  purchases       bigint        NOT NULL DEFAULT 0,
  purchase_value  numeric(14,2) NOT NULL DEFAULT 0,
  synced_at       timestamptz   NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, date, hour)
);

-- ---------------------------------------------------------------- log de sync
CREATE TABLE IF NOT EXISTS public.traffic_sync_log (
  id           bigserial PRIMARY KEY,
  account_id   text REFERENCES public.traffic_ad_accounts(account_id) ON DELETE CASCADE,
  job          text NOT NULL,                  -- intraday | daily | backfill
  status       text NOT NULL CHECK (status IN ('running','success','error')),
  started_at   timestamptz NOT NULL DEFAULT now(),
  finished_at  timestamptz,
  rows_written int,
  error        text
);
CREATE INDEX IF NOT EXISTS traffic_sync_log_account_idx
  ON public.traffic_sync_log(account_id, started_at DESC);

-- =============================================================================
-- Funções de permissão (SECURITY DEFINER para não recursar em RLS)
-- =============================================================================
CREATE OR REPLACE FUNCTION public.traffic_is_admin()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.traffic_admins WHERE user_id = auth.uid());
$$;

CREATE OR REPLACE FUNCTION public.traffic_can_see_client(p_client_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.traffic_is_admin() OR EXISTS (
    SELECT 1 FROM public.traffic_clients c
    WHERE c.id = p_client_id
      AND c.ativo
      AND c.cliente_key = (auth.jwt() -> 'app_metadata' ->> 'cliente')
  );
$$;

CREATE OR REPLACE FUNCTION public.traffic_can_see_account(p_account_id text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.traffic_is_admin() OR EXISTS (
    SELECT 1 FROM public.traffic_ad_accounts a
    JOIN public.traffic_clients c ON c.id = a.client_id
    WHERE a.account_id = p_account_id
      AND c.ativo
      AND c.cliente_key = (auth.jwt() -> 'app_metadata' ->> 'cliente')
  );
$$;

REVOKE ALL ON FUNCTION public.traffic_is_admin() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.traffic_can_see_client(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.traffic_can_see_account(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.traffic_is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.traffic_can_see_client(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.traffic_can_see_account(text) TO authenticated;

-- =============================================================================
-- RLS — só leitura para authenticated; anon não vê nada.
-- =============================================================================
ALTER TABLE public.traffic_clients         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.traffic_admins          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.traffic_ad_accounts     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.traffic_unit_mapping    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.traffic_campaigns       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.traffic_adsets          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.traffic_ads             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.traffic_insights_daily  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.traffic_insights_hourly ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.traffic_sync_log        ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.traffic_clients, public.traffic_admins, public.traffic_ad_accounts,
  public.traffic_unit_mapping, public.traffic_campaigns, public.traffic_adsets,
  public.traffic_ads, public.traffic_insights_daily, public.traffic_insights_hourly,
  public.traffic_sync_log FROM anon;
GRANT SELECT ON public.traffic_clients, public.traffic_admins, public.traffic_ad_accounts,
  public.traffic_unit_mapping, public.traffic_campaigns, public.traffic_adsets,
  public.traffic_ads, public.traffic_insights_daily, public.traffic_insights_hourly,
  public.traffic_sync_log TO authenticated;
-- O Supabase dá ALL por default privileges a authenticated; aqui a escrita é só
-- da service role (a RLS já bloquearia, isto é defesa em profundidade).
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.traffic_clients, public.traffic_admins,
  public.traffic_ad_accounts, public.traffic_unit_mapping, public.traffic_campaigns,
  public.traffic_adsets, public.traffic_ads, public.traffic_insights_daily,
  public.traffic_insights_hourly, public.traffic_sync_log FROM authenticated;
GRANT ALL ON public.traffic_clients, public.traffic_admins, public.traffic_ad_accounts,
  public.traffic_unit_mapping, public.traffic_campaigns, public.traffic_adsets,
  public.traffic_ads, public.traffic_insights_daily, public.traffic_insights_hourly,
  public.traffic_sync_log TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.traffic_sync_log_id_seq TO service_role;

DROP POLICY IF EXISTS traffic_clients_select ON public.traffic_clients;
CREATE POLICY traffic_clients_select ON public.traffic_clients
  FOR SELECT TO authenticated USING (public.traffic_can_see_client(id));

DROP POLICY IF EXISTS traffic_admins_select ON public.traffic_admins;
CREATE POLICY traffic_admins_select ON public.traffic_admins
  FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.traffic_is_admin());

DROP POLICY IF EXISTS traffic_ad_accounts_select ON public.traffic_ad_accounts;
CREATE POLICY traffic_ad_accounts_select ON public.traffic_ad_accounts
  FOR SELECT TO authenticated USING (public.traffic_can_see_client(client_id));

DROP POLICY IF EXISTS traffic_unit_mapping_select ON public.traffic_unit_mapping;
CREATE POLICY traffic_unit_mapping_select ON public.traffic_unit_mapping
  FOR SELECT TO authenticated USING (public.traffic_can_see_client(client_id));

DROP POLICY IF EXISTS traffic_campaigns_select ON public.traffic_campaigns;
CREATE POLICY traffic_campaigns_select ON public.traffic_campaigns
  FOR SELECT TO authenticated USING (public.traffic_can_see_account(account_id));

DROP POLICY IF EXISTS traffic_adsets_select ON public.traffic_adsets;
CREATE POLICY traffic_adsets_select ON public.traffic_adsets
  FOR SELECT TO authenticated USING (public.traffic_can_see_account(account_id));

DROP POLICY IF EXISTS traffic_ads_select ON public.traffic_ads;
CREATE POLICY traffic_ads_select ON public.traffic_ads
  FOR SELECT TO authenticated USING (public.traffic_can_see_account(account_id));

DROP POLICY IF EXISTS traffic_insights_daily_select ON public.traffic_insights_daily;
CREATE POLICY traffic_insights_daily_select ON public.traffic_insights_daily
  FOR SELECT TO authenticated USING (public.traffic_can_see_account(account_id));

DROP POLICY IF EXISTS traffic_insights_hourly_select ON public.traffic_insights_hourly;
CREATE POLICY traffic_insights_hourly_select ON public.traffic_insights_hourly
  FOR SELECT TO authenticated USING (public.traffic_can_see_account(account_id));

DROP POLICY IF EXISTS traffic_sync_log_select ON public.traffic_sync_log;
CREATE POLICY traffic_sync_log_select ON public.traffic_sync_log
  FOR SELECT TO authenticated USING (public.traffic_can_see_account(account_id));
