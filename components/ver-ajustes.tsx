"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, Paperclip } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { ZoomableImage } from "@/components/zoomable-image";
import { listarAjustes } from "@/app/actions";
import type { AjusteComentario } from "@/lib/notion";

// Historico de pedidos de alteracao do cliente (guardados como comentarios no
// card do Notion). Exibido em qualquer etapa quando o card tem ajustes.
// Busca lazy: so carrega ao abrir a primeira vez.
export function VerAjustes({
  pageId,
  ajustes,
}: {
  pageId: string;
  ajustes: number;
}) {
  const [aberto, setAberto] = useState(false);
  const [carregado, setCarregado] = useState(false);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [itens, setItens] = useState<AjusteComentario[]>([]);

  async function toggle() {
    const proximo = !aberto;
    setAberto(proximo);
    if (proximo && !carregado && !carregando) {
      setCarregando(true);
      setErro(null);
      try {
        const data = await listarAjustes(pageId);
        setItens(data);
        setCarregado(true);
      } catch (e) {
        setErro(
          e instanceof Error ? e.message : "Não foi possível carregar os ajustes."
        );
      } finally {
        setCarregando(false);
      }
    }
  }

  return (
    <div className="overflow-hidden rounded-lg border bg-muted/40">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={aberto}
        aria-controls={`ajustes-panel-${pageId}`}
        className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left transition-colors hover:bg-muted/60 active:bg-muted"
      >
        <span className="text-sm font-semibold">
          Ver ajustes{" "}
          <span className="text-muted-foreground">({ajustes})</span>
        </span>
        {aberto ? (
          <ChevronDown className="size-4 text-muted-foreground" />
        ) : (
          <ChevronRight className="size-4 text-muted-foreground" />
        )}
      </button>

      {aberto && (
        <div
          id={`ajustes-panel-${pageId}`}
          className="space-y-3 border-t px-4 py-3"
        >
          {carregando && (
            <div className="space-y-2">
              <Skeleton className="h-4 w-1/3" />
              <Skeleton className="h-16 w-full" />
            </div>
          )}

          {erro && !carregando && <p className="text-sm text-destructive">{erro}</p>}

          {carregado && !erro && itens.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Os ajustes anteriores ainda não estão disponíveis para exibição.
            </p>
          )}

          {!carregando &&
            !erro &&
            itens.map((item) => <AjusteItem key={item.id} item={item} />)}
        </div>
      )}
    </div>
  );
}

function AjusteItem({ item }: { item: AjusteComentario }) {
  const data = formatarData(item.criadoEm);
  return (
    <div className="rounded-md border bg-card p-3">
      {data && (
        <p className="mb-1.5 text-xs text-muted-foreground">{data}</p>
      )}
      <p className="whitespace-pre-line break-words text-sm">{item.texto}</p>

      {item.imagens.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {item.imagens.map((img, i) =>
            img.category === "image" ? (
              <div
                key={i}
                className="block max-w-full overflow-hidden rounded-md border bg-background"
              >
                <ZoomableImage
                  src={img.url}
                  alt="Imagem do ajuste"
                  className="max-h-40 w-auto max-w-full object-contain"
                />
              </div>
            ) : (
              <a
                key={i}
                href={img.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-11 items-center gap-1 rounded-md border bg-background px-3 py-1 text-xs text-muted-foreground hover:text-foreground active:text-foreground md:min-h-0"
              >
                <Paperclip className="size-3" />
                Anexo
              </a>
            )
          )}
        </div>
      )}
    </div>
  );
}

// Data em pt-BR (dd/mm/aaaa hh:mm). Retorna "" se invalida.
function formatarData(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
