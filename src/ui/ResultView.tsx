import { useState } from 'preact/hooks';
import type { PeriodPlan, PlanResult, Prices } from '../engine/types';
import { KIND_LABEL, md, yen, yenPlain } from './format';

interface Props {
  result: PlanResult | null;
  stale: boolean;
  prices: Prices;
  onGenerate: () => void;
}

function detail(p: PeriodPlan, prices: Prices): string[] {
  const lines: string[] = [];
  if (p.kind === 'monthly') lines.push(`購買 30 天月票 ${yen(prices.monthly)}`);
  if (p.booksBought > 0) lines.push(`購買回數票 ${p.booksBought} 本(${yen(p.booksBought * prices.book)})`);
  if (p.singlesBought > 0) lines.push(`補買單程全票 ${p.singlesBought} 張(${yen(p.singlesBought * prices.single)})`);
  for (const b of p.books) {
    const origin = b.fromPreviousPeriod ? '上一期帶入的回數票' : `${md(b.firstUse)} 開始使用的回數票`;
    let line = `${origin}:效期到 ${md(b.expiry)},本期用 ${b.ridesUsedInPeriod} 趟`;
    if (b.expiredUnused > 0) line += `,期末剩 ${b.expiredUnused} 趟已過效期作廢`;
    else if (b.remainingAtPeriodEnd > 0) line += `,期末剩 ${b.remainingAtPeriodEnd} 趟帶入下一期`;
    lines.push(line);
  }
  if (p.kind === 'none' && p.rides > 0) lines.push('全部由上一期帶入的回數票支應,本期不用買票');
  if (p.rides === 0) lines.push('本期都不進台北');
  return lines;
}

export function ResultView({ result, stale, prices, onGenerate }: Props) {
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
          <small>元・共 {result.periods.length} 期</small>
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
          <span>每期都買月票</span>
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
        計算範圍 {md(result.periods[0].start)} – {md(result.extendedEnd)}・進台北 {t.goDays} 天、
        {t.rides} 趟。費用按購票當期計入。
      </p>

      <table class="plan">
        <thead>
          <tr>
            <th>期</th>
            <th>起訖</th>
            <th>票種</th>
            <th class="n">天數</th>
            <th class="n">費用</th>
            <th class="n">每趟</th>
          </tr>
        </thead>
        <tbody>
          {result.periods.map((p) => (
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
      <p class="hint">點任一期可展開購票明細。</p>
    </section>
  );
}
