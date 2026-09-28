"use client";

import { useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Lock, CalendarDays } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { etapaInterna } from "@/lib/board";
import type { CardCalendario } from "@/lib/notion";

// Vista de calendário (segunda opção da home, ao lado do quadro). Mostra todos
// os conteúdos do cliente — inclusive de etapas internas — posicionados pela
// propriedade "Data" do Notion. Dias com conteúdo ficam verdes com a contagem;
// ao clicar, abre a prévia (título + tipo) dos conteúdos daquele dia.

const DIAS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const MESES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

const pad = (n: number) => String(n).padStart(2, "0");
// Chave de dia (YYYY-MM-DD). A "Data" do Notion costuma ser só-data; usamos os
// 10 primeiros caracteres para agrupar sem sofrer com fuso.
const chaveDia = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`;

export function CalendarView({
  cards,
  onOpenCard,
}: {
  cards: CardCalendario[];
  onOpenCard: (id: string) => void;
}) {
  const hoje = new Date();
  const [ano, setAno] = useState(hoje.getFullYear());
  const [mes, setMes] = useState(hoje.getMonth()); // 0-11
  const [diaSel, setDiaSel] = useState<string | null>(null);
  // No mobile a prévia fica empilhada abaixo do calendário, fora da vista. Ao
  // escolher um dia, rolamos até ela para o usuário perceber os conteúdos.
  const previaRef = useRef<HTMLElement | null>(null);

  function selecionarDia(key: string) {
    setDiaSel(key);
    // Só rola no layout empilhado (mobile). No desktop a prévia já fica à vista.
    if (
      typeof window !== "undefined" &&
      window.matchMedia("(max-width: 1023px)").matches
    ) {
      // Espera o painel renderizar a lista antes de rolar.
      requestAnimationFrame(() => {
        previaRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    }
  }

  // Agrupa os cards por dia (só os que têm data). Memo por lista de cards.
  const porDia = useMemo(() => {
    const map = new Map<string, CardCalendario[]>();
    let semData = 0;
    for (const c of cards) {
      if (!c.data) {
        semData++;
        continue;
      }
      const key = c.data.slice(0, 10);
      const lista = map.get(key) ?? [];
      lista.push(c);
      map.set(key, lista);
    }
    return { map, semData };
  }, [cards]);

  const primeiroDiaSemana = new Date(ano, mes, 1).getDay(); // 0=Dom
  const diasNoMes = new Date(ano, mes + 1, 0).getDate();
  const chaveHoje = chaveDia(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());

  // Células: brancos antes do dia 1 + os dias do mês.
  const celulas: (number | null)[] = [
    ...Array.from({ length: primeiroDiaSemana }, () => null),
    ...Array.from({ length: diasNoMes }, (_, i) => i + 1),
  ];

  function mudarMes(delta: number) {
    setDiaSel(null);
    const d = new Date(ano, mes + delta, 1);
    setAno(d.getFullYear());
    setMes(d.getMonth());
  }

  function irParaHoje() {
    setDiaSel(null);
    setAno(hoje.getFullYear());
    setMes(hoje.getMonth());
  }

  const listaSel = diaSel ? porDia.map.get(diaSel) ?? [] : [];

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
      {/* Calendário */}
      <div className="min-w-0">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="text-lg font-semibold tracking-tight">
            {MESES[mes]} <span className="text-muted-foreground">{ano}</span>
          </h2>
          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Mês anterior"
              onClick={() => mudarMes(-1)}
            >
              <ChevronLeft className="size-4" />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={irParaHoje}
            >
              Hoje
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Próximo mês"
              onClick={() => mudarMes(1)}
            >
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>

        {/* Cabeçalho dos dias da semana */}
        <div className="grid grid-cols-7 gap-1.5">
          {DIAS.map((d) => (
            <div
              key={d}
              className="pb-1 text-center text-xs font-semibold uppercase tracking-wide text-muted-foreground"
            >
              {d}
            </div>
          ))}

          {celulas.map((dia, i) => {
            if (dia === null) return <div key={`v-${i}`} />;
            const key = chaveDia(ano, mes, dia);
            const conteudos = porDia.map.get(key);
            const qtd = conteudos?.length ?? 0;
            const temConteudo = qtd > 0;
            const ehHoje = key === chaveHoje;
            const selecionado = key === diaSel;

            return (
              <button
                key={key}
                type="button"
                disabled={!temConteudo}
                onClick={() => selecionarDia(key)}
                aria-label={`Dia ${dia}${temConteudo ? `, ${qtd} conteúdo(s)` : ", sem conteúdo"}`}
                aria-pressed={selecionado}
                className={[
                  "flex min-h-16 flex-col items-center justify-start gap-1 rounded-lg border p-1.5 text-sm transition-colors sm:min-h-20",
                  temConteudo
                    ? "cursor-pointer border-success/40 bg-success/10 hover:bg-success/20"
                    : "border-transparent bg-muted/30 text-muted-foreground",
                  selecionado ? "ring-2 ring-success" : "",
                ].join(" ")}
              >
                <span
                  className={[
                    "flex size-7 items-center justify-center rounded-full text-sm",
                    temConteudo ? "font-semibold text-success" : "",
                    ehHoje ? "bg-foreground text-background" : "",
                  ].join(" ")}
                >
                  {dia}
                </span>
                {temConteudo && (
                  <span className="rounded-full bg-success/20 px-1.5 text-xs font-semibold text-success">
                    {qtd}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {porDia.semData > 0 && (
          <p className="mt-3 text-xs text-muted-foreground">
            {porDia.semData}{" "}
            {porDia.semData === 1
              ? "conteúdo ainda sem data"
              : "conteúdos ainda sem data"}{" "}
            (não aparecem no calendário).
          </p>
        )}
      </div>

      {/* Prévia do dia selecionado */}
      <aside ref={previaRef} className="min-w-0 scroll-mt-4">
        {!diaSel ? (
          <div className="flex h-full min-h-40 flex-col items-center justify-center rounded-lg border border-dashed bg-muted/20 px-4 py-10 text-center">
            <CalendarDays className="mb-2 size-6 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Clique em um dia verde para ver os conteúdos daquela data.
            </p>
          </div>
        ) : (
          <div className="rounded-lg border bg-card">
            <div className="border-b px-4 py-3">
              <p className="text-sm font-semibold">
                {formatarDiaLongo(diaSel)}
              </p>
              <p className="text-xs text-muted-foreground">
                {listaSel.length}{" "}
                {listaSel.length === 1 ? "conteúdo" : "conteúdos"}
              </p>
            </div>
            <ul className="divide-y">
              {listaSel.map((c) => (
                <PreviaItem key={c.id} card={c} onOpenCard={onOpenCard} />
              ))}
            </ul>
          </div>
        )}
      </aside>
    </div>
  );
}

// Item da prévia: título + tipo. Se a etapa é interna, marca como tal e, ao
// tentar abrir, explica que ainda não está disponível (não abre o card).
function PreviaItem({
  card,
  onOpenCard,
}: {
  card: CardCalendario;
  onOpenCard: (id: string) => void;
}) {
  const interna = etapaInterna(card.status);

  function abrir() {
    if (interna) {
      toast.info(
        "Este conteúdo está em uma etapa interna da equipe e ainda não está disponível para você."
      );
      return;
    }
    onOpenCard(card.id);
  }

  return (
    <li className="px-4 py-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium" title={card.titulo}>
            {card.titulo}
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            {card.formato && (
              <Badge variant="outline" className="text-xs">
                {card.formato}
              </Badge>
            )}
            {interna ? (
              <Badge variant="secondary" className="gap-1 text-xs">
                <Lock className="size-3" />
                Etapa interna
              </Badge>
            ) : (
              <span className="text-xs text-muted-foreground">
                {card.status}
              </span>
            )}
          </div>
        </div>
        <Button
          type="button"
          variant={interna ? "ghost" : "outline"}
          size="sm"
          onClick={abrir}
          className="shrink-0"
        >
          Abrir
        </Button>
      </div>
    </li>
  );
}

// "9 de julho de 2026" a partir de uma chave YYYY-MM-DD (sem sofrer com fuso).
function formatarDiaLongo(key: string): string {
  const [y, m, d] = key.split("-").map(Number);
  return `${d} de ${MESES[m - 1].toLowerCase()} de ${y}`;
}
