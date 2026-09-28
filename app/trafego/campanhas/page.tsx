import { TrafficShell } from "@/components/trafego/shell";
import { CampaignsTable } from "@/components/trafego/campaigns-table";
import { getAds, getAdsets, getCampaigns, getDaily } from "@/lib/traffic/data";
import { loadTrafficPage, type SP } from "@/lib/traffic/page";
import { buildTree } from "@/lib/traffic/tree";

export const dynamic = "force-dynamic";

export default async function CampanhasPage({ searchParams }: { searchParams: SP }) {
  const { ctx, period, pulse } = await loadTrafficPage(searchParams);
  if (!ctx.client || !ctx.accountIds.length) {
    return <TrafficShell ctx={ctx} alerts={pulse?.alerts ?? []} period={period} title="Campanhas">{null}</TrafficShell>;
  }
  const ids = ctx.accountIds;
  const [camp, adset, ad, campaigns, adsets, ads] = await Promise.all([
    getDaily(ctx.supabase, ids, "campaign", period.since, period.until),
    getDaily(ctx.supabase, ids, "adset", period.since, period.until),
    getDaily(ctx.supabase, ids, "ad", period.since, period.until),
    getCampaigns(ctx.supabase, ids),
    getAdsets(ctx.supabase, ids),
    getAds(ctx.supabase, ids),
  ]);
  const tree = buildTree(camp, adset, ad, {
    campaigns: new Map(campaigns.map((c) => [c.campaign_id, c])),
    adsets: new Map(adsets.map((a) => [a.adset_id, a])),
    ads: new Map(ads.map((a) => [a.ad_id, a])),
  });

  return (
    <TrafficShell ctx={ctx} alerts={pulse?.alerts ?? []} period={period} title="Campanhas">
      <h1 className="t-display text-xl font-bold tracking-wide">CAMPANHAS · CONJUNTOS · ANÚNCIOS</h1>
      <CampaignsTable tree={tree} metaRoas={ctx.client.meta_roas} />
      <p className="t-muted text-[11px]">
        Compras e faturamento pelo evento de compra do pixel ({ctx.client.purchase_action_type}). CTR e CPC são de clique no link.
        Frequência 7d vem do recorte de 7 dias da Meta (não soma por dia).
      </p>
    </TrafficShell>
  );
}
