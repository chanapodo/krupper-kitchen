import { lookup } from '../data/catalog';
import { canon } from './units';
import type { Level, Location, PantryItem, QtyMode } from './types';

/**
 * Pantry quantities have two modes (v1.3):
 * - 'count': a number of units (eggs, yogurts, cans, pitas); 0 = ran out.
 * - 'level': מלא / חצי / כמעט נגמר / נגמר, for everything else (oil, flour, rice, spices, dish soap).
 * Docs from before v1.3 have no mode: it is worked out from the catalog and the old quantity.
 */

export const LEVELS: Level[] = ['full', 'half', 'low', 'out'];
export const LEVEL_LABEL: Record<Level, string> = { full: 'מלא', half: 'חצי', low: 'כמעט נגמר', out: 'נגמר' };

export const COUNT_UNIT = 'יח׳';

/** The catalog's mode for a name; unknown items: counted when given a plain number. */
export function defaultMode(name: string, qty?: number, unit?: string): QtyMode {
  const c = lookup(name);
  if (c) return c.mode ?? 'level';
  const u = canon(qty, unit).unit;
  return qty !== undefined && u === '' ? 'count' : 'level';
}

export function modeOf(p: Pick<PantryItem, 'name' | 'mode' | 'qty' | 'unit'>): QtyMode {
  return p.mode ?? defaultMode(p.name, p.qty, p.unit);
}

/** Level of a level-mode item; old docs: a 0 quantity is "נגמר", anything else "מלא". */
export function levelOf(p: Pick<PantryItem, 'level' | 'qty'>): Level {
  if (p.level) return p.level;
  return p.qty === 0 ? 'out' : 'full';
}

/** A count-mode item's number (old docs in grams etc. count as 1 package); undefined = "יש". */
export function countOf(p: Pick<PantryItem, 'qty' | 'unit'>): number | undefined {
  if (p.qty === undefined || p.qty === null) return undefined;
  const u = canon(p.qty, p.unit).unit;
  if (u === '' || u === 'קופסה') return p.qty;
  return p.qty > 0 ? 1 : 0;
}

/** Is there some at home? Level items count as present unless "נגמר". */
export function isPresent(p: PantryItem): boolean {
  if (modeOf(p) === 'level') return levelOf(p) !== 'out';
  return p.qty === undefined || p.qty === null || p.qty > 0;
}

/** "כמעט נגמר" / "נגמר" (or a count of 0): time to put it on the shopping list. */
export function needsRestock(p: PantryItem): boolean {
  if (modeOf(p) === 'level') return levelOf(p) === 'low' || levelOf(p) === 'out';
  return p.qty === 0;
}

export function rank(l: Level): number {
  return LEVELS.indexOf(l);
}

/** Lower or equal: kids may only take things down (or mark "נגמר"). */
export function isLowering(p: PantryItem, patch: { qty?: number; level?: Level }): boolean {
  if (patch.level !== undefined) return rank(patch.level) >= rank(levelOf(p));
  if (patch.qty !== undefined) return patch.qty <= (countOf(p) ?? Infinity);
  return true;
}

export function qtyLabel(p: PantryItem): string {
  if (modeOf(p) === 'level') return LEVEL_LABEL[levelOf(p)];
  const n = countOf(p);
  if (n === undefined) return 'יש';
  if (n === 0) return 'נגמר';
  return `${Math.round(n * 100) / 100} ${p.unit && canon(n, p.unit).unit !== '' ? p.unit : COUNT_UNIT}`;
}

/**
 * Switch an item between count and level. Both fields stay on the doc,
 * so switching back finds what was there.
 */
export function switchMode(p: PantryItem): Partial<PantryItem> {
  if (modeOf(p) === 'count') {
    const n = countOf(p);
    return { mode: 'level', level: p.level ?? (n === 0 ? 'out' : 'full') };
  }
  const l = levelOf(p);
  const n = countOf(p);
  return { mode: 'count', qty: l === 'out' ? 0 : n !== undefined && n > 0 ? n : 1, unit: canon(n, p.unit).unit === '' && p.unit ? p.unit : COUNT_UNIT };
}

/** The fields a pre-v1.3 doc gets once (nothing removed). */
export function migratePatch(p: PantryItem): Partial<PantryItem> | null {
  if (p.mode) return null;
  const mode = modeOf(p);
  return mode === 'level' ? { mode, level: levelOf(p) } : { mode };
}

/** Where a new item goes, by store aisle (for things the catalog doesn't know). */
export function locationForAisle(aisle: string): Location {
  switch (aisle) {
    case 'ניקיון וטיפוח': case 'בית וניקיון': return 'home';
    case 'קפואים': return 'freezer';
    case 'חלב וביצים': return 'fridge';
    case 'בשר ועוף': case 'דגים': return 'freezer';
    default: return 'pantry';
  }
}
