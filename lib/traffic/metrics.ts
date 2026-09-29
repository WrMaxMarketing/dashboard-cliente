// Métricas, deltas, ritmo de verba, saúde da conta, status e alertas.
// Tudo puro (sem I/O) para ser testável e reaproveitado por páginas e CSV.

export type DailyRow = {
  account_id: string;
  level: "account" | "campaign" | "adset" | "ad";
  campaign_id: string;
  adset_id: string;
  ad_id: string;
  date: string;
  unidade: string | null;
  spend: number;
  impressions: number;
  reach: number | null;
  frequency: number | null;
  clicks: number;
  link_clicks: number;
  landing_page_views: number;
  view_content: number;
  add_to_cart: number;
  initiate_checkout: number;
  purchases: number;
  purchase_value: number;
};

export type HourlyRow = {
  account_id: string;
  date: string;
  hour: number;
  spend: number;
  impressions: number;
  clicks: number;
  link_clicks: number;
  purchases: number;
  purchase_value: number;
};

export type Totals = {
  spend: number;
  impressions: number;
  clicks: number;
  link_clicks: number;
  landing_page_views: number;
  view_content: number;
  add_to_cart: number;
  initiate_checkout: number;
  purchases: number;
  purchase_value: number;
  days: number;
};

export type Derived = Totals & {
  roas: number | null;
  cpa: number | null;
  cpm: number | null;
  cpc: number | null;
  ctr: number | null; // CTR de link, %
  ticket: number | null;
};

const num = (v: unknown) => (typeof v === "number" ? v : Number(v ?? 0) || 0);

export function emptyTotals(): Totals {
  return {
    spend: 0, impressions: 0, clicks: 0, link_clicks: 0, landing_page_views: 0, view_content: 0,
    add_to_cart: 0, initiate_checkout: 0, purchases: 0, purchase_value: 0, days: 0,
  };
}

export function sumRows(rows: Partial<DailyRow>[]): Totals {
  const t = emptyTotals();
  const days = new Set<string>();
  for (const r of rows) {
    t.spend += num(r.spend);
    t.impressions += num(r.impressions);
    t.clicks += num(r.clicks);
    t.link_clicks += num(r.link_clicks);
    t.landing_page_views += num(r.landing_page_views);
    t.view_content += num(r.view_content);
    t.add_to_cart += num(r.add_to_cart);
    t.initiate_checkout += num(r.initiate_checkout);
    t.purchases += num(r.purchases);
    t.purchase_value += num(r.purchase_value);
    if (r.date) days.add(r.date);
  }
  t.days = days.size;
  return t;
}

export function derive(t: Totals): Derived {
  return {
    ...t,
    roas: t.spend > 0 ? t.purchase_value / t.spend : null,
    cpa: t.purchases > 0 ? t.spend / t.purchases : null,
    cpm: t.impressions > 0 ? (t.spend / t.impressions) * 1000 : null,
    cpc: t.link_clicks > 0 ? t.spend / t.link_clicks : null,
    ctr: t.impressions > 0 ? (t.link_clicks / t.impressions) * 100 : null,
    ticket: t.purchases > 0 ? t.purchase_value / t.purchases : null,
  };
}

/** Frequência média ponderada por impressões dos dias (aproximação diária). */
export function dailyFrequency(rows: Pick<DailyRow, "impressions" | "reach">[]): number | null {
  const withReach = rows.filter((r) => r.reach && r.reach > 0);
  const reach = withReach.reduce((s, r) => s + num(r.reach), 0);
  const imp = withReach.reduce((s, r) => s + num(r.impressions), 0);
  return reach > 0 ? imp / reach : null;
}

// ---------------------------------------------------------------- deltas
export type Direction = "up_good" | "down_good" | "neutral";
export type Delta = { pct: number | null; tone: "good" | "bad" | "neutral" };

export function delta(cur: number | null, prev: number | null, dir: Direction): Delta {
  if (cur == null || prev == null || prev === 0 || !Number.isFinite(cur) || !Number.isFinite(prev)) {
    return { pct: null, tone: "neutral" };
  }
  const pct = ((cur - prev) / Math.abs(prev)) * 100;
  if (dir === "neutral" || Math.abs(pct) < 0.05) return { pct, tone: "neutral" };
  const good = dir === "up_good" ? pct > 0 : pct < 0;
  return { pct, tone: good ? "good" : "bad" };
}

// ---------------------------------------------------------------- ritmo da verba
export type Pacing = {
  spent: number;
  budget: number | null;
  pctUsed: number | null; // gasto / verba
  pctMonth: number; // fração do mês decorrida
  deviation: number | null; // gasto/ideal - 1
  state: "adiantado" | "atrasado" | "no ritmo" | "sem verba";
};

/** monthFraction = fração do mês decorrida NO MOMENTO DO ÚLTIMO SYNC (o gasto é daquele instante). */
export function pacing(spentMonth: number, budget: number | null, monthFraction: number): Pacing {
  const pctMonth = Math.max(0, Math.min(1, monthFraction));
  if (!budget || budget <= 0) {
    return { spent: spentMonth, budget: null, pctUsed: null, pctMonth, deviation: null, state: "sem verba" };
  }
  const ideal = budget * pctMonth;
  const deviation = ideal > 0 ? spentMonth / ideal - 1 : null;
  const state = deviation == null ? "no ritmo" : deviation > 0.05 ? "adiantado" : deviation < -0.05 ? "atrasado" : "no ritmo";
  return { spent: spentMonth, budget, pctUsed: spentMonth / budget, pctMonth, deviation, state };
}

