import type { ISODate } from '../engine/dates';

export const yen = (n: number) => `${Math.round(n).toLocaleString('en-US')} 元`;

export const yenPlain = (n: number) => Math.round(n).toLocaleString('en-US');

/** 2026-11-02 → 11/2 */
export const md = (d: ISODate) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`;

/** 2026-11-02 → 2026/11/2 */
export const ymd = (d: ISODate) => `${d.slice(0, 4)}/${md(d)}`;

export const KIND_LABEL = {
  monthly: '月票',
  rides: '回數票',
  single: '全票',
  none: '免購票',
} as const;
