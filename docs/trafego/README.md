# Painel de Tráfego Pago WRMax (`/trafego`)

Seção nova do Portal do Cliente. Mostra os resultados de Meta Ads de cada cliente, lidos **só do Supabase**. Nenhuma chamada à Meta sai do navegador.

```
Meta Marketing API ──(Python, service role)──► Supabase traffic_* ──(RLS, sessão do usuário)──► /trafego
        ▲                                                                     
  Vercel Cron 1x/dia: /api/traffic_sync?job=daily (04:30 Fortaleza) · botão Atualizar: job=intraday
```

| Parte | Onde |
|---|---|
| Migrations (aditivas, prefixo `traffic_`) | `supabase/migrations/20260929000000_traffic_schema.sql` |
| Seed do cliente 1 (Forno Paulista) | `supabase/seed/traffic_forno_paulista.sql` |
| Sync (Python, só stdlib) | `api/traffic_sync.py` + `api/_traffic/*` |
| CLI de sync/backfill | `scripts/traffic/run_sync.py` |
| Validação de acesso à Meta | `scripts/meta/validate_meta_access.py` |
| Interface | `app/trafego/**`, `components/trafego/**`, `lib/traffic/**` |
| Testes do sync | `python3 -m unittest discover -s tests/traffic` |

Nada existente no portal foi alterado: rotas, componentes, `middleware.ts`, tabelas, policies e env vars continuam iguais. O que entrou de novo: a dependência `recharts`, o `vercel.json` (o portal não tinha um) e os arquivos acima.

---

## 1. Primeira instalação (uma vez)

### 1.1 Variáveis de ambiente no projeto Vercel

| Variável | Uso | Onde |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | já existem no portal | front/SSR |
| `SUPABASE_SERVICE_ROLE_KEY` | já existe no portal; o sync grava com ela | só servidor |
| `META_SYSTEM_USER_TOKEN` | **nova**: token do Usuário do Sistema do BM | só servidor |
| `CRON_SECRET` | **nova**: string aleatória longa. A Vercel envia `Authorization: Bearer $CRON_SECRET` nos crons | só servidor |
| `META_GRAPH_VERSION` | opcional (padrão `v23.0`) | só servidor |
| `TRAFFIC_SYNC_BASE_URL` | opcional: URL base usada pelo botão Atualizar. Na Vercel não precisa (usa `VERCEL_URL`); obrigatória se rodar fora da Vercel | só servidor |

Nunca commite essas chaves. O `.env*` já está no `.gitignore`.

### 1.2 Banco

No SQL Editor do Supabase, rode nesta ordem:
1. `supabase/migrations/20260929000000_traffic_schema.sql` (idempotente)
2. `supabase/seed/traffic_forno_paulista.sql`. **Antes**, confirme o `cliente_key` (ver §2.1).
3. Cadastre os admins WRMax (precisam ter usuário no Supabase Auth):
   ```sql
   insert into traffic_admins (user_id)
   select id from auth.users where email in ('marketingwrmax@gmail.com')
   on conflict do nothing;
   ```

### 1.3 Backfill de 90 dias

Rode da sua máquina (o backfill pode passar do limite de tempo da função):
```bash
export META_SYSTEM_USER_TOKEN=... NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=...
python3 scripts/meta/validate_meta_access.py            # Etapa 1: confirma acesso e action_types
python3 scripts/traffic/run_sync.py backfill            # 90 dias, todas as contas ativas
python3 scripts/traffic/run_sync.py daily               # 7 dias + hoje + metadados + frequência 7d
```
O backfill usa *async report jobs* da Meta em blocos de 15 dias e respeita os headers de uso (`x-business-use-case-usage`).

### 1.4 Atualização dos dados

- **Automática, 1 vez por dia** (`vercel.json`): `30 7 * * *` (04:30 em Fortaleza) → `job=daily`. Refaz os últimos 7 dias (a Meta ajusta conversões retroativamente), inclui o parcial de hoje (por dia e por hora) e atualiza metadados e frequência 7d. Compatível com o plano Hobby.
- **Manual, pelo botão ⟳ "Atualizar"** no topo do painel: `POST /trafego/atualizar`. Exige sessão, confere pela RLS se o usuário enxerga a conta e aceita 1 atualização a cada 5 min por cliente. O servidor chama `/api/traffic_sync?job=intraday` com o `CRON_SECRET`; o navegador nunca fala com a Meta.
- Em **previews** protegidos por *Vercel Authentication*, ative *Protection Bypass for Automation* no projeto para o botão funcionar: a Vercel cria `VERCEL_AUTOMATION_BYPASS_SECRET` e a rota o envia sozinha.
- A Vercel só executa **crons em produção**. No preview use o botão ou:
  ```bash
  curl -H "Authorization: Bearer $CRON_SECRET" "https://<preview>.vercel.app/api/traffic_sync?job=daily"
  ```
- O selo "AO VIVO · atualizado às HH:MM" mostra o último sync com sucesso. Fica âmbar após 26h sem sync e vermelho se o último sync falhou.

---

## 2. Ativar o painel para um NOVO cliente

Suponha o cliente **"Tmax"**, que já faz login no portal.

### 2.1 Descubra o `cliente_key`
O portal identifica o cliente pelo `app_metadata.cliente` do usuário (o mesmo valor do select "Cliente" no Notion):
```sql
select email, raw_app_meta_data->>'cliente' as cliente from auth.users order by 2;
```
O `cliente_key` precisa ser **exatamente** esse texto, com as mesmas maiúsculas, acentos e espaços.

