export function todayYMD(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const a = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${a}`;
}

export function addDays(ymd: string, days: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + days);
  const yy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const dd = String(dt.getDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

export function parseYMD(ymd: string | undefined | null): Date | null {
  if (!ymd) return null;
  const [y, m, d] = ymd.split("-").map((part) => Number(part));
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) {
    return null;
  }
  const dt = new Date(y, m - 1, d);
  if (Number.isNaN(dt.getTime())) {
    return null;
  }
  return dt;
}

export function formatYMD(date: Date): string {
  const yy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

export function addDaysToDate(date: Date, days: number): Date {
  const next = new Date(date.getTime());
  next.setDate(next.getDate() + days);
  return next;
}

export function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

export function endOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}

export function addMonths(date: Date, months: number): Date {
  const next = new Date(date.getFullYear(), date.getMonth() + months, 1);
  return next;
}

export function differenceInDays(a: Date, b: Date): number {
  const diff = a.getTime() - b.getTime();
  return Math.round(diff / (1000 * 60 * 60 * 24));
}

export function monthKey(date: Date): string {
  const yy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  return `${yy}-${mm}`;
}

export function isWinterMonth(month: number, winterMonths: number[]): boolean {
  return winterMonths.includes(month);
}
