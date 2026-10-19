import { AISLES, CATALOG, lookup, normalize } from '../data/catalog';
import type { Ingredient, Kosher, MealType, Recipe } from './types';

/** What we ask the AI to return (also the shape of the demo mock). */
export interface AiRecipe {
  name: string;
  ingredients: { name: string; qty?: number | string | null; unit?: string | null; aisle?: string | null; frozenProtein?: boolean | null }[];
  steps: string[];
  minutes?: number | string | null;
  difficulty?: number | string | null;
  kosher?: string | null;
  meals?: string[] | null;
  cuisine?: string | null;
  tags?: string[] | null;
  sources?: string[] | null;
  videoUrl?: string | null;
}

export class DraftError extends Error {}

const UNITS = ['גרם', 'ק"ג', 'מ"ל', 'ליטר', 'כוס', 'כף', 'כפית', 'קופסה', 'שיניים', 'חבילה', 'יחידות'];

const SHAPE = `{
  "name": "שם המנה בעברית",
  "ingredients": [{"name": "שם המצרך בעברית, בלי תיאורים", "qty": 500, "unit": "גרם", "aisle": "בשר ועוף", "frozenProtein": true}],
  "steps": ["שלב 1", "שלב 2"],
  "minutes": 45,
  "difficulty": 1,
  "kosher": "meat",
  "meals": ["lunch", "dinner"],
  "cuisine": "בריטי",
  "tags": ["ילדים אוהבים"],
  "sources": ["https://..."],
  "videoUrl": null
}`;

const RULES = `כללים:
- הכול בעברית. שם כל מצרך קצר ופשוט, כמו ברשימת קניות (למשל "בשר טחון", "תפוחי אדמה", "בצל"), בלי "קצוץ"/"גדול"/"טרי".
- unit אחת מאלה: ${UNITS.join(', ')}. qty מספר, או null אם "לפי הטעם".
- aisle אחד מאלה: ${AISLES.join(', ')}.
- frozenProtein = true רק לבשר, עוף או דג שבדרך כלל שומרים במקפיא וצריך להפשיר.
- difficulty: 1 קל, 2 בינוני, 3 מאתגר. minutes: זמן כולל בדקות.
- kosher: "meat" אם יש בשר או עוף, "dairy" אם יש חלב, חמאה, גבינה או שמנת, אחרת "parve". המטבח כשר: לעולם לא לערבב בשר וחלב – אם המתכון המקורי מערבב, להחליף (למשל חמאה ← שמן זית או מרגרינה, חלב ← חלב סויה או ציר) ולציין בשלבים.
- meals: "lunch" ו/או "dinner".
- sources: כתובות המקור שמהן לקחת את המתכון.
- להחזיר JSON אחד בלבד, בלי טקסט לפניו או אחריו, בצורה הזו:
${SHAPE}`;

export function findPrompt(dish: string): string {
  return `מצא/י באינטרנט מתכון ביתי מוצלח ומדורג היטב, רצוי מאתר מתכונים ישראלי בעברית, למנה: "${dish}".
מתאים למשפחה עם ילדים בני 8 ו־12.
${RULES}`;
}

/** Without web search: the model writes a classic version from what it knows. */
export function knowledgePrompt(dish: string): string {
  return `כתוב/י מתכון ביתי מוצלח וקלאסי, כמו שמופיע באתרי מתכונים ישראליים, למנה: "${dish}".
מתאים למשפחה עם ילדים בני 8 ו־12. אם אינך מכיר/ה מנה בשם הזה, החזר/י {"error": "no-recipe"}.
${RULES.replace(/- sources:.*\n/, '- sources: [] (ריק).\n')}`;
}

export function linkPrompt(url: string, viaSearch: boolean): string {
  return `${viaSearch ? 'חפש/י ופתח/י את' : 'קרא/י את'} המתכון בכתובת הזו: ${url}
חלץ/י ממנו את המתכון (אם זה סרטון – לפי מה שמוכן בסרטון ובתיאור שלו), ותרגם/י לעברית אם צריך.
אם אין בכתובת מתכון, החזר/י {"error": "no-recipe"}.
${RULES}`;
}

