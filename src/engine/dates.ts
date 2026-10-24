// 日期一律用 'YYYY-MM-DD' 字串,以 UTC 整數日換算,避免時區與夏令時間造成差一天。
export type ISODate = string;

const MS_PER_DAY = 86_400_000;

export function toDayNum(iso: ISODate): number {
  const [y, m, d] = iso.split('-').map(Number);
  return Date.UTC(y, m - 1, d) / MS_PER_DAY;
}

export function fromDayNum(n: number): ISODate {
  const dt = new Date(n * MS_PER_DAY);
  const y = dt.getUTCFullYear();
  const m = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const d = String(dt.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function addDays(iso: ISODate, days: number): ISODate {
  return fromDayNum(toDayNum(iso) + days);
}

/** b 減 a 的天數(b 較晚則為正) */
export function diffDays(a: ISODate, b: ISODate): number {
  return toDayNum(b) - toDayNum(a);
}

/** 0=週日 … 6=週六 */
export function weekday(iso: ISODate): number {
  return new Date(toDayNum(iso) * MS_PER_DAY).getUTCDay();
}

export function isWeekend(iso: ISODate): boolean {
  const w = weekday(iso);
  return w === 0 || w === 6;
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** 以台北時區取得今天日期 */
export function todayTaipei(): ISODate {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei' }).format(new Date());
}
