import { Client } from "@notionhq/client";
import {
  BOARD_STATUSES,
  STATUS_AJUSTE_ARTE,
  PREFIXO_AJUSTE,
  destinoAposSolicitacao,
} from "@/lib/board";

const notion = new Client({ auth: process.env.NOTION_TOKEN });
const DB = process.env.NOTION_DB_CONTEUDO!;

// Nomes exatos das propriedades no Notion.
// CONFIRMAR com `node --env-file=.env.local scripts/inspect-db.mjs`.
const PROP_STATUS = "Status";
const PROP_CLIENTE = "Cliente"; // tipo: select
const PROP_FORMATO = "Formato do conteúdo"; // tipo: status
const PROP_FILES = "Files & media"; // tipo: files (fotos/videos/anexos)
const PROP_FILES_EDITADO = "ARQUIVO EDITADO PRONTO"; // tipo: files — arte/edicao finalizada (etapa "Concluido Designer/Arte")
const PROP_AJUSTES = "🔁 Nº de Ajustes"; // tipo: number — contagem de alteracoes
const PROP_SOLICITACAO = "Solicitação de alteração"; // tipo: date — quando foi pedida (badge de 24h)
const PROP_DATA = "Data"; // tipo: date — data editorial do conteudo (calendario)

function getTitle(props: any): string {
  const titleProp = Object.values(props).find((p: any) => p.type === "title") as any;
  return titleProp?.title?.map((t: any) => t.plain_text).join("") ?? "(sem título)";
}

export type MediaKind = "image" | "video" | "other";

export type MediaFile = {
  name: string;
  url: string;
  kind: MediaKind;
  // Entrada externa (link colado, ex.: vídeo do Drive/YouTube) e não um arquivo
  // hospedado no Notion. A galeria a exibe como cartão de link (abre em nova aba).
  external?: boolean;
};

const IMAGE_EXT = ["png", "jpg", "jpeg", "gif", "webp", "svg", "avif", "bmp", "heic"];
const VIDEO_EXT = ["mp4", "webm", "mov", "m4v", "ogv", "avi", "mkv"];

function kindFromName(name: string): MediaKind {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (IMAGE_EXT.includes(ext)) return "image";
  if (VIDEO_EXT.includes(ext)) return "video";
  return "other";
}

// Extrai os arquivos de uma propriedade do tipo "files". As URLs de arquivos
// hospedados no Notion expiram em ~1h — por isso a pagina e force-dynamic.
function getArquivos(props: any, propName: string = PROP_FILES): MediaFile[] {
  const prop = props?.[propName];
  if (prop?.type !== "files") return [];
  return (prop.files ?? [])
    .map((f: any) => {
      const external = f.type === "external";
      const url = external ? f.external?.url : f.file?.url;
      const name = f.name ?? "arquivo";
      return { name, url: url ?? "", kind: kindFromName(name), external };
    })
    .filter((f: MediaFile) => f.url);
}

export type CardResumo = {
  id: string;
  titulo: string;
  formato: string | null;
  status: string | null;
  arquivos: MediaFile[];
  // Arte/edicao finalizada (propriedade "ARQUIVO EDITADO PRONTO"), exibida na
  // etapa "Concluido Designer/Arte" — onde costumam ficar os videos prontos.
  arquivosEditados: MediaFile[];
  // Nº de alteracoes solicitadas e quando a ultima foi pedida (ISO) — usados
  // pelo badge "Alteração solicitada" (vale 24h) no quadro.
  ajustes: number;
  solicitacaoEm: string | null;
  // Data editorial (propriedade "Data") — posiciona o card no calendario. ISO.
  data: string | null;
};

function getAjustes(props: any): number {
  return props?.[PROP_AJUSTES]?.number ?? 0;
}

function getSolicitacaoEm(props: any): string | null {
  return props?.[PROP_SOLICITACAO]?.date?.start ?? null;
}

// Data editorial do conteudo (propriedade "Data"), usada no calendario. ISO
// (YYYY-MM-DD ou com hora). null quando o card ainda nao tem data marcada.
function getData(props: any): string | null {
  return props?.[PROP_DATA]?.date?.start ?? null;
}

