import "server-only";
import { getAdsets, getCampaigns, getDaily, type TrafficContext } from "@/lib/traffic/data";
import { addDays, daysInMonth, monthStart, todayIn } from "@/lib/traffic/periods";
import { buildAlerts, derive, FREQ_LIMIT, pacing, sumRows, type Alert, type Pacing } from "@/lib/traffic/metrics";
import type { createClient } from "@/lib/supabase/server";

type Supa = Awaited<ReturnType<typeof createClient>>;

export type AccountPulse = {
  today: string;
  nowHour: number;
  pacing: Pacing;
  roasToday: number | null;
  spendToday: number;
  alerts: Alert[];
};

/** Dados do header (sino) e do ritmo da verba — compartilhados por todas as abas. */
export async function getAccountPulse(supabase: Supa, ctx: TrafficContext): Promise<AccountPulse | null> {
  const client = ctx.client;
  if (!client || !ctx.accountIds.length) return null;
  const { date: today, hour } = todayIn(client.fuso);
  const mStart = monthStart(today);
  const twoDaysAgo = addDays(today, -1);

  const [monthRows, campRows, campaigns, adsets] = await Promise.all([
    getDaily(supabase, ctx.accountIds, "account", mStart < twoDaysAgo ? mStart : twoDaysAgo, today),
    getDaily(supabase, ctx.accountIds, "campaign", twoDaysAgo, today),
    getCampaigns(supabase, ctx.accountIds),
    getAdsets(supabase, ctx.accountIds),
  ]);

  const month = sumRows(monthRows.filter((r) => r.date >= mStart));
  const todayT = derive(sumRows(monthRows.filter((r) => r.date === today)));
  const pace = pacing(month.spend, client.verba_mensal, Number(today.slice(8, 10)), hour, daysInMonth(today));

  const campName = new Map(campaigns.map((c) => [c.campaign_id, c.name ?? c.campaign_id]));
  const byCamp = new Map<string, { spend: number; purchases: number }>();
  for (const r of campRows) {
    const cur = byCamp.get(r.campaign_id) ?? { spend: 0, purchases: 0 };
    cur.spend += r.spend;
    cur.purchases += r.purchases;
    byCamp.set(r.campaign_id, cur);
  }
  const noPurchase48h = [...byCamp.entries()]
    .filter(([, v]) => v.spend > 0 && v.purchases === 0)
    .map(([id, v]) => ({ name: campName.get(id) ?? id, spend: v.spend }))
    .sort((a, b) => b.spend - a.spend);

  const activeCampaigns = new Set(campaigns.filter((c) => c.effective_status === "ACTIVE").map((c) => c.campaign_id));
  const adsetsHighFreq = adsets
    .filter((a) => a.frequency_7d != null && a.frequency_7d > FREQ_LIMIT && a.effective_status === "ACTIVE" &&
      (!a.campaign_id || activeCampaigns.has(a.campaign_id)))
    .map((a) => ({ name: a.name ?? a.adset_id, frequency: a.frequency_7d as number }))
    .sort((a, b) => b.frequency - a.frequency);

  const alerts = buildAlerts({
    roasToday: todayT.roas,
    spendToday: todayT.spend,
    metaRoas: client.meta_roas,
    pacing: pace,
    adsetsHighFreq,
    noPurchase48h,
    lastSync: ctx.sync.last,
  });

  return { today, nowHour: hour, pacing: pace, roasToday: todayT.roas, spendToday: todayT.spend, alerts };
}
