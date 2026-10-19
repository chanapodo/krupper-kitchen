import type { DayKey } from './types';

export const DAY_KEYS: DayKey[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
export const DAY_NAMES: Record<DayKey, string> = {
  sun: 'ראשון', mon: 'שני', tue: 'שלישי', wed: 'רביעי', thu: 'חמישי', fri: 'שישי', sat: 'שבת',
};

const pad = (n: number) => String(n).padStart(2, '0');

export function ymd(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function parseYmd(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

/** Week id = the Sunday (local time) that starts the week of `d`. */
export function weekIdOf(d: Date): string {
  return ymd(addDays(new Date(d.getFullYear(), d.getMonth(), d.getDate()), -d.getDay()));
}

export function shiftWeek(weekId: string, n: number): string {
  return ymd(addDays(parseYmd(weekId), 7 * n));
}

export function dayKeyOf(d: Date): DayKey {
  return DAY_KEYS[d.getDay()];
}

export function dateOf(weekId: string, day: DayKey): Date {
  return addDays(parseYmd(weekId), DAY_KEYS.indexOf(day));
}

export function shortDate(d: Date): string {
  return `${d.getDate()}.${d.getMonth() + 1}`;
}

export function weekLabel(weekId: string, now = new Date()): string {
  const cur = weekIdOf(now);
  if (weekId === cur) return 'השבוע';
  if (weekId === shiftWeek(cur, 1)) return 'השבוע הבא';
  if (weekId === shiftWeek(cur, -1)) return 'השבוע שעבר';
  const start = parseYmd(weekId);
  return `${shortDate(start)}–${shortDate(addDays(start, 6))}`;
}
