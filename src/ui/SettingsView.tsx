import { DEFAULT_PRICES, type Prices } from '../engine/types';
import type { AppState } from '../store';

interface Props {
  state: AppState;
  error: string;
  update: (patch: Partial<AppState>) => void;
  onDone: () => void;
}

const PRICE_FIELDS: { key: keyof Prices; label: string; unit: string }[] = [
  { key: 'single', label: '單程全票', unit: '元' },
  { key: 'monthly', label: '30 天月票', unit: '元' },
  { key: 'book', label: '10 次回數票(一本)', unit: '元' },
  { key: 'periodDays', label: '票卡天數(月票期間與回數票效期)', unit: '天' },
];

export function SettingsView({ state, error, update, onDone }: Props) {
  const { prices, existingBook } = state;
  const invalid = state.endDate < state.startDate;

  const setPrice = (key: keyof Prices, raw: string) => {
    const v = Math.max(0, Math.floor(Number(raw) || 0));
    update({ prices: { ...prices, [key]: v } });
  };

  return (
    <section class="settings">
      {!state.onboarded && (
        <p class="notice">
          歡迎使用!請確認下列起始日、截止日與票價(已帶入預設值),完成後按最下方按鈕。
        </p>
      )}
      {error && <p class="notice warn">{error}</p>}

      <h2>評估期間</h2>
      <label>
        起算日(第一次要搭車、或新票卡生效的日子)
        <input
          type="date"
          value={state.startDate}
          onInput={(e) => update({ startDate: (e.target as HTMLInputElement).value })}
        />
      </label>
      <label>
        目標評估截止日
        <input
          type="date"
          value={state.endDate}
          onInput={(e) => update({ endDate: (e.target as HTMLInputElement).value })}
        />
      </label>
      {invalid && <p class="notice warn">截止日不可早於起點。</p>}

      <h2>票價</h2>
      {PRICE_FIELDS.map((f) => (
        <label key={f.key}>
          {f.label}
          <span class="unit">
            <input
              type="number"
              inputMode="numeric"
              min="0"
              value={prices[f.key]}
              onInput={(e) => setPrice(f.key, (e.target as HTMLInputElement).value)}
            />
            {f.unit}
          </span>
        </label>
      ))}
      <button class="link" onClick={() => update({ prices: { ...DEFAULT_PRICES } })}>
        還原預設票價(280 / 8,230 / 2,295 / 30 天)
      </button>

      <h2>手上已有的回數票(選填)</h2>
      <label class="check">
        <input
          type="checkbox"
          checked={existingBook !== null}
          onChange={(e) =>
            update({
              existingBook: (e.target as HTMLInputElement).checked
                ? { remaining: 10, firstUse: state.startDate }
                : null,
            })
          }
        />
        我手上有已開始使用的回數票
      </label>
      {existingBook && (
        <>
          <label>
            剩餘趟數
            <span class="unit">
              <input
                type="number"
                inputMode="numeric"
                min="0"
                max={prices.bookRides}
                value={existingBook.remaining}
                onInput={(e) =>
                  update({
                    existingBook: {
                      ...existingBook,
                      remaining: Math.max(0, Math.floor(Number((e.target as HTMLInputElement).value) || 0)),
                    },
                  })
                }
              />
              趟
            </span>
          </label>
          <label>
            首次使用日
            <input
              type="date"
              value={existingBook.firstUse}
              onInput={(e) =>
                update({ existingBook: { ...existingBook, firstUse: (e.target as HTMLInputElement).value } })
              }
            />
          </label>
        </>
      )}

      <button
        class="primary"
        disabled={invalid}
        onClick={() => {
          update({ onboarded: true });
          onDone();
        }}
      >
        {state.onboarded ? '回到行事曆' : '完成設定,開始標記行事曆'}
      </button>
    </section>
  );
}
