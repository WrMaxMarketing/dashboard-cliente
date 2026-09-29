import { NextResponse, type NextRequest } from "next/server";
import { getTrafficContext } from "@/lib/traffic/data";

// Botão "Atualizar" do painel: dispara o sync de HOJE para as contas do cliente.
// O navegador só fala com esta rota; a chamada à função Python (que fala com a
// Meta) sai do servidor, com o CRON_SECRET, que nunca vai para o front.
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const COOLDOWN_MIN = 5;

// A URL que recebe o CRON_SECRET NUNCA vem do Host da requisição (que o usuário
// controla): usa TRAFFIC_SYNC_BASE_URL ou a URL do próprio deploy (VERCEL_URL).
function syncBase(req: NextRequest): string {
  if (process.env.TRAFFIC_SYNC_BASE_URL) return process.env.TRAFFIC_SYNC_BASE_URL;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  if (process.env.NODE_ENV !== "production") return req.nextUrl.origin; // dev local
  throw new Error("Defina TRAFFIC_SYNC_BASE_URL fora da Vercel.");
}

export async function POST(req: NextRequest) {
  const ctx = await getTrafficContext(req.nextUrl.searchParams.get("c") ?? undefined); // sessão + RLS
  if (!ctx.client || !ctx.accountIds.length) {
    return NextResponse.json({ error: "Painel não ativado para esta conta." }, { status: 404 });
  }
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "CRON_SECRET não configurado." }, { status: 500 });

  // Anti-abuso: um sync por cliente a cada 5 min (inclui um que ainda esteja rodando).
  const since = new Date(Date.now() - COOLDOWN_MIN * 60_000).toISOString();
  const { data: recent } = await ctx.supabase
    .from("traffic_sync_log")
    .select("started_at,status")
    .in("account_id", ctx.accountIds)
    .gte("started_at", since)
    .order("started_at", { ascending: false })
    .limit(1);
  if (recent?.length) {
    const wait = Math.max(1, Math.ceil((Date.parse(recent[0].started_at) + COOLDOWN_MIN * 60_000 - Date.now()) / 60_000));
    return NextResponse.json(
      { error: recent[0].status === "running" ? "Já existe uma atualização em andamento." : `Atualizado há pouco. Tente de novo em ${wait} min.` },
      { status: 429 },
    );
  }

  const headers: Record<string, string> = { Authorization: `Bearer ${secret}` };
  // Deploys de preview protegidos por Vercel Authentication precisam do bypass de automação.
  if (process.env.VERCEL_AUTOMATION_BYPASS_SECRET) {
    headers["x-vercel-protection-bypass"] = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
  }
  const results = await Promise.all(
    ctx.accountIds.map(async (acc) => {
      const url = new URL("/api/traffic_sync", syncBase(req));
      url.searchParams.set("job", "intraday");
      url.searchParams.set("account", acc);
      try {
        const r = await fetch(url, { headers, cache: "no-store" });
        const body = await r.json().catch(() => ({}));
        return { account: acc, ok: r.ok, status: r.status, body };
      } catch (e) {
        return { account: acc, ok: false, status: 0, body: { error: String(e) } };
      }
    }),
  );
  const failed = results.filter((r) => !r.ok);
  if (failed.length) {
    return NextResponse.json({ error: "Falha ao atualizar. Veja o alerta de sync no sino.", results: failed }, { status: 502 });
  }
  return NextResponse.json({ ok: true });
}
