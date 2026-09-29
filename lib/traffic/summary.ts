import "server-only";
import { getAdsets, getCampaigns, getDaily, type TrafficContext } from "@/lib/traffic/data";
import { addDays, daysInMonth, monthStart, todayIn } from "@/lib/traffic/periods";
import { buildAlerts, derive, FREQ_LIMIT, pacing, sumRows, type Alert, type Pacing } from "@/lib/traffic/metrics";
import type { createClient } from "@/lib/supabase/server";

type Supa = Awaited<ReturnType<typeof createClient>>;

export type AccountPulse = {
  today: string;
  nowHour: number;
  /** Momento do último sync com sucesso, no fuso do cliente (os números valem até aqui). */
  asOf: { date: string; hour: number; minute: number } | null;
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
  // "Sem compras há 48h": ontem-1, ontem e hoje => janela de pelo menos 48h.
  const twoDaysAgo = addDays(today, -2);
  const asOf = ctx.sync.lastSuccess ? todayIn(client.fuso, new Date(ctx.sync.lastSuccess)) : null;

  const [monthRows, campRows, campaigns, adsets] = await Promise.all([
    getDaily(supabase, ctx.accountIds, "account", mStart < twoDaysAgo ? mStart : twoDaysAgo, today),
    getDaily(supabase, ctx.accountIds, "campaign", twoDaysAgo, today),
    getCampaigns(supabase, ctx.accountIds),
    getAdsets(supabase, ctx.accountIds),
  ]);

  const month = sumRows(monthRows.filter((r) => r.date >= mStart));
  const todayT = derive(sumRows(monthRows.filter((r) => r.date === today)));
  // Ritmo medido no instante do último sync (e não "agora"), senão parece atrasado
  // só porque o dado de hoje ainda não foi buscado.
  const monthFraction =
    asOf && asOf.date >= mStart
      ? (Number(asOf.date.slice(8, 10)) - 1 + (asOf.hour + asOf.minute / 60) / 24) / daysInMonth(today)
      : 0;
  const pace = pacing(month.spend, client.verba_mensal, monthFraction);

  const campName = new Map(campaigns.map((c) => [c.campaign_id, c.name ?? c.campaign_id]));
  const byCamp = new Map<string, { spend: number; purchases: number }>();
  for (const r of campRows) {
    const cur = byCamp.get(r.campaign_id) ?? { spend: 0, purchases: 0 };
    cur.spend += r.spend;
    cur.purchases += r.purchases;
    byCamp.set(r.campaign_id, cur);
  }
  const activeIds = new Set(campaigns.filter((c) => c.effective_status === "ACTIVE").map((c) => c.campaign_id));
  // Só campanhas ativas e com gasto relevante (evita alerta por centavos).
  const minSpend = Math.max(20, 2 * (client.meta_cpa ?? 0));
  const noPurchase48h = [...byCamp.entries()]
    .filter(([id, v]) => activeIds.has(id) && v.spend >= minSpend && v.purchases === 0)
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

  return { today, nowHour: hour, asOf, pacing: pace, roasToday: todayT.roas, spendToday: todayT.spend, alerts };
}
