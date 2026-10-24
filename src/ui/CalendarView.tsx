import { useState } from 'preact/hooks';
import { BUNDLED_HOLIDAYS, describeDay, toggleOverride } from '../calendar/calendar';
import { daysInMonth, weekday, type ISODate } from '../engine/dates';
import type { AppState } from '../store';
import { md } from './format';

interface Props {
  state: AppState;
  /** 行事曆可調整的最後一天;null 代表日期設定有誤 */
  calendarEnd: ISODate | null;
  /** 各票券的起算日標記(日期 → 票種名稱) */
  marks: Record<ISODate, string>;
  update: (patch: Partial<AppState>) => void;
  onGenerate: () => void;
}

const WEEK = ['日', '一', '二', '三', '四', '五', '六'];

export function CalendarView({ state, calendarEnd: extendedEnd, marks, update, onGenerate }: Props) {
  const { startDate, endDate, overrides } = state;
  const [month, setMonth] = useState(() => startDate.slice(0, 7));

  if (!extendedEnd) {
    return <p class="notice warn">目標評估截止日不可早於起始日,請到「設定」修正。</p>;
  }

  const [year, mon] = month.split('-').map(Number);
  const first: ISODate = `${month}-01`;
  const lead = weekday(first);
  const total = daysInMonth(year, mon);
  const minMonth = startDate.slice(0, 7);
  const maxMonth = extendedEnd.slice(0, 7);
  const shift = (delta: number) => {
    const d = new Date(Date.UTC(year, mon - 1 + delta, 1));
    setMonth(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`);
  };

  const cells: (ISODate | null)[] = [
    ...Array<null>(lead).fill(null),
    ...Array.from({ length: total }, (_, i) => `${month}-${String(i + 1).padStart(2, '0')}`),
  ];

  let goCount = 0;
  let overrideCount = 0;
  for (const d of cells) {
    if (!d || d < startDate || d > extendedEnd) continue;
    const info = describeDay(d, overrides);
    if (info.go) goCount += 1;
    if (info.overridden) overrideCount += 1;
  }
  const totalOverrides = Object.keys(overrides).filter(
    (d) => describeDay(d, overrides).overridden,
  ).length;

  const extended = extendedEnd > endDate;

  return (
    <section>
      {extended && (
        <p class="notice">
          截止日 {md(endDate)} 之後到 {md(extendedEnd)} 是延伸範圍(把已買的票用到期,淺黃色底),
          請一併確認這段日子的標記。
        </p>
      )}

      <div class="monthbar">
        <button disabled={month <= minMonth} onClick={() => shift(-1)} aria-label="上個月">
          ‹
        </button>
        <strong>
          {year} 年 {mon} 月
        </strong>
        <button disabled={month >= maxMonth} onClick={() => shift(1)} aria-label="下個月">
          ›
        </button>
      </div>

      <div class="grid weekhead">
        {WEEK.map((w, i) => (
          <span key={w} class={i === 0 || i === 6 ? 'we' : ''}>
            {w}
          </span>
        ))}
      </div>
      <div class="grid days">
        {cells.map((d, i) => {
          if (!d) return <span key={`b${i}`} />;
          const inRange = d >= startDate && d <= extendedEnd;
          if (!inRange) {
            return (
              <button key={d} class="day off-range" disabled>
                <b>{Number(d.slice(8))}</b>
              </button>
            );
          }
          const info = describeDay(d, overrides);
          const cls = [
            'day',
            info.go ? 'go' : 'stay',
            info.overridden ? 'ovr' : '',
            d > endDate ? 'ext' : '',
          ].join(' ');
          return (
            <button
              key={d}
              class={cls}
              onClick={() => update({ overrides: toggleOverride(d, overrides) })}
              aria-label={`${md(d)} ${info.go ? '進台北' : '不進台北'}${info.label ? ' ' + info.label : ''}`}
              aria-pressed={info.go}
            >
              <b>{Number(d.slice(8))}</b>
              <small>{info.label ? info.label.slice(0, 4) : info.kind === 'makeup' ? '補班' : ''}</small>
              {marks[d] && <i class="pstart">{marks[d]}</i>}
            </button>
          );
        })}
      </div>

      <ul class="legend">
        <li>
          <span class="sw go" /> 進台北
        </li>
        <li>
          <span class="sw stay" /> 不進台北
        </li>
        <li>
          <span class="sw ovr" /> 手動調整過
        </li>
        <li>
          <span class="sw ext" /> 延伸範圍
        </li>
      </ul>
      <p class="hint">
        點日期可切換「進/不進台北」,再點一次回到預設。本月進台北 {goCount} 天
        {overrideCount > 0 && `(其中手動調整 ${overrideCount} 天)`}。
      </p>
      {Number(extendedEnd.slice(0, 4)) > Math.max(...BUNDLED_HOLIDAYS.years) && (
        <p class="notice warn">
          {Math.max(...BUNDLED_HOLIDAYS.years) + 1} 年起尚無內建國定假日資料,暫以「週末不進台北」推定,請手動調整。
        </p>
      )}

      <div class="actions">
        {totalOverrides > 0 && (
          <button class="secondary" onClick={() => update({ overrides: {} })}>
            清除全部手動調整({totalOverrides})
          </button>
        )}
        <button class="primary" onClick={onGenerate}>
          產生購票策略
        </button>
      </div>
    </section>
  );
}
