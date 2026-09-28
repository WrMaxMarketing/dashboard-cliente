# Painel de Tráfego WRMax: Etapa 0 (reconhecimento) e Etapa 1 (acesso à Meta)

Status: **aguardando aprovação**. Nenhum código do portal foi alterado.

## 1. O que foi encontrado

### ⚠️ O repositório desta sessão NÃO é o Portal do Cliente

`WrMaxMarketing/dashboard-cliente` é o antigo **"196 SONHOS - Dashboard de Vendas"**:

| Item | Valor |
|---|---|
| Framework | Next.js 15.4.6 (App Router), React 19.1, Tailwind v4, shadcn/ui |
| Auth | **Firebase Auth** (email/senha, client-side), não Supabase |
| Dados | Google Sheets público via `opensheet.elk.sh` (Pix gerado / Compra aprovada / Carrinho abandonado da Kiwify) |
| Rotas | `/` (login) e `/dashboard` (mais `dashboard/as.tsx`, uma cópia antiga que não é rota) |
| Banco / RLS | nenhum |
| Env vars | `NEXT_PUBLIC_FIREBASE_*` |
| Recharts | já instalado (^3.1.2) |
| Vercel | projeto `dashboard-cliente` |

O domínio `wrmaxclientes.vercel.app` **não aparece em nenhum projeto do time Vercel** `marketingwrmax-9365's projects`. Não consegui abrir o site daqui porque a rede do container bloqueia. Ele pode estar em outra conta/time Vercel.

### Candidatos no GitHub que usam Supabase

**A) `Painel-de-conte-dos-clientes-WRMAX`**, projeto Vercel `painel-de-conte-dos-clientes-wrmax`, domínio `painel.wrmaxmarketing.com.br`. É o portal com login de cliente.

- Next.js **16.2.9**, React 19.2, Tailwind v4, shadcn, next-themes (tema escuro padrão, acento dourado já existe como token `--brand`)
- Rotas: `/login`, `/` (quadro de aprovação de conteúdos vindo do **Notion**), `/admin`, `/api/cards/*`, `/api/notify`
- Login: Supabase Auth email/senha via `@supabase/ssr` e `middleware.ts`. Sessão com limite absoluto de 1h (cookie `client_session_start`)
- **Vínculo cliente↔usuário: não existe tabela.** O cliente é uma string em `auth.users.app_metadata.cliente` (ex.: `"Tmax"`), igual ao select "Cliente" do Notion. Só a service role grava isso
- **Admin: não é um papel no Supabase.** É uma senha (`ADMIN_PASSWORD`) com cookie `admin_session` em hash. O admin não tem usuário Supabase
- Tabelas Supabase próprias: **nenhuma** (os dados vêm do Notion). Sem migrations, sem RLS
- Env: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `ADMIN_PASSWORD`, `NOTION_TOKEN`, `NOTION_DB_CONTEUDO`, `NOTION_STATUS_APROVACAO`, `NOTION_CLIENTE_FIXO`, `EVOLUTION_API_*`, `WHATSAPP_DESTINO`, `CLIENTES_WHATSAPP`, `NOTIFY_WEBHOOK_SECRET`, `SITE_URL`
- Sem crons configurados

**B) `dashboard-admin-wrmaxmarketing`**, painel **interno** de onboarding/contratos.

- TanStack Start (Vite/Nitro), gerado pelo Lovable
- Tabelas: `clientes_onboarding`, `links_temporarios`, `dados_cadastrais_cliente`, `contratos`, `modelos_contrato`
- Cliente não faz login (acesso por link efêmero `/c/:token`)
- ⚠️ A migration `20260928_contrato_rpc_and_grants.sql` cria a policy *"Acesso irrestrito a clientes_onboarding"* `FOR ALL TO anon, authenticated USING (TRUE)`. Quem tem a anon key lê e escreve todos os clientes. Vale revisar isso à parte.

## 2. Proposta de integração (assumindo que o portal é o **A**)

Como o portal A não tem tabela de clientes nem papéis, não existe o que reaproveitar. Por isso a proposta é **criar só o mínimo, tudo com prefixo `traffic_`**, e amarrar ao que já existe:

- **Cliente** → `traffic_clients (id, cliente_key TEXT UNIQUE, nome, verba_mensal, meta_roas, meta_cpa, fuso)`. `cliente_key` é o mesmo valor de `app_metadata.cliente`, então nenhum usuário existente precisa mudar.
- **Admin** → `traffic_admins (user_id → auth.users)`. O painel de tráfego exige sessão Supabase, então os admins WRMax precisam de um usuário Supabase. O `/admin` por senha continua intacto.
- **RLS** em todas as tabelas `traffic_*`:
  `cliente_key = auth.jwt()->'app_metadata'->>'cliente' OR exists(select 1 from traffic_admins where user_id = auth.uid())`.
  Escrita só pela service role (jobs de sync).
