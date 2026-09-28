import { signOut } from "@/app/login/actions";
import type { TrafficContext } from "@/lib/traffic/data";
import type { Alert } from "@/lib/traffic/metrics";
import { AlertsBell } from "@/components/trafego/alerts-bell";
import { ClientSwitcher } from "@/components/trafego/client-switcher";

const STALE_MIN = 45;

function liveState(ctx: TrafficContext, tz: string) {
  const last = ctx.sync.lastSuccess;
  if (!last) return { text: "aguardando 1º sync", stale: true, error: ctx.sync.last?.status === "error" };
  const d = new Date(last);
  const hhmm = new Intl.DateTimeFormat("pt-BR", { timeZone: tz, hour: "2-digit", minute: "2-digit" }).format(d);
  const sameDay =
    new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(d) ===
    new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date());
  const dayTxt = sameDay ? "" : ` de ${new Intl.DateTimeFormat("pt-BR", { timeZone: tz, day: "2-digit", month: "2-digit" }).format(d)}`;
  const stale = Date.now() - d.getTime() > STALE_MIN * 60_000;
  return { text: `atualizado às ${hhmm}${dayTxt}`, stale, error: ctx.sync.last?.status === "error" };
}

export function TrafficHeader({ ctx, alerts, title }: { ctx: TrafficContext; alerts: Alert[]; title: string }) {
  const tz = ctx.client?.fuso ?? "America/Fortaleza";
  const live = liveState(ctx, tz);
  const initial = (ctx.userEmail ?? "?").slice(0, 1).toUpperCase();

  return (
    <header
      className="sticky top-0 z-20 border-b pt-[env(safe-area-inset-top)] backdrop-blur-md"
      style={{ borderColor: "var(--t-border-soft)", background: "rgba(7,7,10,0.82)" }}
    >
      <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3 sm:px-6">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <span className="t-display t-glow-text shrink-0 text-lg font-bold tracking-[0.18em]">WRMAX</span>
          <span aria-hidden className="h-6 w-px shrink-0" style={{ background: "var(--t-border)" }} />
          <div className="min-w-0">
            {ctx.isAdmin && ctx.clients.length > 1 ? (
              <ClientSwitcher clients={ctx.clients} current={ctx.client?.cliente_key ?? ""} />
            ) : (
              <p className="t-display truncate text-base font-semibold" style={{ color: "var(--t-champagne)" }}>
                {ctx.client?.logo_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={ctx.client.logo_url} alt={ctx.client.nome} className="h-6 w-auto" />
                ) : (
                  ctx.client?.nome ?? "Tráfego pago"
                )}
              </p>
            )}
            <p className="t-eyebrow truncate !text-[10px]">{title}</p>
          </div>
        </div>

        {ctx.client && (<div
          className="hidden items-center gap-2 rounded-full border px-3 py-1.5 text-[11px] font-semibold sm:flex"
          style={{ borderColor: "var(--t-border)", color: "var(--t-champagne)" }}
          title={live.error ? `Último sync com erro: ${ctx.sync.last?.error ?? ""}` : undefined}
        >
          <span className="t-live-dot" data-stale={live.stale} data-error={live.error} aria-hidden />
          <span className="t-display tracking-[0.14em]">AO VIVO</span>
          <span className="t-muted font-medium">· {live.text}</span>
        </div>)}

        <AlertsBell alerts={alerts} />

        <form action={signOut} className="t-noprint">
          <button
            type="submit"
            title={`Sair (${ctx.userEmail ?? ""})`}
            aria-label="Sair"
            className="grid h-9 w-9 place-items-center rounded-full border text-sm font-bold"
            style={{ borderColor: "var(--t-border)", color: "var(--t-gold-light)", background: "var(--t-raised)" }}
          >
            {initial}
          </button>
        </form>
      </div>
      {/* selo AO VIVO no mobile, abaixo */}
      {ctx.client && (
        <div className="flex items-center gap-2 px-4 pb-2 text-[11px] font-semibold sm:hidden" style={{ color: "var(--t-champagne)" }}>
          <span className="t-live-dot" data-stale={live.stale} data-error={live.error} aria-hidden />
          <span className="t-display tracking-[0.14em]">AO VIVO</span>
          <span className="t-muted font-medium">· {live.text}</span>
        </div>
      )}
    </header>
  );
}
