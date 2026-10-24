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
  /** 第一次要搭乘(或票卡生效)的起算日 */
  startDate: ISODate;
  /** 目標評估截止日:這天以前的每一趟都要有票;已買票券用不完的部分會延長計算到用完 */
  endDate: ISODate;
  prices: Prices;
  /** 該日是否進台北(已套用預設規則與手動覆寫) */
  goesToTaipei: (date: ISODate) => boolean;
  existingBook?: OpenBook | null;
  /** 效期延後區間(例如春節):區間內的日子不佔用回數票的效期天數 */
  validityExtensions?: DateRange[];
}

export type TicketKind = 'monthly' | 'rides' | 'single';

export interface BookDetail {
  firstUse: ISODate;
  /** 效期截止日(含) */
  expiry: ISODate;
  /** 是否為使用者手上原有的回數票(不另外計費) */
  existing: boolean;
  /** 實際用掉的趟數 */
  ridesUsed: number;
  /** 效期內沒用完而作廢的趟數 */
  wasted: number;
}

/** 一筆購票(或一段連續的零買全票),依時間排列 */
export interface Segment {
  index: number;
  kind: TicketKind;
  /** 首次使用日(月票為起算日) */
  start: ISODate;
  /** 最後使用日(月票為票期到期日) */
  end: ISODate;
  /** 該票券涵蓋期間內進台北的天數 */
  goDays: number;
  rides: number;
  cost: number;
  /** kind 為 single 時的張數 */
  singles: number;
  book: BookDetail | null;
  /** 全部買全票的對照成本 */
  baselineCost: number;
  savings: number;
  /** 平均每趟成本;沒有搭乘時為 null */
  costPerRide: number | null;
}

/** 目標截止日之後,為了把已買的票用完而延長計算的區段;不需再買票 */
export interface TailUsage {
  start: ISODate;
  /** 回數票用完當天(效期先到則為效期截止日);月票則為票期到期日 */
  end: ISODate;
  goDays: number;
  rides: number;
  /** 效期內沒用完而作廢的趟數 */
  wastedRides: number;
}

export interface PlanTotals {
  cost: number;
  goDays: number;
  rides: number;
  baselineCost: number;
  savings: number;
  costPerRide: number | null;
  /** 從起點開始連續每 30 天買一張月票、涵蓋到截止日的總成本 */
  allMonthlyCost: number;
}

export interface PlanResult {
  segments: Segment[];
  totals: PlanTotals;
  /** 目標截止日後用完已買票券的延長區段;沒有時為 null */
  tail: TailUsage | null;
  /** 計算實際涵蓋的最後一天(行事曆需涵蓋到這一天) */
  usageEnd: ISODate;
}
