import { FileSpreadsheet } from "lucide-react";
import { TrafficShell } from "@/components/trafego/shell";
import { PrintButton } from "@/components/trafego/print-button";
import { getCampaigns, getDaily } from "@/lib/traffic/data";
import { loadTrafficPage, type SP } from "@/lib/traffic/page";
import { aggregateBy } from "@/lib/traffic/tree";
import { derive, funnel, sumRows } from "@/lib/traffic/metrics";
import { fmtBRL, fmtDateBR, fmtDec, fmtInt, fmtPct } from "@/lib/traffic/format";

export const dynamic = "force-dynamic";

export default async function RelatoriosPage({ searchParams }: { searchParams: SP }) {
  const { ctx, period, pulse, qs } = await loadTrafficPage(searchParams);
  if (!ctx.client || !ctx.accountIds.length) {
    return <TrafficShell ctx={ctx} alerts={pulse?.alerts ?? []} period={period} title="Relatórios">{null}</TrafficShell>;
  }
  const [acct, adsetRows, camp, campaigns] = await Promise.all([
    getDaily(ctx.supabase, ctx.accountIds, "account", period.since, period.until),
    getDaily(ctx.supabase, ctx.accountIds, "adset", period.since, period.until),
    getDaily(ctx.supabase, ctx.accountIds, "campaign", period.since, period.until),
    getCampaigns(ctx.supabase, ctx.accountIds),
  ]);
  const t = derive(sumRows(acct));
  const names = new Map(campaigns.map((c) => [c.campaign_id, c.name ?? c.campaign_id]));
  const byCamp = [...aggregateBy(camp, (r) => r.campaign_id).entries()]
    .map(([id, x]) => ({ id, name: names.get(id) ?? id, m: derive(x) }))
    .filter((c) => c.m.spend > 0)
    .sort((a, b) => b.m.spend - a.m.spend);
  const byUnit = [...aggregateBy(adsetRows, (r) => r.unidade ?? "Geral").entries()]
    .map(([u, x]) => ({ u, m: derive(x) }))
    .sort((a, b) => b.m.spend - a.m.spend);
  const csv = (nivel: string) => `/trafego/relatorios/csv?${new URLSearchParams([...new URLSearchParams(qs), ["nivel", nivel]])}`;

  return (
    <TrafficShell ctx={ctx} alerts={pulse?.alerts ?? []} period={period} title="Relatórios">
      <section className="t-card t-noprint flex flex-col gap-3 p-4">
        <h1 className="t-display text-xl font-bold tracking-wide">EXPORTAR</h1>
        <div className="flex flex-wrap gap-2">
          <PrintButton />
          {[
            ["account", "CSV diário (conta)"],
            ["campaign", "CSV por campanha"],
            ["adset", "CSV por conjunto"],
            ["ad", "CSV por anúncio"],
          ].map(([n, label]) => (
            <a key={n} href={csv(n)} className="t-pill inline-flex items-center gap-1.5" download>
              <FileSpreadsheet className="h-3.5 w-3.5" aria-hidden /> {label}
            </a>
          ))}
        </div>
        <p className="t-muted text-[11px]">
          O PDF usa a janela de impressão do navegador (escolha &quot;Salvar como PDF&quot;) com o mesmo visual abaixo.
          CSV em UTF-8 com separador &quot;;&quot; e vírgula decimal (abre direto no Excel pt-BR).
        </p>
      </section>

      {/* Conteúdo do relatório (é o que vai para o PDF) */}
      <article className="flex flex-col gap-3">
        <header className="t-card p-4">
          <p className="t-eyebrow">Relatório de tráfego pago · Meta Ads</p>
          <h2 className="t-display t-glow-text text-2xl font-bold">{ctx.client.nome}</h2>
          <p className="t-muted text-sm">
            {fmtDateBR(period.since)} a {fmtDateBR(period.until)} · gerado por WRMax Marketing & IA
          </p>
        </header>
        <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            ["Investimento", fmtBRL(t.spend)],
            ["Faturamento", fmtBRL(t.purchase_value)],
            ["ROAS", t.roas == null ? "—" : `${fmtDec(t.roas)}x`],
            ["Compras", fmtInt(t.purchases)],
            ["Custo por compra", fmtBRL(t.cpa)],
            ["CPM", fmtBRL(t.cpm)],
            ["CTR (link)", fmtPct(t.ctr, 2)],
            ["CPC (link)", fmtBRL(t.cpc)],
          ].map(([k, v]) => (
            <div key={k} className="t-card p-3">
              <p className="t-eyebrow">{k}</p>
              <p className="t-display t-glow-text text-2xl font-bold">{v}</p>
            </div>
          ))}
        </section>
        <section className="t-card p-4">
          <h3 className="t-display mb-2 text-lg font-bold">FUNIL</h3>
          <table className="t-table">
            <tbody>
              {funnel(t).map((s) => (
                <tr key={s.label}>
                  <td className={s.drop ? "t-warn" : undefined}>{s.label}</td>
                  <td>{fmtInt(s.value)}</td>
                  <td className={s.drop ? "t-warn" : "t-muted"}>{s.rate == null ? "" : `${fmtPct(s.rate)} da etapa anterior`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
        <section className="t-card overflow-auto p-4">
          <h3 className="t-display mb-2 text-lg font-bold">UNIDADES</h3>
          <table className="t-table">
            <thead><tr><th>Unidade</th><th>Investimento</th><th>Faturamento</th><th>ROAS</th><th>Compras</th></tr></thead>
            <tbody>
              {byUnit.map(({ u, m }) => (
                <tr key={u}><td>{u}</td><td>{fmtBRL(m.spend)}</td><td>{fmtBRL(m.purchase_value)}</td><td>{m.roas == null ? "—" : `${fmtDec(m.roas)}x`}</td><td>{fmtInt(m.purchases)}</td></tr>
              ))}
            </tbody>
          </table>
        </section>
        <section className="t-card overflow-auto p-4">
          <h3 className="t-display mb-2 text-lg font-bold">CAMPANHAS</h3>
          <table className="t-table">
            <thead><tr><th>Campanha</th><th>Investimento</th><th>Faturamento</th><th>ROAS</th><th>Compras</th><th>CPA</th></tr></thead>
            <tbody>
              {byCamp.map(({ id, name, m }) => (
                <tr key={id}>
                  <td className="max-w-[280px] truncate" title={name}>{name}</td><td>{fmtBRL(m.spend)}</td><td>{fmtBRL(m.purchase_value)}</td>
                  <td>{m.roas == null ? "—" : `${fmtDec(m.roas)}x`}</td><td>{fmtInt(m.purchases)}</td><td>{fmtBRL(m.cpa)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </article>
    </TrafficShell>
  );
}
