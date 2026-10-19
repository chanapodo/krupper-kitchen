import { describe, expect, it } from 'vitest';
import { ingredientKey, lookup } from '../src/data/catalog';
import { SEED_RECIPES } from '../src/data/recipes';
import { DEFAULT_MEMBERS, demoData } from '../src/data/seed';
import { weekIdOf } from '../src/lib/dates';
import {
  addToPantry, buildList, bumpPantry, canAddToSlot, dinnerIdeas, kidsFavorites, kosherCompatible,
  listPermissions, neededFromMenu, newShoppingItem, thawBanner, coveredByPantry, doneRecord, onList, recentDone, restoredItem,
  staleDone, undoPantry, thawPlan, toggleVote, wishSummary,
} from '../src/lib/logic';
import { canon, formatQty } from '../src/lib/units';
import type { PantryItem, Recipe, Week } from '../src/lib/types';

const recipes = new Map(SEED_RECIPES.map((r) => [r.id, r]));
const pantryItem = (name: string, location: PantryItem['location'], qty?: number, unit?: string): PantryItem => ({
  id: name, name, location, updatedAt: 0, ...(qty !== undefined ? { qty } : {}), ...(unit ? { unit } : {}),
});
// a Wednesday
const WED = new Date(2026, 9, 21, 9, 0);
const weekOf = (days: Week['days'], skipped: string[] = []): Week => ({ id: weekIdOf(WED), days, skipped });

describe('catalog', () => {
  it('matches aliases and descriptive names', () => {
    expect(lookup('פילה עוף')?.name).toBe('חזה עוף');
    expect(lookup('בצל גדול')?.name).toBe('בצל');
    expect(ingredientKey('ביצה')).toBe(ingredientKey('ביצים'));
  });
  it('every seed recipe is complete and there are ~40', () => {
    expect(SEED_RECIPES.length).toBeGreaterThanOrEqual(40);
    const ids = new Set<string>();
    for (const r of SEED_RECIPES) {
      expect(ids.has(r.id)).toBe(false);
      ids.add(r.id);
      expect(r.ingredients.length).toBeGreaterThan(2);
      expect(r.steps.length).toBeGreaterThan(2);
      expect(r.meals.length).toBeGreaterThan(0);
    }
    const cuisines = new Set(SEED_RECIPES.map((r) => r.cuisine));
    for (const c of ['אסייתי', 'איטלקי', 'מקסיקני', 'ישראלי']) expect(cuisines.has(c)).toBe(true);
  });
});

describe('units', () => {
  it('converts kg and plural units', () => {
    expect(canon(1.5, 'ק"ג')).toEqual({ qty: 1500, unit: 'גרם' });
    expect(canon(2, 'כוסות')).toEqual({ qty: 2, unit: 'כוס' });
    expect(formatQty(1500, 'גרם')).toBe('1.5 ק"ג');
    expect(formatQty(3, '')).toBe('3');
  });
});

describe('kosher', () => {
  it('never mixes meat and dairy', () => {
    expect(kosherCompatible('meat', 'dairy')).toBe(false);
    expect(kosherCompatible('meat', 'parve')).toBe(true);
    expect(kosherCompatible('dairy', 'dairy')).toBe(true);
    expect(canAddToSlot(recipes.get('pizza')!, ['schnitzel'], recipes)).toBe(false);
    expect(canAddToSlot(recipes.get('fried-rice')!, ['schnitzel'], recipes)).toBe(true);
    expect(canAddToSlot(recipes.get('pizza')!, ['fried-rice'], recipes)).toBe(true);
  });
});

