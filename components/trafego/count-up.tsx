"use client";

import { useEffect, useRef, useState } from "react";

type Kind = "brl" | "int" | "roas" | "pct" | "dec";

const fmts: Record<Kind, Intl.NumberFormat> = {
  brl: new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }),
  int: new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 }),
  roas: new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
  pct: new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }),
  dec: new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
};

function render(v: number, kind: Kind) {
  const s = fmts[kind].format(v);
  return kind === "roas" ? `${s}x` : kind === "pct" ? `${s}%` : s;
}

/** Número que "conta" até o valor ao carregar. null => "—". */
export function CountUp({ value, kind, className }: { value: number | null; kind: Kind; className?: string }) {
  const [shown, setShown] = useState(0);
  const raf = useRef<number | null>(null);

  useEffect(() => {
    if (value == null) return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const start = performance.now();
    const dur = reduce ? 0 : 900;
    const tick = (t: number) => {
      const p = dur === 0 ? 1 : Math.min(1, (t - start) / dur);
      setShown(value * (1 - Math.pow(1 - p, 3)));
      if (p < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current);
    };
  }, [value]);

  return (
    <span className={className} aria-label={value == null ? "sem dado" : render(value, kind)}>
      {value == null ? "—" : render(shown, kind)}
    </span>
  );
}
