import { useState, type ReactNode } from 'react';
import { needsThaw, SUGGESTIONS } from '../data/catalog';
import { ingThaw } from '../lib/logic';
import { kosherConflict, normalizeIngredientName } from '../lib/recipeDraft';
import type { Ingredient, Kosher, MealType, Recipe } from '../lib/types';
import { normalizeUnit } from '../lib/recipeDraft';
import { KOSHER_LABEL, X } from './ui';

const EMOJIS = ['🍲', '🍝', '🍗', '🥘', '🍛', '🍜', '🍣', '🌮', '🍕', '🥗', '🥙', '🍔', '🐟', '🧀', '🥧', '🍳', '🍚', '🥣', '🧆', '🌯'];

/** The recipe editor, used for new/edited recipes and for approving AI-found ones. */
export default function RecipeForm({ initial, known = [], submitLabel = 'שמירה', onSubmit, top }: {
  initial: Recipe;
  /** names already used in the pantry/list, so ingredients match them */
  known?: string[];
  submitLabel?: string;
  onSubmit: (r: Recipe) => Promise<void> | void;
  top?: ReactNode;
}) {
  const [r, setR] = useState<Recipe>(() => structuredClone(initial));
  const [steps, setSteps] = useState(initial.steps.join('\n'));
  const [tags, setTags] = useState(initial.tags.join(', '));
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const set = <K extends keyof Recipe>(k: K, v: Recipe[K]) => setR((x) => ({ ...x, [k]: v }));
  const setIng = (i: number, patch: Partial<Ingredient>) =>
    set('ingredients', r.ingredients.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const toggleMeal = (m: MealType) =>
    set('meals', r.meals.includes(m) ? r.meals.filter((x) => x !== m) : [...r.meals, m]);
  const conflict = kosherConflict(r);

  const submit = async () => {
    const ingredients: Ingredient[] = r.ingredients
      .filter((i) => i.name.trim())
      .map((i) => {
        const unit = normalizeUnit(i.unit);
        return {
          name: normalizeIngredientName(i.name, known),
          ...(i.qty ? { qty: Number(i.qty) } : {}),
          ...(unit ? { unit } : {}),
          ...(i.aisle ? { aisle: i.aisle } : {}),
          ...(i.thaw ? { thaw: true } : {}),
        };
      });
    if (!r.title.trim()) return setErr('צריך שם למתכון');
    if (!r.meals.length) return setErr('לבחור צהריים או ערב');
    setBusy(true);
    try {
      await onSubmit({
        ...r,
        title: r.title.trim(),
        ingredients,
        steps: steps.split('\n').map((s) => s.trim()).filter(Boolean),
        tags: tags.split(/[,،]/).map((t) => t.trim().replace(/^#/, '')).filter(Boolean),
        minutes: Number(r.minutes) || 30,
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="stack form">
      {top}
      <label className="field">שם המנה
        <input className="input" value={r.title} onChange={(e) => set('title', e.target.value)} placeholder="למשל: עוף בדבש וחרדל" />
      </label>

      <div className="field">אימוג׳י
        <div className="emoji-pick">
          {EMOJIS.map((e) => <button key={e} className={`chip ${r.emoji === e ? 'on' : ''}`} onClick={() => set('emoji', e)}>{e}</button>)}
        </div>
      </div>

      <div className="field-row">
        <label className="field">מטבח
          <input className="input" value={r.cuisine} onChange={(e) => set('cuisine', e.target.value)} list="cuisines" />
          <datalist id="cuisines">{['ישראלי', 'איטלקי', 'אסייתי', 'מקסיקני', 'הודי', 'מרוקאי', 'אמריקאי', 'צרפתי', 'מזרחי'].map((c) => <option key={c} value={c} />)}</datalist>
        </label>
        <label className="field">זמן (דקות)
          <input className="input" inputMode="numeric" value={r.minutes} onChange={(e) => set('minutes', Number(e.target.value.replace(/\D/g, '')) || 0)} />
        </label>
      </div>

      <div className="field">כשרות
        <div className="chips">
          {(['meat', 'dairy', 'parve'] as Kosher[]).map((k) => (
            <button key={k} className={`chip kosher-chip-${k} ${r.kosher === k ? 'on' : ''}`} onClick={() => set('kosher', k)}>{KOSHER_LABEL[k]}</button>
          ))}
        </div>
      </div>

      <div className="field-row">
        <div className="field">ארוחה
          <div className="chips">
            <button className={`chip ${r.meals.includes('lunch') ? 'on' : ''}`} onClick={() => toggleMeal('lunch')}>☀️ צהריים</button>
            <button className={`chip ${r.meals.includes('dinner') ? 'on' : ''}`} onClick={() => toggleMeal('dinner')}>🌙 ערב</button>
          </div>
        </div>
        <div className="field">רמת קושי
          <div className="chips">
            {([1, 2, 3] as const).map((d) => <button key={d} className={`chip ${r.difficulty === d ? 'on' : ''}`} onClick={() => set('difficulty', d)}>{['קל', 'בינוני', 'מאתגר'][d - 1]}</button>)}
          </div>
        </div>
      </div>

      <label className="check-line">
        <input type="checkbox" checked={r.kidsCanHelp} onChange={(e) => set('kidsCanHelp', e.target.checked)} /> 👧 הילדים יכולים להכין עם עזרה
      </label>

      <div className="field">מצרכים
        <datalist id="ing-suggestions">{SUGGESTIONS.map((s) => <option key={s} value={s} />)}</datalist>
        {r.ingredients.map((ing, i) => (
          <div key={i} className="ing-edit">
            <input className="input grow" list="ing-suggestions" placeholder="מצרך" value={ing.name} onChange={(e) => setIng(i, { name: e.target.value })} aria-label={`מצרך ${i + 1}`} />
            <input className="input qty" inputMode="decimal" placeholder="כמה" value={ing.qty ?? ''} onChange={(e) => setIng(i, { qty: e.target.value === '' ? undefined : Number(e.target.value) })} aria-label="כמות" />
            <input className="input unit" placeholder="יחידה" value={ing.unit ?? ''} onChange={(e) => setIng(i, { unit: e.target.value })} list="units" aria-label="יחידה" />
            <button className={`chip thaw-toggle ${ingThaw(ing) ? 'on' : ''}`} onClick={() => setIng(i, { thaw: !ing.thaw })}
              disabled={needsThaw(ing.name)} aria-pressed={ingThaw(ing)} aria-label="צריך הפשרה" title="צריך להפשיר מהמקפיא">❄️</button>
            <button className="icon-btn small" onClick={() => set('ingredients', r.ingredients.filter((_, j) => j !== i))} aria-label="הסרה"><X /></button>
          </div>
        ))}
        <datalist id="units">{['גרם', 'ק"ג', 'מ"ל', 'ליטר', 'כוס', 'כף', 'כפית', 'קופסה', 'שיניים', 'חבילה'].map((u) => <option key={u} value={u} />)}</datalist>
        <button className="link" onClick={() => set('ingredients', [...r.ingredients, { name: '' }])}>+ עוד מצרך</button>
      </div>

      <label className="field">אופן ההכנה (שלב בכל שורה)
        <textarea className="input" rows={6} value={steps} onChange={(e) => setSteps(e.target.value)} />
      </label>

      <label className="field">תגיות (מופרדות בפסיק)
        <input className="input" value={tags} onChange={(e) => setTags(e.target.value)} placeholder="מהיר, ילדים אוהבים, מיוחד" />
      </label>

      <label className="field">קישור לסרטון יוטיוב
        <input className="input" dir="ltr" inputMode="url" value={r.videoUrl ?? ''} onChange={(e) => set('videoUrl', e.target.value || undefined)} placeholder="https://youtube.com/…" />
      </label>
      <label className="field">קישור לתמונה
        <input className="input" dir="ltr" inputMode="url" value={r.photoUrl ?? ''} onChange={(e) => set('photoUrl', e.target.value || undefined)} placeholder="https://…" />
      </label>
      <label className="field">קישור למתכון
        <input className="input" dir="ltr" inputMode="url" value={r.link ?? ''} onChange={(e) => set('link', e.target.value || undefined)} placeholder="https://…" />
      </label>

      {conflict.length > 0 && (
        <p className="note warn" role="alert">
          ⚠️ המתכון מסומן {KOSHER_LABEL[r.kosher]} אבל יש בו {conflict.join(', ')}. כדאי להחליף מצרך או לשנות את סימון הכשרות.
        </p>
      )}
      {err && <p className="error" role="alert">{err}</p>}
      <button className="btn big" onClick={submit} disabled={busy}>{busy ? 'שומרת…' : submitLabel}</button>
    </div>
  );
}
