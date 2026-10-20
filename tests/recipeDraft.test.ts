import fixture from './fixtures/gemini-shepherds-pie.txt?raw';
import linkFixture from './fixtures/gemini-link-heninthekitchen.txt?raw';
import { describe, expect, it } from 'vitest';
import { ingredientKey } from '../src/data/catalog';
import { MOCK_AI } from '../src/data/mockAi';
import { weekIdOf } from '../src/lib/dates';
import { neededFromMenu, recipeNeedsThaw, thawBanner } from '../src/lib/logic';
import {
  draftFromAi, DraftError, emojiFor, extractJson, guessKosher, isUrl, knowledgePrompt, kosherConflict,
  linkPrompt, matchRecipes, nameOnlyRecipe, normalizeIngredientName, normalizeUnit,
} from '../src/lib/recipeDraft';
import { SEED_RECIPES } from '../src/data/recipes';
import type { PantryItem, Recipe, Week } from '../src/lib/types';

describe('extracting JSON from model replies', () => {
  it('handles fences, prose and trailing commas', () => {
    expect(extractJson('```json\n{"a": 1}\n```')).toEqual({ a: 1 });
    expect(extractJson('הנה המתכון:\n{"a": [1, 2,],}\nבתיאבון!')).toEqual({ a: [1, 2] });
    expect(() => extractJson('אין לי מושג')).toThrow(DraftError);
    expect(() => extractJson('{not json at all}')).toThrow(DraftError);
  });
});

describe('ingredient name normalization', () => {
  it('maps to the names the pantry and list already use', () => {
    expect(normalizeIngredientName('בשר בקר טחון')).toBe('בשר טחון');
    expect(normalizeIngredientName('בצל גדול קצוץ')).toBe('בצל');
    expect(normalizeIngredientName('ביצה')).toBe('ביצים');
    expect(normalizeIngredientName('2 שיני שום כתושות (לא חובה)')).toBe('שום');
    expect(normalizeIngredientName('תפוחי אדמה בינוניים')).toBe('תפוחי אדמה');
    expect(normalizeIngredientName('פפריקה מתוקה')).toBe('פפריקה');
    expect(normalizeIngredientName('אפונה קפואה')).toBe('אפונה');
    expect(normalizeIngredientName('שמן זית')).toBe('שמן זית');
  });
  it('falls back to family names, then to the cleaned text', () => {
    expect(normalizeIngredientName('במבה', ['במבה'])).toBe('במבה');
    expect(normalizeIngredientName('ציר בקר טרי')).toBe('ציר בקר');
    expect(normalizeIngredientName('שמנת')).toBe('שמנת');
  });
  it('units', () => {
    expect(normalizeUnit('קג')).toBe('ק"ג');
    expect(normalizeUnit('כפות')).toBe('כף');
    expect(normalizeUnit('יח׳')).toBeUndefined();
    expect(normalizeUnit('tbsp')).toBe('כף');
    expect(normalizeUnit('')).toBeUndefined();
  });
});

