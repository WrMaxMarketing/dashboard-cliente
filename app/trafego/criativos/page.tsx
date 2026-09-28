import { TrafficShell } from "@/components/trafego/shell";
import { getAds, getDaily } from "@/lib/traffic/data";
import { loadTrafficPage, type SP } from "@/lib/traffic/page";
import { aggregateBy } from "@/lib/traffic/tree";
import { derive, type Derived } from "@/lib/traffic/metrics";
import { ImageOff } from "lucide-react";
import { fmtBRL, fmtDec, fmtInt, fmtPct, statusPt } from "@/lib/traffic/format";

export const dynamic = "force-dynamic";

type Creative = { id: string; name: string; status: string | null; unidade: string | null; thumb: string | null; m: Derived };

export default async function CriativosPage({ searchParams }: { searchParams: SP }) {
  const { ctx, period, pulse } = await loadTrafficPage(searchParams);
  if (!ctx.client || !ctx.accountIds.length) {
    return <TrafficShell ctx={ctx} alerts={pulse?.alerts ?? []} period={period} title="Criativos">{null}</TrafficShell>;
  }
  const [rows, ads] = await Promise.all([
    getDaily(ctx.supabase, ctx.accountIds, "ad", period.since, period.until),
    getAds(ctx.supabase, ctx.accountIds),
  ]);
  const meta = new Map(ads.map((a) => [a.ad_id, a]));
  const list: Creative[] = [...aggregateBy(rows, (r) => r.ad_id).entries()]
    .map(([id, t]) => {
      const a = meta.get(id);
      return { id, name: a?.name ?? id, status: a?.effective_status ?? null, unidade: a?.unidade ?? null, thumb: a?.thumbnail_url ?? null, m: derive(t) };
    })
    .filter((c) => c.m.spend > 0)
    .sort((a, b) => b.m.spend - a.m.spend);

  // Ranking só com gasto relevante (>= 5% do gasto médio por anúncio, mín. R$ 10) para não premiar acaso.
  const avg = list.reduce((s, c) => s + c.m.spend, 0) / Math.max(1, list.length);
  const minSpend = Math.max(10, avg * 0.05);
  const ranked = list.filter((c) => c.m.spend >= minSpend).sort((a, b) => (b.m.roas ?? 0) - (a.m.roas ?? 0));
  const top = ranked.slice(0, 5);
  const worst = ranked.length > 5 ? ranked.slice(-5).reverse() : [];

  return (
    <TrafficShell ctx={ctx} alerts={pulse?.alerts ?? []} period={period} title="Criativos">
      <h1 className="t-display text-xl font-bold tracking-wide">CRIATIVOS</h1>
      {list.length === 0 ? (
        <div className="t-card t-muted p-10 text-center text-sm">Nenhum anúncio com entrega no período.</div>
      ) : (
        <>
          <section className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            <Ranking title="TOP 5 · MAIOR ROAS" items={top} tone="good" />
            <Ranking title="PIORES 5 · MENOR ROAS" items={worst} tone="bad" />
          </section>
          <p className="t-muted -mt-1 text-[11px]">Ranking considera anúncios com gasto ≥ {fmtBRL(minSpend)} no período.</p>
          <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4" aria-label="Todos os criativos">
            {list.map((c) => (
              <article key={c.id} className="t-card-flat flex flex-col overflow-hidden">
                <Thumb src={c.thumb} alt={c.name} />
                <div className="flex flex-1 flex-col gap-1 p-2.5">
                  <p className="line-clamp-2 text-xs font-semibold" title={c.name}>{c.name}</p>
                  <p className="t-muted text-[10px]">
                    {c.unidade ?? "—"}
                    {c.status && c.status !== "ACTIVE" ? ` · ${statusPt(c.status)}` : ""}
                  </p>
                  <dl className="mt-auto grid grid-cols-2 gap-x-2 gap-y-0.5 text-[11px]">
                    <dt className="t-muted">ROAS</dt>
                    <dd className="t-display text-right text-sm font-bold" style={{ color: "var(--t-gold-light)" }}>
                      {c.m.roas == null ? "—" : `${fmtDec(c.m.roas)}x`}
                    </dd>
                    <dt className="t-muted">CTR</dt><dd className="text-right">{fmtPct(c.m.ctr, 2)}</dd>
                    <dt className="t-muted">Compras</dt><dd className="text-right">{fmtInt(c.m.purchases)}</dd>
                    <dt className="t-muted">Gasto</dt><dd className="text-right">{fmtBRL(c.m.spend)}</dd>
                  </dl>
                </div>
              </article>
            ))}
          </section>
        </>
      )}
    </TrafficShell>
  );
}

function Thumb({ src, alt }: { src: string | null; alt: string }) {
  return src ? (
    // Thumbnails vêm do CDN da Meta (URLs assinadas renovadas a cada sync).
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} loading="lazy" referrerPolicy="no-referrer" className="aspect-square w-full object-cover" />
  ) : (
    <div className="t-muted grid aspect-square w-full place-items-center text-[11px]" style={{ background: "var(--t-raised)" }}>
      <ImageOff className="h-5 w-5 opacity-60" aria-label="sem miniatura" />
    </div>
  );
}

function Ranking({ title, items, tone }: { title: string; items: Creative[]; tone: "good" | "bad" }) {
  return (
    <div className="t-card p-4">
      <h2 className="t-display mb-3 text-lg font-bold tracking-wide">{title}</h2>
      {items.length === 0 ? (
        <p className="t-muted text-sm">Poucos anúncios para ranquear.</p>
      ) : (
        <ol className="flex flex-col gap-2">
          {items.map((c, i) => (
            <li key={c.id} className="flex items-center gap-3">
              <span className="t-display w-5 text-center text-lg font-bold" style={{ color: tone === "good" ? "var(--t-gold-light)" : "var(--t-critical)" }}>
                {i + 1}
              </span>
              <div className="h-11 w-11 shrink-0 overflow-hidden rounded-lg">
                <Thumb src={c.thumb} alt={c.name} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm" title={c.name}>{c.name}</p>
                <p className="t-muted text-[11px]">
                  {fmtBRL(c.m.spend)} · {fmtInt(c.m.purchases)} compras · CTR {fmtPct(c.m.ctr, 2)}
                </p>
              </div>
              <b className={`t-display text-base ${tone === "good" ? "t-good" : "t-bad"}`}>
                {c.m.roas == null ? "—" : `${fmtDec(c.m.roas)}x`}
              </b>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
