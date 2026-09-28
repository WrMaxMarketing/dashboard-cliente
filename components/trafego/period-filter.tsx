"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { PERIOD_OPTIONS, type PeriodKey } from "@/lib/traffic/periods";

export function PeriodFilter({ current, since, until, today }: { current: PeriodKey; since: string; until: string; today: string }) {
  const pathname = usePathname();
  const sp = useSearchParams();
  const router = useRouter();
  const [de, setDe] = useState(since);
  const [ate, setAte] = useState(until);

  const hrefFor = (key: PeriodKey) => {
    const next = new URLSearchParams(sp.toString());
    next.set("p", key);
    if (key !== "custom") {
      next.delete("de");
      next.delete("ate");
    } else {
      next.set("de", de);
      next.set("ate", ate);
    }
    return `${pathname}?${next}`;
  };

  return (
    <div className="t-noprint flex min-w-0 flex-col gap-2">
      <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1" role="group" aria-label="Período">
        {PERIOD_OPTIONS.map((o) => (
          <Link key={o.key} href={hrefFor(o.key)} scroll={false} className="t-pill" aria-current={o.key === current}>
            {o.label}
          </Link>
        ))}
      </div>
      {current === "custom" && (
        <form
          className="flex flex-wrap items-center gap-2 text-xs"
          onSubmit={(e) => {
            e.preventDefault();
            router.push(hrefFor("custom"), { scroll: false });
          }}
        >
          <label className="t-muted flex items-center gap-1.5">
            De
            <input type="date" className="t-input" value={de} max={today} onChange={(e) => setDe(e.target.value)} />
          </label>
          <label className="t-muted flex items-center gap-1.5">
            Até
            <input type="date" className="t-input" value={ate} max={today} onChange={(e) => setAte(e.target.value)} />
          </label>
          <button type="submit" className="t-pill" aria-current="true">
            Aplicar
          </button>
        </form>
      )}
    </div>
  );
}
