import Link from "next/link";
import { BadgeDollarSign, Coins, ShoppingBag, TrendingUp } from "lucide-react";
import { TrafficShell } from "@/components/trafego/shell";
import { DeltaBadge, KpiCard } from "@/components/trafego/kpi-card";
import { MainChart, type ChartPoint } from "@/components/trafego/main-chart";
import { Ring } from "@/components/trafego/ring";
import { Sparkline } from "@/components/trafego/sparkline";
import { CampaignRow, type CampaignSummary } from "@/components/trafego/campaign-row";
import { getCampaigns, getDaily, getHourly } from "@/lib/traffic/data";
import { loadTrafficPage, type SP } from "@/lib/traffic/page";
import { addDays, daysBetween, eachDay } from "@/lib/traffic/periods";
import {
  campaignStatus,
  dailyFrequency,
  delta,
  derive,
  emptyTotals,
  FREQ_LIMIT,
  funnel,
  healthScore,
  sumRows,
  type HourlyRow,
  type Totals,
} from "@/lib/traffic/metrics";
import { fmtBRL, fmtBRL0, fmtDayShort, fmtDec, fmtInt, fmtPct } from "@/lib/traffic/format";

export const dynamic = "force-dynamic";

function hourlyTotals(rows: HourlyRow[]): Totals {
  const t = emptyTotals();
  for (const r of rows) {
    t.spend += r.spend;
    t.impressions += r.impressions;
    t.clicks += r.clicks;
    t.link_clicks += r.link_clicks;
    t.purchases += r.purchases;
    t.purchase_value += r.purchase_value;
  }
  t.days = rows.length ? 1 : 0;
  return t;
}

