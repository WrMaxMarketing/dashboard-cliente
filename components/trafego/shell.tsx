import { Suspense } from "react";
import { TrafficHeader } from "@/components/trafego/header";
import { PeriodFilter } from "@/components/trafego/period-filter";
import type { TrafficContext } from "@/lib/traffic/data";
import type { Alert } from "@/lib/traffic/metrics";
import type { Period } from "@/lib/traffic/periods";

export function TrafficShell({
  ctx,
  alerts,
  period,
  title,
  showPeriod = true,
  children,
}: {
  ctx: TrafficContext;
  alerts: Alert[];
  period: Period;
  title: string;
  showPeriod?: boolean;
  children: React.ReactNode;
}) {
  return (
    <>
      <Suspense fallback={null}>
        <TrafficHeader ctx={ctx} alerts={alerts} title={title} />
      </Suspense>
      <main className="mx-auto flex w-full min-w-0 max-w-6xl flex-col gap-4 px-4 py-4 sm:px-6 sm:py-6">
        {!ctx.client ? (
          <NotEnabled />
        ) : (
          <>
            {showPeriod && (
              <div className="flex min-w-0 flex-col gap-1">
                <Suspense fallback={null}>
                  <PeriodFilter current={period.key} since={period.since} until={period.until} today={period.today} />
                </Suspense>
                <p className="t-muted text-xs">
                  {period.label} · comparado a {fmt(period.prevSince)} – {fmt(period.prevUntil)}
                </p>
              </div>
            )}
            {!ctx.accountIds.length ? <NoAccount /> : children}
          </>
        )}
      </main>
    </>
  );
}

function fmt(iso: string) {
  const [, m, d] = iso.split("-");
  return `${d}/${m}`;
}

function NotEnabled() {
  return (
    <div className="t-card px-6 py-16 text-center">
      <p className="t-display t-glow-text text-xl font-bold">Painel de tráfego não ativado</p>
      <p className="t-muted mx-auto mt-2 max-w-md text-sm">
        Sua conta ainda não tem o painel de tráfego pago. Fale com a WRMax para ativar.
      </p>
    </div>
  );
}

function NoAccount() {
  return (
    <div className="t-card px-6 py-16 text-center">
      <p className="t-display t-glow-text text-xl font-bold">Nenhuma conta de anúncio vinculada</p>
      <p className="t-muted mx-auto mt-2 max-w-md text-sm">
        Cadastre a conta em <code>traffic_ad_accounts</code> para este cliente (veja o README do painel).
      </p>
    </div>
  );
}