// Lista os valores do select "Cliente" (para o seletor no painel admin).
export async function getClientesOptions(): Promise<string[]> {
  const db: any = await notion.databases.retrieve({ database_id: DB });
  const prop = db.properties?.[PROP_CLIENTE];
  if (prop?.type !== "select") return [];
  return prop.select.options.map((o: any) => o.name as string);
}

// Lista os cards do kanban isolados por cliente (select): qualquer um dos
// status configurados em COLUNAS. `cliente` = valor da opcao do select.
export async function getCardsBoard(cliente: string): Promise<CardResumo[]> {
  const res = await notion.databases.query({
    database_id: DB,
    filter: {
      and: [
        { property: PROP_CLIENTE, select: { equals: cliente } },
        {
          or: BOARD_STATUSES.map((s) => ({
            property: PROP_STATUS,
            status: { equals: s },
          })),
        },
      ],
    },
    sorts: [{ timestamp: "created_time", direction: "ascending" }],
  });
  return res.results.map((page: any) => ({
    id: page.id,
    titulo: getTitle(page.properties),
    formato: page.properties[PROP_FORMATO]?.status?.name ?? null,
    status: page.properties[PROP_STATUS]?.status?.name ?? null,
    arquivos: getArquivos(page.properties),
    arquivosEditados: getArquivos(page.properties, PROP_FILES_EDITADO),
    ajustes: getAjustes(page.properties),
    solicitacaoEm: getSolicitacaoEm(page.properties),
    data: getData(page.properties),
  }));
}

// Todos os conteudos do cliente (QUALQUER etapa, inclusive as internas que nao
// aparecem no quadro), enxutos para o calendario: sem arquivos nem blocos. A
// data vem da propriedade "Data"; cards sem data ainda entram (data: null) para
// permitir contagem de "sem data". Paginado (a base pode passar de 100 cards).
export type CardCalendario = {
  id: string;
  titulo: string;
  formato: string | null;
  status: string | null;
  data: string | null;
};

export async function getCardsCalendario(
  cliente: string
): Promise<CardCalendario[]> {
  const out: CardCalendario[] = [];
  let cursor: string | undefined = undefined;
  do {
    const res: any = await notion.databases.query({
      database_id: DB,
      filter: { property: PROP_CLIENTE, select: { equals: cliente } },
      start_cursor: cursor,
      page_size: 100,
    });
    for (const page of res.results as any[]) {
      out.push({
        id: page.id,
        titulo: getTitle(page.properties),
        formato: page.properties[PROP_FORMATO]?.status?.name ?? null,
        status: page.properties[PROP_STATUS]?.status?.name ?? null,
        data: getData(page.properties),
      });
    }
    cursor = res.has_more ? (res.next_cursor as string) : undefined;
  } while (cursor);
  return out;
}

export async function getCard(pageId: string): Promise<CardResumo> {
  const page: any = await notion.pages.retrieve({ page_id: pageId });
  return {
    id: page.id,
    titulo: getTitle(page.properties),
    formato: page.properties[PROP_FORMATO]?.status?.name ?? null,
    status: page.properties[PROP_STATUS]?.status?.name ?? null,
    arquivos: getArquivos(page.properties),
    arquivosEditados: getArquivos(page.properties, PROP_FILES_EDITADO),
    ajustes: getAjustes(page.properties),
    solicitacaoEm: getSolicitacaoEm(page.properties),
    data: getData(page.properties),
  };
}

// --- Edicao da propriedade "Files & media" ---
// O SDK 2.3.0 nao tem a File Upload API, entao usamos a REST crua para o upload.
// Para preservar os arquivos existentes, reenviamos os objetos como vem do GET
// (type "file") + os novos como "file_upload" — validado em scripts/test-files-upload.mjs.

const NOTION_VERSION = "2022-06-28";

export type CardWrite = {
  titulo: string;
  cliente: string | null;
  status: string | null;
  files: any[];
  ajustes: number;
  url: string | null;
};

// Le titulo/dono/etapa/arquivos atuais (estado fresco, para checagem e preservacao).
export async function getCardWrite(pageId: string): Promise<CardWrite> {
  const page: any = await notion.pages.retrieve({ page_id: pageId });
  return {
    titulo: getTitle(page.properties),
    cliente: page.properties?.[PROP_CLIENTE]?.select?.name ?? null,
    status: page.properties?.[PROP_STATUS]?.status?.name ?? null,
    files: page.properties?.[PROP_FILES]?.files ?? [],
    ajustes: getAjustes(page.properties),
    url: page.url ?? null,
  };
}

