import { useState } from 'preact/hooks';
import type { PlanResult, Prices, Segment } from '../engine/types';
import { KIND_LABEL, md, yen, yenPlain } from './format';

interface Props {
  result: PlanResult | null;
  stale: boolean;
  /** 這份結果的計算起點 */
  startDate: string;
  prices: Prices;
  onGenerate: () => void;
}

function detail(s: Segment, prices: Prices): string[] {
  const lines: string[] = [];
  if (s.kind === 'monthly') {
    lines.push(`${md(s.start)} 起買 ${prices.periodDays} 天月票 ${yen(prices.monthly)},到 ${md(s.end)} 到期`);
    lines.push(`票期內進台北 ${s.goDays} 天、${s.rides} 趟`);
  } else if (s.kind === 'rides' && s.book) {
    const b = s.book;
    lines.push(
      b.existing
        ? `手上原有的回數票:效期到 ${md(b.expiry)},用掉 ${b.ridesUsed} 趟(不另外計費)`
        : `${md(b.firstUse)} 起用第一趟,買 1 本回數票 ${yen(prices.book)},效期到 ${md(b.expiry)}`,
    );
    if (!b.existing) lines.push(`用掉 ${b.ridesUsed} 趟,${md(s.start)}–${md(s.end)} 進台北 ${s.goDays} 天`);
    if (b.wasted > 0) lines.push(`效期內有 ${b.wasted} 趟用不完而作廢`);
  } else {
    lines.push(`${md(s.start)}–${md(s.end)} 零買單程全票 ${s.singles} 張(${yen(s.cost)})`);
  }
  return lines;
}

export function ResultView({ result, stale, startDate, prices, onGenerate }: Props) {
  const [open, setOpen] = useState<number | null>(null);

  if (!result) {
    return (
      <section class="empty">
        <p>還沒有計算結果。</p>
        <p class="hint">先在「行事曆」確認請假與加班,再按「產生購票策略」。</p>
        <button class="primary" onClick={onGenerate}>
          產生購票策略
        </button>
      </section>
    );
  }

  const t = result.totals;
  return (
    <section>
      {stale && (
        <p class="notice warn">
          行事曆或設定已變更,下方是舊結果。
          <button class="link" onClick={onGenerate}>
            重新計算
          </button>
        </p>
      )}

      <div class="cards">
        <div class="card main">
          <span>最低總花費</span>
          <strong>{yenPlain(t.cost)}</strong>
          <small>元・共 {result.segments.length} 筆購票</small>
        </div>
        <div class="card">
          <span>平均每趟</span>
          <strong>{t.costPerRide === null ? '—' : t.costPerRide.toFixed(1)}</strong>
          <small>元(全票 {prices.single})</small>
        </div>
        <div class="card">
          <span>比全買全票省</span>
          <strong class={t.savings >= 0 ? 'good' : 'bad'}>{yenPlain(t.savings)}</strong>
          <small>元(全票 {yenPlain(t.baselineCost)})</small>
        </div>
        <div class="card">
          <span>連續買月票</span>
          <strong>{yenPlain(t.allMonthlyCost)}</strong>
          <small>
            元(
            {t.allMonthlyCost - t.cost >= 0
              ? `多 ${yenPlain(t.allMonthlyCost - t.cost)}`
              : `少 ${yenPlain(t.cost - t.allMonthlyCost)}`}
            )
          </small>
        </div>
      </div>
      <p class="hint">
        計算範圍 {md(startDate)} – {md(result.usageEnd)}・進台北 {t.goDays} 天、
        {t.rides} 趟。費用按購票當期計入。
      </p>
      {result.tail && (
        <p class="notice">
          截止日之後已買的票還沒用完,計算已延長到 {md(result.tail.end)}
          {result.tail.wastedRides > 0
            ? `(效期截止,仍有 ${result.tail.wastedRides} 趟用不完而作廢)`
            : '(剛好用完)'}
          。延長期間 {md(result.tail.start)}–{md(result.tail.end)} 進台北 {result.tail.goDays} 天、
          {result.tail.rides} 趟,不另外買票,已計入總趟數與每趟成本。請到「行事曆」確認這段日子的標記。
        </p>
      )}

      <table class="plan">
        <thead>
          <tr>
            <th>#</th>
            <th>起訖</th>
            <th>票種</th>
            <th class="n">天數</th>
            <th class="n">費用</th>
            <th class="n">每趟</th>
          </tr>
        </thead>
        <tbody>
          {result.segments.map((p) => (
            <>
              <tr
                key={p.index}
                class={`row ${p.kind} ${open === p.index ? 'open' : ''}`}
                onClick={() => setOpen(open === p.index ? null : p.index)}
              >
                <td>{p.index + 1}</td>
                <td>
                  {md(p.start)}
                  <br />–{md(p.end)}
                </td>
                <td>
                  <span class={`badge ${p.kind}`}>{KIND_LABEL[p.kind]}</span>
                </td>
                <td class="n">{p.goDays}</td>
                <td class="n">{yenPlain(p.cost)}</td>
                <td class="n">{p.costPerRide === null ? '—' : p.costPerRide.toFixed(0)}</td>
              </tr>
              {open === p.index && (
                <tr key={`d${p.index}`} class="detail">
                  <td colSpan={6}>
                    <ul>
                      {detail(p, prices).map((l) => (
                        <li key={l}>{l}</li>
                      ))}
                      <li class="muted">
                        對照全買全票 {yen(p.baselineCost)},{p.savings >= 0 ? '省' : '多花'}{' '}
                        {yen(Math.abs(p.savings))}
                      </li>
                    </ul>
                  </td>
                </tr>
              )}
            </>
          ))}
        </tbody>
      </table>
      {result.segments.length === 0 && <p class="hint">這段期間都不進台北,不需要買票。</p>}
      <p class="hint">點任一筆可展開購票明細。</p>
    </section>
  );
}
