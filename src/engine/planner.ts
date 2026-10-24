import { addDays, diffDays, type ISODate } from './dates';
import {
  RIDES_PER_GO_DAY,
  type BookUse,
  type PeriodKind,
  type PeriodPlan,
  type PlanInput,
  type PlanResult,
  type TailUsage,
  type Prices,
  type DateRange,
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

/** 評估期間需要切成幾個票期(至少 1 期) */
export function periodCount(startDate: ISODate, endDate: ISODate, periodDays: number): number {
  const span = diffDays(startDate, endDate) + 1;
  if (span < 1) throw new Error('目標評估截止日不可早於起始日');
  return Math.ceil(span / periodDays);
}

/** 最後一期的票期到期日;行事曆需涵蓋到這一天 */
export function extendedEndDate(startDate: ISODate, endDate: ISODate, periodDays: number): ISODate {
  return addDays(startDate, periodCount(startDate, endDate, periodDays) * periodDays - 1);
}

interface Book {
  remaining: number;
  firstUse: ISODate;
  expiry: ISODate;
}

interface Sim {
  cost: number;
  singles: number;
  books: BookUse[];
  carryOut: Book | null;
}

interface Period {
  index: number;
  start: ISODate;
  end: ISODate;
  /** 進台北的日期 */
  goDates: ISODate[];
}

/**
 * 模擬一期的「回數票 + 全票」消耗:
 * - 先用帶入的回數票,過期就作廢
 * - 沒有可用的回數票時,從第 openFromGoDay 個進台北日起才允許新開一本(最多 budget 本),其餘買全票
 */
function simulateRides(
  period: Period,
  carryIn: Book | null,
  budget: number,
  openFromGoDay: number,
  prices: Prices,
  extensions: DateRange[],
): Sim {
  let current: Book | null = carryIn ? { ...carryIn } : null;
  const uses: { book: Book; fromPrev: boolean; used: number }[] = [];
  let currentUse: (typeof uses)[number] | null = null;
  if (current) {
    currentUse = { book: current, fromPrev: true, used: 0 };
    uses.push(currentUse);
  }
  let opened = 0;
  let singles = 0;

  period.goDates.forEach((date, goIdx) => {
    for (let r = 0; r < RIDES_PER_GO_DAY; r += 1) {
      if (current && current.remaining > 0 && date <= current.expiry) {
        current.remaining -= 1;
        currentUse!.used += 1;
      } else if (opened < budget && goIdx >= openFromGoDay) {
        opened += 1;
        const expiry = bookExpiry(date, prices.periodDays, extensions);
        current = { remaining: prices.bookRides - 1, firstUse: date, expiry };
        currentUse = { book: current, fromPrev: false, used: 1 };
        uses.push(currentUse);
      } else {
        singles += 1;
      }
    }
  });

  const nextStart = addDays(period.end, 1);
  const books: BookUse[] = uses.map((u) => {
    const stillValid = u.book.expiry >= nextStart;
    return {
      firstUse: u.book.firstUse,
      expiry: u.book.expiry,
      ridesUsedInPeriod: u.used,
      remainingAtPeriodEnd: u.book.remaining,
      expiredUnused: stillValid ? 0 : u.book.remaining,
      fromPreviousPeriod: u.fromPrev,
    };
  });
  const carryOut =
    current && current.remaining > 0 && current.expiry >= nextStart ? { ...current } : null;
  return { cost: opened * prices.book + singles * prices.single, singles, books, carryOut };
}

interface Choice {
  kind: PeriodKind;
  cost: number;
  singles: number;
  booksBought: number;
  books: BookUse[];
  carryOut: Book | null;
}

function carryAfterMonthly(carry: Book | null, period: Period): Book | null {
  return carry && carry.remaining > 0 && carry.expiry >= addDays(period.end, 1) ? carry : null;
}

/** 列出一期所有可行方案;順序即同價時的優先順序(月票優先) */
function* options(period: Period, carry: Book | null, input: PlanInput): Generator<Choice> {
  const { prices } = input;
  const ext = input.validityExtensions ?? [];
  yield {
    kind: 'monthly',
    cost: prices.monthly,
    singles: 0,
    booksBought: 0,
    books: [],
    carryOut: carryAfterMonthly(carry, period),
  };
  const rides = period.goDates.length * RIDES_PER_GO_DAY;
  const maxBooks = Math.ceil(rides / prices.bookRides);
  for (let budget = 0; budget <= maxBooks; budget += 1) {
    // budget = 0 時延後開本沒有意義,只跑一次
    const maxSkip = budget === 0 ? 0 : period.goDates.length - 1;
    for (let skip = 0; skip <= maxSkip; skip += 1) {
      const sim = simulateRides(period, carry, budget, skip, prices, ext);
      const booksBought = sim.books.filter((b) => !b.fromPreviousPeriod).length;
      if (booksBought < budget) continue; // 買不滿預算 = 與較小預算重複
      const kind: PeriodKind =
        booksBought > 0 ? 'rides' : sim.singles > 0 ? 'single' : 'none';
      yield {
        kind,
        cost: sim.cost,
        singles: sim.singles,
        booksBought,
        books: sim.books,
        carryOut: sim.carryOut,
      };
    }
  }
}

/** 產生購票策略:以動態規劃找出整段期間總花費最低的方案(回數票剩餘趟次可帶入下一期) */
export function planTickets(input: PlanInput): PlanResult {
  const { prices } = input;
  const n = periodCount(input.startDate, input.endDate, prices.periodDays);
  const ext = input.validityExtensions ?? [];

  const periods: Period[] = [];
  for (let i = 0; i < n; i += 1) {
    const start = addDays(input.startDate, i * prices.periodDays);
    const end = addDays(start, prices.periodDays - 1);
    const goDates: ISODate[] = [];
    for (let d = 0; d < prices.periodDays; d += 1) {
      const date = addDays(start, d);
      if (input.goesToTaipei(date)) goDates.push(date);
    }
    periods.push({ index: i, start, end, goDates });
  }

  let initialCarry: Book | null = null;
  if (input.existingBook && input.existingBook.remaining > 0) {
    const expiry = bookExpiry(input.existingBook.firstUse, prices.periodDays, ext);
    if (expiry >= input.startDate) {
      initialCarry = {
        remaining: input.existingBook.remaining,
        firstUse: input.existingBook.firstUse,
        expiry,
      };
    }
  }

  const memo = new Map<string, { total: number; picks: Choice[] }>();
  const solve = (i: number, carry: Book | null): { total: number; picks: Choice[] } => {
    if (i >= n) return { total: 0, picks: [] };
    const key = `${i}|${carry ? `${carry.remaining}|${carry.expiry}` : '-'}`;
    const hit = memo.get(key);
    if (hit) return hit;
    let best: { total: number; picks: Choice[] } | null = null;
    for (const choice of options(periods[i], carry, input)) {
      const rest = solve(i + 1, choice.carryOut);
      const total = choice.cost + rest.total;
      if (best === null || total < best.total) {
        best = { total, picks: [choice, ...rest.picks] };
      }
    }
    memo.set(key, best!);
    return best!;
  };

  const { picks } = solve(0, initialCarry);

  const plans: PeriodPlan[] = periods.map((p, i) => {
    const c = picks[i];
    const rides = p.goDates.length * RIDES_PER_GO_DAY;
    const baselineCost = rides * prices.single;
    return {
      index: i,
      start: p.start,
      end: p.end,
      goDays: p.goDates.length,
      rides,
      kind: c.kind,
      cost: c.cost,
      booksBought: c.booksBought,
      singlesBought: c.singles,
      books: c.books,
      baselineCost,
      savings: baselineCost - c.cost,
      costPerRide: rides > 0 ? c.cost / rides : null,
    };
  });

  // 最後一期結束時若還有可用的回數票,延長計算到用完(或效期截止)為止
  const lastEnd = periods[n - 1].end;
  const leftover = picks[n - 1].carryOut;
  let tail: TailUsage | null = null;
  if (leftover) {
    let remaining = leftover.remaining;
    let goDays = 0;
    let rides = 0;
    let end = leftover.expiry;
    for (let day = addDays(lastEnd, 1); day <= leftover.expiry; day = addDays(day, 1)) {
      if (!input.goesToTaipei(day)) continue;
      goDays += 1;
      const used = Math.min(RIDES_PER_GO_DAY, remaining);
      rides += used;
      remaining -= used;
      if (remaining === 0) {
        end = day;
        break;
      }
    }
    tail = { start: addDays(lastEnd, 1), end, goDays, rides, wastedRides: remaining };
  }

  const cost = plans.reduce((s, p) => s + p.cost, 0);
  const rides = plans.reduce((s, p) => s + p.rides, 0) + (tail?.rides ?? 0);
  const baselineCost = rides * prices.single;
  return {
    periods: plans,
    totals: {
      cost,
      goDays: plans.reduce((s, p) => s + p.goDays, 0) + (tail?.goDays ?? 0),
      rides,
      baselineCost,
      savings: baselineCost - cost,
      costPerRide: rides > 0 ? cost / rides : null,
      allMonthlyCost: n * prices.monthly,
    },
    extendedEnd: lastEnd,
    tail,
    usageEnd: tail ? tail.end : lastEnd,
  };
}
