// Ponte entre o formato de blocks do Notion e o do BlockNote (editor).
// notionToBlockNote: carrega o corpo no editor.
// blockNoteToNotion: converte o que o editor produz em children p/ a API do Notion.
//
// Escopo (v1): blocos de texto de nivel superior — paragraph, headings (1-3),
// listas (bullet/numbered/to-do), quote, code, divider, image. Aninhamento
// (filhos de blocos) NAO e preservado.
/* eslint-disable @typescript-eslint/no-explicit-any */

// ---------- Notion -> BlockNote ----------

function richToInline(rich: any[]): any[] {
  if (!rich?.length) return [];
  const out: any[] = [];
  for (const r of rich) {
    const text: string = r.plain_text ?? "";
    if (text === "" && !r.href) continue;
    const a = r.annotations ?? {};
    const styles: any = {};
    if (a.bold) styles.bold = true;
    if (a.italic) styles.italic = true;
    if (a.underline) styles.underline = true;
    if (a.strikethrough) styles.strike = true;
    if (a.code) styles.code = true;
    if (r.href) {
      out.push({ type: "link", href: r.href, content: [{ type: "text", text, styles }] });
    } else {
      out.push({ type: "text", text, styles });
    }
  }
  return out;
}

export function notionToBlockNote(blocks: any[]): any[] {
  const out: any[] = [];
  for (const b of blocks ?? []) {
    const t = b.type;
    const d = b[t] ?? {};
    switch (t) {
      case "paragraph":
        out.push({ type: "paragraph", content: richToInline(d.rich_text) });
        break;
      case "heading_1":
        out.push({ type: "heading", props: { level: 1 }, content: richToInline(d.rich_text) });
        break;
      case "heading_2":
        out.push({ type: "heading", props: { level: 2 }, content: richToInline(d.rich_text) });
        break;
      case "heading_3":
        out.push({ type: "heading", props: { level: 3 }, content: richToInline(d.rich_text) });
        break;
      case "bulleted_list_item":
        out.push({ type: "bulletListItem", content: richToInline(d.rich_text) });
        break;
      case "numbered_list_item":
        out.push({ type: "numberedListItem", content: richToInline(d.rich_text) });
        break;
      case "to_do":
        out.push({ type: "checkListItem", props: { checked: !!d.checked }, content: richToInline(d.rich_text) });
        break;
      case "quote":
        out.push({ type: "quote", content: richToInline(d.rich_text) });
        break;
      case "callout": {
        const content = richToInline(d.rich_text);
        if (d.icon?.emoji) content.unshift({ type: "text", text: `${d.icon.emoji} `, styles: {} });
        out.push({ type: "quote", content });
        break;
      }
      case "code":
        out.push({ type: "codeBlock", content: richToInline(d.rich_text) });
        break;
      case "divider":
        out.push({ type: "divider" });
        break;
      case "image": {
        const url = d.type === "external" ? d.external?.url : d.file?.url;
        if (url) out.push({ type: "image", props: { url } });
        break;
      }
      default:
        // Fallback: se tiver texto, vira paragrafo; senao ignora.
        if (d?.rich_text?.length) out.push({ type: "paragraph", content: richToInline(d.rich_text) });
    }
  }
  return out;
}

// ---------- BlockNote -> Notion ----------

function splitText(s: string): string[] {
  // Notion limita rich_text a 2000 chars por item.
  if (s.length <= 2000) return [s];
  const out: string[] = [];
  for (let i = 0; i < s.length; i += 2000) out.push(s.slice(i, i + 2000));
  return out;
}

function pushText(rich: any[], text: string, styles: any, href: string | null) {
  const s = styles ?? {};
  const annotations = {
    bold: !!s.bold,
    italic: !!s.italic,
    strikethrough: !!s.strike,
    underline: !!s.underline,
    code: !!s.code,
    color: "default",
  };
  for (const chunk of splitText(text ?? "")) {
    if (chunk === "") continue;
    rich.push({
      type: "text",
      text: { content: chunk, link: href ? { url: href } : null },
      annotations,
    });
  }
}

function inlineToRich(content: any[]): any[] {
  const rich: any[] = [];
  for (const c of content ?? []) {
    if (c.type === "link") {
      for (const inner of c.content ?? []) pushText(rich, inner.text, inner.styles, c.href);
    } else if (c.type === "text") {
      pushText(rich, c.text, c.styles, null);
    }
  }
  return rich;
}

export function blockNoteToNotion(blocks: any[]): any[] {
  const out: any[] = [];
  for (const b of blocks ?? []) {
    const c = inlineToRich(b.content);
    switch (b.type) {
      case "paragraph":
        out.push({ type: "paragraph", paragraph: { rich_text: c } });
        break;
      case "heading": {
        const lvl = Math.min(3, Math.max(1, b.props?.level ?? 1));
        const key = `heading_${lvl}`;
        out.push({ type: key, [key]: { rich_text: c } });
        break;
      }
      case "bulletListItem":
        out.push({ type: "bulleted_list_item", bulleted_list_item: { rich_text: c } });
        break;
      case "numberedListItem":
        out.push({ type: "numbered_list_item", numbered_list_item: { rich_text: c } });
        break;
      case "checkListItem":
        out.push({ type: "to_do", to_do: { rich_text: c, checked: !!b.props?.checked } });
        break;
      case "quote":
        out.push({ type: "quote", quote: { rich_text: c } });
        break;
      case "codeBlock":
        out.push({ type: "code", code: { rich_text: c, language: "plain text" } });
        break;
      case "divider":
        out.push({ type: "divider", divider: {} });
        break;
      case "image": {
        const url = b.props?.url;
        if (url && /^https?:\/\//.test(url)) {
          out.push({ type: "image", image: { type: "external", external: { url } } });
        }
        break;
      }
      default:
        // table/toggle/video/etc -> paragrafo com o texto que houver.
        if (c.length) out.push({ type: "paragraph", paragraph: { rich_text: c } });
    }
  }
  return out;
}
