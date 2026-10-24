import { get, set } from 'idb-keyval';
import type { Overrides } from './calendar/calendar';
import { addDays, todayTaipei, type ISODate } from './engine/dates';
import { DEFAULT_PRICES, type OpenBook, type Prices } from './engine/types';

/** 存在手機瀏覽器 IndexedDB 的資料;每次修改都會自動存檔(等同行事曆草稿自動暫存) */
export interface AppState {
  startDate: ISODate;
  endDate: ISODate;
  prices: Prices;
  existingBook: OpenBook | null;
  overrides: Overrides;
  /** 使用者是否已確認過初始設定 */
  onboarded: boolean;
}

const KEY = 'hsr-commuter/state/v1';

export function defaultState(): AppState {
  const today = todayTaipei();
  return {
    startDate: today,
    endDate: addDays(today, 179),
    prices: { ...DEFAULT_PRICES },
    existingBook: null,
    overrides: {},
    onboarded: false,
  };
}

export async function loadState(): Promise<AppState> {
  try {
    const saved = await get<AppState>(KEY);
    if (saved) return { ...defaultState(), ...saved, prices: { ...DEFAULT_PRICES, ...saved.prices } };
  } catch {
    // 無痕模式等情況讀不到儲存空間,就用預設值
  }
  return defaultState();
}

export async function saveState(state: AppState): Promise<void> {
  try {
    await set(KEY, state);
  } catch {
    // 存檔失敗不影響使用
  }
}
