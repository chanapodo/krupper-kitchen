import {
  aisleOf, AISLES, defaultLocation, displayName, ingredientKey, isStaple, needsThaw,
} from '../data/catalog';
import { addDays, dateOf, DAY_KEYS, dayKeyOf, shiftWeek, weekIdOf, ymd } from './dates';
import { canon } from './units';
import type {
  DayKey, Ingredient, Kosher, MealType, Member, PantryItem, Recipe, ShoppingItem, ThawPlan, Vote, Week,
} from './types';

export const MEAL_NAMES: Record<MealType, string> = { lunch: 'צהריים', dinner: 'ערב' };

// ---------- ingredients ----------

/** Aisle of a recipe ingredient: the catalog's, else what the recipe says. */
export function ingAisle(i: Ingredient): string {
  const a = aisleOf(i.name);
  return a === 'אחר' && i.aisle ? i.aisle : a;
}

export function ingThaw(i: Ingredient): boolean {
  return needsThaw(i.name) || !!i.thaw;
}

/** Recipes the family can use (kids' pending suggestions excluded). */
export function approved(recipes: Recipe[]): Recipe[] {
  return recipes.filter((r) => r.status !== 'pending');
}

// ---------- kosher ----------

/** Meat and dairy never go in the same meal; parve goes with anything. */
export function kosherCompatible(a: Kosher, b: Kosher): boolean {
  return a === 'parve' || b === 'parve' || a === b;
}

/** The kosher type a slot already has (meat/dairy wins over parve). */
export function slotKosher(recipeIds: string[], recipes: Map<string, Recipe>): Kosher {
  let k: Kosher = 'parve';
  for (const id of recipeIds) {
    const r = recipes.get(id);
    if (r && r.kosher !== 'parve') k = r.kosher;
  }
  return k;
}

export function canAddToSlot(recipe: Recipe, recipeIds: string[], recipes: Map<string, Recipe>): boolean {
  return kosherCompatible(recipe.kosher, slotKosher(recipeIds, recipes));
}

// ---------- week helpers ----------

export function emptyWeek(id: string): Week {
  return { id, days: {}, skipped: [] };
}

export function weekDays(shabbat: boolean): DayKey[] {
  return shabbat ? DAY_KEYS : DAY_KEYS.slice(0, 6);
}

/** All recipe ids planned in a week (repeats kept, so a dish cooked twice counts twice). */
export function plannedRecipeIds(week: Week | undefined): string[] {
  if (!week) return [];
  const ids: string[] = [];
  for (const day of DAY_KEYS) {
    const d = week.days[day];
    if (!d) continue;
    for (const meal of ['lunch', 'dinner'] as MealType[]) ids.push(...(d[meal]?.recipeIds ?? []));
  }
  return ids;
}

// ---------- pantry ----------

export function pantryIndex(pantry: PantryItem[]): Map<string, PantryItem[]> {
  const m = new Map<string, PantryItem[]>();
  for (const p of pantry) {
    const k = ingredientKey(p.name);
    m.set(k, [...(m.get(k) ?? []), p]);
  }
  return m;
}

/** Is there some of this ingredient at home? (an item with no quantity counts as "yes") */
export function haveAtHome(name: string, idx: Map<string, PantryItem[]>): boolean {
  if (isStaple(name)) return true;
  return (idx.get(ingredientKey(name)) ?? []).some((p) => p.qty === undefined || p.qty === null || p.qty > 0);
}

/**
 * What to write to the pantry when something is bought.
 * Merges into an existing item of the same ingredient when the units allow it.
 */
export function addToPantry(
  pantry: PantryItem[],
  item: { name: string; qty?: number; unit?: string },
  now = Date.now(),
): { id?: string; data: Omit<PantryItem, 'id'> } {
  const key = ingredientKey(item.name);
  const existing = pantry.find((p) => ingredientKey(p.name) === key);
  const add = canon(item.qty, item.unit);
  if (existing) {
    const cur = canon(existing.qty, existing.unit);
    let qty: number | undefined;
    let unit: string | undefined;
    if (cur.qty !== undefined && add.qty !== undefined && cur.unit === add.unit) {
      qty = cur.qty + add.qty;
      unit = cur.unit;
    } else if (add.qty !== undefined) {
      qty = add.qty;
      unit = add.unit;
    } else {
      qty = cur.qty;
      unit = cur.unit;
    }
    return {
      id: existing.id,
      data: { name: existing.name, location: existing.location, qty, ...(unit ? { unit } : {}), updatedAt: now },
    };
  }
  return {
    data: {
      name: displayName(item.name),
      location: defaultLocation(item.name),
      ...(add.qty !== undefined ? { qty: add.qty } : {}),
      ...(add.unit ? { unit: add.unit } : {}),
      updatedAt: now,
    },
  };
}

