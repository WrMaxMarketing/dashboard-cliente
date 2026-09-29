import "server-only";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { DailyRow, HourlyRow } from "@/lib/traffic/metrics";

// Toda leitura usa a sessão do usuário (anon key + cookies) => a RLS do
// Supabase decide o que ele vê. Nenhuma chamada à Meta sai daqui.

export type TrafficClient = {
  id: string;
  cliente_key: string;
  nome: string;
  logo_url: string | null;
  verba_mensal: number | null;
  meta_roas: number | null;
  meta_cpa: number | null;
  fuso: string;
  purchase_action_type: string;
};

export type TrafficAccount = {
  account_id: string;
  nome: string | null;
  frequency_7d: number | null;
  reach_7d: number | null;
  snapshot_at: string | null;
};

export type SyncInfo = {
  lastSuccess: string | null;
  last: { status: string; error: string | null; finished_at: string | null; started_at: string } | null;
};

export type TrafficContext = {
  userEmail: string | null;
  isAdmin: boolean;
  clients: Pick<TrafficClient, "cliente_key" | "nome">[];
  client: TrafficClient | null;
  accounts: TrafficAccount[];
  accountIds: string[];
  sync: SyncInfo;
};

type Supa = Awaited<ReturnType<typeof createClient>>;

const n = (v: unknown) => (v == null ? null : Number(v));

export async function getTrafficContext(requestedKey?: string): Promise<TrafficContext & { supabase: Supa }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: isAdminData }, { data: clientsData }] = await Promise.all([
    supabase.rpc("traffic_is_admin"),
    supabase
      .from("traffic_clients")
      .select("id,cliente_key,nome,logo_url,verba_mensal,meta_roas,meta_cpa,fuso,purchase_action_type")
      .eq("ativo", true)
      .order("nome"),
  ]);
  const isAdmin = isAdminData === true;
  const all = (clientsData ?? []).map((c) => ({
    ...c,
    verba_mensal: n(c.verba_mensal),
    meta_roas: n(c.meta_roas),
    meta_cpa: n(c.meta_cpa),
  })) as TrafficClient[];

  // Cliente comum: a RLS já devolve só o dele. Admin: escolhe via ?c=.
  const own = (user.app_metadata?.cliente as string | undefined) ?? "";
  const client =
    (isAdmin && requestedKey ? all.find((c) => c.cliente_key === requestedKey) : undefined) ??
    all.find((c) => c.cliente_key === own) ??
    (isAdmin ? all[0] : undefined) ??
    null;

  let accounts: TrafficAccount[] = [];
  let sync: SyncInfo = { lastSuccess: null, last: null };
  if (client) {
    const { data: acc } = await supabase
      .from("traffic_ad_accounts")
      .select("account_id,nome,frequency_7d,reach_7d,snapshot_at")
      .eq("client_id", client.id)
      .eq("ativo", true);
    accounts = (acc ?? []).map((a) => ({ ...a, frequency_7d: n(a.frequency_7d), reach_7d: n(a.reach_7d) }));
    const ids = accounts.map((a) => a.account_id);
    if (ids.length) {
      const [{ data: okRow }, { data: lastRow }] = await Promise.all([
        supabase
          .from("traffic_sync_log")
          .select("finished_at")
          .in("account_id", ids)
          .eq("status", "success")
          .order("finished_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from("traffic_sync_log")
          .select("status,error,finished_at,started_at")
          .in("account_id", ids)
          .neq("status", "running")
          .order("started_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);
      sync = { lastSuccess: okRow?.finished_at ?? null, last: lastRow ?? null };
    }
  }

  return {
    supabase,
    userEmail: user.email ?? null,
    isAdmin,
    clients: all.map(({ cliente_key, nome }) => ({ cliente_key, nome })),
    client,
    accounts,
    accountIds: accounts.map((a) => a.account_id),
    sync,
  };
}

const DAILY_COLS =
  "account_id,level,campaign_id,adset_id,ad_id,date,unidade,spend,impressions,reach,frequency,clicks,link_clicks,landing_page_views,view_content,add_to_cart,initiate_checkout,purchases,purchase_value";

const PAGE = 1000; // limite padrão de linhas do PostgREST

function toNum<T extends Record<string, unknown>>(row: T, keys: string[]): T {
  const out: Record<string, unknown> = { ...row };
  for (const k of keys) if (out[k] != null) out[k] = Number(out[k]);
  return out as T;
}
const NUM_KEYS = [
  "spend", "impressions", "reach", "frequency", "clicks", "link_clicks", "landing_page_views", "view_content",
  "add_to_cart", "initiate_checkout", "purchases", "purchase_value",
];

export async function getDaily(
  supabase: Supa,
  accountIds: string[],
  level: DailyRow["level"],
  since: string,
  until: string,
): Promise<DailyRow[]> {
  if (!accountIds.length) return [];
  const out: DailyRow[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("traffic_insights_daily")
      .select(DAILY_COLS)
      .in("account_id", accountIds)
      .eq("level", level)
      .gte("date", since)
      .lte("date", until)
      .order("date")
      .order("account_id")
      .order("campaign_id")
      .order("adset_id")
      .order("ad_id")
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`traffic_insights_daily: ${error.message}`);
    out.push(...((data ?? []) as unknown as DailyRow[]).map((r) => toNum(r, NUM_KEYS)));
    if (!data || data.length < PAGE) break;
  }
  return out;
}

export async function getHourly(supabase: Supa, accountIds: string[], dates: string[]): Promise<HourlyRow[]> {
  if (!accountIds.length) return [];
  const { data, error } = await supabase
    .from("traffic_insights_hourly")
    .select("account_id,date,hour,spend,impressions,clicks,link_clicks,purchases,purchase_value")
    .in("account_id", accountIds)
    .in("date", dates)
    .order("hour");
  if (error) throw new Error(`traffic_insights_hourly: ${error.message}`);
  return ((data ?? []) as unknown as HourlyRow[]).map((r) =>
    toNum(r, ["hour", "spend", "impressions", "clicks", "link_clicks", "purchases", "purchase_value"]),
  );
}

export type CampaignMeta = { campaign_id: string; name: string | null; effective_status: string | null; objective: string | null; unidade: string | null };
export type AdsetMeta = { adset_id: string; campaign_id: string | null; name: string | null; effective_status: string | null; unidade: string | null; frequency_7d: number | null };
export type AdMeta = { ad_id: string; adset_id: string | null; campaign_id: string | null; name: string | null; effective_status: string | null; thumbnail_url: string | null; unidade: string | null };

async function selectAll<T>(supabase: Supa, table: string, cols: string, accountIds: string[]): Promise<T[]> {
  if (!accountIds.length) return [];
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase.from(table).select(cols).in("account_id", accountIds).range(from, from + PAGE - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    out.push(...((data ?? []) as unknown as T[]));
    if (!data || data.length < PAGE) break;
  }
  return out;
}

export const getCampaigns = (s: Supa, ids: string[]) =>
  selectAll<CampaignMeta>(s, "traffic_campaigns", "campaign_id,name,effective_status,objective,unidade", ids);
export const getAdsets = async (s: Supa, ids: string[]) =>
  (await selectAll<AdsetMeta>(s, "traffic_adsets", "adset_id,campaign_id,name,effective_status,unidade,frequency_7d", ids)).map(
    (a) => ({ ...a, frequency_7d: n(a.frequency_7d) }),
  );
export const getAds = (s: Supa, ids: string[]) =>
  selectAll<AdMeta>(s, "traffic_ads", "ad_id,adset_id,campaign_id,name,effective_status,thumbnail_url,unidade", ids);