/** Pull the JSON object out of a model reply (which may wrap it in ``` fences or prose). */
export function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fenced ? fenced[1] : text;
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  if (start < 0 || end <= start) throw new DraftError('no-json');
  const raw = body.slice(start, end + 1);
  try {
    return JSON.parse(raw);
  } catch {
    // common slips: trailing commas, smart quotes
    try {
      return JSON.parse(raw.replace(/,\s*([}\]])/g, '$1').replace(/[“”]/g, '"'));
    } catch {
      throw new DraftError('bad-json');
    }
  }
}

const DESCRIPTORS = new Set([
  'קצוץ', 'קצוצה', 'קצוצים', 'קצוצות', 'גדול', 'גדולה', 'גדולים', 'גדולות', 'בינוני', 'בינונית', 'בינוניים', 'בינוניות',
  'קטן', 'קטנה', 'קטנים', 'קטנות', 'טרי', 'טרייה', 'טריה', 'טריים', 'טריות', 'מגורר', 'מגוררת', 'מגוררים', 'פרוס', 'פרוסה',
  'פרוסים', 'פרוסות', 'כתוש', 'כתושה', 'כתושים', 'מרוסק', 'מבושל', 'מבושלים', 'מבושלת', 'קפוא', 'קפואה', 'קפואים', 'קלוף',
  'קלופים', 'קלופה', 'דק', 'דקה', 'דקים', 'איכותי', 'איכותית', 'לבחירה', 'רצוי', 'בערך', 'כ־', 'כ-',
]);

/** Lowercased whole-word containment, longest key first. */
function containedKey(n: string, keys: string[]): string | undefined {
  const padded = ` ${n} `;
  return keys.filter((k) => padded.includes(` ${k} `)).sort((a, b) => b.length - a.length)[0];
}

const catalogKeys = (() => {
  const m = new Map<string, string>();
  for (const c of CATALOG) {
    m.set(normalize(c.name), c.name);
    for (const a of c.aliases ?? []) m.set(normalize(a), c.name);
  }
  return m;
})();

/**
 * Map a free-text ingredient name to the name the app already uses
 * (catalog, then the family's pantry/list names), so list-minus-pantry works.
 */
export function normalizeIngredientName(raw: string, known: string[] = []): string {
  const base = raw
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[,.;:!]/g, ' ')
    .replace(/^(כ[-־]\s*)/, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!base) return raw.trim();
  const exact = (t: string) => catalogKeys.get(normalize(t));
  const stripped = base.split(' ').filter((w) => !DESCRIPTORS.has(w)).join(' ').trim() || base;
  const n = normalize(stripped);
  const knownMap = new Map(known.map((k) => [normalize(k), k.trim()]));
  const hit = exact(base) ?? exact(stripped) ?? knownMap.get(n);
  if (hit) return hit;
  // longest whole-word match: "בשר בקר טחון" -> "בקר טחון" -> בשר טחון
  const ck = containedKey(n, [...catalogKeys.keys()]);
  if (ck) return catalogKeys.get(ck)!;
  const kk = containedKey(n, [...knownMap.keys()]);
  if (kk) return knownMap.get(kk)!;
  return stripped;
}

const UNIT_ALIASES: Record<string, string> = {
  'גר': 'גרם', 'גר׳': 'גרם', "גר'": 'גרם', 'g': 'גרם', 'gr': 'גרם', 'grams': 'גרם', 'גרמים': 'גרם',
  'קג': 'ק"ג', 'ק״ג': 'ק"ג', 'kg': 'ק"ג', 'קילו': 'ק"ג',
  'מל': 'מ"ל', 'מ״ל': 'מ"ל', 'ml': 'מ"ל', 'ל': 'ליטר', 'l': 'ליטר',
  'כוסות': 'כוס', 'cup': 'כוס', 'cups': 'כוס', 'כפות': 'כף', 'tbsp': 'כף', 'כפיות': 'כפית', 'tsp': 'כפית',
  'קופסאות': 'קופסה', 'פחית': 'קופסה', 'שן': 'שיניים', 'שיני': 'שיניים', 'יח׳': 'יחידות', "יח'": 'יחידות', 'יחידה': 'יחידות',
};

