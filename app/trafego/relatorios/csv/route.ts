import { NextResponse, type NextRequest } from "next/server";
import { getAds, getAdsets, getCampaigns, getDaily, getTrafficContext } from "@/lib/traffic/data";
import { resolvePeriod } from "@/lib/traffic/periods";
import { derive, sumRows, type DailyRow } from "@/lib/traffic/metrics";

export const dynamic = "force-dynamic";

const LEVELS = ["account", "campaign", "adset", "ad"] as const;

// CSV pt-BR: ";" como separador, vírgula decimal, BOM para o Excel reconhecer UTF-8.
const dec = (v: number | null, d = 2) => (v == null ? "" : v.toFixed(d).replace(".", ","));
// Nomes vêm da Meta: neutraliza fórmulas (=, +, -, @) ao abrir no Excel.
const text = (v: string | null | undefined) => (v && /^[=+\-@\t\r]/.test(v) ? `'${v}` : v ?? "");
const cell = (v: string | number | null | undefined) => {
  const s = v == null ? "" : String(v);
  return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const ctx = await getTrafficContext(sp.get("c") ?? undefined); // sessão + RLS
  if (!ctx.client || !ctx.accountIds.length) {
    return NextResponse.json({ error: "painel não ativado" }, { status: 404 });
  }
  const level = (LEVELS as readonly string[]).includes(sp.get("nivel") ?? "") ? (sp.get("nivel") as DailyRow["level"]) : "campaign";
  const period = resolvePeriod(
    { p: sp.get("p") ?? undefined, de: sp.get("de") ?? undefined, ate: sp.get("ate") ?? undefined },
    ctx.client.fuso,
  );
  const [rows, campaigns, adsets, ads] = await Promise.all([
    getDaily(ctx.supabase, ctx.accountIds, level, period.since, period.until),
    level === "account" ? Promise.resolve([]) : getCampaigns(ctx.supabase, ctx.accountIds),
    level === "adset" || level === "ad" ? getAdsets(ctx.supabase, ctx.accountIds) : Promise.resolve([]),
    level === "ad" ? getAds(ctx.supabase, ctx.accountIds) : Promise.resolve([]),
  ]);
  const cName = new Map(campaigns.map((c) => [c.campaign_id, c.name ?? ""]));
  const sName = new Map(adsets.map((s) => [s.adset_id, s.name ?? ""]));
  const aName = new Map(ads.map((a) => [a.ad_id, a.name ?? ""]));

  const header = [
    "data", "conta", "campanha_id", "campanha", "conjunto_id", "conjunto", "anuncio_id", "anuncio", "unidade",
    "investimento", "impressoes", "alcance", "frequencia", "cliques", "cliques_link", "ctr_link_pct", "cpc_link", "cpm",
    "visualizacoes_pagina", "visualizou_produto", "carrinho", "checkout", "compras", "faturamento", "roas", "custo_por_compra",
  ];
  const lines = [header.join(";")];
  for (const r of rows) {
    const m = derive(sumRows([r]));
    lines.push(
      [
        r.date, r.account_id, r.campaign_id, text(cName.get(r.campaign_id)), r.adset_id, text(sName.get(r.adset_id)),
        r.ad_id, text(aName.get(r.ad_id)), text(r.unidade),
        dec(r.spend), r.impressions, r.reach ?? "", dec(r.frequency, 4), r.clicks, r.link_clicks, dec(m.ctr, 4), dec(m.cpc),
        dec(m.cpm), r.landing_page_views, r.view_content, r.add_to_cart, r.initiate_checkout, r.purchases,
        dec(r.purchase_value), dec(m.roas, 4), dec(m.cpa),
      ].map(cell).join(";"),
    );
  }
  const slug = ctx.client.nome.normalize("NFKD").replace(/[^\w]+/g, "-").toLowerCase();
  return new NextResponse("﻿" + lines.join("\r\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="trafego-${slug}-${level}-${period.since}_${period.until}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
