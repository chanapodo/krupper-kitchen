import { describe, expect, it } from 'vitest';
import { aisleOf, aisleName, defaultLocation } from '../src/data/catalog';
import { MOCK_RECEIPT } from '../src/data/mockAi';
import { cleanUrl, firstUrl } from '../src/lib/links';
import {
  addToPantry, decidedRequests, groupByAisle, pendingRequests, removalRequests, slotRequests, undoPantry, unreadNotices, verb,
} from '../src/lib/logic';
import {
  countOf, defaultMode, isLowering, isPresent, levelOf, migratePatch, modeOf, needsRestock, qtyLabel, switchMode,
} from '../src/lib/pantry';
import { isJunkLine, linesFromAi } from '../src/lib/receipt';
import type { ApprovalRequest, Notice, PantryItem } from '../src/lib/types';

const item = (name: string, extra: Partial<PantryItem> = {}): PantryItem => ({ id: name, name, location: 'pantry', updatedAt: 0, ...extra });

describe('recipe links', () => {
  it('strips Google junk glued to the path (the foodsdictionary case)', () => {
    expect(cleanUrl('https://www.foodsdictionary.co.il/Recipes/6590&sa=U&sqi=2&ved=2ahUKEwjj1p_GusiXAxXWQkEAHRy3FX4QFnoECB0QAQ&usg=AOvVaw3C1IkcE13ZIBPuxdq6GfK7'))
      .toBe('https://www.foodsdictionary.co.il/Recipes/6590');
  });
  it('unwraps google.com/url?q= and drops utm / fbclid, keeping real parameters', () => {
    expect(cleanUrl('https://www.google.com/url?q=https://www.foodsdictionary.co.il/Recipes/6590&sa=U&ved=2ahUK&usg=AOv'))
      .toBe('https://www.foodsdictionary.co.il/Recipes/6590');
    expect(cleanUrl('https://site.co.il/r?id=7&utm_source=fb&utm_medium=x&fbclid=IwAR0')).toBe('https://site.co.il/r?id=7');
    expect(cleanUrl('https://www.youtube.com/watch?v=abcdefghijk&si=XYZ&t=30')).toBe('https://www.youtube.com/watch?v=abcdefghijk&t=30');
    expect(cleanUrl('https://heninthekitchen.com/shepherds-pie/')).toBe('https://heninthekitchen.com/shepherds-pie/');
  });
  it('finds the link inside a shared text', () => {
    expect(firstUrl('תראי איזה מתכון! https://site.co.il/a?x=1 שווה')).toBe('https://site.co.il/a?x=1');
    expect(cleanUrl('מתכון: https://site.co.il/a?utm_source=wa')).toBe('https://site.co.il/a');
  });
});

