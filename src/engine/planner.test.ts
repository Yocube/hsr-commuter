import { describe, expect, it } from 'vitest';
import { describeDay } from '../calendar/calendar';
import { addDays, type ISODate } from './dates';
import { bookExpiry, periodCount, planTickets } from './planner';
import { DEFAULT_PRICES, type PlanInput, type PlanResult } from './types';

/** 手寫的假行事曆:只有列出的日期進台北 */
const goOn = (dates: ISODate[]) => (d: ISODate) => dates.includes(d);
/** 從 start 起連續 n 天進台北 */
const consecutive = (start: ISODate, n: number): ISODate[] =>
  Array.from({ length: n }, (_, i) => addDays(start, i));

const base = (over: Partial<PlanInput> & Pick<PlanInput, 'goesToTaipei'>): PlanInput => ({
  startDate: '2026-11-02',
  endDate: '2026-12-01',
  prices: DEFAULT_PRICES,
  ...over,
});

const count = (r: PlanResult, kind: 'monthly' | 'rides' | 'single') =>
  r.segments.filter((s) => s.kind === kind);
const booksBought = (r: PlanResult) =>
  r.segments.filter((s) => s.book && !s.book.existing).length;
const singlesBought = (r: PlanResult) => count(r, 'single').reduce((n, s) => n + s.singles, 0);

describe('日期與月票張數', () => {
  it('11/2–12/1 剛好 30 天 = 1 張;多 1 天就要 2 張', () => {
    expect(periodCount('2026-11-02', '2026-12-01', 30)).toBe(1);
    expect(periodCount('2026-11-02', '2026-12-02', 30)).toBe(2);
  });

  it('截止日早於起始日要報錯', () => {
    expect(() => periodCount('2026-11-02', '2026-11-01', 30)).toThrow();
    expect(() => planTickets(base({ endDate: '2026-11-01', goesToTaipei: goOn([]) }))).toThrow();
  });
});

describe('回數票效期', () => {
  it('首次使用日起 30 天內(含首日):11/2 → 12/1', () => {
    expect(bookExpiry('2026-11-02', 30)).toBe('2026-12-01');
  });

  it('春節 9 天延後區間內的日子不佔效期:12/1 → 12/10', () => {
    const ext = [{ start: '2026-11-10', end: '2026-11-18' }];
    expect(bookExpiry('2026-11-02', 30, ext)).toBe('2026-12-10');
  });
});

describe('單一時段:月票 vs 回數票 vs 全票(價格 280 / 8,230 / 2,295)', () => {
  it('15 天 = 30 趟 = 剛好 3 本回數票 6,885 元,比月票便宜', () => {
    const r = planTickets(base({ goesToTaipei: goOn(consecutive('2026-11-02', 15)) }));
    expect(r.totals.cost).toBe(6885);
    expect(count(r, 'rides').map((s) => s.start)).toEqual(['2026-11-02', '2026-11-07', '2026-11-12']);
    expect(r.segments[0]).toMatchObject({ cost: 2295, rides: 10, goDays: 5, end: '2026-11-06' });
    expect(r.segments[0].book?.expiry).toBe('2026-12-01');
    expect(singlesBought(r)).toBe(0);
  });

  it('16 天 = 32 趟 = 3 本 + 2 張全票 = 7,445 元,仍比月票便宜', () => {
    const r = planTickets(base({ goesToTaipei: goOn(consecutive('2026-11-02', 16)) }));
    expect(r.totals.cost).toBe(7445);
    expect([booksBought(r), singlesBought(r)]).toEqual([3, 2]);
  });

  it('17 天 = 34 趟 = 3 本 + 4 張全票 = 8,005 元,比月票 8,230 便宜 225 元', () => {
    const r = planTickets(base({ goesToTaipei: goOn(consecutive('2026-11-02', 17)) }));
    expect(r.totals.cost).toBe(8005);
    expect([booksBought(r), singlesBought(r)]).toEqual([3, 4]);
    expect(r.totals.allMonthlyCost - r.totals.cost).toBe(225);
  });

  it('18 天 = 36 趟:3 本+6 張全票 8,565、4 本 9,180,都貴過月票 → 買月票 8,230', () => {
    const r = planTickets(base({ goesToTaipei: goOn(consecutive('2026-11-02', 18)) }));
    expect(r.segments).toHaveLength(1);
    expect(r.segments[0]).toMatchObject({ kind: 'monthly', cost: 8230, start: '2026-11-02', end: '2026-12-01' });
  });

  it('只進台北 2 天:買 4 張全票 1,120 元最便宜', () => {
    const r = planTickets(base({ goesToTaipei: goOn(['2026-11-02', '2026-11-03']) }));
    expect(r.totals.cost).toBe(1120);
    expect(singlesBought(r)).toBe(4);
  });

  it('完全不進台北:不需購票,費用 0', () => {
    const r = planTickets(base({ goesToTaipei: goOn([]) }));
    expect(r.segments).toHaveLength(0);
    expect(r.totals).toMatchObject({ cost: 0, rides: 0, costPerRide: null });
  });
});

