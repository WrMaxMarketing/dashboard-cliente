import "server-only";
import { getTrafficContext } from "@/lib/traffic/data";
import { resolvePeriod } from "@/lib/traffic/periods";
import { getAccountPulse } from "@/lib/traffic/summary";

export type SP = Promise<{ [key: string]: string | string[] | undefined }>;

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/** Contexto comum a todas as abas: sessão/RLS, cliente, período e alertas. */
export async function loadTrafficPage(searchParams: SP) {
  const sp = await searchParams;
  const ctx = await getTrafficContext(one(sp.c));
  const tz = ctx.client?.fuso ?? "America/Fortaleza";
  const period = resolvePeriod({ p: one(sp.p), de: one(sp.de), ate: one(sp.ate) }, tz);
  const pulse = ctx.client ? await getAccountPulse(ctx.supabase, ctx) : null;
  const qs = new URLSearchParams();
  for (const k of ["c", "p", "de", "ate"]) {
    const v = one(sp[k]);
    if (v) qs.set(k, v);
  }
  return { ctx, period, pulse, qs: qs.toString() };
}
