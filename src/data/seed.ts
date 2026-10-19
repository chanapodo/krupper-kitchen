import { shiftWeek, weekIdOf } from '../lib/dates';
import type { Member, PantryItem, Recipe, Settings, ShoppingItem, Vote, Week } from '../lib/types';
import { SEED_RECIPES } from './recipes';

export const DEFAULT_MEMBERS: Member[] = [
  { id: 'mom', name: 'אמא', role: 'parent', emoji: '👩', color: '#FFD6C9' },
  { id: 'dad', name: 'אבא', role: 'parent', emoji: '👨', color: '#D4ECFF' },
  { id: 'kid1', name: 'ילד/ה גדול/ה', role: 'kid', emoji: '🦊', color: '#E3DBFF' },
  { id: 'kid2', name: 'ילד/ה קטן/ה', role: 'kid', emoji: '🐼', color: '#CDEFE3' },
];

export const DEFAULT_SETTINGS: Settings = {
  familyName: 'בישולי קרופרז',
  members: DEFAULT_MEMBERS,
  shabbat: false,
  pinSet: false,
};

/** Recipes for a brand-new family (real Firebase mode): no ratings yet. */
export function freshRecipes(now = Date.now()): Recipe[] {
  return SEED_RECIPES.map((r) => ({ ...r, createdAt: now }));
}

const DEMO_RATINGS: Record<string, Record<string, number>> = {
  schnitzel: { mom: 4, dad: 4, kid1: 5, kid2: 5 },
  pizza: { kid1: 5, kid2: 5, dad: 4 },
  tacos: { kid1: 5, kid2: 4, mom: 4 },
  sushi: { kid1: 5, mom: 5 },
  bolognese: { kid2: 5, kid1: 4, dad: 5 },
  'mac-cheese': { kid2: 5, kid1: 3 },
  shakshuka: { mom: 5, dad: 4, kid1: 3, kid2: 2 },
  curry: { mom: 5, dad: 4, kid1: 4 },
  'teriyaki-chicken': { kid1: 5, kid2: 4, mom: 4 },
  quesadilla: { kid2: 5, kid1: 4 },
  'lentil-soup': { mom: 4, kid2: 2 },
};

/** Everything the demo shows on first open, so it can be tried without setup. */
export function demoData(now = new Date()): {
  settings: Settings; recipes: Recipe[]; pantry: PantryItem[]; weeks: Week[]; votes: Vote[]; shopping: ShoppingItem[];
} {
  const t = now.getTime();
  const recipes = SEED_RECIPES.map((r) => ({ ...r, ratings: DEMO_RATINGS[r.id] ?? {}, createdAt: t }));
  const p = (id: string, name: string, location: PantryItem['location'], qty?: number, unit?: string): PantryItem => ({
    id, name, location, updatedAt: t, ...(qty !== undefined ? { qty } : {}), ...(unit ? { unit } : {}),
  });
  const pantry: PantryItem[] = [
    p('p1', 'ביצים', 'fridge', 8), p('p2', 'חלב', 'fridge', 1, 'ליטר'), p('p3', 'גבינה צהובה', 'fridge', 200, 'גרם'),
    p('p4', 'עגבניות', 'fridge', 5), p('p5', 'מלפפונים', 'fridge', 4), p('p6', 'גזר', 'fridge', 6),
    p('p7', 'חזה עוף', 'freezer', 1, 'ק"ג'), p('p8', 'בשר טחון', 'freezer', 500, 'גרם'), p('p9', 'פילה סלמון', 'freezer', 600, 'גרם'),
    p('p10', 'אפונה', 'freezer'), p('p11', 'אורז', 'pantry', 1, 'ק"ג'), p('p12', 'פסטה', 'pantry', 2), p('p13', 'ספגטי', 'pantry', 1),
    p('p14', 'עגבניות מרוסקות', 'pantry', 2), p('p15', 'בצל', 'pantry', 6), p('p16', 'שום', 'pantry'), p('p17', 'תפוחי אדמה', 'pantry', 6),
    p('p18', 'טורטיות', 'pantry', 10), p('p19', 'תירס בקופסה', 'pantry', 2), p('p20', 'רוטב טריאקי', 'pantry'),
  ];
  const cur = weekIdOf(now);
  const next = shiftWeek(cur, 1);
  const weeks: Week[] = [
    {
      id: cur,
      skipped: [],
      days: {
        sun: { lunch: { recipeIds: ['schnitzel'] }, dinner: { recipeIds: ['shakshuka'] } },
        mon: { lunch: { recipeIds: ['bolognese'] }, dinner: { recipeIds: ['quesadilla'] } },
        tue: { lunch: { recipeIds: ['roast-chicken'] }, dinner: { recipeIds: ['fried-rice'] } },
        wed: { lunch: { recipeIds: ['teriyaki-chicken'] }, dinner: { recipeIds: ['pizza'] } },
        thu: { lunch: { recipeIds: ['meatballs'] }, dinner: { recipeIds: ['salmon-teriyaki'] } },
        fri: { lunch: { recipeIds: ['tacos'] }, dinner: { recipeIds: ['lentil-soup'] } },
      },
    },
    { id: next, skipped: [], days: { sun: { lunch: { recipeIds: ['shawarma'] } } } },
  ];
  const votes: Vote[] = [
    { id: `${next}_kid1`, weekId: next, memberId: 'kid1', recipeIds: ['sushi', 'tacos', 'curry'], wishes: ['ראמן כמו במסעדה'], updatedAt: t },
    { id: `${next}_kid2`, weekId: next, memberId: 'kid2', recipeIds: ['pizza', 'mac-cheese', 'schnitzel'], wishes: [], updatedAt: t },
  ];
  const shopping: ShoppingItem[] = [
    { id: 's1', name: 'בננות', aisle: 'ירקות ופירות', status: 'active', addedBy: 'mom', createdAt: t },
    { id: 's2', name: 'במבה', aisle: 'חטיפים ומשקאות', status: 'pending', addedBy: 'kid2', createdAt: t },
  ];
  return { settings: { ...structuredClone(DEFAULT_SETTINGS) }, recipes, pantry, weeks, votes, shopping };
}