describe('shopping list from menu', () => {
  const week = weekOf({
    sun: { lunch: { recipeIds: ['bolognese'] } },
    mon: { lunch: { recipeIds: ['tacos'] } },
  });

  it('sums ingredients across the week and skips staples', () => {
    const need = neededFromMenu(week, recipes, []);
    const beef = need.find((n) => n.name === 'בשר טחון')!;
    expect(beef.qty).toBe(1000);
    expect(beef.unit).toBe('גרם');
    expect(beef.recipes).toEqual(['ספגטי בולונז', 'טאקו בשר']);
    expect(need.find((n) => n.name === 'מלח')).toBeUndefined();
    expect(need.find((n) => n.name === 'בצל')!.qty).toBe(2);
  });

  it('subtracts pantry stock', () => {
    const need = neededFromMenu(week, recipes, [
      pantryItem('בשר טחון', 'freezer', 600, 'גרם'),
      pantryItem('בצל', 'pantry', 5),
      pantryItem('בזיליקום', 'fridge'),
    ]);
    expect(need.find((n) => n.name === 'בשר טחון')!.qty).toBe(400);
    expect(need.find((n) => n.name === 'בצל')).toBeUndefined();
    expect(need.find((n) => n.name === 'בזיליקום')).toBeUndefined();
  });

  it('honours skipped items and does not duplicate manual items', () => {
    const w = { ...week, skipped: [ingredientKey('אבוקדו')] };
    const manual = [{ id: 'x', ...newShoppingItem('ספגטי', 'mom', true) }];
    const need = neededFromMenu(w, recipes, [], manual);
    expect(need.find((n) => n.name === 'אבוקדו')).toBeUndefined();
    expect(need.find((n) => n.name === 'ספגטי')).toBeUndefined();
  });

  it('groups by aisle in store order and keeps pending apart', () => {
    const items = [
      { id: 'a', ...newShoppingItem('במבה', 'kid1', false) },
      { id: 'b', ...newShoppingItem('בננות', 'mom', true) },
    ];
    const { groups, pending } = buildList(week, recipes, [], items);
    expect(groups[0].aisle).toBe('ירקות ופירות');
    expect(groups.flatMap((g) => g.rows).some((r) => r.name === 'בננות')).toBe(true);
    expect(pending.map((p) => p.name)).toEqual(['במבה']);
  });
});

describe('undo: recently bought / removed', () => {
  const week = weekOf({ sun: { lunch: { recipeIds: ['bolognese'] } } });
  const NOW = WED.getTime();

  it('a removed manual item keeps its doc as history and stops blocking the menu row', () => {
    const item = { id: 'x', ...newShoppingItem('ספגטי', 'mom', true, 1, 'חבילה') };
    const rec = { id: 'x', ...doneRecord({ id: 'x', name: 'ספגטי', aisle: item.aisle, fromMenu: false, item }, 'removed', 'mom', {}, NOW) };
    expect(rec).toMatchObject({ status: 'removed', doneAt: NOW, doneBy: 'mom', prevStatus: 'active', qty: 1 });
    expect(onList(rec)).toBe(false);
    expect(neededFromMenu(week, recipes, [], [rec]).some((n) => n.name === 'ספגטי')).toBe(true);
    expect(buildList(week, recipes, [], [rec]).groups.flatMap((g) => g.rows).filter((r) => r.name === 'ספגטי')).toHaveLength(1);
    expect({ id: 'x', ...restoredItem(rec) }).toEqual(item);
  });

  it('a rejected suggestion goes back to waiting for approval', () => {
    const p = { id: 'k', ...newShoppingItem('במבה', 'kid1', false) };
    const rec = { id: 'k', ...doneRecord(p, 'removed', 'mom', {}, NOW) };
    expect(rec.prevStatus).toBe('pending');
    expect(restoredItem(rec).status).toBe('pending');
  });

  it('a menu row records its key and week ("not needed") or its pantry move (bought)', () => {
    const row = { id: `menu:${ingredientKey('בצל')}`, name: 'בצל', qty: 1, aisle: 'ירקות ופירות', fromMenu: true, recipes: ['ספגטי בולונז'] };
    const skipped = doneRecord(row, 'removed', 'mom', { weekId: week.id }, NOW);
    expect(skipped).toMatchObject({ status: 'removed', menuKey: ingredientKey('בצל'), weekId: week.id, recipes: ['ספגטי בולונז'] });
    expect(skipped.prevStatus).toBeUndefined();
    const bought = doneRecord(row, 'bought', 'mom', { weekId: week.id, pantry: { id: 'p1', created: true, qty: 1 } }, NOW);
    expect(bought.weekId).toBeUndefined();
    expect(bought.pantry).toEqual({ id: 'p1', created: true, qty: 1 });
  });

  it('only the last 24 hours, newest first, at most 20; a week-old one is cleaned up', () => {
    const mk = (i: number, hoursAgo: number, status: 'bought' | 'removed' | 'active' = 'bought') => ({
      id: `h${i}`, ...newShoppingItem(`פריט ${i}`, 'mom', true), status, doneAt: NOW - hoursAgo * 3600_000,
    });
    const items = [mk(1, 2), mk(2, 1, 'removed'), mk(3, 30), mk(4, 0.5, 'active'), mk(5, 200), ...Array.from({ length: 25 }, (_, i) => mk(10 + i, 3 + i / 10))];
    const recent = recentDone(items, NOW);
    expect(recent[0].id).toBe('h2');
    expect(recent[1].id).toBe('h1');
    expect(recent).toHaveLength(20);
    expect(recent.some((r) => r.id === 'h3' || r.id === 'h4')).toBe(false);
    expect(staleDone(items, NOW).map((r) => r.id)).toEqual(['h5']);
  });

  it('taking a purchase back out of the pantry', () => {
    // new pantry item: removed
    expect(undoPantry([pantryItem('חלב', 'fridge', 1, 'ליטר')], { id: 'חלב', created: true, qty: 1, unit: 'ליטר' })).toEqual({ remove: true });
    // added on top of stock: subtract
    const r = undoPantry([pantryItem('בצל', 'pantry', 5)], { id: 'בצל', created: false, qty: 2, prevQty: 3 }, 7);
    expect(r).toEqual({ data: { name: 'בצל', location: 'pantry', qty: 3, updatedAt: 7 } });
    // units changed by the purchase: put back what it said before
    const r2 = undoPantry([pantryItem('אורז', 'pantry', 1, 'ק"ג')], { id: 'אורז', created: false, qty: 1, unit: 'ק"ג', prevQty: 2, prevUnit: 'כוס' }, 7);
    expect(r2).toEqual({ data: { name: 'אורז', location: 'pantry', qty: 2, unit: 'כוס', updatedAt: 7 } });
    // already used up / deleted: nothing to do
    expect(undoPantry([], { id: 'x', created: true })).toBeNull();
  });

  it('rows hidden because the pantry has them are listed with what is at home', () => {
    const pantry = [pantryItem('בצל', 'pantry', 5), pantryItem('בזיליקום', 'fridge')];
    const covered = coveredByPantry(week, recipes, pantry);
    expect(covered.map((c) => c.name)).toEqual(expect.arrayContaining(['בצל', 'בזיליקום']));
    expect(covered.find((c) => c.name === 'בצל')).toMatchObject({ qty: 1, have: [pantry[0]] });
    expect(neededFromMenu(week, recipes, pantry).some((n) => n.name === 'בצל')).toBe(false);
    // skipped ones are not "at home", they're in the removed history
    expect(coveredByPantry({ ...week, skipped: [ingredientKey('בצל')] }, recipes, pantry).some((c) => c.name === 'בצל')).toBe(false);
  });
});

