"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

// Só para admins WRMax: troca o cliente exibido (?c=cliente_key).
export function ClientSwitcher({ clients, current }: { clients: { cliente_key: string; nome: string }[]; current: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  return (
    <select
      aria-label="Cliente"
      value={current}
      onChange={(e) => {
        const next = new URLSearchParams(sp.toString());
        next.set("c", e.target.value);
        router.push(`${pathname}?${next}`);
      }}
      className="t-display t-input max-w-[46vw] truncate !py-1 text-base font-semibold"
      style={{ color: "var(--t-champagne)" }}
    >
      {clients.map((c) => (
        <option key={c.cliente_key} value={c.cliente_key}>
          {c.nome}
        </option>
      ))}
    </select>
  );
}
