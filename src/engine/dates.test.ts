import { describe, expect, it } from 'vitest';
import { addDays, daysInMonth, diffDays, weekday } from './dates';

describe('日期工具', () => {
  it('跨月、跨年加減天數', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-11-02', 29)).toBe('2026-12-01');
    expect(addDays('2027-03-01', -1)).toBe('2027-02-28');
  });

  it('兩日期相差天數', () => {
    expect(diffDays('2026-11-02', '2026-12-01')).toBe(29);
    expect(diffDays('2026-12-01', '2026-11-02')).toBe(-29);
  });

  it('星期幾(2026-10-24 是週六、2026-11-02 是週一)', () => {
    expect(weekday('2026-10-24')).toBe(6);
    expect(weekday('2026-11-02')).toBe(1);
  });

  it('每月天數', () => {
    expect(daysInMonth(2027, 2)).toBe(28);
    expect(daysInMonth(2028, 2)).toBe(29);
  });
});
