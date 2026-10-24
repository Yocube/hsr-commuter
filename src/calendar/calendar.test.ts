import { describe, expect, it } from 'vitest';
import { describeDay, toggleOverride, type HolidayData } from './calendar';

describe('行事曆預設規則(內建 2026–2027 假日資料)', () => {
  it('平日預設進台北', () => {
    const d = describeDay('2026-11-02');
    expect(d).toMatchObject({ go: true, defaultGo: true, kind: 'workday', overridden: false });
  });

  it('週末預設不進台北', () => {
    expect(describeDay('2026-11-07').go).toBe(false); // 週六
    expect(describeDay('2026-11-08').go).toBe(false); // 週日
  });

  it('國定假日(平日)預設不進台北,並帶出名稱', () => {
    const d = describeDay('2026-09-28');
    expect(d).toMatchObject({ go: false, kind: 'holiday', label: '孔子誕辰紀念日/教師節' });
  });

  it('補假日預設不進台北', () => {
    expect(describeDay('2026-10-09').go).toBe(false);
    expect(describeDay('2026-10-26').go).toBe(false);
  });

  it('2026 春節 2/14–2/22 連續 9 天都不進台北', () => {
    for (let day = 14; day <= 22; day += 1) {
      expect(describeDay(`2026-02-${day}`).go).toBe(false);
    }
    expect(describeDay('2026-02-13').go).toBe(true); // 週五,春節前最後上班日
    expect(describeDay('2026-02-23').go).toBe(true); // 週一,春節後第一天
  });

  it('沒有內建資料的年份,以週末規則推定並標示', () => {
    const mon = describeDay('2028-01-03');
    expect(mon).toMatchObject({ go: true, noData: true });
    expect(describeDay('2028-01-01').go).toBe(false);
  });
});

describe('補班日與手動覆寫', () => {
  const data: HolidayData = {
    years: [2030],
    days: {
      '2030-03-02': { off: false, name: '補班' }, // 週六補班
      '2030-03-04': { off: true, name: '假日' }, // 週一放假
    },
  };

  it('補班日預設進台北', () => {
    expect(describeDay('2030-03-02', {}, data)).toMatchObject({ go: true, kind: 'makeup' });
  });

  it('平日臨時請假:覆寫為不進台北', () => {
    const d = describeDay('2030-03-05', { '2030-03-05': false }, data);
    expect(d).toMatchObject({ go: false, overridden: true, defaultGo: true });
  });

  it('假日加班、國定假日仍進台北、補班日改請假皆可覆寫', () => {
    expect(describeDay('2030-03-03', { '2030-03-03': true }, data).go).toBe(true); // 週日加班
    expect(describeDay('2030-03-04', { '2030-03-04': true }, data).go).toBe(true); // 假日仍進
    expect(describeDay('2030-03-02', { '2030-03-02': false }, data).go).toBe(false); // 補班改請假
  });

  it('覆寫值與預設相同時視為沒有覆寫', () => {
    expect(describeDay('2030-03-05', { '2030-03-05': true }, data).overridden).toBe(false);
  });

  it('點一下切換,再點一下回到預設(並移除覆寫紀錄)', () => {
    const once = toggleOverride('2030-03-05', {}, data);
    expect(once).toEqual({ '2030-03-05': false });
    const twice = toggleOverride('2030-03-05', once, data);
    expect(twice).toEqual({});
  });
});