// ---------------------------------------------------------------- status da campanha
export type CampaignStatus = "ESCALANDO" | "NO ALVO" | "ATENÇÃO" | "CRÍTICO" | "SEM META" | "SEM DADOS";

export function campaignStatus(roas: number | null, metaRoas: number | null, spend: number): CampaignStatus {
  if (spend <= 0 || roas == null) return spend > 0 ? "CRÍTICO" : "SEM DADOS";
  if (!metaRoas) return "SEM META";
  const r = roas / metaRoas;
  if (r >= 1.3) return "ESCALANDO";
  if (r >= 1) return "NO ALVO";
  if (r >= 0.7) return "ATENÇÃO";
  return "CRÍTICO";
}

// ---------------------------------------------------------------- saúde da conta
export type HealthPart = { label: string; score: number | null; detail: string };

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

export function healthScore(input: {
  roas: number | null;
  metaRoas: number | null;
  pacingDeviation: number | null;
  frequency7d: number | null;
  ctr: number | null;
  ctrBaseline: number | null;
}): { score: number | null; parts: HealthPart[] } {
  const parts: HealthPart[] = [
    {
      label: "ROAS vs meta",
      score: input.roas != null && input.metaRoas ? clamp01(input.roas / input.metaRoas) : null,
      detail: input.metaRoas ? "ROAS do período ÷ meta" : "sem meta de ROAS cadastrada",
    },
    {
      label: "Ritmo da verba",
      score: input.pacingDeviation != null ? clamp01(1 - Math.abs(input.pacingDeviation) / 0.3) : null,
      detail: "desvio do gasto ideal para o dia do mês",
    },
    {
      label: "Frequência 7d",
      score: input.frequency7d != null ? clamp01((4.5 - input.frequency7d) / 2) : null,
      detail: "≤ 2,5 ótimo · ≥ 4,5 fadiga",
    },
    {
      label: "CTR vs média",
      score: input.ctr != null && input.ctrBaseline ? clamp01((input.ctr / input.ctrBaseline - 0.5) / 0.5) : null,
      detail: "CTR de link vs média de 90 dias da conta",
    },
  ];
  const valid = parts.filter((p) => p.score != null);
  const score = valid.length ? Math.round((valid.reduce((s, p) => s + (p.score as number), 0) / valid.length) * 100) : null;
  return { score, parts };
}

// ---------------------------------------------------------------- funil
export type FunnelStep = { label: string; value: number; rate: number | null; drop: boolean };

export function funnel(t: Totals): FunnelStep[] {
  const steps = [
    { label: "Visualizações de página", value: t.landing_page_views },
    { label: "Visualizou produto", value: t.view_content },
    { label: "Adicionou ao carrinho", value: t.add_to_cart },
    { label: "Iniciou checkout", value: t.initiate_checkout },
    { label: "Compra", value: t.purchases },
  ];
  const withRate = steps.map((s, i) => ({
    ...s,
    rate: i === 0 ? null : steps[i - 1].value > 0 ? (s.value / steps[i - 1].value) * 100 : null,
    drop: false,
  }));
  // Maior queda = menor taxa de passagem (entre as calculáveis)
  let worst = -1;
  withRate.forEach((s, i) => {
    if (s.rate != null && (worst < 0 || s.rate < (withRate[worst].rate as number))) worst = i;
  });
  if (worst > 0) withRate[worst].drop = true;
  return withRate;
}

// ---------------------------------------------------------------- alertas
export type Alert = { level: "critico" | "atencao"; title: string; detail: string };

export const FREQ_LIMIT = 3.5;

export function buildAlerts(input: {
  roasToday: number | null;
  spendToday: number;
  metaRoas: number | null;
  pacing: Pacing;
  adsetsHighFreq: { name: string; frequency: number }[];
  noPurchase48h: { name: string; spend: number }[];
  lastSync: { status: string; error: string | null; finished_at: string | null } | null;
}): Alert[] {
  const out: Alert[] = [];
  if (input.lastSync?.status === "error") {
    out.push({ level: "critico", title: "Erro no último sync", detail: input.lastSync.error?.slice(0, 180) || "falha sem mensagem" });
  }
  if (input.metaRoas && input.spendToday > 0 && input.roasToday != null && input.roasToday < input.metaRoas) {
    out.push({
      level: "atencao",
      title: "ROAS do dia abaixo da meta",
      detail: `${input.roasToday.toFixed(2).replace(".", ",")}x hoje · meta ${input.metaRoas.toFixed(2).replace(".", ",")}x`,
    });
  }
  if (input.pacing.deviation != null && input.pacing.deviation > 0.15) {
    out.push({
      level: "atencao",
      title: "Gasto do mês adiantado",
      detail: `${Math.round(input.pacing.deviation * 100)}% acima do ritmo ideal`,
    });
  }
  for (const a of input.adsetsHighFreq) {
    out.push({ level: "atencao", title: "Frequência alta (fadiga)", detail: `${a.name} · ${a.frequency.toFixed(2).replace(".", ",")} em 7 dias` });
  }
  for (const c of input.noPurchase48h) {
    out.push({
      level: "critico",
      title: "Gasto sem compras há 48h",
      detail: `${c.name} · R$ ${c.spend.toFixed(2).replace(".", ",")} sem compra`,
    });
  }
  return out;
}