/** Change a pantry quantity by +-1 step; returns null when the item should be removed. */
export function bumpPantry(item: PantryItem, dir: 1 | -1): number | null | undefined {
  if (item.qty === undefined || item.qty === null) return dir < 0 ? null : 1;
  const step = item.unit === 'גרם' || item.unit === 'מ"ל' ? (item.qty > 250 || dir > 0 ? 250 : item.qty) : 1;
  const next = item.qty + dir * step;
  return next <= 0 ? null : next;
}

// ---------- shopping list ----------

export interface NeededItem {
  key: string;
  name: string;
  qty?: number;
  unit?: string;
  aisle: string;
  recipes: string[];
}

/**
 * The automatic part of the shopping list: everything the week's menu needs,
 * minus what's in the pantry, minus what a parent skipped or already listed by hand.
 */
export function neededFromMenu(
  week: Week | undefined,
  recipes: Map<string, Recipe>,
  pantry: PantryItem[],
  manual: ShoppingItem[] = [],
): NeededItem[] {
  const totals = new Map<string, NeededItem & { unknownQty: boolean }>();
  for (const rid of plannedRecipeIds(week)) {
    const r = recipes.get(rid);
    if (!r) continue;
    for (const ing of r.ingredients) {
      if (isStaple(ing.name)) continue;
      const key = ingredientKey(ing.name);
      const c = canon(ing.qty, ing.unit);
      // different units of the same thing are kept apart ("2 כוסות" vs "300 גרם")
      const tkey = `${key}|${c.unit}`;
      const cur = totals.get(tkey);
      if (cur) {
        if (c.qty === undefined) cur.unknownQty = true;
        else cur.qty = (cur.qty ?? 0) + c.qty;
        if (!cur.recipes.includes(r.title)) cur.recipes.push(r.title);
      } else {
        totals.set(tkey, {
          key, name: displayName(ing.name), qty: c.qty, unit: c.unit || undefined,
          aisle: ingAisle(ing), recipes: [r.title], unknownQty: c.qty === undefined,
        });
      }
    }
  }

  const idx = pantryIndex(pantry);
  const skipped = new Set(week?.skipped ?? []);
  const listed = new Set(manual.filter((m) => m.status !== 'bought').map((m) => ingredientKey(m.name)));
  const out: NeededItem[] = [];
  for (const t of totals.values()) {
    if (skipped.has(t.key) || listed.has(t.key)) continue;
    const stock = idx.get(t.key) ?? [];
    let qty = t.unknownQty ? undefined : t.qty;
    let covered = false;
    for (const p of stock) {
      const pc = canon(p.qty, p.unit);
      if (pc.qty === undefined || pc.unit !== (t.unit ?? '') || qty === undefined) {
        // some at home and we can't compare amounts -> assume it's enough
        if (pc.qty === undefined || pc.qty > 0) covered = true;
      } else {
        qty -= pc.qty;
      }
    }
    if (covered || (qty !== undefined && qty <= 0)) continue;
    out.push({ key: t.key, name: t.name, qty, unit: t.unit, aisle: t.aisle, recipes: t.recipes });
  }
  return out;
}

export interface ListRow {
  id: string; // "menu:<key>" for automatic rows, item id for manual ones
  name: string;
  qty?: number;
  unit?: string;
  aisle: string;
  fromMenu: boolean;
  recipes?: string[];
  item?: ShoppingItem;
}

/** Rows grouped by store aisle, in walking order. Pending suggestions are not included. */
export function groupByAisle(rows: ListRow[]): { aisle: string; rows: ListRow[] }[] {
  const groups = new Map<string, ListRow[]>();
  for (const r of rows) groups.set(r.aisle, [...(groups.get(r.aisle) ?? []), r]);
  const order = (a: string) => {
    const i = (AISLES as readonly string[]).indexOf(a);
    return i < 0 ? AISLES.length : i;
  };
  return [...groups.entries()]
    .sort((a, b) => order(a[0]) - order(b[0]))
    .map(([aisle, rs]) => ({ aisle, rows: rs.sort((x, y) => x.name.localeCompare(y.name, 'he')) }));
}

export function buildList(
  week: Week | undefined,
  recipes: Map<string, Recipe>,
  pantry: PantryItem[],
  items: ShoppingItem[],
): { groups: { aisle: string; rows: ListRow[] }[]; pending: ShoppingItem[] } {
  const active = items.filter((i) => i.status === 'active');
  const rows: ListRow[] = [
    ...neededFromMenu(week, recipes, pantry, items.filter((i) => i.status !== 'pending')).map((n) => ({
      id: `menu:${n.key}`, name: n.name, qty: n.qty, unit: n.unit, aisle: n.aisle, fromMenu: true, recipes: n.recipes,
    })),
    ...active.map((i) => ({ id: i.id, name: i.name, qty: i.qty, unit: i.unit, aisle: i.aisle, fromMenu: false, item: i })),
  ];
  return {
    groups: groupByAisle(rows),
    pending: items.filter((i) => i.status === 'pending').sort((a, b) => a.createdAt - b.createdAt),
  };
}