describe('AI reply -> recipe draft', () => {
  const draft = draftFromAi(MOCK_AI['פאי רועים'], { fallbackName: 'פאי רועים' });

  it('builds a complete, normalized recipe', () => {
    expect(draft.title).toBe('פאי רועים');
    expect(draft.kosher).toBe('meat');
    expect(draft.difficulty).toBe(2);
    expect(draft.minutes).toBe(70);
    expect(draft.emoji).toBe('🥧');
    expect(draft.steps[0].startsWith('מבשלים')).toBe(true); // "1." stripped
    const names = draft.ingredients.map((i) => i.name);
    expect(names).toEqual(expect.arrayContaining(['בשר טחון', 'בצל', 'גזר', 'אפונה', 'תפוחי אדמה', 'ציר בקר']));
    expect(draft.ingredients.find((i) => i.name === 'תפוחי אדמה')).toMatchObject({ qty: 1, unit: 'ק"ג' });
    expect(draft.ingredients.find((i) => i.name === 'גזר')).toEqual({ name: 'גזר', qty: 2 });
    // catalog knows beef needs thawing; unknown items keep the AI's aisle
    expect(draft.ingredients.find((i) => i.name === 'בשר טחון')?.thaw).toBeUndefined();
    expect(draft.ingredients.find((i) => i.name === 'ציר בקר')?.aisle).toBe('תבלינים ואפייה');
    expect(draft.sources).toEqual(['https://www.example.co.il/shepherds-pie']);
    expect(draft.link).toBe('https://www.example.co.il/shepherds-pie');
  });

  it('feeds the shopping list (minus pantry) and the thaw reminder', () => {
    const r: Recipe = { ...draft, id: 'pie' };
    const recipes = new Map([[r.id, r]]);
    const tue = new Date(2026, 9, 20, 9);
    const week: Week = { id: weekIdOf(tue), days: { tue: { dinner: { recipeIds: ['pie'] } } }, skipped: [] };
    const pantry: PantryItem[] = [{ id: 'b', name: 'בשר טחון', qty: 500, unit: 'גרם', mode: 'count', location: 'freezer', updatedAt: 0 }];
    const need = neededFromMenu(week, recipes, pantry);
    expect(need.find((n) => n.key === ingredientKey('בשר טחון'))?.qty).toBe(100);
    expect(need.find((n) => n.name === 'ציר בקר')?.aisle).toBe('תבלינים ואפייה');
    expect(need.find((n) => n.name === 'מלח')).toBeUndefined();
    expect(recipeNeedsThaw(r)).toBe(true);
    expect(thawBanner(new Date(2026, 9, 19, 19), () => week, recipes, [])?.text).toBe('להוציא מהמקפיא למחר: בשר טחון');
  });

  it('trusts the AI thaw flag only for unknown proteins', () => {
    const d = draftFromAi({ name: 'x', steps: ['a'], ingredients: [{ name: 'פילה ברמונדי', frozenProtein: true }, { name: 'נקניקיות', frozenProtein: true }] }, { fallbackName: 'x' });
    expect(d.ingredients.find((i) => i.name === 'פילה ברמונדי')?.thaw).toBe(true);
    expect(d.ingredients.find((i) => i.name === 'נקניקיות')?.thaw).toBeUndefined();
  });

  it('merges duplicates, parses fractions, guesses kosher when missing', () => {
    const d = draftFromAi({
      name: 'פסטה שמנת', steps: ['מבשלים'],
      ingredients: [{ name: 'שמנת מתוקה', qty: '½', unit: 'כוס' }, { name: 'שמנת מתוקה', qty: '1/2', unit: 'כוס' }, { name: 'פסטה', qty: '500', unit: 'גר' }],
    }, { fallbackName: '' });
    expect(d.ingredients.find((i) => i.name === 'שמנת מתוקה')).toMatchObject({ qty: 1, unit: 'כוס' });
    expect(d.ingredients.find((i) => i.name === 'פסטה')).toMatchObject({ qty: 500, unit: 'גרם' });
    expect(d.kosher).toBe('dairy');
    expect(guessKosher([{ name: 'חלב קוקוס' }])).toBe('parve');
  });

  it('flags meat+dairy and refuses empty or "no recipe" replies', () => {
    expect(kosherConflict({ ...draft, ingredients: [...draft.ingredients, { name: 'חמאה' }] })).toEqual(['חמאה']);
    expect(kosherConflict(draft)).toEqual([]);
    expect(() => draftFromAi({ error: 'no-recipe' }, { fallbackName: 'x' })).toThrow(DraftError);
    expect(() => draftFromAi({ name: 'x', ingredients: [], steps: [] }, { fallbackName: 'x' })).toThrow(DraftError);
  });

  it('links: YouTube becomes the video, a site becomes the link', () => {
    const yt = draftFromAi(MOCK_AI['ראמן'], { fallbackName: '', link: 'https://youtu.be/abcdefghijk' });
    expect(yt.videoUrl).toBe('https://youtu.be/abcdefghijk');
    const site = draftFromAi(MOCK_AI['ראמן'], { fallbackName: '', link: 'https://www.10dakot.co.il/ramen' });
    expect(site.link).toBe('https://www.10dakot.co.il/ramen');
    expect(site.videoUrl).toBeUndefined();
  });

  it('parses a real Gemini reply (saved fixture)', () => {
    const text = fixture;
    const d = draftFromAi(extractJson(text), { fallbackName: 'פאי רועים' });
    expect(d.kosher).toBe('meat');
    expect(d.ingredients.map((i) => i.name)).toEqual(expect.arrayContaining(['תפוחי אדמה', 'בשר טחון', 'בצל', 'ביצים', 'פפריקה', 'אפונה']));
    expect(d.ingredients.find((i) => i.name === 'בצל')?.unit).toBeUndefined();
    expect(d.steps.length).toBeGreaterThan(4);
  });

  it('parses a real link reply with unescaped ק"ג (gemini-3.5-flash-lite + URL context)', () => {
    const link = 'https://heninthekitchen.com/blog/2021/12/15/%D7%A4%D7%90%D7%99-%D7%A8%D7%95%D7%A2%D7%99%D7%9D/';
    const d = draftFromAi(extractJson(linkFixture), { fallbackName: '', link });
    expect(d.title).toBe('פאי רועים');
    expect(d.kosher).toBe('meat');
    expect(d.ingredients.find((i) => i.name === 'תפוחי אדמה')).toMatchObject({ qty: 1.5, unit: 'ק"ג' });
    expect(d.ingredients.map((i) => i.name)).toEqual(expect.arrayContaining(['בשר טחון', 'סלרי', 'ראס אל חנות']));
    expect(d.link).toBe(link);
    expect(extractJson('{"a": "ק"ג", "b": "צה"ל"}')).toEqual({ a: 'ק"ג', b: 'צה"ל' });
  });
});

describe('helpers', () => {
  it('name-only recipes, emoji, urls, prompts', () => {
    expect(nameOnlyRecipe(' פאי רועים ', 'meat', 'dinner')).toMatchObject({ title: 'פאי רועים', kosher: 'meat', meals: ['dinner'], ingredients: [] });
    expect(emojiFor('מרק עוף')).toBe('🥣');
    expect(isUrl('https://youtu.be/x1')).toBe(true);
    expect(isUrl('פאי רועים')).toBe(false);
    expect(knowledgePrompt('פאי רועים')).toContain('"פאי רועים"');
    expect(knowledgePrompt('פאי')).toContain('sources: [] (ריק)');
    expect(linkPrompt('https://a.b/c')).toContain('ואל תמציא/י');
  });
  it('free-text search ignores spaces and geresh', () => {
    expect(matchRecipes('שקשוקה', SEED_RECIPES).map((r) => r.id)).toEqual(['shakshuka']);
    expect(matchRecipes('צילי', SEED_RECIPES).map((r) => r.id)).toContain('chili');
    expect(matchRecipes('פאי רועים', SEED_RECIPES)).toEqual([]);
  });
});