describe('kids and the shopping list', () => {
  it('kids can only suggest; parents decide', () => {
    expect(listPermissions(false)).toMatchObject({ check: false, remove: false, approve: false, addStatus: 'pending' });
    expect(listPermissions(true)).toMatchObject({ check: true, remove: true, approve: true, addStatus: 'active' });
    expect(newShoppingItem('במבה', 'kid2', false).status).toBe('pending');
    expect(newShoppingItem('במבה', 'mom', true).status).toBe('active');
  });
});

describe('pantry', () => {
  it('buying merges into an existing pantry item', () => {
    const pantry = [pantryItem('בשר טחון', 'freezer', 500, 'גרם')];
    const res = addToPantry(pantry, { name: 'בשר טחון', qty: 1, unit: 'ק"ג' }, 1);
    expect(res.id).toBe('בשר טחון');
    expect(res.data.qty).toBe(1500);
  });
  it('buying something new goes to its usual place', () => {
    expect(addToPantry([], { name: 'חזה עוף', qty: 700, unit: 'גרם' }).data.location).toBe('freezer');
    expect(addToPantry([], { name: 'יוגורט' }).data.location).toBe('fridge');
    expect(addToPantry([], { name: 'משהו חדש' }).data.location).toBe('pantry');
  });
  it('+/- steps and removal', () => {
    expect(bumpPantry(pantryItem('ביצים', 'fridge', 1), -1)).toBeNull();
    expect(bumpPantry(pantryItem('ביצים', 'fridge', 2), 1)).toBe(3);
    expect(bumpPantry(pantryItem('שום', 'pantry'), -1)).toBeNull();
    expect(bumpPantry(pantryItem('אורז', 'pantry', 1000, 'גרם'), -1)).toBe(750);
  });
});

