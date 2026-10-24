import { describe, expect, it } from 'vitest';
import { describeDay } from '../calendar/calendar';
import { addDays, type ISODate } from './dates';
import { bookExpiry, extendedEndDate, periodCount, planTickets } from './planner';
import { DEFAULT_PRICES, type PlanInput } from './types';

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

describe('票期切割', () => {
  it('11/2 起算 30 天,到期日為 12/1,剛好 1 期', () => {
    expect(periodCount('2026-11-02', '2026-12-01', 30)).toBe(1);
    expect(extendedEndDate('2026-11-02', '2026-12-01', 30)).toBe('2026-12-01');
  });

  it('截止日落在票期中間,延伸到該票期的到期日', () => {
    expect(periodCount('2026-11-02', '2026-12-02', 30)).toBe(2);
    expect(extendedEndDate('2026-11-02', '2026-12-02', 30)).toBe('2026-12-31');
  });

  it('截止日早於起始日要報錯', () => {
    expect(() => periodCount('2026-11-02', '2026-11-01', 30)).toThrow();
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

describe('單期:月票 vs 回數票 vs 全票(價格 280 / 8,230 / 2,295)', () => {
  it('15 天 = 30 趟 = 剛好 3 本回數票 6,885 元,比月票便宜', () => {
    const r = planTickets(base({ goesToTaipei: goOn(consecutive('2026-11-02', 15)) }));
    const p = r.periods[0];
    expect(p).toMatchObject({ kind: 'rides', cost: 6885, booksBought: 3, singlesBought: 0 });
    // 每 5 天用完一本,第二、三本分別在 11/7、11/12 開始用
    expect(p.books.map((b) => b.firstUse)).toEqual(['2026-11-02', '2026-11-07', '2026-11-12']);
    expect(p.books[0].expiry).toBe('2026-12-01');
  });

  it('16 天 = 32 趟 = 3 本 + 2 張全票 = 7,445 元,仍比月票便宜', () => {
    const r = planTickets(base({ goesToTaipei: goOn(consecutive('2026-11-02', 16)) }));
    expect(r.periods[0]).toMatchObject({ kind: 'rides', cost: 7445, booksBought: 3, singlesBought: 2 });
  });

  it('17 天 = 34 趟 = 3 本 + 4 張全票 = 8,005 元,比月票 8,230 便宜 225 元', () => {
    const r = planTickets(base({ goesToTaipei: goOn(consecutive('2026-11-02', 17)) }));
    expect(r.periods[0]).toMatchObject({ kind: 'rides', cost: 8005, booksBought: 3, singlesBought: 4 });
    expect(r.totals.allMonthlyCost - r.totals.cost).toBe(225);
  });

  it('18 天 = 36 趟:3 本+6 張全票 8,565、4 本 9,180,都貴過月票 → 買月票 8,230', () => {
    const r = planTickets(base({ goesToTaipei: goOn(consecutive('2026-11-02', 18)) }));
    expect(r.periods[0]).toMatchObject({ kind: 'monthly', cost: 8230, booksBought: 0 });
  });

  it('只進台北 2 天:買 4 張全票 1,120 元最便宜', () => {
    const r = planTickets(base({ goesToTaipei: goOn(['2026-11-02', '2026-11-03']) }));
    expect(r.periods[0]).toMatchObject({ kind: 'single', cost: 1120, singlesBought: 4 });
  });

  it('完全不進台北:不需購票,費用 0', () => {
    const r = planTickets(base({ goesToTaipei: goOn([]) }));
    expect(r.periods[0]).toMatchObject({ kind: 'none', cost: 0, costPerRide: null });
  });
});

describe('以真實 2026 年 11 月行事曆驗證(內建假日資料)', () => {
  const real = (d: ISODate) => describeDay(d).go;

  it('11/2–12/1 共 22 個平日 = 44 趟:月票 8,230 勝出', () => {
    const r = planTickets(base({ goesToTaipei: real }));
    expect(r.periods[0].goDays).toBe(22);
    expect(r.periods[0].rides).toBe(44);
    // 回數票方案:4 本 + 4 張全票 = 10,300;5 本 = 11,475;都比月票貴
    expect(r.periods[0]).toMatchObject({ kind: 'monthly', cost: 8230 });
  });

  it('CP 值數字:全買全票 12,320、省 4,090、每趟約 187.05 元', () => {
    const t = planTickets(base({ goesToTaipei: real })).totals;
    expect(t.baselineCost).toBe(12320);
    expect(t.savings).toBe(4090);
    expect(t.costPerRide).toBeCloseTo(8230 / 44, 5);
  });

  it('11/2 起算 6 期(到 2027/4/30):總花費不會高於「每期都買月票」或「全買全票」', () => {
    const r = planTickets(base({ endDate: '2027-04-30', goesToTaipei: real }));
    expect(r.periods).toHaveLength(6);
    expect(r.periods[0].start).toBe('2026-11-02');
    expect(r.periods[5].end).toBe('2027-04-30');
    expect(r.totals.cost).toBeLessThanOrEqual(r.totals.allMonthlyCost);
    expect(r.totals.cost).toBeLessThanOrEqual(r.totals.baselineCost);
    expect(r.totals.cost).toBe(r.periods.reduce((s, p) => s + p.cost, 0));
  });
});

describe('回數票剩餘趟次帶入下一期', () => {
  it('第 1 期最後 3 天 + 第 2 期前 7 天,共 20 趟 = 2 本,共 4,590 元', () => {
    const days = ['2026-11-29', '2026-11-30', '2026-12-01', ...consecutive('2026-12-02', 7)];
    const r = planTickets(base({ endDate: '2026-12-08', goesToTaipei: goOn(days) }));
    expect(r.periods).toHaveLength(2);
    const [p1, p2] = r.periods;
    expect(p1).toMatchObject({ kind: 'rides', cost: 2295, booksBought: 1, singlesBought: 0 });
    expect(p1.books[0]).toMatchObject({ firstUse: '2026-11-29', ridesUsedInPeriod: 6, remainingAtPeriodEnd: 4 });
    // 第 2 期先用掉帶入的 4 趟,再開第二本
    expect(p2.books[0]).toMatchObject({ fromPreviousPeriod: true, ridesUsedInPeriod: 4, remainingAtPeriodEnd: 0 });
    expect(p2.books[1]).toMatchObject({ firstUse: '2026-12-04', ridesUsedInPeriod: 10 });
    expect(p2).toMatchObject({ cost: 2295, booksBought: 1 });
    expect(r.totals.cost).toBe(4590);
  });

  it('只有 12/1 一天與 12/2–12/5 四天,共 10 趟:第 1 期買 1 本 2,295 元,第 2 期免費', () => {
    const days = ['2026-12-01', ...consecutive('2026-12-02', 4)];
    const r = planTickets(base({ endDate: '2026-12-31', goesToTaipei: goOn(days) }));
    expect(r.periods[0]).toMatchObject({ kind: 'rides', cost: 2295 });
    expect(r.periods[1]).toMatchObject({ kind: 'none', cost: 0, rides: 8 });
    expect(r.totals.cost).toBe(2295); // 全買全票要 2,800
  });
});

describe('現有回數票(輸入剩餘趟次與首次使用日)', () => {
  it('效期內且夠用:該期不用花錢', () => {
    const r = planTickets(
      base({
        existingBook: { remaining: 6, firstUse: '2026-10-20' }, // 效期到 11/18
        goesToTaipei: goOn(['2026-11-02', '2026-11-03', '2026-11-04']),
      }),
    );
    expect(r.periods[0]).toMatchObject({ kind: 'none', cost: 0, singlesBought: 0 });
  });

  it('已過期的回數票不能用:2 趟買全票 560 元', () => {
    const r = planTickets(
      base({
        existingBook: { remaining: 6, firstUse: '2026-10-01' }, // 效期到 10/30
        goesToTaipei: goOn(['2026-11-02']),
      }),
    );
    expect(r.periods[0]).toMatchObject({ kind: 'single', cost: 560 });
    expect(r.periods[0].books).toHaveLength(0);
  });

  it('效期當天(含)仍可用,隔天起作廢:剩 4 趟,11/22–11/24 共 6 趟 → 另補 2 張全票 560 元', () => {
    const r = planTickets(
      base({
        existingBook: { remaining: 4, firstUse: '2026-10-25' }, // 效期到 11/23
        goesToTaipei: goOn(['2026-11-22', '2026-11-23', '2026-11-24']),
      }),
    );
    expect(r.periods[0].books[0]).toMatchObject({ expiry: '2026-11-23', ridesUsedInPeriod: 4 });
    expect(r.periods[0]).toMatchObject({ cost: 560, singlesBought: 2 });
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
    expect(r.periods[0]).toMatchObject({ kind: 'none', cost: 0 });
    expect(r.periods[0].books[0].expiry).toBe('2026-12-10');
  });

  it('沒有延後:效期 12/1 已過,4 趟要買全票 1,120 元', () => {
    const r = planTickets(input([]));
    expect(r.periods[0]).toMatchObject({ kind: 'single', cost: 1120 });
  });
});
