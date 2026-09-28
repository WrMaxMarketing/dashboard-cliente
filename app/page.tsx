import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AppHeader } from "@/components/app-header";
import { HomeViews } from "@/components/home-views";
import { getCardsBoard, getCardsCalendario, getBlocks } from "@/lib/notion";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "@/app/login/actions";
import { SESSION_MAX_AGE_MS, SESSION_START_COOKIE } from "@/lib/session";

// Sempre busca fresco do Notion (nao prerenderiza no build).
export const dynamic = "force-dynamic";

export default async function Home({
  searchParams,
}: {
  // Next 16: searchParams é assíncrono. Usado só para a vista inicial (?view).
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { view } = await searchParams;
  const initialView = view === "calendario" ? "calendario" : "quadro";

  // Exige sessao (o middleware ja protege, mas garantimos aqui tambem).
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Horario em que a sessao de 1h expira, derivado do cookie de inicio. O board
  // usa isso para avisar o cliente e deslogar no instante exato do fim da janela.
  const cookieStore = await cookies();
  const startedAtRaw = cookieStore.get(SESSION_START_COOKIE)?.value;
  const startedAt = startedAtRaw ? Number(startedAtRaw) : NaN;
  const sessionExpiresAt = Number.isFinite(startedAt)
    ? startedAt + SESSION_MAX_AGE_MS
    : null;

  // O cliente vem do app_metadata, definido pelo admin (o usuario nao altera).
  const cliente = (user.app_metadata?.cliente as string | undefined) ?? "";

  // Quadro (etapas visíveis, com blocos do corpo) + calendário (todos os
  // conteúdos do cliente, enxutos). Buscados em paralelo.
  const [resumos, calendarCards] = await Promise.all([
    cliente ? getCardsBoard(cliente) : Promise.resolve([]),
    cliente ? getCardsCalendario(cliente) : Promise.resolve([]),
  ]);
  const cards = await Promise.all(
    resumos.map(async (c) => ({ ...c, blocks: await getBlocks(c.id) }))
  );

  return (
    <main className="flex-1">
      {/* Header */}
      <AppHeader title="Aprovação de Conteúdos" signOutAction={signOut} />

      {/* Saudação + abas + vistas vivem no HomeViews: assim a saudação e as abas
          somem na vista de detalhe do card (só as informações do conteúdo). */}
      {cliente ? (
        <HomeViews
          cliente={cliente}
          boardCards={cards}
          calendarCards={calendarCards}
          sessionExpiresAt={sessionExpiresAt}
          initialView={initialView}
        />
      ) : (
        <section className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-10">
          <div className="rounded-xl border bg-card px-6 py-16 text-center shadow-sm ring-1 ring-foreground/10">
            <p className="text-lg font-semibold">Conta sem cliente associado</p>
            <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
              Sua conta ainda não está vinculada a um cliente. Contate o
              administrador para concluir a configuração.
            </p>
          </div>
        </section>
      )}
    </main>
  );
}
