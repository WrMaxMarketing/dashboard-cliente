-- =============================================================================
-- Ativação do Painel de Tráfego — Cliente 1: Forno Paulista
-- Rodar DEPOIS da migration 20260929000000_traffic_schema.sql (SQL Editor do
-- Supabase, como postgres/service role). Idempotente.
--
-- ⚠️ CONFIRMAR ANTES DE RODAR:
--   1. cliente_key precisa ser EXATAMENTE o app_metadata.cliente dos usuários
--      da Forno no portal (confira com:
--        select email, raw_app_meta_data->>'cliente' from auth.users;
--      ou `node --env-file=.env.local scripts/create-client-user.mjs --list`).
--   2. meta_roas / meta_cpa ficam NULL até a WRMax definir — o painel mostra "—".
-- =============================================================================

INSERT INTO public.traffic_clients (cliente_key, nome, verba_mensal, meta_roas, meta_cpa, fuso)
VALUES ('Forno Paulista', 'Forno Paulista', 10000.00, NULL, NULL, 'America/Fortaleza')
ON CONFLICT (cliente_key) DO UPDATE
  SET nome = EXCLUDED.nome,
      verba_mensal = EXCLUDED.verba_mensal,
      fuso = EXCLUDED.fuso,
      updated_at = now();

INSERT INTO public.traffic_ad_accounts (client_id, platform, account_id, nome, currency, timezone)
SELECT id, 'meta', 'act_2869812946623860', 'CA - Forno Paulista', 'BRL', 'America/Fortaleza'
FROM public.traffic_clients WHERE cliente_key = 'Forno Paulista'
ON CONFLICT (account_id) DO NOTHING;

-- Unidades. Nomes reais das campanhas usam snake_case ("hugo_napoleao",
-- "valter_alencar", "dom_severino") e colchetes ("[LESTE]", "[SUL]").
INSERT INTO public.traffic_unit_mapping (client_id, pattern, unidade, prioridade)
SELECT c.id, m.pattern, m.unidade, m.prioridade
FROM public.traffic_clients c,
  (VALUES
    ('multiunidade',   'Geral',        10),
    ('hugo napoleao',  'Leste',        20),
    ('leste',          'Leste',        30),
    ('valter alencar', 'Sul',          20),
    ('sul',            'Sul',          30),
    ('joaquim nelson', 'Dirceu',       20),
    ('dirceu',         'Dirceu',       30),
    ('dom severino',   'Dom Severino', 20)
  ) AS m(pattern, unidade, prioridade)
WHERE c.cliente_key = 'Forno Paulista'
ON CONFLICT (client_id, pattern) DO UPDATE
  SET unidade = EXCLUDED.unidade, prioridade = EXCLUDED.prioridade;

-- Admins WRMax (precisam ter usuário no Supabase Auth). Exemplo:
-- INSERT INTO public.traffic_admins (user_id)
-- SELECT id FROM auth.users WHERE email = 'marketingwrmax@gmail.com'
-- ON CONFLICT DO NOTHING;
