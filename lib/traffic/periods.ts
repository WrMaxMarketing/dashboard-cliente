// Períodos do painel, sempre no fuso do cliente (datas ISO YYYY-MM-DD).

export type PeriodKey = "hoje" | "ontem" | "7d" | "14d" | "30d" | "mes" | "custom";

export const PERIOD_OPTIONS: { key: PeriodKey; label: string }[] = [
  { key: "hoje", label: "Hoje" },
  { key: "ontem", label: "Ontem" },
  { key: "7d", label: "7d" },
  { key: "14d", label: "14d" },
  { key: "30d", label: "30d" },
  { key: "mes", label: "Mês atual" },
  { key: "custom", label: "Personalizado" },
];

export type Period = {
  key: PeriodKey;
  label: string;
  since: string;
  until: string;
  prevSince: string;
  prevUntil: string;
  hourly: boolean; // "Hoje" => gráfico por hora
  today: string;
  nowHour: number;
};

const ISO = /^\d{4}-\d{2}-\d{2}$/;

/** Data ISO real (rejeita 2026-02-31, 9999-99-99 etc.). */
export function isIsoDate(s: string | undefined): s is string {
  if (!s || !ISO.test(s)) return false;
  const d = new Date(`${s}T12:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

export function todayIn(tz: string, now = new Date()): { date: string; hour: number; minute: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  return { date: `${get("year")}-${get("month")}-${get("day")}`, hour: Number(get("hour")), minute: Number(get("minute")) };
}

export function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86400000);
}

export function eachDay(since: string, until: string): string[] {
  const out: string[] = [];
  for (let d = since; d <= until; d = addDays(d, 1)) out.push(d);
  return out;
}

export function monthStart(iso: string) {
  return `${iso.slice(0, 8)}01`;
}

export function daysInMonth(iso: string) {
  const [y, m] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

export function resolvePeriod(
  sp: { p?: string; de?: string; ate?: string },
  tz: string,
  now = new Date(),
): Period {
  const { date: today, hour } = todayIn(tz, now);
  const key = (PERIOD_OPTIONS.some((o) => o.key === sp.p) ? sp.p : "7d") as PeriodKey;
  let since = today;
  let until = today;
  switch (key) {
    case "hoje":
      break;
    case "ontem":
      since = until = addDays(today, -1);
      break;
    case "7d":
    case "14d":
    case "30d":
      // Últimos N dias COMPLETOS (até ontem), como no Gerenciador de Anúncios:
      // incluir o parcial de hoje puxaria a comparação para baixo.
      until = addDays(today, -1);
      since = addDays(today, -parseInt(key, 10));
      break;
    case "mes":
      since = monthStart(today);
      break;
    case "custom": {
      let a = isIsoDate(sp.de) ? sp.de : addDays(today, -6);
      let b = isIsoDate(sp.ate) ? sp.ate : today;
      if (a > b) [a, b] = [b, a];
      if (b > today) b = today;
      if (a > b) a = b;
      since = a;
      until = b;
      // limite de 180 dias por consulta
      if (daysBetween(since, until) > 179) since = addDays(until, -179);
      break;
    }
  }
  const len = daysBetween(since, until) + 1;
  let prevSince = addDays(since, -len);
  let prevUntil = addDays(since, -1);
  if (key === "mes") {
    // mesmo número de dias no mês anterior
    const prevMonthLast = addDays(since, -1);
    prevSince = monthStart(prevMonthLast);
    const cap = addDays(prevSince, len - 1);
    prevUntil = cap > prevMonthLast ? prevMonthLast : cap;
  }
  const label = key === "custom" || key === "mes" || len > 1
    ? `${fmt(since)} – ${fmt(until)}`
    : key === "hoje" ? "Hoje" : "Ontem";
  return { key, label, since, until, prevSince, prevUntil, hourly: key === "hoje", today, nowHour: hour };
}

function fmt(iso: string) {
  const [, m, d] = iso.split("-");
  return `${d}/${m}`;
}
