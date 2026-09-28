// Configuracao das colunas do kanban. Modulo "puro" (sem deps de servidor)
// para poder ser importado tanto no servidor (notion.ts/page) quanto no
// componente client (approval-board).
//
// `status` = valor EXATO da opcao no Notion (atencao: "Concluido" sem acento).
// `label`  = texto exibido na coluna (pode ter acento).
// `modo`   = o que o cliente pode fazer nessa etapa:
//   - "aprovar"      => edita o conteudo + Aprovar (=> "Conteúdo aprovado") / Reprovar
//   - "aprovar-arte" => so visualiza + Aprovar (=> "Para agendar")
//   - "leitura"      => so visualiza, sem acoes

export type ColunaModo = "aprovar" | "aprovar-arte" | "leitura";

// Qual propriedade de arquivos do Notion alimenta a galeria de midias da etapa:
//   "cru"     => "Files & media" (arquivos crus)
//   "editado" => "ARQUIVO EDITADO PRONTO" (arte/edicao finalizada, incl. videos)
export type ColunaMidia = "cru" | "editado";

export type Coluna = {
  status: string;
  label: string;
  modo: ColunaModo;
  midia: ColunaMidia;
};

export const COLUNAS: Coluna[] = [
  {
    status: "Conteúdo para aprovação",
    label: "Conteúdo para aprovar",
    modo: "aprovar",
    midia: "cru",
  },
  {
    status: "Conteúdo aprovado",
    label: "Conteúdo aprovado pelo cliente",
    modo: "leitura",
    midia: "cru",
  },
  {
    status: "Concluido Designer/Arte",
    label: "Edição/arte finalizada",
    modo: "aprovar-arte",
    midia: "editado",
  },
  {
    status: "Para agendar",
    label: "Para publicar",
    modo: "leitura",
    midia: "editado",
  },
];

export const BOARD_STATUSES = COLUNAS.map((c) => c.status);

// Unica etapa em que o cliente pode editar (corpo e midias).
export const STATUS_EDITAVEL =
  COLUNAS.find((c) => c.modo === "aprovar")?.status ?? "";

// Etapas que disparam notificacao ao cliente (as que exigem acao dele):
// "Conteúdo para aprovação" e "Concluido Designer/Arte".
export const STATUS_NOTIFICAVEIS = COLUNAS.filter(
  (c) => c.modo !== "leitura"
).map((c) => c.status);

export function modoDoStatus(status: string | null | undefined): ColunaModo {
  return COLUNAS.find((c) => c.status === status)?.modo ?? "leitura";
}

// Rotulo amigavel da etapa (para exibir/registrar), com fallback no proprio
// status quando for um valor fora do board.
export function labelDoStatus(status: string | null | undefined): string {
  return COLUNAS.find((c) => c.status === status)?.label ?? status ?? "";
}

// Etapas em que o cliente pode solicitar alteracao: "Edicao/arte finalizada"
// (aprovar-arte) e tambem "Conteudo aprovado" (revisao apos aprovar o briefing).
export const STATUS_SOLICITAVEIS = COLUNAS.filter(
  (c) => c.modo === "aprovar-arte" || c.status === "Conteúdo aprovado"
).map((c) => c.status);

export function podeSolicitarAlteracao(
  status: string | null | undefined
): boolean {
  return STATUS_SOLICITAVEIS.includes(status ?? "");
}

// Alteracoes incluidas no pacote do cliente. Acima disso o pedido ainda e
// aceito, mas vira taxa extra (regra comercial — nao bloqueia o envio).
export const MAX_ALTERACOES = 2;

// Quantas alteracoes ainda cabem no limite (nunca negativo).
export function alteracoesRestantes(ajustes: number): number {
  return Math.max(0, MAX_ALTERACOES - ajustes);
}

// Status INTERNO (fora do quadro) da etapa de ajuste de arte/edicao no Notion.
// Quando o cliente pede alteracao na etapa "Edição/arte finalizada", o card vai
// para ca — uma movimentacao interna para a equipe, que nao aparece como coluna.
export const STATUS_AJUSTE_ARTE = "Ajuste Arte/Edição";

// Prefixo aplicado ao titulo ao mandar o card para "Ajuste Arte/Edição", para
// sinalizar o pedido de alteracao a equipe de arte/edicao.
export const PREFIXO_AJUSTE = "[AJUSTAR]";

// Para onde o card vai quando o cliente solicita alteracao a partir de `status`:
//   - etapa de arte finalizada (aprovar-arte) => "Ajuste Arte/Edição" (interna)
//   - demais etapas solicitaveis ("Conteúdo aprovado") => "Conteúdo aprovado"
export function destinoAposSolicitacao(
  status: string | null | undefined
): string {
  return modoDoStatus(status) === "aprovar-arte"
    ? STATUS_AJUSTE_ARTE
    : "Conteúdo aprovado";
}

// Etapa "interna": qualquer status fora das colunas do quadro. Esses conteudos
// existem para o cliente no calendario (previa), mas nao abrem como card.
export function etapaInterna(status: string | null | undefined): boolean {
  return !BOARD_STATUSES.includes(status ?? "");
}

// Qual fonte de midia a etapa usa (default "cru" para status fora do board).
export function midiaDoStatus(status: string | null | undefined): ColunaMidia {
  return COLUNAS.find((c) => c.status === status)?.midia ?? "cru";
}
