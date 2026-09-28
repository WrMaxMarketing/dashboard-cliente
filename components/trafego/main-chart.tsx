"use client";

import { Area, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export type ChartPoint = { label: string; faturamento: number; investimento: number };

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const brlCompact = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", notation: "compact", maximumFractionDigits: 1 });

function TooltipBox({ active, payload, label }: { active?: boolean; payload?: { dataKey: string; value: number }[]; label?: string }) {
  if (!active || !payload?.length) return null;
  const fat = payload.find((p) => p.dataKey === "faturamento")?.value ?? 0;
  const inv = payload.find((p) => p.dataKey === "investimento")?.value ?? 0;
  return (
    <div className="t-card px-3 py-2 text-xs" style={{ background: "var(--t-raised)" }}>
      <p className="t-muted mb-1">{label}</p>
      <p className="flex items-center gap-2">
        <span className="inline-block h-2 w-3 rounded-sm" style={{ background: "var(--t-gold)" }} aria-hidden />
        Faturamento <b className="ml-auto pl-3">{brl.format(fat)}</b>
      </p>
      <p className="flex items-center gap-2">
        <span className="inline-block h-0 w-3 border-t-2 border-dashed" style={{ borderColor: "var(--t-champagne)" }} aria-hidden />
        Investimento <b className="ml-auto pl-3">{brl.format(inv)}</b>
      </p>
      <p className="t-muted mt-1">ROAS {inv > 0 ? `${(fat / inv).toFixed(2).replace(".", ",")}x` : "—"}</p>
    </div>
  );
}

/** Investimento x Faturamento — mesma unidade (R$), um único eixo Y. */
export function MainChart({ data, hourly }: { data: ChartPoint[]; hourly: boolean }) {
  if (!data.length) {
    return <div className="t-muted grid h-[240px] place-items-center text-sm">Sem dados sincronizados no período.</div>;
  }
  return (
    <div className="h-[240px] w-full sm:h-[280px]">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="t-area" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="rgba(212,175,55,0.45)" />
              <stop offset="100%" stopColor="rgba(212,175,55,0)" />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="var(--t-grid)" vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fill: "#8a8a93", fontSize: 11 }}
            tickLine={false}
            axisLine={{ stroke: "rgba(232,220,192,0.12)" }}
            interval="preserveStartEnd"
            minTickGap={hourly ? 12 : 18}
          />
          <YAxis
            tick={{ fill: "#8a8a93", fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            width={62}
            tickFormatter={(v: number) => brlCompact.format(v)}
          />
          <Tooltip content={<TooltipBox />} />
          <Area
            type="monotone"
            dataKey="faturamento"
            name="Faturamento"
            stroke="#d4af37"
            strokeWidth={2}
            fill="url(#t-area)"
            dot={false}
            activeDot={{ r: 4, stroke: "#0e0e12", strokeWidth: 2, fill: "#f5d27a" }}
            isAnimationActive
          />
          <Line
            type="monotone"
            dataKey="investimento"
            name="Investimento"
            stroke="#e8dcc0"
            strokeWidth={2}
            strokeDasharray="5 4"
            dot={false}
            activeDot={{ r: 4, stroke: "#0e0e12", strokeWidth: 2, fill: "#e8dcc0" }}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