describe('月票可從任何一個進台北日開始買(不是固定 30 天一格)', () => {
  it('前面空 10 天才開始通勤:月票從 11/12 起算,不是 11/2', () => {
    const days = consecutive('2026-11-12', 20);
    const r = planTickets(base({ endDate: '2026-12-01', goesToTaipei: goOn(days) }));
    expect(r.segments).toHaveLength(1);
    expect(r.segments[0]).toMatchObject({ kind: 'monthly', start: '2026-11-12', end: '2026-12-11' });
    // 截止日 12/1 之後到票期到期日 12/11 是延長範圍
    expect(r.usageEnd).toBe('2026-12-11');
    expect(r.tail).toMatchObject({ start: '2026-12-02', end: '2026-12-11', wastedRides: 0 });
  });

  it('長假前改用回數票收尾,假期後再買月票(兩張月票之間隔著回數票)', () => {
    // 11/2 起連續 20 天 → 月票;之後空一段;12/10 起連續 25 天 → 月票
    const days = [...consecutive('2026-11-02', 20), ...consecutive('2026-12-10', 25)];
    const r = planTickets(
      base({ endDate: '2027-01-13', prices: DEFAULT_PRICES, goesToTaipei: goOn(days) }),
    );
    const monthlies = count(r, 'monthly');
    expect(monthlies.map((s) => s.start)).toEqual(['2026-11-02', '2026-12-10']);
    expect(r.totals.cost).toBe(16460);
  });
});

describe('以真實 2026 年 11 月行事曆驗證(內建假日資料)', () => {
  const real = (d: ISODate) => describeDay(d).go;

  it('11/2–12/1 共 22 個平日 = 44 趟:月票 8,230 勝出', () => {
    const r = planTickets(base({ goesToTaipei: real }));
    expect(r.segments).toHaveLength(1);
    expect(r.segments[0]).toMatchObject({ kind: 'monthly', cost: 8230, goDays: 22, rides: 44 });
  });

  it('CP 值數字:全買全票 12,320、省 4,090、每趟約 187.05 元', () => {
    const t = planTickets(base({ goesToTaipei: real })).totals;
    expect(t.baselineCost).toBe(12320);
    expect(t.savings).toBe(4090);
    expect(t.costPerRide).toBeCloseTo(8230 / 44, 5);
  });

  it('11/2 起算半年:總花費不會高於「連續買月票」或「全買全票」', () => {
    const r = planTickets(base({ endDate: '2027-04-30', goesToTaipei: real }));
    expect(r.totals.cost).toBeLessThanOrEqual(r.totals.allMonthlyCost);
    expect(r.totals.cost).toBeLessThanOrEqual(r.totals.baselineCost);
  });
});

describe('實際案例:11/11 – 3/5(PM 與另一個 Claude 的試算對照)', () => {
  // 不進台北:11/30、12/18–1/7(WFH 或請假)、2/3、2/26;春節與 3/1 國定假日由內建假日資料帶入
  const off = new Set<ISODate>(['2026-11-30', '2027-02-03', '2027-02-26']);
  for (let d: ISODate = '2026-12-18'; d <= '2027-01-07'; d = addDays(d, 1)) off.add(d);
  const go = (d: ISODate) => !off.has(d) && describeDay(d).go;

  const r = planTickets({
    startDate: '2026-11-11',
    endDate: '2027-03-05',
    prices: DEFAULT_PRICES,
    goesToTaipei: go,
  });

  it('共進台北 59 天、118 趟', () => {
    expect(r.totals.goDays).toBe(59);
    expect(r.totals.rides).toBe(118);
  });

  it('最低總花費 25,640 元:月票 + 回數票 + 月票 + 3 本回數票', () => {
    expect(r.totals.cost).toBe(25640);
    expect(r.segments.map((s) => [s.kind, s.start])).toEqual([
      ['monthly', '2026-11-11'],
      ['rides', '2026-12-11'],
      ['monthly', '2027-01-08'],
      ['rides', '2027-02-11'],
      ['rides', '2027-02-18'],
      ['rides', '2027-02-25'],
    ]);
  });

  it('各票券涵蓋天數:月票 21 天、回數票 5 天、月票 18 天、回數票各 5 天', () => {
    expect(r.segments.map((s) => s.goDays)).toEqual([21, 5, 18, 5, 5, 5]);
    expect(r.segments.map((s) => s.cost)).toEqual([8230, 2295, 8230, 2295, 2295, 2295]);
  });
});

describe('回數票跨越空檔繼續使用', () => {
  it('11/29 起連續 10 天 = 20 趟 = 2 本,共 4,590 元', () => {
    const r = planTickets(
      base({ endDate: '2026-12-08', goesToTaipei: goOn(consecutive('2026-11-29', 10)) }),
    );
    expect(r.totals.cost).toBe(4590);
    expect(count(r, 'rides').map((s) => s.start)).toEqual(['2026-11-29', '2026-12-04']);
  });

  it('12/1 一天加 12/2–12/5 四天,共 10 趟:只要 1 本 2,295 元(全買全票要 2,800)', () => {
    const days = ['2026-12-01', ...consecutive('2026-12-02', 4)];
    const r = planTickets(base({ startDate: '2026-11-02', endDate: '2026-12-31', goesToTaipei: goOn(days) }));
    expect(r.totals.cost).toBe(2295);
    expect(r.segments).toHaveLength(1);
    expect(r.segments[0]).toMatchObject({ start: '2026-12-01', end: '2026-12-05', goDays: 5, rides: 10 });
  });
});

