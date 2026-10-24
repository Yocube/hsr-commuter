import { addDays, diffDays, type ISODate } from './dates';
import {
  RIDES_PER_GO_DAY,
  type DateRange,
  type PlanInput,
  type PlanResult,
  type Segment,
  type TailUsage,
} from './types';

/**
 * 回數票效期截止日(含)。從首次使用日起算 periodDays 天(含首日);
 * 落在延後區間內的日子不佔用效期天數。
 */
export function bookExpiry(
  firstUse: ISODate,
  periodDays: number,
  extensions: DateRange[] = [],
): ISODate {
  let counted = 0;
  let day = firstUse;
  for (;;) {
    const frozen = extensions.some((r) => day >= r.start && day <= r.end);
    if (!frozen) counted += 1;
    if (counted >= periodDays) return day;
    day = addDays(day, 1);
  }
}

/** 從起點連續每 periodDays 天買一張月票,涵蓋到截止日需要幾張 */
export function periodCount(startDate: ISODate, endDate: ISODate, periodDays: number): number {
  const span = diffDays(startDate, endDate) + 1;
  if (span < 1) throw new Error('目標評估截止日不可早於起始日');
  return Math.ceil(span / periodDays);
}

interface Book {
  rem: number;
  expiry: ISODate;
}

type Action = 'use' | 'monthly' | 'book' | 'single';

/**
 * 產生購票策略。
 *
 * 把評估期間內每一趟(進台北一天 = 去程 + 回程 2 趟)依序排好,用動態規劃找出總花費最低的買法:
 * - 月票:可從任何一個進台北日開始買,涵蓋之後 periodDays 天
 * - 回數票:第一次刷卡日起算效期,有效期內的趟次一定先用完;用不完的趟次跨假期照樣可用到效期截止
 * - 單程全票:零星趟次或湊不滿一本時補買
 * 不預先把時間切成固定的 30 天一格,所以長假前可以先改用回數票收尾,假期結束後再買月票。
 */
