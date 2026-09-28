import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCardWrite, setArquivos, uploadParaNotion } from "@/lib/notion";
import { STATUS_EDITAVEL } from "@/lib/board";

// Upload de midia para a propriedade "Files & media" de um card.
// So permitido na etapa editavel e para o cliente dono do card.
const MAX_BYTES = 20 * 1024 * 1024; // 20 MB (upload de parte unica do Notion)

// Valida o link colado e monta a entrada externa do Notion, com um nome amigavel
// conforme o provedor (YouTube/Drive/host). Retorna null se a URL for invalida.
function montarLinkExterno(
  raw: string
): { type: "external"; name: string; external: { url: string } } | null {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return null;
  const host = u.hostname.replace(/^www\./, "");
  let nome = `Link — ${host}`;
  if (host.includes("youtu")) nome = "Vídeo do YouTube";
  else if (host.includes("drive.google") || host.includes("docs.google"))
    nome = "Vídeo do Google Drive";
  else if (host.includes("vimeo")) nome = "Vídeo do Vimeo";
  return { type: "external", name: nome, external: { url: u.toString() } };
}

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }
  const cliente = (user.app_metadata?.cliente as string | undefined) ?? "";

  const form = await req.formData();
  const pageId = String(form.get("pageId") ?? "");
  const files = form.getAll("file").filter((f): f is File => f instanceof File);
  // Link de vídeo (Drive/YouTube): entra como item externo na mesma propriedade.
  const link = String(form.get("link") ?? "").trim();
  const linkExterno = link ? montarLinkExterno(link) : null;

  if (link && !linkExterno) {
    return NextResponse.json(
      { error: "Link inválido. Cole um endereço começando com http:// ou https://." },
      { status: 400 }
    );
  }
  if (!pageId || (!files.length && !linkExterno)) {
    return NextResponse.json({ error: "Requisição inválida." }, { status: 400 });
  }

  for (const f of files) {
    if (f.size > MAX_BYTES) {
      return NextResponse.json(
        { error: `"${f.name}" excede o limite de 20 MB.` },
        { status: 413 }
      );
    }
  }

  // Checagem de dono + etapa (estado fresco do Notion).
  const card = await getCardWrite(pageId);
  if (card.cliente !== cliente) {
    return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
  }
  if (card.status !== STATUS_EDITAVEL) {
    return NextResponse.json(
      { error: "Esta etapa não permite edição de mídia." },
      { status: 403 }
    );
  }

  try {
    const novos = [];
    for (const f of files) {
      const id = await uploadParaNotion(await f.arrayBuffer(), f.name, f.type);
      novos.push({ type: "file_upload", file_upload: { id }, name: f.name });
    }
    if (linkExterno) novos.push(linkExterno);
    // Preserva os existentes (reenviados como vem do GET) + anexa os novos.
    await setArquivos(pageId, [...card.files, ...novos]);
    revalidatePath("/");
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Falha no upload.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