describe('現有回數票(輸入剩餘趟次與首次使用日)', () => {
  it('效期內且夠用:不用花錢', () => {
    const r = planTickets(
      base({
        existingBook: { remaining: 6, firstUse: '2026-10-20' }, // 效期到 11/18
        goesToTaipei: goOn(['2026-11-02', '2026-11-03', '2026-11-04']),
      }),
    );
    expect(r.totals.cost).toBe(0);
    expect(r.segments).toHaveLength(1);
    expect(r.segments[0]).toMatchObject({ rides: 6, cost: 0 });
    expect(r.segments[0].book).toMatchObject({ existing: true, ridesUsed: 6 });
  });

  it('已過期的回數票不能用:2 趟買全票 560 元', () => {
    const r = planTickets(
      base({
        existingBook: { remaining: 6, firstUse: '2026-10-01' }, // 效期到 10/30
        goesToTaipei: goOn(['2026-11-02']),
      }),
    );
    expect(r.totals.cost).toBe(560);
    expect(r.segments.every((s) => !s.book)).toBe(true);
  });

  it('效期當天(含)仍可用,隔天起作廢:剩 4 趟,11/22–11/24 共 6 趟 → 另補 2 張全票 560 元', () => {
    const r = planTickets(
      base({
        existingBook: { remaining: 4, firstUse: '2026-10-25' }, // 效期到 11/23
        goesToTaipei: goOn(['2026-11-22', '2026-11-23', '2026-11-24']),
      }),
    );
    expect(r.segments[0].book).toMatchObject({ expiry: '2026-11-23', ridesUsed: 4 });
    expect(r.totals.cost).toBe(560);
    expect(singlesBought(r)).toBe(2);
  });
});

describe('春節等效期延後區間', () => {
  const ext = [{ start: '2026-11-10', end: '2026-11-18' }];
  const input = (validityExtensions: typeof ext) =>
    base({
      startDate: '2026-12-02',
      endDate: '2026-12-31',
      existingBook: { remaining: 4, firstUse: '2026-11-02' },
      validityExtensions,
      goesToTaipei: goOn(['2026-12-05', '2026-12-06']),
    });

  it('有延後 9 天:效期延到 12/10,12/5–12/6 的 4 趟仍可用,免費', () => {
    const r = planTickets(input(ext));
    expect(r.totals.cost).toBe(0);
    expect(r.segments[0].book?.expiry).toBe('2026-12-10');
  });

  it('沒有延後:效期 12/1 已過,4 趟要買全票 1,120 元', () => {
    expect(planTickets(input([])).totals.cost).toBe(1120);
  });
});

describe('延長計算到已買的票用完', () => {
  const existing = { remaining: 6, firstUse: '2026-11-20' }; // 效期到 12/19

  it('回數票用不完:延長到用完當天(12/2、12/3 共 4 趟)', () => {
    const r = planTickets(
      base({ existingBook: existing, goesToTaipei: goOn(['2026-11-02', '2026-12-02', '2026-12-03']) }),
    );
    expect(r.tail).toEqual({ start: '2026-12-02', end: '2026-12-03', goDays: 2, rides: 4, wastedRides: 0 });
    expect(r.usageEnd).toBe('2026-12-03');
    // 延長區段的 4 趟也計入總趟數,CP 值才準確
    expect(r.totals).toMatchObject({ rides: 6, cost: 0, goDays: 3, baselineCost: 1680, savings: 1680 });
  });

  it('延長期間內沒用完:算到效期截止日 12/19,剩下 2 趟作廢', () => {
    const r = planTickets(base({ existingBook: existing, goesToTaipei: goOn(['2026-11-02', '2026-12-02']) }));
    expect(r.tail).toEqual({ start: '2026-12-02', end: '2026-12-19', goDays: 1, rides: 2, wastedRides: 2 });
    expect(r.segments[0].book?.wasted).toBe(2);
  });

  it('月票的票期超過截止日:延長到票期到期日,期間的進台北趟次計入', () => {
    const r = planTickets(
      base({ endDate: '2026-11-20', goesToTaipei: goOn(consecutive('2026-11-02', 21)) }),
    );
    expect(r.segments).toHaveLength(1);
    expect(r.segments[0]).toMatchObject({ kind: 'monthly', rides: 42, goDays: 21 });
    expect(r.tail).toEqual({ start: '2026-11-21', end: '2026-12-01', goDays: 2, rides: 4, wastedRides: 0 });
    expect(r.usageEnd).toBe('2026-12-01');
  });

  it('沒有剩餘票券就不延長', () => {
    const r = planTickets(base({ goesToTaipei: goOn(consecutive('2026-11-02', 15)) }));
    expect(r.tail).toBeNull();
    expect(r.usageEnd).toBe('2026-12-01');
  });
});
