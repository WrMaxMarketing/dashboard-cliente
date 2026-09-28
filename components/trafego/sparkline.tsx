"use client";

import { Area, AreaChart, ResponsiveContainer, Tooltip } from "recharts";

export function Sparkline({ data, format }: { data: { label: string; v: number | null }[]; format: "brl" | "pct" | "dec" }) {
  const f = (v: number) =>
    format === "brl"
      ? v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
      : format === "pct"
        ? `${v.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`
        : v.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
  if (data.filter((d) => d.v != null).length < 2) return <div className="h-10" />;
  return (
    <div className="h-10 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 4, right: 2, bottom: 0, left: 2 }}>
          <defs>
            <linearGradient id="t-spark" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="rgba(212,175,55,0.35)" />
              <stop offset="100%" stopColor="rgba(212,175,55,0)" />
            </linearGradient>
          </defs>
          <Tooltip
            cursor={false}
            content={({ active, payload }) =>
              active && payload?.length && payload[0].value != null ? (
                <div className="t-card px-2 py-1 text-[11px]" style={{ background: "var(--t-raised)" }}>
                  <span className="t-muted">{payload[0].payload.label}</span> · {f(Number(payload[0].value))}
                </div>
              ) : null
            }
          />
          <Area type="monotone" dataKey="v" stroke="#d4af37" strokeWidth={1.5} fill="url(#t-spark)" dot={false} connectNulls />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