### 2.2 Cadastre cliente, verba e metas
```sql
insert into traffic_clients (cliente_key, nome, verba_mensal, meta_roas, meta_cpa, fuso)
values ('Tmax', 'Tmax Imóveis', 5000, 3.0, 80, 'America/Fortaleza');
```
- `verba_mensal`: alimenta o "Ritmo da verba" e o alerta de gasto adiantado (> 15%).
- `meta_roas`: status das campanhas (ESCALANDO ≥ 130% da meta · NO ALVO ≥ 100% · ATENÇÃO ≥ 70% · CRÍTICO), alerta de ROAS do dia e parte do score de saúde. Sem meta, o painel mostra "—" e "SEM META".
- `purchase_action_type`: padrão `offsite_conversion.fb_pixel_purchase`. Troque para `omni_purchase` ou `purchase` só se o `validate_meta_access.py` mostrar que o pixel do cliente não devolve o padrão. **Um tipo só**; nunca somamos tipos.

### 2.3 Vincule a conta de anúncio
O Usuário do Sistema precisa ter a conta atribuída como ativo no BM. Valide antes:
```bash
python3 scripts/meta/validate_meta_access.py --account act_XXXXXXXX
```
```sql
insert into traffic_ad_accounts (client_id, account_id, nome, currency, timezone)
select id, 'act_XXXXXXXX', 'CA - Tmax', 'BRL', 'America/Fortaleza'
from traffic_clients where cliente_key = 'Tmax';
```
Um cliente pode ter mais de uma conta; o painel soma as contas dele.

### 2.4 Mapeamento de unidades (opcional)
Busca o texto no nome da campanha, depois no do conjunto, depois no do anúncio. A busca ignora acentos e maiúsculas, trata `_`, `-` e `[ ]` como espaço e exige palavra inteira. Menor `prioridade` é testada primeiro. Sem correspondência, a unidade é "Geral".
```sql
insert into traffic_unit_mapping (client_id, pattern, unidade, prioridade)
select id, p, u, pr from traffic_clients,
  (values ('centro','Centro',20), ('zona leste','Zona Leste',20)) v(p,u,pr)
where cliente_key = 'Tmax';
```
Depois de mudar o mapeamento, rode `run_sync.py daily` (ou `backfill`) para recalcular a unidade das linhas antigas.

### 2.5 Acesso do usuário do cliente
Nada a fazer se o usuário já existe no portal com `app_metadata.cliente = 'Tmax'`. Para criar um usuário novo, use o script que o portal já tem:
```bash
node --env-file=.env.local scripts/create-client-user.mjs email@cliente.com 'senha' "Tmax"
```
Ele acessa `/trafego` com o mesmo login. A RLS garante que só veja as contas do próprio cliente.

### 2.6 Primeira carga
```bash
python3 scripts/traffic/run_sync.py backfill --account act_XXXXXXXX
```

Para desativar: `update traffic_clients set ativo = false where cliente_key = 'Tmax';`. O cliente perde o acesso na hora e o sync para.

---

## 3. Regras de cálculo (para conferir com o Gerenciador)

- **Compras / Faturamento**: `actions` e `action_values` do `purchase_action_type` do cliente. **ROAS = faturamento ÷ investimento** com esse mesmo tipo (não usamos `purchase_roas`, que pode misturar tipos).
- **Funil**: mesma família de eventos do tipo de compra (pixel: `fb_pixel_view_content`, `fb_pixel_add_to_cart`, `fb_pixel_initiate_checkout`) mais `landing_page_view`. "Visualizou produto" pode passar de 100% das visualizações de página, porque a mesma visita vê vários produtos. O dado é da Meta e não é corrigido.
- **CTR e CPC** são de **clique no link** (`inline_link_clicks`). CPM = investimento ÷ impressões × 1000.
- **Frequência 7d**: recorte de 7 dias pedido pronto à Meta (alcance não soma por dia). Alerta de fadiga acima de 3,5 em conjuntos ativos.
- **Atribuição**: `use_account_attribution_setting=true`, igual ao Gerenciador de Anúncios.
- **Períodos** no fuso do cliente. "7d/14d/30d" são dias completos até ontem, como no Gerenciador de Anúncios. "Hoje" e "Mês atual" incluem o parcial de hoje. "Hoje" compara com ontem até a hora do último sync. O ritmo da verba é medido no instante do último sync. Se o período anterior não tem dados em pelo menos metade dos dias, a variação aparece como "—".
- **Saúde da conta (0–100)**: média de ROAS vs meta, ritmo da verba (0 com desvio ≥ 30%), frequência 7d (100 com ≤ 2,5, 0 com ≥ 4,5) e CTR vs média de 90 dias. Componentes sem dado ficam de fora da média.
- **Alertas** (sino): ROAS de hoje abaixo da meta · gasto do mês > 15% acima do ideal · conjunto ativo com frequência 7d > 3,5 · campanha **ativa** com gasto ≥ max(R$ 20, 2× meta de CPA) e zero compras de anteontem até hoje (≥ 48h) · erro no último sync.
- **"AO VIVO · atualizado às HH:MM"** = fim do último sync com sucesso. Fica âmbar após 26h e vermelho se o último sync falhou.
