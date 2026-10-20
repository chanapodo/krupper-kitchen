import type { Location, QtyMode } from '../lib/types';

export const AISLES = [
  'ירקות ופירות',
  'בשר ועוף',
  'דגים',
  'חלב וביצים',
  'לחם ומאפים',
  'פסטה, אורז ודגנים',
  'שימורים ורטבים',
  'תבלינים ואפייה',
  'קפואים',
  'חטיפים ומשקאות',
  'ניקיון וטיפוח',
  'אחר',
] as const;
export type Aisle = (typeof AISLES)[number];

export interface CatalogItem {
  name: string;
  aisle: Aisle;
  /** basics assumed to be at home (salt, oil...) — never put on the list automatically */
  staple?: boolean;
  /** frozen meat/chicken/fish that must be taken out to thaw */
  thaw?: boolean;
  location?: Location;
  aliases?: string[];
  /** how the pantry keeps it: 'count' for things you count (eggs, yogurts, cans, pitas); default 'level' */
  mode?: QtyMode;
}

/** The aisle was called 'בית וניקיון' before v1.3. */
export function aisleName(a: string): string {
  return a === 'בית וניקיון' ? 'ניקיון וטיפוח' : a;
}

const V = 'ירקות ופירות', M = 'בשר ועוף', F = 'דגים', D = 'חלב וביצים', B = 'לחם ומאפים',
  G = 'פסטה, אורז ודגנים', C = 'שימורים ורטבים', S = 'תבלינים ואפייה', Z = 'קפואים', K = 'חטיפים ומשקאות',
  H = 'ניקיון וטיפוח';
const N = 'count' as const;

