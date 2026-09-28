import { Fragment, type ReactNode } from "react";
import { Separator } from "@/components/ui/separator";
import { ZoomableImage } from "@/components/zoomable-image";

type RichTextItem = {
  plain_text: string;
  href: string | null;
  annotations: {
    bold: boolean;
    italic: boolean;
    strikethrough: boolean;
    underline: boolean;
    code: boolean;
    color: string;
  };
};

function RichText({ value }: { value?: RichTextItem[] }) {
  if (!value?.length) return null;
  return (
    <>
      {value.map((t, i) => {
        const a = t.annotations;
        let node: ReactNode = t.plain_text;
        if (a.code) {
          node = (
            <code className="rounded-sm bg-muted px-1.5 py-0.5 font-mono text-[0.85em] break-words text-foreground">
              {node}
            </code>
          );
        }
        const cls = [
          a.bold && "font-semibold",
          a.italic && "italic",
          a.strikethrough && "line-through",
          a.underline && "underline",
        ]
          .filter(Boolean)
          .join(" ");
        if (cls) node = <span className={cls}>{node}</span>;
        if (t.href) {
          node = (
            <a
              href={t.href}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-info underline underline-offset-2 hover:opacity-80"
            >
              {node}
            </a>
          );
        }
        return <Fragment key={i}>{node}</Fragment>;
      })}
    </>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function SingleBlock({ block }: { block: any }) {
  const type = block.type;
  const data = block[type];

  switch (type) {
    case "paragraph":
      if (!data.rich_text?.length) return <div className="h-3" />;
      return (
        <p className="leading-relaxed text-foreground/90">
          <RichText value={data.rich_text} />
        </p>
      );
    case "heading_1":
      return (
        <h2 className="mt-2 font-heading text-2xl text-foreground">
          <RichText value={data.rich_text} />
        </h2>
      );
    case "heading_2":
      return (
        <h3 className="mt-2 font-heading text-xl text-foreground">
          <RichText value={data.rich_text} />
        </h3>
      );
    case "heading_3":
      return (
        <h4 className="mt-1 font-heading text-lg text-foreground">
          <RichText value={data.rich_text} />
        </h4>
      );
    case "quote":
      return (
        <blockquote className="border-l-2 border-border pl-4 italic text-foreground/80">
          <RichText value={data.rich_text} />
        </blockquote>
      );
    case "callout":
      return (
        <div className="flex items-start gap-2 rounded-md border-l-2 border-brand/60 bg-muted p-3 text-foreground/90">
          {data.icon?.emoji && (
            <span className="mt-0.5" aria-hidden>
              {data.icon.emoji}
            </span>
          )}
          <span>
            <RichText value={data.rich_text} />
          </span>
        </div>
      );
    case "to_do":
      return (
        <label className="flex items-start gap-2 text-foreground/90">
          <input
            type="checkbox"
            checked={!!data.checked}
            readOnly
            disabled
            className="mt-1.5 accent-primary"
          />
          <span className={data.checked ? "line-through opacity-70" : ""}>
            <RichText value={data.rich_text} />
          </span>
        </label>
      );
    case "code":
      return (
        <pre className="overflow-x-auto rounded-md bg-muted p-3 font-mono text-sm text-foreground/90">
          <code>{data.rich_text?.map((t: RichTextItem) => t.plain_text).join("")}</code>
        </pre>
      );
    case "divider":
      return <Separator />;
    case "image": {
      const url = data.type === "external" ? data.external?.url : data.file?.url;
      if (!url) return null;
      return (
        <ZoomableImage
          src={url}
          alt={data.caption?.map((t: RichTextItem) => t.plain_text).join("") || ""}
          className="h-auto max-w-full rounded-md border border-border"
        />
      );
    }
    default:
      // Fallback: se o bloco tiver rich_text, renderiza como paragrafo.
      if (data?.rich_text?.length) {
        return (
          <p className="leading-relaxed text-foreground/90">
            <RichText value={data.rich_text} />
          </p>
        );
      }
      return null;
  }
}

// Renderiza o corpo (blocks) do card em modo somente-leitura.
// Agrupa itens de lista consecutivos em <ul>/<ol>.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function NotionBlocks({ blocks }: { blocks: any[] }) {
  if (!blocks?.length) {
    return (
      <p className="text-sm italic text-muted-foreground">
        Este conteúdo não tem corpo de texto.
      </p>
    );
  }

  const out: ReactNode[] = [];
  let i = 0;
  while (i < blocks.length) {
    const b = blocks[i];
    if (b.type === "bulleted_list_item" || b.type === "numbered_list_item") {
      const ordered = b.type === "numbered_list_item";
      const items = [];
      while (i < blocks.length && blocks[i].type === b.type) {
        items.push(blocks[i]);
        i++;
      }
      const ListTag = ordered ? "ol" : "ul";
      out.push(
        <ListTag
          key={`list-${i}`}
          className={`space-y-1 pl-6 text-foreground/90 ${
            ordered ? "list-decimal" : "list-disc"
          }`}
        >
          {items.map((it) => (
            <li key={it.id}>
              <RichText value={it[it.type].rich_text} />
            </li>
          ))}
        </ListTag>
      );
      continue;
    }
    out.push(<SingleBlock key={b.id ?? i} block={b} />);
    i++;
  }

  return <div className="space-y-3 break-words text-[0.95rem]">{out}</div>;
}
