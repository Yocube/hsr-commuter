import type { ISODate } from '../engine/dates';
import { isWeekend } from '../engine/dates';
import rawHolidays from '../data/holidays.json';

export interface HolidayData {
  /** 內建資料涵蓋的年份 */
  years: number[];
  /** 只收錄與「週末休、平日上班」預設不同、或有名稱的日子 */
  days: Record<ISODate, { off: boolean; name: string }>;
}

export const BUNDLED_HOLIDAYS: HolidayData = rawHolidays as HolidayData;

export type DayKind = 'workday' | 'weekend' | 'holiday' | 'makeup';

export interface DayInfo {
  date: ISODate;
  /** 預設規則下是否進台北 */
  defaultGo: boolean;
  /** 套用手動覆寫後是否進台北 */
  go: boolean;
  overridden: boolean;
  kind: DayKind;
  /** 假日名稱(如「國慶日」「春節」) */
  label: string;
  /** 該年度沒有內建假日資料,僅以週末規則推定 */
  noData: boolean;
}

/** 手動覆寫:true = 進台北、false = 不進台北;沒有該日 = 照預設 */
export type Overrides = Record<ISODate, boolean>;

export function describeDay(
  date: ISODate,
  overrides: Overrides = {},
  data: HolidayData = BUNDLED_HOLIDAYS,
): DayInfo {
  const year = Number(date.slice(0, 4));
  const noData = !data.years.includes(year);
  const entry = data.days[date];
  const weekend = isWeekend(date);

  let kind: DayKind;
  let defaultGo: boolean;
  if (entry && entry.off) {
    kind = weekend ? 'weekend' : 'holiday';
    defaultGo = false;
  } else if (entry && !entry.off) {
    kind = 'makeup'; // 週末但要上班的補班日
    defaultGo = true;
  } else {
    kind = weekend ? 'weekend' : 'workday';
    defaultGo = !weekend;
  }

  const overridden = Object.hasOwn(overrides, date) && overrides[date] !== defaultGo;
  return {
    date,
    defaultGo,
    go: overridden ? overrides[date] : defaultGo,
    overridden,
    kind,
    label: entry?.name ?? '',
    noData,
  };
}

/** 切換某天的狀態;切回預設值時移除覆寫 */
export function toggleOverride(
  date: ISODate,
  overrides: Overrides,
  data: HolidayData = BUNDLED_HOLIDAYS,
): Overrides {
  const info = describeDay(date, overrides, data);
  const next = { ...overrides };
  const wanted = !info.go;
  if (wanted === info.defaultGo) delete next[date];
  else next[date] = wanted;
  return next;
}
