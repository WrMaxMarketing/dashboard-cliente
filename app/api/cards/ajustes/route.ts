import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  getCardWrite,
  uploadParaNotion,
  criarComentarioAjuste,
  registrarSolicitacaoAlteracao,
  anexarSolicitacaoNoCorpo,
  setArquivos,
  AJUSTE_SENTINEL,
} from "@/lib/notion";
import { labelDoStatus, podeSolicitarAlteracao } from "@/lib/board";
// Aviso por WhatsApp desativado — ver bloco comentado no passo 4.
// import { enviarWhatsApp } from "@/lib/whatsapp";

// Solicitacao de alteracao na etapa "Concluido Designer/Arte": texto livre +
// (opcional) quantas imagens e/ou videos quiser, cada um com uma descricao
// ("onde e e o que fazer"). Cada pedido vira COMENTARIO(s) no card do Notion,
// incrementa o Nº de Ajustes e move o card:
// da etapa de arte finalizada para "Ajuste Arte/Edição" (interna, titulo
// prefixado "[AJUSTAR]"); das demais etapas, para "Conteúdo aprovado".
// A equipe acompanha os pedidos pelo proprio Notion.
// So permitido nas etapas solicitaveis e para o cliente dono do card.
const MAX_BYTES = 20 * 1024 * 1024; // 20 MB (upload de parte unica do Notion)
const MAX_ANEXOS_POR_COMENTARIO = 3; // limite da API de comentarios do Notion

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
  const texto = String(form.get("texto") ?? "").trim();
  const files = form.getAll("file").filter((f): f is File => f instanceof File);
  // Descricao alinhada por indice com cada arquivo (pode vir vazia).
  const descricoes = form.getAll("imagemDescricao").map((d) => String(d).trim());

  if (!pageId || !texto) {
    return NextResponse.json(
      { error: "Descreva a alteração desejada." },
      { status: 400 }
    );
  }
  for (const f of files) {
    if (!f.type.startsWith("image/") && !f.type.startsWith("video/")) {
      return NextResponse.json(
        { error: "Os anexos precisam ser imagens ou vídeos." },
        { status: 400 }
      );
    }
    if (f.size > MAX_BYTES) {
      return NextResponse.json(
        { error: `"${f.name}" excede o limite de 20 MB.` },
        { status: 413 }
      );
    }
  }