export function planTickets(input: PlanInput): PlanResult {
  const { prices, startDate, endDate } = input;
  const ext = input.validityExtensions ?? [];
  const periodCountForMonthly = periodCount(startDate, endDate, prices.periodDays);

  // 依序列出每一趟的日期
  const dates: ISODate[] = [];
  for (let day = startDate; day <= endDate; day = addDays(day, 1)) {
    if (input.goesToTaipei(day)) for (let i = 0; i < RIDES_PER_GO_DAY; i += 1) dates.push(day);
  }
  const total = dates.length;

  // 月票從第 r 趟(當天第一趟)起算,涵蓋到哪一趟之前
  const jumpCache = new Map<number, number>();
  const jump = (r: number): number => {
    const hit = jumpCache.get(r);
    if (hit !== undefined) return hit;
    const last = addDays(dates[r], prices.periodDays - 1);
    let k = r;
    while (k < total && dates[k] <= last) k += 1;
    jumpCache.set(r, k);
    return k;
  };

  const live = (book: Book | null, date: ISODate): Book | null =>
    book && book.rem > 0 && date <= book.expiry ? book : null;
  const openBook = (date: ISODate): Book => ({
    rem: prices.bookRides - 1,
    expiry: bookExpiry(date, prices.periodDays, ext),
  });
  const keyOf = (r: number, b: Book | null) => (b ? `${r}|${b.rem}|${b.expiry}` : `${r}|-`);

  const memo = new Map<string, { cost: number; action: Action }>();
  const solve = (r: number, book: Book | null): number => {
    if (r >= total) return 0;
    const cur = live(book, dates[r]);
    const key = keyOf(r, cur);
    const hit = memo.get(key);
    if (hit) return hit.cost;

    let best: { cost: number; action: Action };
    if (cur) {
      // 手上有可用的回數票就一定先用
      best = { cost: solve(r + 1, { rem: cur.rem - 1, expiry: cur.expiry }), action: 'use' };
    } else {
      best = { cost: Infinity, action: 'single' };
      // 同價時優先順序:月票 > 回數票 > 全票
      if (r % 2 === 0) {
        const c = prices.monthly + solve(jump(r), null);
        if (c < best.cost) best = { cost: c, action: 'monthly' };
      }
      const cb = prices.book + solve(r + 1, openBook(dates[r]));
      if (cb < best.cost) best = { cost: cb, action: 'book' };
      const cs = prices.single + solve(r + 1, null);
      if (cs < best.cost) best = { cost: cs, action: 'single' };
    }
    memo.set(key, best);
    return best.cost;
  };

  let book: Book | null = null;
  if (input.existingBook && input.existingBook.remaining > 0) {
    const expiry = bookExpiry(input.existingBook.firstUse, prices.periodDays, ext);
    if (expiry >= startDate) book = { rem: input.existingBook.remaining, expiry };
  }
  solve(0, book);

  // 依最佳決策還原每一筆購票
  const segments: Segment[] = [];
  const goesSet = (from: ISODate, to: ISODate) => {
    let n = 0;
    for (let d = from; d <= to; d = addDays(d, 1)) if (input.goesToTaipei(d)) n += 1;
    return n;
  };
  let bookSeg: Segment | null = null;
  let singleSeg: Segment | null = null;
  let bookRef: Book | null = book;
  const bookDays = new Set<ISODate>();
  const singleDays = new Set<ISODate>();

  const push = (seg: Omit<Segment, 'index' | 'baselineCost' | 'savings' | 'costPerRide'>): Segment => {
    const s: Segment = { ...seg, index: segments.length, baselineCost: 0, savings: 0, costPerRide: null };
    segments.push(s);
    return s;
  };
  const startExisting = (): Segment => {
    const b = input.existingBook!;
    bookDays.clear();
    return push({
      kind: 'rides',
      start: b.firstUse,
      end: b.firstUse,
      goDays: 0,
      rides: 0,
      cost: 0,
      singles: 0,
      book: {
        firstUse: b.firstUse,
        expiry: bookExpiry(b.firstUse, prices.periodDays, ext),
        existing: true,
        ridesUsed: 0,
        wasted: 0,
      },
    });
  };
  if (bookRef) bookSeg = null; // 現有回數票在第一次被用到時才建立區段

  let r = 0;
  while (r < total) {
    const date = dates[r];
    // 回數票已過效期:剩下的趟次作廢
    if (bookRef && bookRef.rem > 0 && date > bookRef.expiry && bookSeg?.book) {
      bookSeg.book.wasted += bookRef.rem;
    }
    const cur = live(bookRef, date);
    const decision = memo.get(keyOf(r, cur))!;
    if (decision.action === 'use') {
      if (!bookSeg) bookSeg = startExisting();
      bookSeg.rides += 1;
      bookSeg.book!.ridesUsed += 1;
      bookSeg.end = date;
      bookDays.add(date);
      bookSeg.goDays = bookDays.size;
      bookRef = { rem: cur!.rem - 1, expiry: cur!.expiry };
      singleSeg = null;
      r += 1;
    } else if (decision.action === 'monthly') {
      const end = addDays(date, prices.periodDays - 1);
      const days = goesSet(date, end);
      push({
        kind: 'monthly',
        start: date,
        end,
        goDays: days,
        rides: days * RIDES_PER_GO_DAY,
        cost: prices.monthly,
        singles: 0,
        book: null,
      });
      bookRef = null;
      bookSeg = null;
      singleSeg = null;
      r = jump(r);
    } else if (decision.action === 'book') {
      const expiry = bookExpiry(date, prices.periodDays, ext);
      bookDays.clear();
      bookDays.add(date);
      bookSeg = push({
        kind: 'rides',
        start: date,
        end: date,
        goDays: 1,
        rides: 1,
        cost: prices.book,
        singles: 0,
        book: { firstUse: date, expiry, existing: false, ridesUsed: 1, wasted: 0 },
      });
      bookRef = { rem: prices.bookRides - 1, expiry };
      singleSeg = null;
      r += 1;
    } else {
      if (!singleSeg) {
        singleDays.clear();
        singleSeg = push({
          kind: 'single',
          start: date,
          end: date,
          goDays: 0,
          rides: 0,
          cost: 0,
          singles: 0,
          book: null,
        });
      }
      singleSeg.singles += 1;
      singleSeg.rides += 1;
      singleSeg.cost += prices.single;
      singleSeg.end = date;
      singleDays.add(date);
      singleSeg.goDays = singleDays.size;
      bookRef = null;
      bookSeg = null;
      r += 1;
    }
  }

  // 目標截止日之後:把已買的票用完(月票算到票期到期日、回數票算到用完或效期截止)
  let tail: TailUsage | null = null;
  const afterEnd = addDays(endDate, 1);
  const lastSeg = segments[segments.length - 1];
  if (lastSeg?.kind === 'monthly' && lastSeg.end >= afterEnd) {
    tail = {
      start: afterEnd,
      end: lastSeg.end,
      goDays: goesSet(afterEnd, lastSeg.end),
      rides: goesSet(afterEnd, lastSeg.end) * RIDES_PER_GO_DAY,
      wastedRides: 0,
    };
  } else if (bookRef && bookRef.rem > 0 && bookRef.expiry >= afterEnd) {
    const seg = bookSeg ?? (input.existingBook ? startExisting() : null);
    if (seg?.book) {
      let rem = bookRef.rem;
      let goDays = 0;
      let rides = 0;
      let end = bookRef.expiry;
      for (let day = afterEnd; day <= bookRef.expiry; day = addDays(day, 1)) {
        if (!input.goesToTaipei(day)) continue;
        goDays += 1;
        const used = Math.min(RIDES_PER_GO_DAY, rem);
        rides += used;
        rem -= used;
        seg.book.ridesUsed += used;
        seg.rides += used;
        seg.end = day;
        if (rem === 0) {
          end = day;
          break;
        }
      }
      seg.goDays += goDays;
      seg.book.wasted += rem;
      tail = { start: afterEnd, end, goDays, rides, wastedRides: rem };
    }
  } else if (bookRef && bookRef.rem > 0 && bookSeg?.book) {
    // 效期在截止日前就到了
    bookSeg.book.wasted += bookRef.rem;
  }

  for (const s of segments) {
    s.baselineCost = s.rides * prices.single;
    s.savings = s.baselineCost - s.cost;
    s.costPerRide = s.rides > 0 ? s.cost / s.rides : null;
  }

  const usageEnd = tail ? tail.end : endDate;
  const cost = segments.reduce((sum, s) => sum + s.cost, 0);
  const rides = segments.reduce((sum, s) => sum + s.rides, 0);
  const baselineCost = rides * prices.single;
  return {
    segments,
    totals: {
      cost,
      goDays: goesSet(startDate, usageEnd),
      rides,
      baselineCost,
      savings: baselineCost - cost,
      costPerRide: rides > 0 ? cost / rides : null,
      allMonthlyCost: periodCountForMonthly * prices.monthly,
    },
    tail,
    usageEnd,
  };
}