export default async function TrafegoOverview({ searchParams }: { searchParams: SP }) {
  const { ctx, period, pulse, qs } = await loadTrafficPage(searchParams);
  const client = ctx.client;
  if (!client || !ctx.accountIds.length || !pulse) {
    return <TrafficShell ctx={ctx} alerts={pulse?.alerts ?? []} period={period} title="Visão geral">{null}</TrafficShell>;
  }

  const len = daysBetween(period.since, period.until) + 1;
  const sparkSince = len < 7 ? addDays(period.until, -13) : period.since;
  const baselineSince = addDays(period.today, -89);
  const fetchSince = [period.prevSince, sparkSince, baselineSince].sort()[0];

  const [acctRows, campRows, campaigns, hourly] = await Promise.all([
    getDaily(ctx.supabase, ctx.accountIds, "account", fetchSince, period.until),
    getDaily(ctx.supabase, ctx.accountIds, "campaign", period.since, period.until),
    getCampaigns(ctx.supabase, ctx.accountIds),
    period.hourly ? getHourly(ctx.supabase, ctx.accountIds, [period.today, addDays(period.today, -1)]) : Promise.resolve([]),
  ]);

  const inRange = (d: string, a: string, b: string) => d >= a && d <= b;
  const curRows = acctRows.filter((r) => inRange(r.date, period.since, period.until));
  const cur = derive(sumRows(curRows));

  // "Hoje" compara com ontem ATÉ A MESMA HORA (se houver dado por hora de ontem).
  const yHourly = hourly.filter((h) => h.date === addDays(period.today, -1) && h.hour <= period.nowHour);
  const prevRaw =
    period.hourly && yHourly.length
      ? hourlyTotals(yHourly)
      : sumRows(acctRows.filter((r) => inRange(r.date, period.prevSince, period.prevUntil)));
  // Sem dado em pelo menos metade dos dias do período anterior => não comparamos (evita % enganoso).
  const prevDays = daysBetween(period.prevSince, period.prevUntil) + 1;
  const prevOk = period.hourly ? prevRaw.days > 0 : prevRaw.days >= Math.ceil(prevDays / 2);
  const prev = derive(prevOk ? prevRaw : { ...emptyTotals(), spend: NaN, purchase_value: NaN, purchases: NaN, impressions: NaN, link_clicks: NaN });
  const prevLabel = !prevOk
    ? "indisponíveis: o período anterior ainda não tem dados sincronizados"
    : !period.hourly
    ? "vs período anterior"
    : yHourly.length
      ? "vs ontem até esta hora"
      : "vs ontem (dia inteiro — o dado por hora de ontem ainda não foi sincronizado)";

  // ---------- gráfico principal
  let chart: ChartPoint[];
  if (period.hourly) {
    const today = hourly.filter((h) => h.date === period.today);
    chart = Array.from({ length: period.nowHour + 1 }, (_, h) => {
      const rows = today.filter((r) => r.hour === h);
      return {
        label: `${String(h).padStart(2, "0")}h`,
        faturamento: rows.reduce((s, r) => s + r.purchase_value, 0),
        investimento: rows.reduce((s, r) => s + r.spend, 0),
      };
    });
    if (!today.length) chart = [];
  } else {
    chart = eachDay(period.since, period.until).map((d) => {
      const rows = curRows.filter((r) => r.date === d);
      return {
        label: d === period.today ? "hoje" : fmtDayShort(d),
        faturamento: rows.reduce((s, r) => s + r.purchase_value, 0),
        investimento: rows.reduce((s, r) => s + r.spend, 0),
      };
    });
    if (!curRows.length) chart = [];
  }

  // ---------- campanhas
  const meta = new Map(campaigns.map((c) => [c.campaign_id, c]));
  const byCamp = new Map<string, Totals>();
  for (const r of campRows) {
    const t = byCamp.get(r.campaign_id) ?? emptyTotals();
    const s = sumRows([r]);
    for (const k of Object.keys(s) as (keyof Totals)[]) t[k] += s[k];
    byCamp.set(r.campaign_id, t);
  }
  const campList: CampaignSummary[] = [...byCamp.entries()]
    .map(([id, t]) => {
      const d = derive(t);
      const m = meta.get(id);
      return {
        id,
        name: m?.name ?? id,
        active: m?.effective_status === "ACTIVE",
        unidade: m?.unidade ?? null,
        spend: d.spend,
        roas: d.roas,
        purchases: d.purchases,
        cpa: d.cpa,
        status: campaignStatus(d.roas, client.meta_roas, d.spend),
      };
    })
    .filter((c) => c.spend > 0)
    .sort((a, b) => Number(b.active) - Number(a.active) || b.spend - a.spend);

  // ---------- mini cards
  const sparkDays = eachDay(sparkSince, period.until);
  const spark = (fn: (t: ReturnType<typeof derive>) => number | null) =>
    sparkDays.map((d) => ({ label: fmtDayShort(d), v: fn(derive(sumRows(acctRows.filter((r) => r.date === d)))) }));
  const freqSpark = sparkDays.map((d) => ({
    label: fmtDayShort(d),
    v: dailyFrequency(acctRows.filter((r) => r.date === d)),
  }));
  const reachSum = ctx.accounts.reduce((s, a) => s + (a.reach_7d ?? 0), 0);
  const freq7d =
    reachSum > 0
      ? ctx.accounts.reduce((s, a) => s + (a.frequency_7d ?? 0) * (a.reach_7d ?? 0), 0) / reachSum
      : ctx.accounts.find((a) => a.frequency_7d != null)?.frequency_7d ?? null;

  const baseline = derive(sumRows(acctRows.filter((r) => r.date >= baselineSince)));
  const health = healthScore({
    roas: cur.roas,
    metaRoas: client.meta_roas,
    pacingDeviation: pulse.pacing.deviation,
    frequency7d: freq7d,
    ctr: cur.ctr,
    ctrBaseline: baseline.ctr,
  });
  const steps = funnel(cur);
  const pace = pulse.pacing;

  return (
    <TrafficShell ctx={ctx} alerts={pulse.alerts} period={period} title="Visão geral">
      {/* 2. KPIs */}
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4 [&>*]:min-w-0" aria-label="Indicadores principais">
        <KpiCard icon={Coins} label="Investimento" value={cur.spend} kind="brl" delta={{ ...delta(cur.spend, prev.spend, "neutral") }} />
        <KpiCard icon={BadgeDollarSign} label="Faturamento" value={cur.purchase_value} kind="brl" delta={delta(cur.purchase_value, prev.purchase_value, "up_good")} />
        <KpiCard
          icon={TrendingUp}
          label="ROAS"
          value={cur.roas}
          kind="roas"
          delta={delta(cur.roas, prev.roas, "up_good")}
          sub={client.meta_roas ? <>meta {fmtDec(client.meta_roas)}x</> : <>meta não definida</>}
        />
        <KpiCard
          icon={ShoppingBag}
          label="Compras"
          value={cur.purchases}
          kind="int"
          delta={delta(cur.purchases, prev.purchases, "up_good")}
          sub={
            <span className="flex flex-wrap items-center gap-x-1.5">
              CPA{" "}
              <b
                style={{
                  color:
                    client.meta_cpa && cur.cpa != null
                      ? cur.cpa <= client.meta_cpa
                        ? "var(--t-gold-light)"
                        : "var(--t-critical)"
                      : "var(--t-champagne)",
                }}
              >
                {fmtBRL(cur.cpa)}
              </b>
              {client.meta_cpa ? <span>· meta {fmtBRL(client.meta_cpa)}</span> : null}
              <DeltaBadge d={delta(cur.cpa, prev.cpa, "down_good")} suffix="" />
            </span>
          }
        />
      </section>
      <p className="t-muted -mt-2 text-[11px]">Variações {prevLabel}.</p>

      {/* 3. Gráfico principal + ritmo da verba */}
      <section className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="t-card p-4">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h2 className="t-display text-lg font-bold tracking-wide">INVESTIMENTO x FATURAMENTO</h2>
            <div className="flex items-center gap-3 text-[11px]">
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-2 w-3 rounded-sm" style={{ background: "var(--t-gold)" }} aria-hidden /> Faturamento
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block w-3 border-t-2 border-dashed" style={{ borderColor: "var(--t-champagne)" }} aria-hidden /> Investimento
              </span>
            </div>
          </div>
          <MainChart data={chart} hourly={period.hourly} />
          <details className="mt-2 text-xs">
            <summary className="t-muted cursor-pointer">Ver tabela</summary>
            <div className="mt-2 max-h-56 overflow-auto">
              <table className="t-table">
                <thead>
                  <tr><th>{period.hourly ? "Hora" : "Dia"}</th><th>Investimento</th><th>Faturamento</th><th>ROAS</th></tr>
                </thead>
                <tbody>
                  {chart.map((p) => (
                    <tr key={p.label}>
                      <td>{p.label}</td>
                      <td>{fmtBRL(p.investimento)}</td>
                      <td>{fmtBRL(p.faturamento)}</td>
                      <td>{p.investimento > 0 ? `${fmtDec(p.faturamento / p.investimento)}x` : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </div>

        <div className="t-card flex flex-col items-center gap-3 p-4">
          <h2 className="t-display self-start text-lg font-bold tracking-wide">RITMO DA VERBA</h2>
          <Ring
            value={pace.pctUsed}
            marker={pace.budget ? pace.pctMonth : null}
            label={`Gasto do mês: ${fmtPct((pace.pctUsed ?? 0) * 100)} da verba`}
            color={pace.deviation != null && pace.deviation > 0.15 ? "var(--t-amber)" : "var(--t-gold)"}
          >
            <div>
              <p className="t-display t-glow-text text-3xl font-bold leading-none">
                {pace.pctUsed == null ? "—" : fmtPct(pace.pctUsed * 100, 0)}
              </p>
              <p className="t-muted mt-1 text-[10px] uppercase tracking-widest">da verba</p>
            </div>
          </Ring>
          <p className="text-center text-sm">
            <b style={{ color: "var(--t-champagne)" }}>{fmtBRL0(pace.spent)}</b>
            <span className="t-muted"> de {fmtBRL0(pace.budget)}</span>
          </p>
          <p
            className={`rounded-full border px-3 py-1 text-xs font-semibold ${
              pace.state === "adiantado" ? "t-warn" : pace.state === "atrasado" ? "t-neutral" : "t-good"
            }`}
            style={{ borderColor: "var(--t-border-soft)" }}
          >
            {pace.state === "sem verba"
              ? "Verba mensal não cadastrada"
              : pace.state === "no ritmo"
                ? "No ritmo ideal"
                : `${pace.state === "adiantado" ? "Adiantado" : "Atrasado"} ${fmtPct(Math.abs((pace.deviation ?? 0) * 100), 0)}`}
          </p>
          <p className="t-muted text-center text-[11px]">
            Ideal hoje: {fmtPct(pace.pctMonth * 100, 0)} do mês (marca clara no anel)
          </p>
        </div>
      </section>

      {/* 4. Campanhas + 5. Funil */}
      <section className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <div className="t-card p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="t-display text-lg font-bold tracking-wide">CAMPANHAS ATIVAS</h2>
            <Link href={`/trafego/campanhas${qs ? `?${qs}` : ""}`} className="t-gold text-xs font-semibold">
              Ver todas →
            </Link>
          </div>
          {campList.length === 0 ? (
            <p className="t-muted py-6 text-center text-sm">Nenhuma campanha com gasto no período.</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {campList.slice(0, 6).map((c) => (
                <CampaignRow key={c.id} c={c} metaRoas={client.meta_roas} />
              ))}
            </ul>
          )}
        </div>

        <div className="t-card p-4">
          <h2 className="t-display mb-3 text-lg font-bold tracking-wide">FUNIL DE CONVERSÃO</h2>
          <ol className="flex flex-col gap-2.5">
            {steps.map((s, i) => {
              const max = Math.max(1, steps[0].value, ...steps.map((x) => x.value));
              return (
                <li key={s.label}>
                  {i > 0 && (
                    <p className={`mb-1 pl-1 text-[11px] font-semibold ${s.drop ? "t-warn" : "t-muted"}`}>
                      ↓ {s.rate == null ? "—" : fmtPct(s.rate)} passaram{s.drop ? " · maior queda" : ""}
                    </p>
                  )}
                  <div className="flex items-center justify-between gap-2 text-sm">
                    <span className={s.drop ? "t-warn" : undefined}>{s.label}</span>
                    <b className="t-display text-base">{fmtInt(s.value)}</b>
                  </div>
                  <div className="t-bar mt-1">
                    <span
                      style={{
                        width: `${Math.max(2, (s.value / max) * 100)}%`,
                        ...(s.drop ? { background: "linear-gradient(90deg,#8c5a00,var(--t-amber))" } : {}),
                      }}
                    />
                  </div>
                </li>
              );
            })}
          </ol>
          <p className="t-muted mt-3 text-[11px]">
            Conversão total (página → compra):{" "}
            {steps[0].value > 0 ? fmtPct((cur.purchases / steps[0].value) * 100, 2) : "—"}
          </p>
        </div>
      </section>

      {/* 6. Mini cards */}
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4 [&>*]:min-w-0" aria-label="Eficiência">
        <MiniCard label="CPM" value={fmtBRL(cur.cpm)} d={delta(cur.cpm, prev.cpm, "down_good")}>
          <Sparkline data={spark((t) => t.cpm)} format="brl" />
        </MiniCard>
        <MiniCard label="CTR (link)" value={fmtPct(cur.ctr, 2)} d={delta(cur.ctr, prev.ctr, "up_good")}>
          <Sparkline data={spark((t) => t.ctr)} format="pct" />
        </MiniCard>
        <MiniCard label="CPC (link)" value={fmtBRL(cur.cpc)} d={delta(cur.cpc, prev.cpc, "down_good")}>
          <Sparkline data={spark((t) => t.cpc)} format="brl" />
        </MiniCard>
        <MiniCard
          label="Frequência 7d"
          value={fmtDec(freq7d)}
          warn={freq7d != null && freq7d > FREQ_LIMIT}
          note={freq7d != null && freq7d > FREQ_LIMIT ? "⚠ fadiga (> 3,5)" : "média diária no gráfico"}
        >
          <Sparkline data={freqSpark} format="dec" />
        </MiniCard>
      </section>

      {/* 7. Saúde da conta */}
      <section className="t-card flex flex-col items-center gap-4 p-4 sm:flex-row sm:items-center">
        <Ring value={health.score == null ? null : health.score / 100} size={120} label={`Saúde da conta ${health.score ?? "sem dado"}`}>
          <div>
            <p className="t-display t-glow-text text-3xl font-bold leading-none">{health.score ?? "—"}</p>
            <p className="t-muted mt-1 text-[10px] uppercase tracking-widest">de 100</p>
          </div>
        </Ring>
        <div className="w-full">
          <h2 className="t-display mb-2 text-lg font-bold tracking-wide">SAÚDE DA CONTA</h2>
          <ul className="grid gap-2 sm:grid-cols-2">
            {health.parts.map((p) => (
              <li key={p.label}>
                <div className="flex justify-between text-xs">
                  <span>{p.label}</span>
                  <b className="t-display">{p.score == null ? "—" : Math.round(p.score * 100)}</b>
                </div>
                <div className="t-bar mt-1">
                  <span style={{ width: `${(p.score ?? 0) * 100}%` }} />
                </div>
                <p className="t-muted mt-0.5 text-[10px]">{p.detail}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </TrafficShell>
  );
}

function MiniCard({
  label,
  value,
  d,
  warn,
  note,
  children,
}: {
  label: string;
  value: string;
  d?: ReturnType<typeof delta>;
  warn?: boolean;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="t-card-flat flex min-w-0 flex-col gap-1 p-3" style={warn ? { borderColor: "rgba(240,162,2,0.55)" } : undefined}>
      <span className="t-eyebrow">{label}</span>
      <span className={`t-display text-2xl font-bold leading-none ${warn ? "t-warn" : ""}`}>{value}</span>
      {d ? <DeltaBadge d={d} suffix="" /> : <span className={`text-[11px] ${warn ? "t-warn" : "t-muted"}`}>{note}</span>}
      {children}
    </div>
  );
}