// teste
  // Checagem de dono + etapa (estado fresco do Notion).
  const card = await getCardWrite(pageId);
  if (card.cliente !== cliente) {
    return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
  }
  if (!podeSolicitarAlteracao(card.status)) {
    return NextResponse.json(
      { error: "Esta etapa não permite solicitar alteração." },
      { status: 403 }
    );
  }
  // Etapa em que o pedido foi feito — registrada no comentário, no corpo e no
  // aviso à equipe (única adição à lógica de solicitação de alteração).
  const etapa = labelDoStatus(card.status);

  try {
    // Sobe cada anexo UMA vez e guarda id + nome + descricao + tipo. O mesmo
    // file_upload id e reusado no comentario e em "Files & media" (validado).
    const anexos: {
      id: string;
      name: string;
      descricao: string;
      kind: "image" | "video";
    }[] = [];
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      const id = await uploadParaNotion(await f.arrayBuffer(), f.name, f.type);
      anexos.push({
        id,
        name: f.name,
        descricao: descricoes[i] ?? "",
        kind: f.type.startsWith("video/") ? "video" : "image",
      });
    }

    // Numeracao SEQUENCIAL global (1, 2, 3, 4…) — a mesma referencia usada nos
    // comentarios e no resumo do corpo. A palavra reflete o tipo.
    // Os contadores por tipo (nImg/nVid) so alimentavam o aviso de WhatsApp,
    // hoje desativado — ver bloco comentado no passo 4.
    // let nImg = 0;
    // let nVid = 0;
    const rotulos = anexos.map((a, i) => {
      const n = i + 1;
      // if (a.kind === "video") nVid++;
      // else nImg++;
      const sufixo = a.descricao ? `: ${a.descricao}` : "";
      return a.kind === "video"
        ? `🎬 Vídeo ${n}${sufixo}`
        : `📷 Imagem ${n}${sufixo}`;
    });

    // 1) Comentarios do Notion. Como a API aceita ate 3 anexos por comentario,
    // agrupamos em blocos de 3. O texto geral vai no primeiro comentario.
    const linhaEtapa = `📍 Etapa: ${etapa}`;
    if (anexos.length === 0) {
      await criarComentarioAjuste(
        pageId,
        `${AJUSTE_SENTINEL}\n${linhaEtapa}\n${texto}`,
        []
      );
    } else {
      for (
        let start = 0;
        start < anexos.length;
        start += MAX_ANEXOS_POR_COMENTARIO
      ) {
        const bloco = anexos.slice(start, start + MAX_ANEXOS_POR_COMENTARIO);
        const linhas = [AJUSTE_SENTINEL];
        if (start === 0) {
          linhas.push(linhaEtapa);
          linhas.push(texto);
        }
        rotulos
          .slice(start, start + MAX_ANEXOS_POR_COMENTARIO)
          .forEach((r) => linhas.push(r));
        await criarComentarioAjuste(
          pageId,
          linhas.join("\n"),
          bloco.map((a) => a.id)
        );
      }
    }

    // 2) Tambem anexa todas as midias em "Files & media" (preserva as existentes).
    if (anexos.length) {
      const novosFiles = anexos.map((a) => ({
        type: "file_upload",
        file_upload: { id: a.id },
        name: a.name,
      }));
      await setArquivos(pageId, [...card.files, ...novosFiles]);
    }

    // 3) Resumo duravel no CORPO da pagina: separador + cabecalho identificando
    // o cliente e a data + o pedido + referencias numeradas (so as com descricao).
    const dataBr = new Date().toLocaleDateString("pt-BR", {
      timeZone: "America/Sao_Paulo",
    });
    const header = `SOLICITAÇÃO DE ALTERAÇÃO POR ${(
      cliente || "CLIENTE"
    ).toUpperCase()} DIA ${dataBr} — ETAPA: ${etapa.toUpperCase()}`;
    const referencias = anexos
      .map((a, i) => ({ n: i + 1, kind: a.kind, descricao: a.descricao }))
      .filter((r) => r.descricao)
      .map(
        (r) => `${r.kind === "video" ? "Vídeo" : "Imagem"} ${r.n}: ${r.descricao}`
      );
    await anexarSolicitacaoNoCorpo(pageId, header, texto, referencias);

    // 4) Aviso a equipe por WhatsApp — DESATIVADO. A instancia da Evolution API
    // ficava fora do ar e derrubava a solicitacao inteira (HTTP 500) DEPOIS de
    // os comentarios/anexos ja terem sido gravados no Notion, fazendo o cliente
    // reenviar e duplicar tudo. A equipe acompanha os pedidos pelo Notion.
    // Para reativar: descomentar este bloco, o import de `enviarWhatsApp` e os
    // contadores nImg/nVid acima — e, de preferencia, envolver o envio em um
    // try/catch proprio para que a falha do aviso nao invalide a solicitacao.
    //
    // // Resumo dos anexos para o aviso (ex.: "2 imagens e 1 vídeo").
    // const partesResumo: string[] = [];
    // if (nImg) partesResumo.push(`${nImg} ${nImg === 1 ? "imagem" : "imagens"}`);
    // if (nVid) partesResumo.push(`${nVid} ${nVid === 1 ? "vídeo" : "vídeos"}`);
    // const resumoAnexos = partesResumo.join(" e ");
    //
    // // Notifica a equipe (os anexos nao vao pelo WhatsApp; apenas o aviso).
    // const corpo = [
    //   "🔔 *Solicitação de alteração*",
    //   `Cliente: ${cliente || "(sem cliente)"}`,
    //   `Conteúdo: ${card.titulo}`,
    //   `Etapa: ${etapa}`,
    //   "",
    //   texto,
    //   anexos.length ? `📎 ${resumoAnexos} em anexo (ver no painel/Notion).` : "",
    //   card.url ? `🔗 ${card.url}` : "",
    // ]
    //   .filter(Boolean)
    //   .join("\n");
    // await enviarWhatsApp(corpo);

    // Registra (Nº de Ajustes +1 + data) e move o card conforme a etapa de
    // origem: "Edição/arte finalizada" => "Ajuste Arte/Edição" (interna, com
    // titulo prefixado "[AJUSTAR]"); demais => "Conteúdo aprovado".
    await registrarSolicitacaoAlteracao(
      pageId,
      card.ajustes,
      new Date().toISOString(),
      card.status
    );

    revalidatePath("/");
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Não foi possível enviar.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
