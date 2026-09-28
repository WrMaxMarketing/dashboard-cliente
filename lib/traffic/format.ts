// Formatação pt-BR do Painel de Tráfego. Valor ausente => "—" (nunca inventar dado).

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const brl0 = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const int = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });
const dec2 = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const compact = new Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 1 });

export const DASH = "—";

const ok = (v: number | null | undefined): v is number => typeof v === "number" && Number.isFinite(v);

export const fmtBRL = (v: number | null | undefined) => (ok(v) ? brl.format(v) : DASH);
export const fmtBRL0 = (v: number | null | undefined) => (ok(v) ? brl0.format(v) : DASH);
export const fmtInt = (v: number | null | undefined) => (ok(v) ? int.format(v) : DASH);
export const fmtDec = (v: number | null | undefined) => (ok(v) ? dec2.format(v) : DASH);
export const fmtCompact = (v: number | null | undefined) => (ok(v) ? compact.format(v) : DASH);
export const fmtRoas = (v: number | null | undefined) => (ok(v) ? `${dec2.format(v)}x` : DASH);
export const fmtPct = (v: number | null | undefined, digits = 1) =>
  ok(v)
    ? `${new Intl.NumberFormat("pt-BR", { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(v)}%`
    : DASH;

export function fmtDateBR(iso: string) {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}
export function fmtDayShort(iso: string) {
  const [, m, d] = iso.split("-");
  return `${d}/${m}`;
}

const STATUS_PT: Record<string, string> = {
  ACTIVE: "ativa",
  PAUSED: "pausada",
  CAMPAIGN_PAUSED: "campanha pausada",
  ADSET_PAUSED: "conjunto pausado",
  ARCHIVED: "arquivada",
  DELETED: "excluída",
  IN_PROCESS: "em processamento",
  WITH_ISSUES: "com problemas",
  DISAPPROVED: "reprovada",
  PENDING_REVIEW: "em análise",
  PENDING_BILLING_INFO: "pendente de pagamento",
};
export const statusPt = (s: string | null | undefined) => (s ? STATUS_PT[s] ?? s.toLowerCase().replace(/_/g, " ") : "");
