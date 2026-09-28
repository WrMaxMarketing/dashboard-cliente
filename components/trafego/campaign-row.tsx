import type { CampaignStatus } from "@/lib/traffic/metrics";
import { fmtBRL, fmtDec, fmtInt } from "@/lib/traffic/format";

export type CampaignSummary = {
  id: string;
  name: string;
  active: boolean;
  unidade: string | null;
  spend: number;
  roas: number | null;
  purchases: number;
  cpa: number | null;
  status: CampaignStatus;
};

export const STATUS_STYLE: Record<CampaignStatus, { color: string; bg: string }> = {
  ESCALANDO: { color: "#0e0e12", bg: "linear-gradient(180deg,#f5d27a,#d4af37)" },
  "NO ALVO": { color: "#f5d27a", bg: "rgba(212,175,55,0.14)" },
  ATENÇÃO: { color: "#f0a202", bg: "rgba(240,162,2,0.14)" },
  CRÍTICO: { color: "#e5484d", bg: "rgba(229,72,77,0.14)" },
  "SEM META": { color: "#8a8a93", bg: "rgba(138,138,147,0.12)" },
  "SEM DADOS": { color: "#8a8a93", bg: "rgba(138,138,147,0.12)" },
};

export function StatusBadge({ s }: { s: CampaignStatus }) {
  const st = STATUS_STYLE[s];
  return (
    <span
      className="t-display shrink-0 rounded-md px-2 py-0.5 text-[10.5px] font-bold tracking-wider"
      style={{ color: st.color, background: st.bg }}
    >
      {s}
    </span>
  );
}

/** Linha de campanha: barra = ROAS atingido vs meta do cliente (100% = meta). */
export function CampaignRow({ c, metaRoas }: { c: CampaignSummary; metaRoas: number | null }) {
  const pct = metaRoas && c.roas != null ? Math.min(1.5, c.roas / metaRoas) / 1.5 : null;
  return (
    <li>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold" title={c.name}>
            {!c.active && <span className="t-muted mr-1 text-[10px]">[pausada]</span>}
            {c.name}
          </p>
          <p className="t-muted text-[11px]">
            {c.unidade ?? "—"} · {fmtBRL(c.spend)} · {fmtInt(c.purchases)} compras · ROAS{" "}
            <b style={{ color: "var(--t-champagne)" }}>{c.roas == null ? "—" : `${fmtDec(c.roas)}x`}</b>
          </p>
        </div>
        <StatusBadge s={c.status} />
      </div>
      <div className="t-bar relative mt-1.5" title={metaRoas ? `meta ${fmtDec(metaRoas)}x` : "sem meta de ROAS"}>
        <span style={{ width: `${(pct ?? 0) * 100}%` }} />
        {metaRoas && (
          <i aria-hidden className="absolute top-[-2px] h-[10px] w-[2px]" style={{ left: `${100 / 1.5}%`, background: "var(--t-champagne)" }} />
        )}
      </div>
    </li>
  );
}
