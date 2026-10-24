import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { describeDay } from '../calendar/calendar';
import { extendedEndDate, planTickets } from '../engine/planner';
import type { PlanResult } from '../engine/types';
import { loadState, saveState, type AppState } from '../store';
import { CalendarView } from './CalendarView';
import { ResultView } from './ResultView';
import { SettingsView } from './SettingsView';

type Tab = 'calendar' | 'result' | 'settings';

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'calendar', label: '行事曆', icon: '📅' },
  { id: 'result', label: '購票策略', icon: '🎫' },
  { id: 'settings', label: '設定', icon: '⚙️' },
];

/** 計算結果對應的輸入內容,用來判斷結果是否過期 */
const inputKey = (s: AppState) =>
  JSON.stringify([s.startDate, s.endDate, s.prices, s.existingBook, s.overrides]);

export function App() {
  const [state, setState] = useState<AppState | null>(null);
  const [tab, setTab] = useState<Tab>('calendar');
  const [result, setResult] = useState<{ plan: PlanResult; key: string } | null>(null);
  const [error, setError] = useState('');
  const loaded = useRef(false);

  useEffect(() => {
    loadState().then((s) => {
      loaded.current = true;
      setState(s);
      if (!s.onboarded) setTab('settings');
    });
  }, []);

  useEffect(() => {
    if (!state || !loaded.current) return;
    const t = setTimeout(() => void saveState(state), 300);
    return () => clearTimeout(t);
  }, [state]);

  const update = (patch: Partial<AppState>) => setState((s) => (s ? { ...s, ...patch } : s));

  const extendedEnd = useMemo(() => {
    if (!state || state.endDate < state.startDate) return null;
    return extendedEndDate(state.startDate, state.endDate, state.prices.periodDays);
  }, [state?.startDate, state?.endDate, state?.prices.periodDays]);

  if (!state) return <div class="loading">載入中…</div>;

  const generate = () => {
    try {
      const plan = planTickets({
        startDate: state.startDate,
        endDate: state.endDate,
        prices: state.prices,
        existingBook: state.existingBook,
        goesToTaipei: (d) => describeDay(d, state.overrides).go,
      });
      setResult({ plan, key: inputKey(state) });
      setError('');
      setTab('result');
    } catch (e) {
      setError(e instanceof Error ? e.message : '計算失敗');
      setTab('settings');
    }
  };

  return (
    <div class="app">
      <header class="topbar">
        <h1>高鐵通勤票券</h1>
        <span class="sub">新竹 ⇌ 台北</span>
      </header>
      <main class="content">
        {tab === 'calendar' && (
          <CalendarView state={state} extendedEnd={extendedEnd} update={update} onGenerate={generate} />
        )}
        {tab === 'result' && (
          <ResultView
            result={result?.plan ?? null}
            stale={result !== null && result.key !== inputKey(state)}
            prices={state.prices}
            onGenerate={generate}
          />
        )}
        {tab === 'settings' && (
          <SettingsView state={state} error={error} update={update} onDone={() => setTab('calendar')} />
        )}
      </main>
      <nav class="tabbar">
        {TABS.map((t) => (
          <button key={t.id} class={tab === t.id ? 'active' : ''} onClick={() => setTab(t.id)}>
            <span class="ico">{t.icon}</span>
            {t.label}
          </button>
        ))}
      </nav>
    </div>
  );
}