export function normalizeUnit(u?: string | null): string | undefined {
  const t = (u ?? '').trim();
  if (!t) return undefined;
  const v = UNIT_ALIASES[t.toLowerCase()] ?? t;
  return v === 'יחידות' ? undefined : v;
}

function toNumber(v: unknown): number | undefined {
  if (typeof v === 'number') return Number.isFinite(v) && v > 0 ? v : undefined;
  if (typeof v !== 'string') return undefined;
  const s = v.trim().replace(',', '.');
  const frac: Record<string, number> = { '½': 0.5, '¼': 0.25, '¾': 0.75, '⅓': 1 / 3, '⅔': 2 / 3 };
  if (frac[s]) return frac[s];
  const m = s.match(/^(\d+)\s*\/\s*(\d+)$/);
  if (m) return Number(m[1]) / Number(m[2]);
  const mixed = s.match(/^(\d+)\s+(\d+)\/(\d+)$/);
  if (mixed) return Number(mixed[1]) + Number(mixed[2]) / Number(mixed[3]);
  const n = parseFloat(s);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

const KOSHER: Record<string, Kosher> = { meat: 'meat', 'בשרי': 'meat', dairy: 'dairy', 'חלבי': 'dairy', parve: 'parve', pareve: 'parve', 'פרווה': 'parve' };
const EMOJI_BY_WORD: [RegExp, string][] = [
  [/פאי|קיש|פשטיד/, '🥧'], [/פסטה|ספגטי|לזניה|ניוקי/, '🍝'], [/פיצה/, '🍕'], [/סושי/, '🍣'], [/מרק/, '🥣'],
  [/עוף|כנפ|שניצל/, '🍗'], [/דג|סלמון|טונה/, '🐟'], [/בורגר|המבורגר/, '🍔'], [/טאקו/, '🌮'], [/אורז|ריזוטו/, '🍚'],
  [/נודלס|אטריות|ראמן/, '🍜'], [/קארי/, '🍛'], [/סלט/, '🥗'], [/פנקייק|לביבות/, '🥞'], [/בשר|קציצ/, '🍖'],
];

export function emojiFor(title: string): string {
  return EMOJI_BY_WORD.find(([re]) => re.test(title))?.[1] ?? '🍲';
}

/** Turn an AI reply into an editable Recipe draft (id empty, not saved). */
export function draftFromAi(data: unknown, opts: { fallbackName: string; known?: string[]; link?: string } = { fallbackName: '' }): Recipe {
  if (!data || typeof data !== 'object') throw new DraftError('bad-json');
  const d = data as AiRecipe & { error?: string };
  if (d.error) throw new DraftError('no-recipe');
  const rawIngs = Array.isArray(d.ingredients) ? d.ingredients : [];
  const steps = (Array.isArray(d.steps) ? d.steps : []).map((s) => String(s).replace(/^\s*\d+[.)]\s*/, '').trim()).filter(Boolean);
  if (!rawIngs.length && !steps.length) throw new DraftError('no-recipe');

  const seen = new Map<string, Ingredient>();
  for (const i of rawIngs) {
    if (!i || !i.name) continue;
    const name = normalizeIngredientName(String(i.name), opts.known);
    const unit = normalizeUnit(i.unit);
    const qty = toNumber(i.qty);
    const aisle = i.aisle && (AISLES as readonly string[]).includes(i.aisle) ? i.aisle : undefined;
    const key = `${normalize(name)}|${unit ?? ''}`;
    const prev = seen.get(key);
    if (prev) {
      if (qty !== undefined) prev.qty = (prev.qty ?? 0) + qty;
      continue;
    }
    seen.set(key, {
      name,
      ...(qty !== undefined ? { qty } : {}),
      ...(unit ? { unit } : {}),
      ...(aisle && !lookup(name) ? { aisle } : {}),
      ...(i.frozenProtein && !lookup(name) ? { thaw: true } : {}),
    });
  }

  const title = String(d.name || opts.fallbackName || '').trim() || opts.fallbackName;
  const meals = (Array.isArray(d.meals) ? d.meals : []).filter((m): m is MealType => m === 'lunch' || m === 'dinner');
  const diff = Math.round(toNumber(d.difficulty) ?? 1);
  const sources = (Array.isArray(d.sources) ? d.sources : []).filter((u) => typeof u === 'string' && /^https?:\/\//.test(u));
  const video = typeof d.videoUrl === 'string' && /youtu/.test(d.videoUrl) ? d.videoUrl : opts.link && /youtu/.test(opts.link) ? opts.link : undefined;
  const link = opts.link && !/youtu/.test(opts.link) ? opts.link : sources[0];
  return {
    id: '',
    title,
    emoji: emojiFor(title),
    cuisine: String(d.cuisine || 'ביתי').trim(),
    kosher: KOSHER[String(d.kosher ?? '').toLowerCase()] ?? guessKosher([...seen.values()]),
    meals: meals.length ? meals : ['lunch', 'dinner'],
    minutes: Math.round(toNumber(d.minutes) ?? 45),
    difficulty: (diff >= 3 ? 3 : diff <= 1 ? 1 : 2) as 1 | 2 | 3,
    kidsCanHelp: false,
    tags: (Array.isArray(d.tags) ? d.tags : []).map((t) => String(t).replace(/^#/, '').trim()).filter(Boolean).slice(0, 6),
    ingredients: [...seen.values()],
    steps,
    ...(video ? { videoUrl: video } : {}),
    ...(link ? { link } : {}),
    ...(sources.length ? { sources } : {}),
    ratings: {},
    createdAt: 0,
  };
}

const MEATY = /בשר|עוף|הודו|כבש|נקניק|פסטרמה|שניצל|פרגי|שוקיים|כנפ|אסאדו|טחון/;
const DAIRY = /חלב(?! קוקוס)|חמאה|גבינ|שמנת|יוגורט|פרמזן|מוצרלה|ריקוטה|קוטג/;

export function guessKosher(ings: Ingredient[]): Kosher {
  const names = ings.map((i) => i.name).join(' | ');
  if (MEATY.test(names)) return 'meat';
  if (DAIRY.test(names)) return 'dairy';
  return 'parve';
}

/** A meat recipe that also lists dairy (or the reverse) — warn in the preview. */
export function kosherConflict(r: Recipe): string[] {
  if (r.kosher === 'parve') return [];
  const re = r.kosher === 'meat' ? DAIRY : MEATY;
  return r.ingredients.filter((i) => re.test(i.name)).map((i) => i.name);
}

/** Blank recipe for "just a name". */
export function nameOnlyRecipe(title: string, kosher: Kosher, meal?: MealType): Recipe {
  const t = title.trim();
  return {
    id: '', title: t, emoji: emojiFor(t), cuisine: 'ביתי', kosher, meals: meal ? [meal] : ['lunch', 'dinner'],
    minutes: 45, difficulty: 1, kidsCanHelp: false, tags: [], ingredients: [], steps: [], ratings: {}, createdAt: 0,
  };
}

/** Recipes whose title matches a free-text search (ignores spaces, geresh and case). */
export function matchRecipes(q: string, recipes: Recipe[]): Recipe[] {
  const n = (s: string) => normalize(s).replace(/[\s"׳'-]/g, '');
  const k = n(q);
  if (!k) return recipes;
  return recipes.filter((r) => n(r.title).includes(k) || r.tags.some((t) => n(t).includes(k)) || n(r.cuisine).includes(k));
}

export function isUrl(s: string): boolean {
  return /^https?:\/\/\S+\.\S+/.test(s.trim());
}
