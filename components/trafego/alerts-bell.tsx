"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Bell, OctagonAlert } from "lucide-react";
import type { Alert } from "@/lib/traffic/metrics";

export function AlertsBell({ alerts }: { alerts: Alert[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const critical = alerts.some((a) => a.level === "critico");

  return (
    <div ref={ref} className="t-noprint relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={`Alertas (${alerts.length})`}
        className="relative grid h-9 w-9 place-items-center rounded-full border"
        style={{ borderColor: "var(--t-border)", background: "var(--t-raised)", color: "var(--t-champagne)" }}
      >
        <Bell className="h-4 w-4" aria-hidden />
        {alerts.length > 0 && (
          <span
            className="t-display absolute -right-1 -top-1 grid h-[18px] min-w-[18px] place-items-center rounded-full px-1 text-[11px] font-bold"
            style={{ background: critical ? "var(--t-critical)" : "var(--t-amber)", color: "#0e0e12" }}
          >
            {alerts.length}
          </span>
        )}
      </button>
      {open && (
        <div
          role="dialog"
          aria-label="Alertas"
          className="t-card absolute right-0 top-11 z-40 w-[min(88vw,360px)] p-2"
          style={{ background: "var(--t-raised)" }}
        >
          <p className="t-eyebrow px-2 pb-1 pt-1">Alertas</p>
          {alerts.length === 0 ? (
            <p className="t-muted px-2 py-4 text-sm">Nenhum alerta no momento.</p>
          ) : (
            <ul className="max-h-[60vh] space-y-1 overflow-auto">
              {alerts.map((a, i) => (
                <li key={i} className="flex gap-2 rounded-lg px-2 py-2" style={{ background: "rgba(232,220,192,0.03)" }}>
                  {a.level === "critico" ? (
                    <OctagonAlert className="t-bad mt-0.5 h-4 w-4 shrink-0" aria-label="Crítico" />
                  ) : (
                    <AlertTriangle className="t-warn mt-0.5 h-4 w-4 shrink-0" aria-label="Atenção" />
                  )}
                  <div className="min-w-0">
                    <p className="text-sm font-semibold">{a.title}</p>
                    <p className="t-muted break-words text-xs">{a.detail}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
