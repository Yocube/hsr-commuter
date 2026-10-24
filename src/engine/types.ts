import type { ISODate } from './dates';

export interface Prices {
  /** 單程全票 */
  single: number;
  /** 30 天月票 */
  monthly: number;
  /** 一本回數票的價格 */
  book: number;
  /** 一本回數票的趟數(1 次 = 單程) */
  bookRides: number;
  /** 票期天數:月票期間與回數票效期共用(含首日) */
  periodDays: number;
}

export const DEFAULT_PRICES: Prices = {
  single: 280,
  monthly: 8230,
  book: 2295,
  bookRides: 10,
  periodDays: 30,
};

/** 一天進台北 = 去程 + 回程 */
export const RIDES_PER_GO_DAY = 2;

export interface DateRange {
  start: ISODate;
  end: ISODate;
}

/** 使用者手上已開始使用的回數票 */
export interface OpenBook {
  remaining: number;
  firstUse: ISODate;
}

export interface PlanInput {
  /** 第一期起始日 */
  startDate: ISODate;
  /** 目標評估截止日;若落在票期中間,最後一期會算到票期實際到期日 */
  endDate: ISODate;
  prices: Prices;
  /** 該日是否進台北(已套用預設規則與手動覆寫) */
  goesToTaipei: (date: ISODate) => boolean;
  existingBook?: OpenBook | null;
  /** 效期延後區間(例如春節):區間內的日子不佔用回數票的效期天數 */
  validityExtensions?: DateRange[];
}

export type PeriodKind = 'monthly' | 'rides' | 'single' | 'none';

export interface BookUse {
  firstUse: ISODate;
  /** 效期截止日(含) */
  expiry: ISODate;
  /** 本期內用掉的趟數 */
  ridesUsedInPeriod: number;
  /** 本期結束時剩餘趟數(帶到下一期) */
  remainingAtPeriodEnd: number;
  /** 效期內是否有剩餘趟次來不及用完而作廢 */
  expiredUnused: number;
  fromPreviousPeriod: boolean;
}

export interface PeriodPlan {
  index: number;
  start: ISODate;
  end: ISODate;
  goDays: number;
  rides: number;
  kind: PeriodKind;
  /** 本期需支出的現金(購票當期計入) */
  cost: number;
  booksBought: number;
  singlesBought: number;
  books: BookUse[];
  /** 全部買全票的對照成本 */
  baselineCost: number;
  /** 對照全部買全票所省下的金額 */
  savings: number;
  /** 本期平均每趟成本;沒有搭乘時為 null */
  costPerRide: number | null;
}

export interface PlanTotals {
  cost: number;
  goDays: number;
  rides: number;
  baselineCost: number;
  savings: number;
  costPerRide: number | null;
  allMonthlyCost: number;
}

export interface PlanResult {
  periods: PeriodPlan[];
  totals: PlanTotals;
  /** 實際計算涵蓋的最後一天(票期到期日) */
  extendedEnd: ISODate;
}