export const CATALOG: CatalogItem[] = [
  // vegetables & fruit
  { name: 'בצל', aisle: V, aliases: ['בצל יבש', 'בצלים'] },
  { name: 'בצל סגול', aisle: V },
  { name: 'בצל ירוק', aisle: V, location: 'fridge' },
  { name: 'שום', aisle: V, aliases: ['שיני שום', 'ראש שום'] },
  { name: 'גזר', aisle: V, location: 'fridge', aliases: ['גזרים'] },
  { name: 'תפוחי אדמה', aisle: V, aliases: ['תפוח אדמה', 'תפו"א'] },
  { name: 'בטטה', aisle: V, aliases: ['בטטות'] },
  { name: 'עגבניות', aisle: V, aliases: ['עגבניה', 'עגבנייה'] },
  { name: 'עגבניות שרי', aisle: V, location: 'fridge' },
  { name: 'מלפפונים', aisle: V, location: 'fridge', aliases: ['מלפפון'] },
  { name: 'פלפל אדום', aisle: V, location: 'fridge', aliases: ['פלפל'] },
  { name: 'פלפל צהוב', aisle: V, location: 'fridge' },
  { name: 'קישואים', aisle: V, location: 'fridge', aliases: ['קישוא'] },
  { name: 'חציל', aisle: V, aliases: ['חצילים'] },
  { name: 'ברוקולי', aisle: V, location: 'fridge' },
  { name: 'כרובית', aisle: V, location: 'fridge' },
  { name: 'כרוב', aisle: V, location: 'fridge' },
  { name: 'חסה', aisle: V, location: 'fridge' },
  { name: 'פטריות', aisle: V, location: 'fridge' },
  { name: 'תירס', aisle: V, aliases: ['תירס מתוק'] },
  { name: 'אבוקדו', mode: N, aisle: V },
  { name: 'לימון', mode: N, aisle: V, aliases: ['לימונים', 'מיץ לימון'] },
  { name: 'ליים', aisle: V },
  { name: 'ג׳ינג׳ר', aisle: V, aliases: ["ג'ינג'ר", 'ג׳ינג׳ר טרי'] },
  { name: 'פטרוזיליה', aisle: V, location: 'fridge' },
  { name: 'כוסברה', aisle: V, location: 'fridge' },
  { name: 'בזיליקום', aisle: V, location: 'fridge' },
  { name: 'נענע', aisle: V, location: 'fridge' },
  { name: 'שמיר', aisle: V, location: 'fridge' },
  { name: 'תפוחים', aisle: V, aliases: ['תפוח'] },
  { name: 'בננות', aisle: V, aliases: ['בננה'] },
  { name: 'סלק', aisle: V },
  { name: 'דלעת', aisle: V },
  { name: 'תרד', aisle: V, location: 'fridge' },
  { name: 'אפונה', aisle: Z, location: 'freezer', aliases: ['אפונה קפואה'] },
  { name: 'שעועית ירוקה', aisle: Z, location: 'freezer' },
  // meat & chicken (frozen at home → thaw)
  { name: 'חזה עוף', aisle: M, thaw: true, location: 'freezer', aliases: ['פילה עוף', 'חזה עוף טחון'] },
  { name: 'פרגיות', aisle: M, thaw: true, location: 'freezer', aliases: ['פרגית', 'שוקיים עוף מפורק'] },
  { name: 'שוקיים עוף', aisle: M, thaw: true, location: 'freezer', aliases: ['כרעיים', 'כרעי עוף', 'שוקיים'] },
  { name: 'עוף שלם', aisle: M, thaw: true, location: 'freezer' },
  { name: 'כנפיים', aisle: M, thaw: true, location: 'freezer', aliases: ['כנפי עוף'] },
  { name: 'בשר טחון', aisle: M, thaw: true, location: 'freezer', aliases: ['בקר טחון', 'טחון'] },
  { name: 'עוף טחון', aisle: M, thaw: true, location: 'freezer', aliases: ['הודו טחון'] },
  { name: 'בשר בקר לבישול', aisle: M, thaw: true, location: 'freezer', aliases: ['בשר בקר', 'צלי', 'כתף בקר', 'בשר לגולאש'] },
  { name: 'אסאדו', aisle: M, thaw: true, location: 'freezer' },
  { name: 'שניצל', aisle: M, thaw: true, location: 'freezer', aliases: ['שניצלים'] },
  { name: 'נקניקיות', mode: N, aisle: M, location: 'fridge', aliases: ['נקניקייה'] },
  { name: 'פסטרמה', aisle: M, location: 'fridge' },
  // fish
  { name: 'פילה סלמון', aisle: F, thaw: true, location: 'freezer', aliases: ['סלמון'] },
  { name: 'פילה דג לבן', aisle: F, thaw: true, location: 'freezer', aliases: ['פילה אמנון', 'פילה מושט', 'פילה בקלה', 'פילה דג', 'דג לבן'] },
  { name: 'טונה', mode: N, aisle: C, aliases: ['טונה בקופסה', 'קופסת טונה'] },
  // dairy & eggs
  { name: 'ביצים', mode: N, aisle: D, location: 'fridge', aliases: ['ביצה'] },
  { name: 'חלב', mode: N, aisle: D, location: 'fridge' },
  { name: 'חמאה', aisle: D, location: 'fridge' },
  { name: 'שמנת מתוקה', mode: N, aisle: D, location: 'fridge', aliases: ['שמנת לבישול'] },
  { name: 'שמנת חמוצה', mode: N, aisle: D, location: 'fridge' },
  { name: 'גבינה צהובה', aisle: D, location: 'fridge', aliases: ['גבינה צהובה מגוררת', 'מוצרלה מגוררת'] },
  { name: 'מוצרלה', aisle: D, location: 'fridge', aliases: ['מוצרלה טרייה'] },
  { name: 'פרמזן', aisle: D, location: 'fridge', aliases: ['פרמז׳ן', 'גבינת פרמזן'] },
  { name: 'גבינה בולגרית', aisle: D, location: 'fridge', aliases: ['בולגרית', 'פטה', 'גבינה מלוחה'] },
  { name: 'גבינה לבנה', mode: N, aisle: D, location: 'fridge', aliases: ['קוטג׳', "קוטג'"] },
  { name: 'ריקוטה', mode: N, aisle: D, location: 'fridge' },
  { name: 'יוגורט', mode: N, aisle: D, location: 'fridge', aliases: ['יוגורט טבעי'] },
  { name: 'חלב קוקוס', mode: N, aisle: C, aliases: ['קרם קוקוס'] },
  // bread
  { name: 'טורטיות', mode: N, aisle: B, aliases: ['טורטייה', 'טורטיה'] },
  { name: 'פיתות', mode: N, aisle: B, aliases: ['פיתה'] },
  { name: 'לחמניות המבורגר', mode: N, aisle: B, aliases: ['לחמניות'] },
  { name: 'לחם', mode: N, aisle: B },
  { name: 'פירורי לחם', aisle: S, aliases: ['פירורי פנקו', 'פנקו'] },
  { name: 'בצק עלים', mode: N, aisle: Z, location: 'freezer' },
  { name: 'בצק פיצה', mode: N, aisle: Z, location: 'freezer' },
  // pasta, rice, grains
  { name: 'ספגטי', mode: N, aisle: G },
  { name: 'פסטה', mode: N, aisle: G, aliases: ['פנה', 'פוזילי', 'מקרוני'] },
  { name: 'אטריות אורז', aisle: G, aliases: ['נודלס אורז'] },
  { name: 'אטריות ביצים', aisle: G, aliases: ['נודלס', 'אטריות'] },
  { name: 'אורז', aisle: G, aliases: ['אורז לבן', 'אורז בסמטי', 'אורז יסמין'] },
  { name: 'אורז לסושי', aisle: G },
  { name: 'קוסקוס', aisle: G },
  { name: 'פתיתים', aisle: G },
  { name: 'בורגול', aisle: G },
  { name: 'קינואה', aisle: G },
  { name: 'עדשים כתומות', aisle: G, aliases: ['עדשים'] },
  { name: 'גריסי פנינה', aisle: G },
  { name: 'דפי לזניה', mode: N, aisle: G },
  { name: 'קמח', aisle: S, staple: true, aliases: ['קמח לבן'] },
  // cans & sauces
  { name: 'רסק עגבניות', mode: N, aisle: C },
  { name: 'עגבניות מרוסקות', mode: N, aisle: C, aliases: ['עגבניות מרוסקות בקופסה', 'רוטב עגבניות', 'פסטה עגבניות'] },
  { name: 'גרגרי חומוס', mode: N, aisle: C, aliases: ['חומוס בקופסה', 'חומוס יבש'] },
  { name: 'שעועית שחורה', mode: N, aisle: C },
  { name: 'שעועית לבנה', mode: N, aisle: C },
  { name: 'תירס בקופסה', mode: N, aisle: C },
  { name: 'טחינה גולמית', aisle: C, aliases: ['טחינה'] },
  { name: 'רוטב סויה', aisle: C, staple: true, aliases: ['סויה'] },
  { name: 'רוטב טריאקי', aisle: C },
  { name: 'רוטב צ׳ילי מתוק', aisle: C, aliases: ["צ'ילי מתוק"] },
  { name: 'סילאן', aisle: C, aliases: ['דבש תמרים'] },
  { name: 'דבש', aisle: C, staple: true },
  { name: 'קטשופ', aisle: C, staple: true },
  { name: 'מיונז', aisle: C },
  { name: 'חרדל', aisle: C, staple: true },
  { name: 'חומץ', aisle: C, staple: true, aliases: ['חומץ אורז'] },
  { name: 'אצות נורי', aisle: C, aliases: ['נורי'] },
  { name: 'זיתים', aisle: C },
  { name: 'מלפפון חמוץ', aisle: C, aliases: ['חמוצים'] },
  { name: 'שמן זית', aisle: S, staple: true },
  { name: 'שמן', aisle: S, staple: true, aliases: ['שמן קנולה', 'שמן לטיגון', 'שמן צמחי'] },
  { name: 'שמן שומשום', aisle: S },
  // spices & baking
  { name: 'מלח', aisle: S, staple: true },
  { name: 'פלפל שחור', aisle: S, staple: true },
  { name: 'סוכר', aisle: S, staple: true },
  { name: 'סוכר חום', aisle: S },
  { name: 'פפריקה', aisle: S, staple: true, aliases: ['פפריקה מתוקה'] },
  { name: 'כמון', aisle: S, staple: true },
  { name: 'כורכום', aisle: S, staple: true },
  { name: 'אורגנו', aisle: S, staple: true },
  { name: 'קינמון', aisle: S, staple: true },
  { name: 'שומשום', aisle: S, staple: true },
  { name: 'אבקת שום', aisle: S, staple: true },
  { name: 'תבלין שווארמה', aisle: S },
  { name: 'ראס אל חנות', aisle: S },
  { name: 'קארי', aisle: S, aliases: ['אבקת קארי', 'משחת קארי'] },
  { name: 'אבקת מרק', aisle: S, staple: true, aliases: ['אבקת מרק עוף', 'אבקת מרק פרווה'] },
  { name: 'קורנפלור', aisle: S, staple: true, aliases: ['עמילן תירס'] },
  { name: 'אבקת אפייה', aisle: S, staple: true },
  { name: 'שמרים', aisle: S },
  { name: 'שוקולד מריר', aisle: S },
  { name: 'מים', aisle: 'אחר', staple: true },
  // frozen
  { name: 'ירקות מוקפצים קפואים', aisle: Z, location: 'freezer', aliases: ['תערובת ירקות קפואה'] },
  { name: 'אדממה', aisle: Z, location: 'freezer' },
  // snacks & drinks
  { name: 'נאצ׳וס', aisle: K, aliases: ["נאצ'וס", 'טורטיה צ׳יפס'] },
  { name: 'מיץ תפוזים', aisle: K },
  // cleaning & personal care
  { name: 'סבון כלים', aisle: H, location: 'home', aliases: ['נוזל כלים', 'פיירי'] },
  { name: 'טבליות למדיח', aisle: H, location: 'home', aliases: ['טבליות מדיח', 'קפסולות למדיח'] },
  { name: 'אבקת כביסה', aisle: H, location: 'home', aliases: ['ג׳ל כביסה', "ג'ל כביסה", 'נוזל כביסה'] },
  { name: 'מרכך כביסה', aisle: H, location: 'home' },
  { name: 'אקונומיקה', aisle: H, location: 'home' },
  { name: 'נוזל לניקוי רצפות', aisle: H, location: 'home', aliases: ['סבון רצפות', 'נוזל רצפות'] },
  { name: 'תרסיס ניקוי', aisle: H, location: 'home', aliases: ['ספריי ניקוי', 'מסיר שומנים'] },
  { name: 'ספוגים', aisle: H, location: 'home', mode: N, aliases: ['ספוג', 'ספוגיות'] },
  { name: 'נייר טואלט', aisle: H, location: 'home', mode: N, aliases: ['נייר טואלט', 'נייר טואלאט'] },
  { name: 'מגבות נייר', aisle: H, location: 'home', mode: N, aliases: ['נייר מגבת', 'מגבת נייר'] },
  { name: 'מגבונים', aisle: H, location: 'home', mode: N, aliases: ['מגבונים לחים'] },
  { name: 'שקיות אשפה', aisle: H, location: 'home', mode: N, aliases: ['שקיות זבל'] },
  { name: 'נייר כסף', aisle: H, location: 'home', aliases: ['נייר אלומיניום'] },
  { name: 'נייר אפייה', aisle: H, location: 'home' },
  { name: 'שמפו', aisle: H, location: 'home' },
  { name: 'מרכך שיער', aisle: H, location: 'home' },
  { name: 'סבון רחצה', aisle: H, location: 'home', aliases: ['סבון גוף', 'ג׳ל רחצה', "ג'ל רחצה", 'תחליב רחצה'] },
  { name: 'סבון ידיים', aisle: H, location: 'home', aliases: ['סבון נוזלי'] },
  { name: 'משחת שיניים', aisle: H, location: 'home', mode: N },
  { name: 'מברשות שיניים', aisle: H, location: 'home', mode: N, aliases: ['מברשת שיניים'] },
  { name: 'דאודורנט', aisle: H, location: 'home' },
  { name: 'קרם הגנה', aisle: H, location: 'home' },
  { name: 'צמר גפן', aisle: H, location: 'home', aliases: ['מקלוני אוזניים'] },
];

