"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";

export function RefreshButton({ clienteKey }: { clienteKey: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [, startTransition] = useTransition();

  async function onClick() {
    setBusy(true);
    const id = toast.loading("Buscando dados de hoje na Meta…");
    try {
      const r = await fetch(`/trafego/atualizar?c=${encodeURIComponent(clienteKey)}`, { method: "POST" });
      const body = await r.json().catch(() => ({}));
      if (r.ok) {
        toast.success("Painel atualizado.", { id });
        startTransition(() => router.refresh());
      } else {
        toast.error(body.error ?? "Não foi possível atualizar agora.", { id });
      }
    } catch {
      toast.error("Sem conexão. Tente novamente.", { id });
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      aria-label="Atualizar dados agora"
      title="Atualizar dados agora"
      className="t-noprint grid h-9 w-9 place-items-center rounded-full border disabled:opacity-60"
      style={{ borderColor: "var(--t-border)", background: "var(--t-raised)", color: "var(--t-gold-light)" }}
    >
      <RefreshCw className={`h-4 w-4 ${busy ? "animate-spin" : ""}`} aria-hidden />
    </button>
  );
}