describe('receipt', () => {
  const lines = linesFromAi(JSON.stringify(MOCK_RECEIPT), { pantry: [item('ביצים', { qty: 8, location: 'fridge' })] });
  it('skips deposit, bag, discount and total lines', () => {
    const names = lines.map((l) => l.name);
    expect(names).not.toContain('פיקדון');
    expect(names.some((n) => /שקית|הנחה|סה"כ/.test(n))).toBe(false);
    expect(isJunkLine('פיקדון בקבוק')).toBe(true);
    expect(isJunkLine('שקית קניה')).toBe(true);
    expect(isJunkLine('יוגורט דנונה')).toBe(false);
  });
  it('normalizes names, picks a mode and a category', () => {
    const by = Object.fromEntries(lines.map((l) => [l.name, l]));
    expect(by['שמן']).toMatchObject({ mode: 'level', aisle: 'תבלינים ואפייה' });
    expect(by['יוגורט']).toMatchObject({ mode: 'count', qty: 4 });
    expect(by['ביצים']).toMatchObject({ mode: 'count', qty: 12 });
    expect(by['בננות']).toMatchObject({ mode: 'level' }); // weighed
    expect(by['סבון כלים']).toMatchObject({ aisle: 'ניקיון וטיפוח', mode: 'level' });
    expect(by['נייר טואלט']).toMatchObject({ aisle: 'ניקיון וטיפוח', mode: 'count' });
  });
  it('merges repeated lines and refuses a non-receipt', () => {
    const two = linesFromAi(JSON.stringify({ items: [{ raw: 'יוגורט', name: 'יוגורט', qty: 2, kind: 'item' }, { raw: 'יוגורט תות', name: 'יוגורט', qty: 3, kind: 'item' }] }));
    expect(two).toHaveLength(1);
    expect(two[0].qty).toBe(5);
    expect(() => linesFromAi('{"error":"no-receipt"}')).toThrow();
  });
});

describe('cleaning & personal care', () => {
  it('is a list aisle and a pantry place; the old aisle name maps to it', () => {
    expect(aisleOf('שמפו')).toBe('ניקיון וטיפוח');
    expect(aisleOf('נוזל כלים')).toBe('ניקיון וטיפוח');
    expect(defaultLocation('נייר טואלט')).toBe('home');
    expect(aisleName('בית וניקיון')).toBe('ניקיון וטיפוח');
    const groups = groupByAisle([
      { id: 'a', name: 'אקונומיקה', aisle: 'בית וניקיון', fromMenu: false },
      { id: 'b', name: 'שמפו', aisle: 'ניקיון וטיפוח', fromMenu: false },
    ]);
    expect(groups).toHaveLength(1);
  });
});

describe('pantry modes', () => {
  it('sensible defaults: counted things vs. levels', () => {
    for (const n of ['ביצים', 'יוגורט', 'פיתות', 'טונה', 'תירס בקופסה']) expect(defaultMode(n)).toBe('count');
    for (const n of ['שמן', 'קמח', 'אורז', 'פפריקה', 'סבון כלים']) expect(defaultMode(n)).toBe('level');
    expect(defaultMode('משהו חדש', 3)).toBe('count');
    expect(defaultMode('משהו חדש', 300, 'גרם')).toBe('level');
  });
  it('old docs: worked out without losing anything', () => {
    const oil = item('שמן', { qty: 1 });
    expect(modeOf(oil)).toBe('level');
    expect(levelOf(oil)).toBe('full');
    expect(migratePatch(oil)).toEqual({ mode: 'level', level: 'full' });
    expect(migratePatch(item('ביצים', { qty: 8 }))).toEqual({ mode: 'count' });
    expect(migratePatch(item('ביצים', { mode: 'count' }))).toBeNull();
    expect(levelOf(item('קמח', { qty: 0 }))).toBe('out');
  });
  it('present / restock / labels', () => {
    expect(isPresent(item('שמן', { mode: 'level', level: 'low' }))).toBe(true);
    expect(isPresent(item('שמן', { mode: 'level', level: 'out' }))).toBe(false);
    expect(needsRestock(item('שמן', { mode: 'level', level: 'low' }))).toBe(true);
    expect(needsRestock(item('שמן', { mode: 'level', level: 'half' }))).toBe(false);
    expect(needsRestock(item('ביצים', { mode: 'count', qty: 0 }))).toBe(true);
    expect(qtyLabel(item('ביצים', { mode: 'count', qty: 6 }))).toBe('6 יח׳');
    expect(qtyLabel(item('ביצים', { mode: 'count', qty: 0 }))).toBe('נגמר');
    expect(qtyLabel(item('שמן', { mode: 'level', level: 'low' }))).toBe('כמעט נגמר');
    expect(countOf(item('אורז', { qty: 1000, unit: 'גרם' }))).toBe(1);
  });
  it('switching modes keeps both fields, so switching back finds them', () => {
    const eggs = item('ביצים', { mode: 'count', qty: 6, unit: 'יח׳' });
    const asLevel = { ...eggs, ...switchMode(eggs) };
    expect(asLevel).toMatchObject({ mode: 'level', level: 'full', qty: 6 });
    expect({ ...asLevel, ...switchMode(asLevel) }).toMatchObject({ mode: 'count', qty: 6 });
    expect(switchMode(item('שמן', { mode: 'level', level: 'out' }))).toMatchObject({ mode: 'count', qty: 0 });
  });
  it('kids may only lower', () => {
    const oil = item('שמן', { mode: 'level', level: 'half' });
    expect(isLowering(oil, { level: 'low' })).toBe(true);
    expect(isLowering(oil, { level: 'full' })).toBe(false);
    expect(isLowering(item('ביצים', { mode: 'count', qty: 3 }), { qty: 2 })).toBe(true);
    expect(isLowering(item('ביצים', { mode: 'count', qty: 3 }), { qty: 4 })).toBe(false);
  });
  it('undoing a purchase of a level item puts its level back', () => {
    const p = item('שמן', { mode: 'level', level: 'full' });
    expect(undoPantry([p], { id: 'שמן', created: false, prevLevel: 'low' }, 5)).toEqual({ data: { name: 'שמן', location: 'pantry', mode: 'level', level: 'low', updatedAt: 5 } });
    expect(undoPantry([p], { id: 'שמן', created: false, prevLevel: null }, 5)).toEqual({ data: { name: 'שמן', location: 'pantry', mode: 'level', updatedAt: 5 } });
    expect(undoPantry([p], { id: 'שמן', created: true, prevLevel: null })).toEqual({ remove: true });
  });
  it('a new item can take the mode chosen on the receipt review', () => {
    expect(addToPantry([], { name: 'בננות', qty: 6, unit: 'יח׳', mode: 'count' }).data).toMatchObject({ mode: 'count', qty: 6 });
  });
});

describe('notices and requests', () => {
  it('Hebrew verbs by gender', () => {
    expect(verb({ gender: 'm' }, 'הוסיף')).toBe('הוסיף');
    expect(verb({ gender: 'f' }, 'הוסיף')).toBe('הוסיפה');
    expect(verb({ gender: 'f' }, 'סימן')).toBe('סימנה');
    expect(verb({}, 'הוסיף')).toBe('הוסיף/ה');
  });
  const r = (x: Partial<ApprovalRequest>): ApprovalRequest => ({ id: 'r', kind: 'shop-remove', by: 'kid1', at: 1, status: 'pending', title: 'חלב', ...x });
  it('pending requests by row and by slot; decided ones for a week', () => {
    const reqs = [
      r({ id: 'a', itemId: 'item1' }),
      r({ id: 'b', menuKey: 'בצל', weekId: 'w1' }),
      r({ id: 'c', menuKey: 'גזר', weekId: 'w2' }),
      r({ id: 'd', kind: 'menu-add', weekId: 'w1', day: 'sun', meal: 'lunch', recipeId: 'x' }),
      r({ id: 'e', status: 'cancelled', itemId: 'item2' }),
      r({ id: 'f', status: 'approved', decidedAt: 100 }),
    ];
    const m = removalRequests(reqs, 'w1');
    expect([...m.keys()].sort()).toEqual(['item1', 'menu:בצל']);
    expect(slotRequests(reqs, 'w1', 'sun', 'lunch').map((x) => x.id)).toEqual(['d']);
    expect(pendingRequests(reqs)).toHaveLength(4);
    expect(decidedRequests(reqs, 200).map((x) => x.id)).toEqual(['f']);
  });
  it('unread notices per parent; undone ones hidden', () => {
    const n = (x: Partial<Notice>): Notice => ({ id: 'n', text: 't', kind: 'shop', by: 'kid1', at: 1, ...x });
    const list = [n({ id: '1' }), n({ id: '2', readBy: { mom: true } }), n({ id: '3', undone: true })];
    expect(unreadNotices(list, 'mom').map((x) => x.id)).toEqual(['1']);
    expect(unreadNotices(list, 'dad').map((x) => x.id)).toEqual(['1', '2']);
  });
});