describe('dinner ideas', () => {
  const recipeList: Recipe[] = SEED_RECIPES;
  it('ranks what can be made from the pantry first', () => {
    const pantry = ['ביצים', 'עגבניות', 'פלפל אדום', 'בצל', 'שום', 'רסק עגבניות', 'פטרוזיליה', 'לחם'].map((n) => pantryItem(n, 'pantry'));
    const ideas = dinnerIdeas(recipeList, pantry, DEFAULT_MEMBERS);
    expect(ideas[0].recipe.id).toBe('shakshuka');
    expect(ideas[0].missing).toEqual([]);
    expect(ideas[0].coverage).toBe(1);
  });
  it('filters quick, special and kid-friendly, and only dinner dishes by default', () => {
    const quick = dinnerIdeas(recipeList, [], DEFAULT_MEMBERS, { filter: 'quick' });
    expect(quick.every((i) => i.recipe.minutes <= 30)).toBe(true);
    expect(quick.every((i) => i.recipe.meals.includes('dinner'))).toBe(true);
    const special = dinnerIdeas(recipeList, [], DEFAULT_MEMBERS, { filter: 'special' });
    expect(special.some((i) => i.recipe.id === 'sushi')).toBe(true);
    const kids = dinnerIdeas(recipeList, [], DEFAULT_MEMBERS, { filter: 'kids' });
    expect(kids.some((i) => i.recipe.id === 'pizza')).toBe(true);
    const dairy = dinnerIdeas(recipeList, [], DEFAULT_MEMBERS, { kosher: 'dairy' });
    expect(dairy.every((i) => i.recipe.kosher === 'dairy')).toBe(true);
  });
  it('family ratings break ties', () => {
    const rated = recipeList.map((r) => (r.id === 'quesadilla' ? { ...r, ratings: { kid1: 5, kid2: 5 } } : r));
    const ideas = dinnerIdeas(rated, [], DEFAULT_MEMBERS, { filter: 'quick' });
    const q = ideas.findIndex((i) => i.recipe.id === 'quesadilla');
    const n = ideas.findIndex((i) => i.recipe.id === 'nachos');
    expect(q).toBeLessThan(n);
  });
  it('surfaces kids favourites', () => {
    const { recipes: demo, settings } = demoData(WED);
    const favs = kidsFavorites(demo, settings.members).map((r) => r.id);
    expect(favs).toContain('pizza');
    expect(favs).not.toContain('shakshuka');
  });
});

describe('thaw reminders', () => {
  const week = weekOf({
    wed: { dinner: { recipeIds: ['salmon-teriyaki'] } },
    thu: { lunch: { recipeIds: ['schnitzel'] }, dinner: { recipeIds: ['pizza'] } },
  });
  const get = (id: string) => (id === week.id ? week : undefined);

  it('warns in the evening about tomorrow', () => {
    const b = thawBanner(new Date(2026, 9, 21, 19, 0), get, recipes, [])!;
    expect(b.when).toBe('tomorrow');
    expect(b.text).toBe('להוציא מהמקפיא למחר: חזה עוף');
  });
  it('warns in the morning about today, and at noon only about dinner', () => {
    expect(thawBanner(WED, get, recipes, [])!.text).toContain('פילה סלמון');
    expect(thawBanner(new Date(2026, 9, 21, 12, 0), get, recipes, [])!.alerts.every((a) => a.meal === 'dinner')).toBe(true);
  });
  it('skips what is already in the fridge', () => {
    expect(thawBanner(new Date(2026, 9, 21, 19, 0), get, recipes, [pantryItem('חזה עוף', 'fridge', 700, 'גרם')])).toBeNull();
  });
  it('builds a plan by date for the nightly reminder', () => {
    const plan = thawPlan(WED, get, recipes, []);
    expect(Object.keys(plan.byDate)).toEqual(['2026-10-21', '2026-10-22']);
    expect(plan.byDate['2026-10-22'].meals).toEqual(['צהריים: שניצל אפוי בתנור']);
  });
});

describe('kids votes', () => {
  it('caps picks and shows whose wishes made the menu', () => {
    let v: string[] = [];
    for (const id of ['a', 'b', 'c', 'd', 'e', 'f']) v = toggleVote(v, id);
    expect(v).toHaveLength(5);
    expect(toggleVote(v, 'a')).not.toContain('a');
    const week = weekOf({ sun: { lunch: { recipeIds: ['pizza'] } } });
    const votes = [
      { id: '1', weekId: week.id, memberId: 'kid1', recipeIds: ['sushi'], wishes: ['ראמן'], updatedAt: 0 },
      { id: '2', weekId: week.id, memberId: 'kid2', recipeIds: ['pizza', 'tacos'], wishes: [], updatedAt: 0 },
    ];
    const s = wishSummary(week, votes, DEFAULT_MEMBERS);
    expect(s.map((x) => [x.member.id, x.included.length, x.wished.length])).toEqual([['kid1', 0, 1], ['kid2', 1, 2]]);
    expect(s[0].wishes).toEqual(['ראמן']);
  });
});
