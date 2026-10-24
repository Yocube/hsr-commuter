import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { describeDay } from '../calendar/calendar';
import { planTickets } from '../engine/planner';
import type { PlanResult } from '../engine/types';
import { loadState, saveState, type AppState } from '../store';
import { CalendarView } from './CalendarView';
import { ResultView } from './ResultView';
import { KIND_LABEL } from './format';
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
  const [result, setResult] = useState<{ plan: PlanResult; key: string; startDate: string } | null>(null);
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

  const fresh = state && result && result.key === inputKey(state) ? result.plan : null;

  // 算過之後,行事曆開放到「已買的票用完」那天,供使用者確認延長範圍內的標記
  const calendarEnd =
    state && state.endDate >= state.startDate
      ? result && result.startDate === state.startDate && result.plan.usageEnd > state.endDate
        ? result.plan.usageEnd
        : state.endDate
      : null;

  // 各票券的起算日,標在行事曆上(結果過期時不顯示)
  const marks = useMemo(() => {
    const m: Record<string, string> = {};
    for (const seg of fresh?.segments ?? []) {
      if (!seg.book?.existing) m[seg.start] = KIND_LABEL[seg.kind];
    }
    return m;
  }, [fresh]);

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
      setResult({ plan, key: inputKey(state), startDate: state.startDate });
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
          <CalendarView state={state} calendarEnd={calendarEnd} marks={marks} update={update} onGenerate={generate} />
        )}
        {tab === 'result' && (
          <ResultView
            result={result?.plan ?? null}
            stale={result !== null && result.key !== inputKey(state)}
            startDate={result?.startDate ?? state.startDate}
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