/** Who may do what on the shopping list. Kids only suggest; parents decide. */
export const listPermissions = (isParent: boolean) => ({
  check: isParent,
  remove: isParent,
  approve: isParent,
  addStatus: (isParent ? 'active' : 'pending') as ShoppingItem['status'],
});

export function newShoppingItem(
  name: string, addedBy: string, isParent: boolean, qty?: number, unit?: string, now = Date.now(),
): Omit<ShoppingItem, 'id'> {
  return {
    name: displayName(name),
    aisle: aisleOf(name),
    status: listPermissions(isParent).addStatus,
    addedBy,
    createdAt: now,
    ...(qty !== undefined ? { qty } : {}),
    ...(unit ? { unit } : {}),
  };
}

// ---------- ratings ----------

export function avgRating(r: Recipe, memberIds?: string[]): number | undefined {
  const vals = Object.entries(r.ratings ?? {})
    .filter(([id]) => !memberIds || memberIds.includes(id))
    .map(([, v]) => v);
  if (!vals.length) return undefined;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

export function kidIds(members: Member[]): string[] {
  return members.filter((m) => m.role === 'kid').map((m) => m.id);
}

export function kidsFavorites(recipes: Recipe[], members: Member[], min = 4): Recipe[] {
  const kids = kidIds(members);
  return recipes
    .map((r) => ({ r, a: avgRating(r, kids) }))
    .filter((x) => x.a !== undefined && x.a >= min)
    .sort((a, b) => (b.a ?? 0) - (a.a ?? 0))
    .map((x) => x.r);
}

// ---------- dinner ideas ----------

export type IdeaFilter = 'all' | 'quick' | 'special' | 'kids';

export interface Idea {
  recipe: Recipe;
  have: string[];
  missing: string[];
  coverage: number; // 0..1, non-staple ingredients at home
  rating?: number;
  score: number;
}

export function isSpecial(r: Recipe): boolean {
  return r.tags.includes('מיוחד') || (r.cuisine !== 'ישראלי' && r.difficulty >= 2);
}

export function isKidFriendly(r: Recipe, members: Member[]): boolean {
  const k = avgRating(r, kidIds(members));
  return r.kidsCanHelp || r.tags.includes('ילדים אוהבים') || (k !== undefined && k >= 4);
}

export function dinnerIdeas(
  recipes: Recipe[],
  pantry: PantryItem[],
  members: Member[],
  opts: { filter?: IdeaFilter; meal?: MealType | 'any'; kosher?: Kosher | 'any' } = {},
): Idea[] {
  const idx = pantryIndex(pantry);
  const { filter = 'all', meal = 'dinner', kosher = 'any' } = opts;
  const ideas: Idea[] = [];
  for (const r of recipes) {
    if (meal !== 'any' && !r.meals.includes(meal)) continue;
    if (kosher !== 'any' && r.kosher !== kosher) continue;
    if (filter === 'quick' && r.minutes > 30) continue;
    if (filter === 'special' && !isSpecial(r)) continue;
    if (filter === 'kids' && !isKidFriendly(r, members)) continue;
    const seen = new Set<string>();
    const have: string[] = [];
    const missing: string[] = [];
    for (const ing of r.ingredients) {
      if (isStaple(ing.name)) continue;
      const k = ingredientKey(ing.name);
      if (seen.has(k)) continue;
      seen.add(k);
      (haveAtHome(ing.name, idx) ? have : missing).push(displayName(ing.name));
    }
    const total = have.length + missing.length;
    const coverage = total ? have.length / total : 1;
    const rating = avgRating(r);
    // what's at home matters most; family love breaks ties; each missing item costs a little
    const score = coverage * 70 + ((rating ?? 3) / 5) * 30 - missing.length * 2;
    ideas.push({ recipe: r, have, missing, coverage, rating, score });
  }
  return ideas.sort((a, b) => b.score - a.score || a.recipe.minutes - b.recipe.minutes);
}

// ---------- thawing ----------

export interface ThawAlert {
  date: string;
  meal: MealType;
  recipe: string;
  items: string[];
}

/** Frozen meat/chicken/fish in the meals of one date (not counting what is already in the fridge). */
export function thawForDate(
  date: Date,
  getWeek: (id: string) => Week | undefined,
  recipes: Map<string, Recipe>,
  pantry: PantryItem[],
): ThawAlert[] {
  const week = getWeek(weekIdOf(date));
  const day = week?.days[dayKeyOf(date)];
  if (!day) return [];
  const inFridge = new Set(
    pantry.filter((p) => p.location === 'fridge' && (p.qty === undefined || p.qty > 0)).map((p) => ingredientKey(p.name)),
  );
  const out: ThawAlert[] = [];
  for (const meal of ['lunch', 'dinner'] as MealType[]) {
    for (const rid of day[meal]?.recipeIds ?? []) {
      const r = recipes.get(rid);
      if (!r) continue;
      const items = [
        ...new Set(r.ingredients.filter((i) => ingThaw(i) && !inFridge.has(ingredientKey(i.name))).map((i) => displayName(i.name))),
      ];
      if (items.length) out.push({ date: ymd(date), meal, recipe: r.title, items });
    }
  }
  return out;
}

export function recipeNeedsThaw(r: Recipe): boolean {
  return r.ingredients.some(ingThaw);
}

export interface ThawBanner {
  when: 'tomorrow' | 'today';
  date: string;
  alerts: ThawAlert[];
  text: string;
}

export function thawText(alerts: ThawAlert[], when: 'tomorrow' | 'today'): string {
  const items = [...new Set(alerts.flatMap((a) => a.items))];
  return when === 'tomorrow'
    ? `להוציא מהמקפיא למחר: ${items.join(', ')}`
    : `להוציא עכשיו מהמקפיא: ${items.join(', ')}`;
}

/**
 * The banner on the home screen: from 15:00 it warns about tomorrow's meals,
 * in the morning about today's, and around noon about tonight's dinner.
 */
export function thawBanner(
  now: Date,
  getWeek: (id: string) => Week | undefined,
  recipes: Map<string, Recipe>,
  pantry: PantryItem[],
): ThawBanner | null {
  const h = now.getHours();
  if (h >= 15) {
    const tomorrow = addDays(now, 1);
    const alerts = thawForDate(tomorrow, getWeek, recipes, pantry);
    return alerts.length ? { when: 'tomorrow', date: ymd(tomorrow), alerts, text: thawText(alerts, 'tomorrow') } : null;
  }
  let alerts = thawForDate(now, getWeek, recipes, pantry);
  if (h >= 11) alerts = alerts.filter((a) => a.meal === 'dinner');
  return alerts.length ? { when: 'today', date: ymd(now), alerts, text: thawText(alerts, 'today') } : null;
}

/** Thaw needs for the coming days, saved to Firestore so a nightly reminder can read it. */
export function thawPlan(
  now: Date,
  getWeek: (id: string) => Week | undefined,
  recipes: Map<string, Recipe>,
  pantry: PantryItem[],
  days = 8,
): ThawPlan {
  const byDate: ThawPlan['byDate'] = {};
  for (let i = 0; i < days; i++) {
    const d = addDays(now, i);
    const alerts = thawForDate(d, getWeek, recipes, pantry);
    if (!alerts.length) continue;
    byDate[ymd(d)] = {
      text: thawText(alerts, 'tomorrow'),
      items: [...new Set(alerts.flatMap((a) => a.items))],
      meals: alerts.map((a) => `${MEAL_NAMES[a.meal]}: ${a.recipe}`),
    };
  }
  return { byDate, updatedAt: now.getTime() };
}

// ---------- kids' votes ----------

export function voteCounts(votes: Vote[], weekId: string): Map<string, string[]> {
  const m = new Map<string, string[]>();
  for (const v of votes) {
    if (v.weekId !== weekId) continue;
    for (const rid of v.recipeIds) m.set(rid, [...(m.get(rid) ?? []), v.memberId]);
  }
  return m;
}

export interface WishSummary {
  member: Member;
  wished: string[];
  included: string[];
  wishes: string[];
}

/** For each kid: which of their picks made it into the menu, so nobody is left out. */
export function wishSummary(week: Week | undefined, votes: Vote[], members: Member[]): WishSummary[] {
  const planned = new Set(plannedRecipeIds(week));
  return members
    .filter((m) => m.role === 'kid')
    .map((member) => {
      const v = votes.find((x) => x.weekId === week?.id && x.memberId === member.id);
      const wished = v?.recipeIds ?? [];
      return { member, wished, included: wished.filter((id) => planned.has(id)), wishes: v?.wishes ?? [] };
    });
}

export const MAX_VOTES = 5;

export function toggleVote(current: string[], recipeId: string, max = MAX_VOTES): string[] {
  if (current.includes(recipeId)) return current.filter((x) => x !== recipeId);
  if (current.length >= max) return current;
  return [...current, recipeId];
}

/** The week kids vote for: next week, since this one is usually already planned. */
export function votingWeekId(now = new Date()): string {
  return shiftWeek(weekIdOf(now), 1);
}

export { dateOf };
