import { TrafficShell } from "@/components/trafego/shell";
import { DeltaBadge } from "@/components/trafego/kpi-card";
import { getDaily } from "@/lib/traffic/data";
import { loadTrafficPage, type SP } from "@/lib/traffic/page";
import { aggregateBy } from "@/lib/traffic/tree";
import { delta, derive, emptyTotals } from "@/lib/traffic/metrics";
import { fmtBRL, fmtDec, fmtInt } from "@/lib/traffic/format";

export const dynamic = "force-dynamic";

export default async function UnidadesPage({ searchParams }: { searchParams: SP }) {
  const { ctx, period, pulse } = await loadTrafficPage(searchParams);
  if (!ctx.client || !ctx.accountIds.length) {
    return <TrafficShell ctx={ctx} alerts={pulse?.alerts ?? []} period={period} title="Unidades">{null}</TrafficShell>;
  }
  // Um único nível (conjunto) evita contar a verba duas vezes; a unidade do conjunto
  // vem do traffic_unit_mapping (nome do conjunto, senão o da campanha).
  const [cur, prev, mapping] = await Promise.all([
    getDaily(ctx.supabase, ctx.accountIds, "adset", period.since, period.until),
    getDaily(ctx.supabase, ctx.accountIds, "adset", period.prevSince, period.prevUntil),
    ctx.supabase.from("traffic_unit_mapping").select("unidade,prioridade").eq("client_id", ctx.client.id),
  ]);
  const curAgg = aggregateBy(cur, (r) => r.unidade ?? "Geral");
  const prevAgg = aggregateBy(prev, (r) => r.unidade ?? "Geral");

  const configured = [...new Set((mapping.data ?? []).map((m) => m.unidade as string))];
  const units = [...new Set([...configured.filter((u) => u !== "Geral"), ...curAgg.keys(), "Geral"])].filter(
    (u) => u !== "Geral" || curAgg.has("Geral"),
  );
  const data = units.map((u) => ({
    u,
    c: derive(curAgg.get(u) ?? emptyTotals()),
    p: derive(prevAgg.get(u) ?? emptyTotals()),
  }));
  const maxSpend = Math.max(1, ...data.map((d) => Math.max(d.c.spend, d.c.purchase_value)));
  const total = derive([...curAgg.values()].reduce((a, t) => {
    for (const k of Object.keys(t) as (keyof typeof t)[]) a[k] += t[k];
    return a;
  }, emptyTotals()));

  return (
    <TrafficShell ctx={ctx} alerts={pulse?.alerts ?? []} period={period} title="Unidades">
      <h1 className="t-display text-xl font-bold tracking-wide">UNIDADES</h1>
      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {data.map(({ u, c, p }) => (
          <div key={u} className="t-card flex flex-col gap-2 p-4">
            <div className="flex items-baseline justify-between">
              <h2 className="t-display text-lg font-bold tracking-wide" style={{ color: "var(--t-champagne)" }}>{u.toUpperCase()}</h2>
              <span className="t-muted text-[11px]">
                {total.spend > 0 ? `${Math.round((c.spend / total.spend) * 100)}% da verba` : "—"}
              </span>
            </div>
            <p className="t-display t-glow-text text-3xl font-bold leading-none">{c.roas == null ? "—" : `${fmtDec(c.roas)}x`}</p>
            <DeltaBadge d={delta(c.roas, p.roas, "up_good")} />
            <dl className="grid grid-cols-2 gap-y-1 text-xs">
              <dt className="t-muted">Investimento</dt><dd className="text-right">{fmtBRL(c.spend)}</dd>
              <dt className="t-muted">Faturamento</dt><dd className="text-right">{fmtBRL(c.purchase_value)}</dd>
              <dt className="t-muted">Compras</dt><dd className="text-right">{fmtInt(c.purchases)}</dd>
              <dt className="t-muted">CPA</dt><dd className="text-right">{fmtBRL(c.cpa)}</dd>
            </dl>
            <div className="mt-1 flex flex-col gap-1" aria-hidden>
              <div className="t-bar"><span style={{ width: `${(c.purchase_value / maxSpend) * 100}%` }} /></div>
              <div className="t-bar"><span style={{ width: `${(c.spend / maxSpend) * 100}%`, background: "var(--t-champagne)", opacity: 0.7 }} /></div>
            </div>
            <p className="t-muted text-[10px]">barras: faturamento (dourado) · investimento (champanhe)</p>
          </div>
        ))}
      </section>
      <div className="t-card overflow-auto">
        <table className="t-table">
          <thead>
            <tr><th>Unidade</th><th>Investimento</th><th>Faturamento</th><th>ROAS</th><th>Compras</th><th>CPA</th><th>CTR</th></tr>
          </thead>
          <tbody>
            {data.map(({ u, c }) => (
              <tr key={u}>
                <td>{u}</td><td>{fmtBRL(c.spend)}</td><td>{fmtBRL(c.purchase_value)}</td>
                <td>{c.roas == null ? "—" : `${fmtDec(c.roas)}x`}</td><td>{fmtInt(c.purchases)}</td>
                <td>{fmtBRL(c.cpa)}</td><td>{c.ctr == null ? "—" : `${fmtDec(c.ctr)}%`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="t-muted text-[11px]">
        Unidade derivada do nome da campanha/conjunto pelo mapeamento do cliente. &quot;Geral&quot; = campanhas sem unidade (ex.: multiunidade).
      </p>
    </TrafficShell>
  );
}