// Registra a solicitacao de alteracao do cliente: incrementa a contagem de
// ajustes, carimba a data (badge de 24h) e move o card conforme a etapa de
// origem (`statusAtual`):
//   - da etapa "Edição/arte finalizada" => "Ajuste Arte/Edição" (etapa interna,
//     fora do quadro) e prefixa o titulo com "[AJUSTAR]" (uma vez);
//   - das demais etapas => devolve para "Conteúdo aprovado".
// `agora` = ISO da solicitacao.
export async function registrarSolicitacaoAlteracao(
  pageId: string,
  ajustesAtuais: number,
  agora: string,
  statusAtual: string | null
) {
  const destino = destinoAposSolicitacao(statusAtual);
  const properties: any = {
    [PROP_STATUS]: { status: { name: destino } },
    [PROP_AJUSTES]: { number: ajustesAtuais + 1 },
    [PROP_SOLICITACAO]: { date: { start: agora } },
  };

  // Ao ir para a etapa interna de ajuste, prefixa o titulo com "[AJUSTAR]".
  // Descobre a propriedade de titulo dinamicamente (como em reprovarCard) e
  // guarda contra duplicar o prefixo.
  if (destino === STATUS_AJUSTE_ARTE) {
    const page: any = await notion.pages.retrieve({ page_id: pageId });
    const entry = Object.entries(page.properties).find(
      ([, p]: any) => p.type === "title"
    );
    if (entry) {
      const [tituloProp, prop]: any = entry;
      const atual = prop.title?.map((t: any) => t.plain_text).join("") ?? "";
      if (!atual.startsWith(PREFIXO_AJUSTE)) {
        properties[tituloProp] = {
          title: [{ text: { content: `${PREFIXO_AJUSTE} ${atual}` } }],
        };
      }
    }
  }

  await notion.pages.update({ page_id: pageId, properties } as any);
}

// Sobrescreve a propriedade de arquivos com o array ja montado.
export async function setArquivos(pageId: string, files: any[]) {
  await notion.pages.update({
    page_id: pageId,
    properties: { [PROP_FILES]: { files } },
  } as any);
}

// Sobe os bytes para o Notion (upload de parte unica, ate 20 MB) e devolve o id.
export async function uploadParaNotion(
  bytes: ArrayBuffer,
  name: string,
  contentType: string
): Promise<string> {
  const auth = {
    Authorization: `Bearer ${process.env.NOTION_TOKEN}`,
    "Notion-Version": NOTION_VERSION,
  };

  const create = await fetch("https://api.notion.com/v1/file_uploads", {
    method: "POST",
    headers: { ...auth, "Content-Type": "application/json" },
    body: "{}",
  });
  if (!create.ok) throw new Error("Falha ao iniciar o upload no Notion.");
  const { id, upload_url } = await create.json();

  const form = new FormData();
  form.append(
    "file",
    new Blob([bytes], { type: contentType || "application/octet-stream" }),
    name
  );
  const send = await fetch(upload_url, { method: "POST", headers: auth, body: form });
  if (!send.ok) throw new Error("Falha ao enviar o arquivo ao Notion.");

  return id as string;
}

// --- Comentarios de ajuste (pedidos do cliente na etapa de arte) ---
// Cada pedido vira um COMENTARIO na pagina do Notion (texto + imagem opcional).
// A API de comentarios com anexo exige REST cru e uma versao mais nova que a do
// SDK 2.3.0 (que so aceita comentario de texto).
const NOTION_VERSION_COMMENTS = "2026-03-11";

// Marcador na 1a linha do comentario: distingue os pedidos do cliente de outros
// comentarios da equipe ao listar.
export const AJUSTE_SENTINEL = "🔁 Ajuste do cliente";

export type AjusteImagem = { url: string; category: string };
export type AjusteComentario = {
  id: string;
  criadoEm: string; // ISO (created_time)
  texto: string; // sem a linha do sentinel
  imagens: AjusteImagem[];
};

const NOTION_COMMENTS_URL = "https://api.notion.com/v1/comments";
function commentsAuth() {
  return {
    Authorization: `Bearer ${process.env.NOTION_TOKEN}`,
    "Notion-Version": NOTION_VERSION_COMMENTS,
  };
}

