"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { LayoutGrid, CalendarDays } from "lucide-react";
import { ApprovalBoard, type Card } from "@/components/approval-board";
import { CalendarView } from "@/components/calendar-view";
import type { CardCalendario } from "@/lib/notion";

// Alterna as duas vistas da home: o QUADRO (principal, padrão) e o CALENDÁRIO.
// O quadro segue como está; o calendário é uma leitura complementar de todos os
// conteúdos do cliente. Abrir um card pela prévia do calendário volta ao quadro
// já com o card aberto (só para etapas visíveis ao cliente).

type View = "quadro" | "calendario";

function tabClass(active: boolean): string {
  return [
    "-mb-px inline-flex min-h-11 items-center gap-1.5 border-b-2 px-3 text-sm transition-colors",
    active
      ? "border-brand font-semibold text-foreground"
      : "border-transparent font-medium text-muted-foreground hover:text-foreground",
  ].join(" ");
}

export function HomeViews({
  cliente,
  boardCards,
  calendarCards,
  sessionExpiresAt = null,
  initialView = "quadro",
}: {
  cliente: string;
  boardCards: Card[];
  calendarCards: CardCalendario[];
  sessionExpiresAt?: number | null;
  initialView?: View;
}) {
  const [view, setView] = useState<View>(initialView);
  // Pedido de abrir um card no quadro, vindo da prévia do calendário.
  const [requestOpenId, setRequestOpenId] = useState<string | null>(null);
  // Um card está aberto (vista de detalhe)? Nesse caso escondemos a saudação e
  // as abas Quadro/Calendário — o cliente vê só as informações do conteúdo.
  const [cardAberto, setCardAberto] = useState(false);
  // O card foi aberto a partir do calendário? Nesse caso, voltar (seta do
  // navegador ou gesto no mobile) deve retornar ao calendário — não ao quadro.
  // Ref para o listener de popstate (sempre lê o valor atual) e state espelho
  // para o rótulo do botão "Voltar".
  const voltarAoCalendarioRef = useRef(false);
  const [voltarAoCalendario, setVoltarAoCalendario] = useState(false);

  const trocar = useCallback((v: View) => {
    setView(v);
    // Reflete na URL sem criar entrada no histórico (não conflita com o
    // pushState que o quadro usa para abrir/fechar card).
    const url = new URL(window.location.href);
    if (v === "quadro") url.searchParams.delete("view");
    else url.searchParams.set("view", v);
    window.history.replaceState(window.history.state, "", url);
  }, []);

  const abrirCardNoQuadro = useCallback(
    (id: string) => {
      // Só abre se o card existir no quadro (etapas visíveis). Senão, mantém a
      // marca de origem limpa para não desviar um próximo "voltar" ao calendário.
      if (!boardCards.some((c) => c.id === id)) return;
      // Lembra a origem para restaurar o calendário ao voltar. Trocamos a vista
      // para o quadro SEM mexer na URL (segue ?view=calendario): o card é um
      // estado efêmero da tela e, ao voltar, retomamos o calendário na mesma data.
      voltarAoCalendarioRef.current = true;
      setVoltarAoCalendario(true);
      setRequestOpenId(id);
      setView("quadro");
    },
    [boardCards]
  );

  // Ao voltar pelo navegador (seta ou gesto no mobile), o quadro já fecha o card
  // via seu próprio popstate. Aqui, se o card veio do calendário, restauramos
  // essa vista — o CalendarView fica montado (via `hidden`), então a data
  // selecionada e o mês são preservados.
  useEffect(() => {
    function onPop() {
      if (!voltarAoCalendarioRef.current) return;
      voltarAoCalendarioRef.current = false;
      setVoltarAoCalendario(false);
      setView("calendario");
    }
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  return (
    <>
      {/* Saudação: escondida na vista de detalhe do card (só informações do card). */}
      {!cardAberto && (
        <section className="mx-auto max-w-5xl px-4 pt-8 sm:px-6 sm:pt-12">
          <h1 className="text-2xl font-semibold tracking-tight sm:text-4xl">
            Olá, <span className="capitalize">{cliente || "cliente"}</span>
          </h1>
          <p className="mt-2 text-sm text-muted-foreground sm:mt-3 sm:text-base">
            Acompanhe os conteúdos por etapa. Revise e aprove os que estão
            aguardando você.
          </p>
        </section>
      )}

      <section className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-10">
        <div>
          {/* Abas Quadro/Calendário: escondidas na vista de detalhe do card. */}
          {!cardAberto && (
            <div role="tablist" className="mb-6 flex gap-1 border-b">
              <button
                role="tab"
                type="button"
                aria-selected={view === "quadro"}
                onClick={() => trocar("quadro")}
                className={tabClass(view === "quadro")}
              >
                <LayoutGrid className="size-4" />
                Quadro
              </button>
              <button
                role="tab"
                type="button"
                aria-selected={view === "calendario"}
                onClick={() => trocar("calendario")}
                className={tabClass(view === "calendario")}
              >
                <CalendarDays className="size-4" />
                Calendário
              </button>
            </div>
          )}

          {/* O quadro fica sempre montado (togglado por `hidden`) para preservar
              estado (card aberto, edições) ao alternar de vista. */}
          <div className={view === "quadro" ? "" : "hidden"}>
            <ApprovalBoard
              cards={boardCards}
              sessionExpiresAt={sessionExpiresAt}
              requestOpenId={requestOpenId}
              onOpenHandled={() => setRequestOpenId(null)}
              voltarAoCalendario={voltarAoCalendario}
              onCardViewChange={setCardAberto}
            />
          </div>
          {/* O calendário também fica sempre montado (togglado por `hidden`) para
              preservar a data selecionada e o mês ao abrir um card e voltar. */}
          <div className={view === "calendario" ? "" : "hidden"}>
            <CalendarView cards={calendarCards} onOpenCard={abrirCardNoQuadro} />
          </div>
        </div>
      </section>
    </>
  );
}