export function normalize(name: string): string {
  return name
    .trim()
    .replace(/[׳']/g, '׳')
    .replace(/["״]/g, '"')
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

const index = new Map<string, CatalogItem>();
for (const item of CATALOG) {
  index.set(normalize(item.name), item);
  for (const a of item.aliases ?? []) index.set(normalize(a), item);
}

/** Find the catalog entry for a free-text ingredient name (exact, alias, or prefix match). */
export function lookup(name: string): CatalogItem | undefined {
  const n = normalize(name);
  const exact = index.get(n);
  if (exact) return exact;
  // "בצל גדול" -> "בצל", "עגבניות בשלות" -> "עגבניות": longest catalog name that starts the text
  let best: CatalogItem | undefined;
  let bestLen = 0;
  for (const [key, item] of index) {
    if (key.length > bestLen && (n.startsWith(key + ' ') || n === key)) {
      best = item;
      bestLen = key.length;
    }
  }
  return best;
}

/** Stable key used to match an ingredient across recipes, pantry and list. */
export function ingredientKey(name: string): string {
  const item = lookup(name);
  return item ? normalize(item.name) : normalize(name);
}

export function displayName(name: string): string {
  return lookup(name)?.name ?? name.trim();
}

export function aisleOf(name: string): Aisle {
  return lookup(name)?.aisle ?? 'אחר';
}

export function isStaple(name: string): boolean {
  return !!lookup(name)?.staple;
}

export function needsThaw(name: string): boolean {
  return !!lookup(name)?.thaw;
}

export function defaultLocation(name: string): Location {
  return lookup(name)?.location ?? 'pantry';
}

export const SUGGESTIONS = CATALOG.filter((c) => !c.staple).map((c) => c.name);