// Cria um comentario de ajuste na pagina. `texto` ja vem com a linha do sentinel.
// `fileUploadIds` (ate 3) sao anexados como imagens (reusa uploadParaNotion).
export async function criarComentarioAjuste(
  pageId: string,
  texto: string,
  fileUploadIds: string[] = []
): Promise<void> {
  const body: Record<string, unknown> = {
    parent: { page_id: pageId },
    rich_text: [{ type: "text", text: { content: texto } }],
  };
  if (fileUploadIds.length) {
    body.attachments = fileUploadIds.map((id) => ({
      type: "file_upload",
      file_upload_id: id,
    }));
  }
  const res = await fetch(NOTION_COMMENTS_URL, {
    method: "POST",
    headers: { ...commentsAuth(), "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(
      `Falha ao registrar o comentário no Notion.${detail ? ` ${detail}` : ""}`
    );
  }
}

// Lista os pedidos do cliente (comentarios com o sentinel), do mais recente ao
// mais antigo. As URLs das imagens expiram — busque sob demanda (page dinamica).
export async function listarComentariosAjuste(
  pageId: string
): Promise<AjusteComentario[]> {
  const out: AjusteComentario[] = [];
  let cursor: string | undefined = undefined;
  do {
    const url = new URL(NOTION_COMMENTS_URL);
    url.searchParams.set("block_id", pageId);
    url.searchParams.set("page_size", "100");
    if (cursor) url.searchParams.set("start_cursor", cursor);

    const res = await fetch(url, { headers: commentsAuth() });
    if (!res.ok) throw new Error("Falha ao carregar os ajustes.");
    const data: any = await res.json();

    for (const c of data.results ?? []) {
      const texto = (c.rich_text ?? [])
        .map((r: any) => r.plain_text ?? r.text?.content ?? "")
        .join("");
      if (!texto.startsWith(AJUSTE_SENTINEL)) continue;
      const imagens: AjusteImagem[] = (c.attachments ?? [])
        .map((a: any) => ({ url: a.file?.url ?? "", category: a.category ?? "" }))
        .filter((a: AjusteImagem) => a.url);
      out.push({
        id: c.id,
        criadoEm: c.created_time,
        texto: texto.slice(AJUSTE_SENTINEL.length).trim(),
        imagens,
      });
    }
    cursor = data.has_more ? (data.next_cursor as string) : undefined;
  } while (cursor);

  // A API retorna do mais antigo ao mais recente; invertemos para recente-primeiro.
  return out.reverse();
}

// BLOCK (corpo): separado da query, paginado por cursor. Render read-only.
export async function getBlocks(pageId: string) {
  const blocks: any[] = [];
  let cursor: string | undefined = undefined;
  do {
    const res = await notion.blocks.children.list({
      block_id: pageId, start_cursor: cursor, page_size: 100,
    });
    blocks.push(...res.results);
    cursor = res.has_more ? (res.next_cursor as string) : undefined;
  } while (cursor);
  return blocks;
}

// Anexa o resumo de uma solicitacao de alteracao ao CORPO da pagina (blocos),
// como registro duravel: separador chamativo + cabecalho + texto do pedido +
// (opcional) referencias das imagens numeradas. Usa a API de blocos (append).
const SEPARADOR_SOLICITACAO = "=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+";
export async function anexarSolicitacaoNoCorpo(
  pageId: string,
  header: string,
  texto: string,
  referencias: string[] = []
): Promise<void> {
  const paragrafo = (content: string, bold = false) => ({
    object: "block",
    type: "paragraph",
    paragraph: {
      rich_text: [{ type: "text", text: { content }, annotations: { bold } }],
    },
  });
  const item = (content: string) => ({
    object: "block",
    type: "bulleted_list_item",
    bulleted_list_item: {
      rich_text: [{ type: "text", text: { content } }],
    },
  });

  const children: any[] = [paragrafo(SEPARADOR_SOLICITACAO), paragrafo(header, true)];
  if (texto) children.push(paragrafo(texto));
  if (referencias.length) {
    children.push(paragrafo("Imagens de referência:", true));
    for (const r of referencias) children.push(item(r));
  }
  await notion.blocks.children.append({ block_id: pageId, children } as any);
}
