"use server";
import { Client } from "@notionhq/client";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  getCardWrite,
  setArquivos,
  listarComentariosAjuste,
  type AjusteComentario,
} from "@/lib/notion";
import { STATUS_EDITAVEL } from "@/lib/board";

const notion = new Client({ auth: process.env.NOTION_TOKEN });

// Remove uma midia da propriedade "Files & media". So na etapa editavel e para
// o cliente dono do card. `index`/`name` identificam o arquivo na lista atual.
export async function removerArquivo(
  pageId: string,
  index: number,
  name: string
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Não autenticado.");
  const cliente = (user.app_metadata?.cliente as string | undefined) ?? "";

  const card = await getCardWrite(pageId);
  if (card.cliente !== cliente) throw new Error("Sem permissão.");
  if (card.status !== STATUS_EDITAVEL) {
    throw new Error("Esta etapa não permite edição de mídia.");
  }
  // Confere que a lista nao mudou desde que o cliente a viu.
  if (card.files[index]?.name !== name) {
    throw new Error("A lista de mídias mudou. Recarregue e tente de novo.");
  }

  await setArquivos(
    pageId,
    card.files.filter((_, i) => i !== index)
  );
  revalidatePath("/");
}

export async function aprovarCard(pageId: string) {
  await notion.pages.update({
    page_id: pageId,
    properties: { Status: { status: { name: "Conteúdo aprovado" } } },
  });
  revalidatePath("/");
}

// Lista os pedidos de alteracao do cliente (guardados como comentarios no card
// do Notion), para o "Ver ajustes". Busca lazy: so quando o cliente abre a secao.
// So o dono do card pode ler.
export async function listarAjustes(
  pageId: string
): Promise<AjusteComentario[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Não autenticado.");
  const cliente = (user.app_metadata?.cliente as string | undefined) ?? "";

  const card = await getCardWrite(pageId);
  if (card.cliente !== cliente) throw new Error("Sem permissão.");

  return listarComentariosAjuste(pageId);
}

// Aprova a etapa "Concluido Designer/Arte" => move o card para "Para agendar".
export async function aprovarArteCard(pageId: string) {
  await notion.pages.update({
    page_id: pageId,
    properties: { Status: { status: { name: "Para agendar" } } },
  });
  revalidatePath("/");
}

// Salva o corpo editado: arquiva os blocks de nivel superior atuais e recria
// os blocks vindos do editor. `children` ja vem no formato da API do Notion.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function salvarCorpo(pageId: string, children: any[]) {
  // 1) coleta os ids dos blocks atuais (paginado)
  const ids: string[] = [];
  let cursor: string | undefined = undefined;
  do {
    const res = await notion.blocks.children.list({
      block_id: pageId,
      start_cursor: cursor,
      page_size: 100,
    });
    res.results.forEach((b) => ids.push(b.id));
    cursor = res.has_more ? (res.next_cursor as string) : undefined;
  } while (cursor);

  // 2) arquiva os atuais (sequencial: respeita o rate limit do Notion)
  for (const id of ids) {
    await notion.blocks.delete({ block_id: id });
  }

  // 3) recria os editados (append aceita ate 100 por chamada)
  for (let i = 0; i < children.length; i += 100) {
    await notion.blocks.children.append({
      block_id: pageId,
      children: children.slice(i, i + 100),
    });
  }

  revalidatePath("/");
}

export async function reprovarCard(pageId: string) {
  const page: any = await notion.pages.retrieve({ page_id: pageId });
  const entry = Object.entries(page.properties).find(([, p]: any) => p.type === "title");
  if (!entry) return;
  const [tituloProp, prop]: any = entry;
  const atual = prop.title?.map((t: any) => t.plain_text).join("") ?? "";
  if (atual.startsWith("[REPROVADO]")) return; // guarda contra duplicar
  await notion.pages.update({
    page_id: pageId,
    properties: {
      [tituloProp]: { title: [{ text: { content: `[REPROVADO] ${atual}` } }] },
    },
  });
  revalidatePath("/");
}