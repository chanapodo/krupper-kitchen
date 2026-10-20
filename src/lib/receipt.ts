import { aisleOf, AISLES, aisleName, ingredientKey, lookup } from '../data/catalog';
import { extractJson, normalizeIngredientName, normalizeUnit, DraftError } from './recipeDraft';
import { COUNT_UNIT, defaultMode, modeOf } from './pantry';
import type { PantryItem, QtyMode } from './types';

/** A line of a scanned receipt, as shown on the review screen. */
export interface ReceiptLine {
  id: string;
  /** the text as printed */
  raw: string;
  /** the name the app uses (catalog / family wording) */
  name: string;
  mode: QtyMode;
  /** count mode only */
  qty?: number;
  aisle: string;
}

/** Deposit, bags, discounts, totals and payment lines are not groceries. */
const JUNK = /פי?קדון|פקדון|שקית|שקיות קניה|שקיות לקניות|הנחה|הנחת|מבצע|קופון|זיכוי|סה"?כ|סה״כ|לתשלום|עודף|מע"?מ|מע״מ|אשראי|מזומן|ויזה|כרטיס|עיגול|חיסכון|נקודות|מועדון|deposit|discount|total|bag\b/i;

export function isJunkLine(raw: string): boolean {
  return JUNK.test(raw);
}

export function receiptPrompt(): string {
  return `זו קבלה מסופרמרקט (צילום או PDF). קרא/י את כל שורות המוצרים.
לכל מוצר שנקנה החזר/י: raw = הטקסט כפי שמודפס, name = שם פשוט בעברית כמו ברשימת קניות (למשל "יוגורט", "סבון כלים", "חזה עוף") בלי מותג, אחוזים או משקל,
qty = כמה יחידות נקנו (מספר שלם; אם המוצר נשקל בק"ג – null), unit = "יח׳" או "ק"ג", aisle = אחד מאלה: ${AISLES.join(', ')}.
kind = "item" למוצר, "deposit" לפיקדון בקבוקים, "bag" לשקית, "discount" להנחה/מבצע/קופון, "other" לסה"כ, תשלום, מע"מ וכל שורה שאינה מוצר.
אם זו לא קבלה, החזר/י {"error": "no-receipt"}.
להחזיר JSON אחד בלבד, בלי טקסט לפניו או אחריו:
{"items": [{"raw": "יוגורט דנונה 3% 200 גר", "name": "יוגורט", "qty": 4, "unit": "יח׳", "aisle": "חלב וביצים", "kind": "item"}]}`;
}

interface AiLine { raw?: string | null; name?: string | null; qty?: number | string | null; unit?: string | null; aisle?: string | null; kind?: string | null }

/** Turn the model's answer into review lines: junk skipped, names normalized, repeats merged. */
export function linesFromAi(text: string, opts: { known?: string[]; pantry?: PantryItem[] } = {}): ReceiptLine[] {
  const data = extractJson(text) as { items?: AiLine[]; error?: string };
  if (!data || typeof data !== 'object' || data.error || !Array.isArray(data.items)) throw new DraftError('no-receipt');
  const byKey = new Map<string, ReceiptLine>();
  let n = 0;
  for (const it of data.items) {
    if (!it) continue;
    const raw = String(it.raw ?? it.name ?? '').trim();
    const given = String(it.name ?? '').trim();
    if (!raw && !given) continue;
    if (it.kind && it.kind !== 'item') continue;
    if (isJunkLine(raw) || isJunkLine(given)) continue;
    const name = normalizeIngredientName(given || raw, opts.known);
    if (!name) continue;
    const unit = normalizeUnit(it.unit);
    const num = typeof it.qty === 'number' ? it.qty : parseFloat(String(it.qty ?? ''));
    const weighed = unit === 'ק"ג' || unit === 'גרם';
    const count = Number.isFinite(num) && num > 0 && !weighed ? Math.round(num) || 1 : undefined;
    const key = ingredientKey(name);
    const prev = byKey.get(key);
    if (prev) {
      if (prev.mode === 'count') prev.qty = (prev.qty ?? 1) + (count ?? 1);
      prev.raw = `${prev.raw} · ${raw}`;
      continue;
    }
    const have = opts.pantry?.find((p) => ingredientKey(p.name) === key);
    const mode = have ? modeOf(have) : defaultMode(name, count, count !== undefined ? COUNT_UNIT : undefined);
    const aiAisle = it.aisle && (AISLES as readonly string[]).includes(aisleName(it.aisle)) ? aisleName(it.aisle) : undefined;
    byKey.set(key, {
      id: `l${n++}`,
      raw: raw || name,
      name,
      mode,
      ...(mode === 'count' ? { qty: count ?? 1 } : {}),
      aisle: lookup(name) ? aisleOf(name) : aiAisle ?? 'אחר',
    });
  }
  return [...byKey.values()];
}
