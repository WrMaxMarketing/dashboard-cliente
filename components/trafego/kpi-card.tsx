import type { LucideIcon } from "lucide-react";
import { CountUp } from "@/components/trafego/count-up";
import type { Delta } from "@/lib/traffic/metrics";
import { fmtPct } from "@/lib/traffic/format";

export function DeltaBadge({ d, suffix = "vs período anterior" }: { d: Delta; suffix?: string }) {
  if (d.pct == null) return <span className="t-muted text-[11px]">— {suffix}</span>;
  const up = d.pct >= 0;
  const cls = d.tone === "good" ? "t-good" : d.tone === "bad" ? "t-bad" : "t-neutral";
  return (
    <span className="text-[11px]">
      <span className={`${cls} font-semibold`}>
        {up ? "▲" : "▼"} {fmtPct(Math.abs(d.pct))}
      </span>{" "}
      <span className="t-muted">{suffix}</span>
    </span>
  );
}

export function KpiCard({
  icon: Icon,
  label,
  value,
  kind,
  delta,
  sub,
}: {
  icon: LucideIcon;
  label: string;
  value: number | null;
  kind: "brl" | "int" | "roas";
  delta: Delta;
  sub?: React.ReactNode;
}) {
  return (
    <div className="t-card flex min-w-0 flex-col gap-2 p-3.5 sm:p-4">
      <div className="flex items-center gap-2">
        <span
          className="grid h-8 w-8 shrink-0 place-items-center rounded-lg"
          style={{ background: "rgba(212,175,55,0.12)", color: "var(--t-gold)" }}
        >
          <Icon className="h-4 w-4" aria-hidden />
        </span>
        <span className="t-eyebrow truncate">{label}</span>
      </div>
      <CountUp value={value} kind={kind} className="t-display t-glow-text truncate text-[26px] font-bold leading-none sm:text-3xl" />
      {sub && <div className="t-muted text-xs">{sub}</div>}
      <DeltaBadge d={delta} />
    </div>
  );
}
