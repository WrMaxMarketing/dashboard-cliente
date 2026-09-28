"use client";

import {
  useRef,
  useState,
  useTransition,
  type ChangeEvent,
  type DragEvent,
} from "react";
import { useRouter } from "next/navigation";
import {
  Download,
  ExternalLink,
  FileText,
  Film,
  Link as LinkIcon,
  Play,
  UploadCloud,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ZoomableImage } from "@/components/zoomable-image";
import { removerArquivo } from "@/app/actions";
import type { MediaFile } from "@/lib/notion";

// Exibe as midias da propriedade "Files & media": imagens e videos hospedados com
// preview inline, links externos (vídeo do Drive/YouTube) como cartão de link, e
// demais arquivos como anexo. Em `editable` (etapa "Conteúdo para aprovação")
// permite adicionar por arraste/clique, colar um link de vídeo, e remover.
export function MediaGallery({
  arquivos,
  editable = false,
  pageId,
}: {
  arquivos: MediaFile[];
  editable?: boolean;
  pageId?: string;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [removing, startRemove] = useTransition();
  const [dragging, setDragging] = useState(false);
  const [link, setLink] = useState("");
  const [enviandoLink, setEnviandoLink] = useState(false);
  const ocupado = uploading || removing || enviandoLink;

  // Sobe os arquivos escolhidos (por clique ou arraste) para o Notion.
  async function enviarArquivos(lista: FileList | File[]) {
    const files = Array.from(lista);
    if (!files.length || !pageId) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("pageId", pageId);
      for (const f of files) fd.append("file", f);
      const res = await fetch("/api/cards/files", { method: "POST", body: fd });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? "Falha no upload.");
      toast.success(files.length > 1 ? "Mídias adicionadas." : "Mídia adicionada.");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível enviar.");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  function onPick(e: ChangeEvent<HTMLInputElement>) {
    if (e.target.files?.length) enviarArquivos(e.target.files);
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setDragging(false);
    if (ocupado) return;
    if (e.dataTransfer.files?.length) enviarArquivos(e.dataTransfer.files);
  }

  // Salva o link de vídeo como item externo no Files & media (por baixo dos panos).
  async function enviarLink() {
    const url = link.trim();
    if (!url || !pageId) return;
    setEnviandoLink(true);
    try {
      const fd = new FormData();
      fd.append("pageId", pageId);
      fd.append("link", url);
      const res = await fetch("/api/cards/files", { method: "POST", body: fd });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? "Não foi possível adicionar o link.");
      toast.success("Link de vídeo adicionado.");
      setLink("");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível adicionar o link.");
    } finally {
      setEnviandoLink(false);
    }
  }

  function onRemove(index: number, name: string) {
    if (!pageId) return;
    startRemove(async () => {
      try {
        await removerArquivo(pageId, index, name);
        toast.success("Mídia removida.");
        router.refresh();
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "Não foi possível remover."
        );
      }
    });
  }

  const vazio = arquivos.length === 0;
  if (vazio && !editable) {
    return (
      <p className="rounded-lg border border-dashed bg-muted/30 px-4 py-8 text-center text-sm text-muted-foreground">
        Nenhuma mídia neste conteúdo.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {arquivos.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {arquivos.map((f, i) => (
            <figure
              key={`${f.name}-${i}`}
              className="relative overflow-hidden rounded-lg border bg-card"
            >
              {f.external ? (
                // Link externo (vídeo do Drive/YouTube): cartão clicável, sem player.
                <a
                  href={f.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex aspect-square w-full flex-col items-center justify-center gap-2 bg-muted/60 px-3 text-center text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                >
                  <span className="flex size-11 items-center justify-center rounded-full bg-brand/15 text-foreground">
                    <Play className="size-5" />
                  </span>
                  <span className="text-xs font-medium">Abrir vídeo</span>
                </a>
              ) : f.kind === "image" ? (
                <ZoomableImage
                  src={f.url}
                  alt={f.name}
                  className="aspect-square w-full object-cover"
                />
              ) : f.kind === "video" ? (
                <video
                  src={f.url}
                  controls
                  preload="metadata"
                  className="aspect-square w-full bg-muted object-contain"
                />
              ) : (
                // Arquivo genérico: só o ícone (o nome aparece na figcaption).
                <div className="flex aspect-square w-full items-center justify-center bg-muted text-muted-foreground">
                  <FileText className="size-8" />
                </div>
              )}

              {editable && (
                <button
                  type="button"
                  onClick={() => onRemove(i, f.name)}
                  disabled={ocupado}
                  aria-label={`Remover ${f.name}`}
                  className="absolute right-1 top-1 rounded-md bg-background/80 p-2 text-muted-foreground backdrop-blur transition-colors hover:bg-destructive hover:text-destructive-foreground active:bg-destructive active:text-destructive-foreground disabled:opacity-50 md:p-1"
                >
                  <X className="size-4" />
                </button>
              )}

              {/* Rodape: nome + acao (abrir link externo / baixar arquivo) */}
              <figcaption className="flex items-center justify-between gap-2 border-t bg-card/80 px-2 py-1.5">
                <span className="flex min-w-0 items-center gap-1 text-xs text-muted-foreground">
                  {f.external ? (
                    <LinkIcon className="size-3 shrink-0" />
                  ) : (
                    f.kind === "video" && <Film className="size-3 shrink-0" />
                  )}
                  <span className="truncate" title={f.name}>
                    {f.name}
                  </span>
                </span>
                <a
                  href={f.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  {...(f.external ? {} : { download: f.name })}
                  aria-label={
                    f.external ? `Abrir ${f.name}` : `Baixar ${f.name}`
                  }
                  className="shrink-0 rounded-md p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground active:bg-accent active:text-foreground md:p-1"
                >
                  {f.external ? (
                    <ExternalLink className="size-4" />
                  ) : (
                    <Download className="size-4" />
                  )}
                </a>
              </figcaption>
            </figure>
          ))}
        </div>
      )}

      {editable && (
        <div className="space-y-3">
          {/* Caminho 1: enviar arquivo (arraste ou clique). Estado vazio convida. */}
          <input
            ref={inputRef}
            type="file"
            multiple
            className="hidden"
            onChange={onPick}
          />
          <button
            type="button"
            disabled={ocupado}
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              if (!ocupado) setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            className={`flex w-full flex-col items-center justify-center gap-1.5 rounded-lg border-2 border-dashed px-4 py-8 text-center transition-colors disabled:opacity-60 ${
              dragging
                ? "border-brand bg-brand/10"
                : "border-border bg-muted/30 hover:border-brand/60 hover:bg-muted/50"
            }`}
          >
            <UploadCloud className="size-6 text-muted-foreground" />
            <span className="text-sm font-medium text-foreground">
              {uploading
                ? "Enviando…"
                : vazio
                  ? "Nenhuma mídia ainda. Arraste ou clique para adicionar"
                  : "Arraste ou clique para adicionar"}
            </span>
            <span className="text-xs text-muted-foreground">
              Enviar arquivo — até 20 MB (limite do Notion)
            </span>
          </button>

          {/* Caminho 2: link de vídeo (Drive/YouTube), p/ arquivos grandes. */}
          <div className="space-y-1.5">
            <label
              htmlFor="link-video"
              className="text-xs font-medium text-muted-foreground"
            >
              Link do vídeo (Drive/YouTube)
            </label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                id="link-video"
                type="url"
                inputMode="url"
                value={link}
                disabled={ocupado}
                onChange={(e) => setLink(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    enviarLink();
                  }
                }}
                placeholder="Cole aqui o link do vídeo…"
                className="flex-1"
              />
              <Button
                type="button"
                variant="outline"
                disabled={ocupado || !link.trim()}
                onClick={enviarLink}
                className="shrink-0"
              >
                <LinkIcon className="size-4" />
                {enviandoLink ? "Adicionando…" : "Adicionar link"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
