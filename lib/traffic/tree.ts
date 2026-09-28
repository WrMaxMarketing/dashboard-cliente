import { derive, emptyTotals, sumRows, type DailyRow, type Derived, type Totals } from "@/lib/traffic/metrics";

export type Node = {
  id: string;
  name: string;
  level: "campaign" | "adset" | "ad";
  status: string | null;
  unidade: string | null;
  thumbnail?: string | null;
  frequency7d?: number | null;
  m: Derived;
  children: Node[];
};

function add(t: Totals, r: DailyRow) {
  const s = sumRows([r]);
  for (const k of Object.keys(s) as (keyof Totals)[]) if (k !== "days") t[k] += s[k];
}

export function aggregateBy(rows: DailyRow[], key: (r: DailyRow) => string): Map<string, Totals> {
  const m = new Map<string, Totals>();
  for (const r of rows) {
    const k = key(r);
    const t = m.get(k) ?? emptyTotals();
    add(t, r);
    m.set(k, t);
  }
  return m;
}

/** Monta campanha > conjunto > anúncio só com itens que tiveram entrega no período. */
export function buildTree(
  camp: DailyRow[],
  adset: DailyRow[],
  ad: DailyRow[],
  meta: {
    campaigns: Map<string, { name: string | null; effective_status: string | null; unidade: string | null }>;
    adsets: Map<string, { name: string | null; effective_status: string | null; unidade: string | null; frequency_7d: number | null }>;
    ads: Map<string, { name: string | null; effective_status: string | null; unidade: string | null; thumbnail_url: string | null }>;
  },
): Node[] {
  const cAgg = aggregateBy(camp, (r) => r.campaign_id);
  const sAgg = aggregateBy(adset, (r) => `${r.campaign_id}|${r.adset_id}`);
  const aAgg = aggregateBy(ad, (r) => `${r.adset_id}|${r.ad_id}`);

  const adsBySet = new Map<string, Node[]>();
  for (const [k, t] of aAgg) {
    const [setId, adId] = k.split("|");
    const mm = meta.ads.get(adId);
    const list = adsBySet.get(setId) ?? [];
    list.push({
      id: adId, name: mm?.name ?? adId, level: "ad", status: mm?.effective_status ?? null,
      unidade: mm?.unidade ?? null, thumbnail: mm?.thumbnail_url ?? null, m: derive(t), children: [],
    });
    adsBySet.set(setId, list);
  }
  const setsByCamp = new Map<string, Node[]>();
  for (const [k, t] of sAgg) {
    const [campId, setId] = k.split("|");
    const mm = meta.adsets.get(setId);
    const list = setsByCamp.get(campId) ?? [];
    list.push({
      id: setId, name: mm?.name ?? setId, level: "adset", status: mm?.effective_status ?? null,
      unidade: mm?.unidade ?? null, frequency7d: mm?.frequency_7d ?? null, m: derive(t),
      children: (adsBySet.get(setId) ?? []).sort((a, b) => b.m.spend - a.m.spend),
    });
    setsByCamp.set(campId, list);
  }
  return [...cAgg.entries()]
    .map(([id, t]) => {
      const mm = meta.campaigns.get(id);
      return {
        id, name: mm?.name ?? id, level: "campaign" as const, status: mm?.effective_status ?? null,
        unidade: mm?.unidade ?? null, m: derive(t),
        children: (setsByCamp.get(id) ?? []).sort((a, b) => b.m.spend - a.m.spend),
      };
    })
    .filter((n) => n.m.spend > 0 || n.m.impressions > 0)
    .sort((a, b) => b.m.spend - a.m.spend);
}