- Demais tabelas conforme o briefing: `traffic_ad_accounts`, `traffic_unit_mapping`, `traffic_insights_daily`, `traffic_insights_hourly`, `traffic_campaigns`, `traffic_ads`, `traffic_sync_log`.

**Rota:** `/trafego` (e `/trafego/campanhas|criativos|unidades|relatorios`) dentro da área logada. O layout é próprio (`app/trafego/layout.tsx`) com tema dourado escopado e navegação inferior só ali. O portal hoje não tem menu nem nav mobile, só o `AppHeader`.

**Mudanças compartilhadas que precisam do seu aval (vou mostrar o diff antes):**
1. Um link "Tráfego" no `AppHeader` (ou um card na home)
2. `middleware.ts`: nenhuma mudança necessária, porque `/trafego` já cai na proteção padrão. As rotas de cron em `/api/traffic/*` já são liberadas pelo `isApi` e vão validar o `CRON_SECRET`
3. `vercel.json` novo, com os crons (o portal não tem nenhum)
4. Dependência nova: `recharts`

**"Em Python":** o portal é Next.js/TypeScript, então a UI fica em TS/React. Os **jobs de sync/backfill ficam em Python**: a Vercel roda Python Functions em `api/*.py` no mesmo projeto, disparadas pelo Vercel Cron. O Python usa só a service role do Supabase e o `META_SYSTEM_USER_TOKEN`, ambos server-side.

**"Duplique o repositório":** o plano é **não mexer no repo de produção**. Copio o código do portal A para esta branch (`claude/upbeat-mendel-ndfuzn` do `dashboard-cliente`), substituindo o app 196 Sonhos **só na branch**, e construo o painel aqui. O deploy de preview sai do projeto Vercel `dashboard-cliente`, apontando para o mesmo Supabase por env vars de Preview. Depois de validado, o merge é feito no repo do portal. O `main` do dashboard-cliente (196 Sonhos) não é tocado.

## 3. Etapa 1: acesso à Meta (validação preliminar)

Feita **pelo conector Meta Ads da WRMax (seu usuário)**, não pelo token do Usuário do Sistema. O container não acessa `graph.facebook.com`. A validação oficial com o token é pelo script `scripts/meta/validate_meta_access.py`.

- `act_2869812946623860` → **"CA - Forno Paulista"**, fuso **America/Fortaleza**, gasto 7d **R$ 1.893,31** ✅
- Insights 7d por campanha: **`omni_purchase` = `offsite_conversion.fb_pixel_purchase` em todas as campanhas** (compras e valores idênticos). `onsite_conversion.purchase` = null.

| Campanha (7d) | Gasto | Compras (pixel) | Valor | ROAS |
|---|---|---|---|---|
| conversao-tuigo-dom_severino-26_08_26 | 527,55 | 14 | 1.359,00 | 2,58 |
| [EVENTOS] [ANIVERSÁRIO] [MENSAGENS] 11/08/26 | 565,71 | 4 | 276,10 | 0,49 |
| conversao-tuigo-hugo_napoleao-18_08_26 | 366,98 | 15 | 1.299,16 | 3,54 |
| conversao-tuigo-dirceu-26_08_26 | 207,85 | 33 | 2.647,36 | 12,74 |
| [WRMAX][VENDA][MIX][2] | 155,04 | 2 | 313,20 | 2,02 |
| conversao-tuigo-valter_alencar-26_08_26 | 70,18 | 19 | 2.174,52 | 30,98 |
| **Total** | **1.893,31** | **87** | **8.069,34** | **4,26** |

**Proposta:** usar **`offsite_conversion.fb_pixel_purchase`** (compra no pixel da loja Tuigo) para contagem e valor, sem somar com `omni_purchase`.

**Efeito no mapeamento de unidades:** os nomes novos usam `snake_case` (`hugo_napoleao`, `valter_alencar`, `dom_severino`, `multiunidade`), e a unidade **Sul aparece como "Valter Alencar"**. Mapeamento inicial proposto (sem acento, sem diferenciar maiúsculas, `_` tratado como espaço):

| Padrão | Unidade |
|---|---|
| `hugo napoleao`, `leste` | Leste |
| `valter alencar`, `sul` | Sul |
| `dirceu`, `joaquim nelson` | Dirceu |
| `dom severino` | Dom Severino |
| (nenhum, `multiunidade`, `st pietro`) | Geral |

Frequência 7d da campanha Dom Severino = **3,81**. Isso já dispararia o alerta de fadiga (> 3,5).
