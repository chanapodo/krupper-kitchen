import { useState } from 'react';
import { aiMessage, findRecipe, recipeFromLink, type FoundRecipe } from '../lib/ai';
import { kosherCompatible } from '../lib/logic';
import { isUrl, nameOnlyRecipe } from '../lib/recipeDraft';
import type { Kosher, MealType, Recipe } from '../lib/types';
import { useApp } from '../state';
import RecipeForm from './RecipeForm';
import { KOSHER_LABEL } from './ui';

type Step = { s: 'choose' } | { s: 'link' } | { s: 'name' } | { s: 'loading'; what: 'find' | 'link' } | { s: 'preview'; found: FoundRecipe };

/**
 * "The dish isn't in the list": find a recipe with AI, read one from a link, or add just the name.
 * Parents' recipes go straight into the bank; a kid's become pending suggestions.
 */
export default function NewDish({ query, meal, slotKosher, onSaved, onWish, onManual }: {
  query: string;
  meal?: MealType;
  /** the meal already has meat/dairy: a clashing dish is saved but not placed */
  slotKosher?: Kosher;
  /** called after the recipe is saved (pending for kids) */
  onSaved: (r: Recipe) => void;
  /** kids' "just the name" becomes a free-text wish */
  onWish?: (name: string) => void;
  /** recipe bank: open the full editor instead of "just a name" */
  onManual?: (name: string) => void;
}) {
  const { isParent, me, store, toast, pantry, shopping } = useApp();
  const [step, setStep] = useState<Step>(isUrl(query) ? { s: 'link' } : { s: 'choose' });
  const [url, setUrl] = useState(isUrl(query) ? query.trim() : '');
  const [error, setError] = useState('');
  const name = isUrl(query) ? '' : query.trim();
  const known = [...new Set([...pantry.map((p) => p.name), ...shopping.map((s) => s.name)])];

  const run = async (what: 'find' | 'link') => {
    setError('');
    setStep({ s: 'loading', what });
    try {
      const found = what === 'find' ? await findRecipe(name, { known }) : await recipeFromLink(url.trim(), { known });
      if (meal && !found.recipe.meals.includes(meal)) found.recipe.meals = [...found.recipe.meals, meal];
      setStep({ s: 'preview', found });
    } catch (e) {
      setError(aiMessage(e));
      setStep(what === 'link' ? { s: 'link' } : { s: 'choose' });
    }
  };

  const save = async (r: Recipe) => {
    const id = store.newId();
    const data: Recipe = {
      ...r, id, createdAt: Date.now(), createdBy: me?.id,
      ...(isParent ? {} : { status: 'pending' as const }),
    };
    await store.set(`recipes/${id}`, data as unknown as Record<string, unknown>);
    if (!isParent) toast('ההצעה נשלחה להורים לאישור 🙏');
    else if (slotKosher && !kosherCompatible(data.kosher, slotKosher)) {
      toast(`${data.title} נשמר בספר המתכונים, אבל הוא ${KOSHER_LABEL[data.kosher]} ולא נכנס לארוחה ה${KOSHER_LABEL[slotKosher]}ת`);
    }
    onSaved(data);
  };

  if (step.s === 'loading') {
    return (
      <div className="newdish loading" role="status">
        <div className="loader">{step.what === 'find' ? '🔎' : '🔗'}</div>
        <p><strong>{step.what === 'find' ? `מחפשת מתכון ל${name}…` : 'קוראת את המתכון מהקישור…'}</strong></p>
        <p className="muted small">זה לוקח בדרך כלל 10–30 שניות</p>
      </div>
    );
  }

  if (step.s === 'preview') {
    const { recipe, via } = step.found;
    return (
      <RecipeForm
        initial={recipe}
        known={known}
        submitLabel={isParent ? (slotKosher !== undefined || meal ? 'שמירה והוספה לתפריט' : 'שמירה בספר המתכונים') : 'לשלוח להורים לאישור'}
        onSubmit={save}
        top={
          <div className={`note ${via === 'ai' ? 'warn' : ''}`}>
            {via === 'link' && <>🔗 נקרא מהקישור. עברו על המצרכים והכמויות ותקנו מה שצריך לפני השמירה.</>}
            {via === 'ai' && <>✨ המתכון נכתב על ידי ה־AI לפי מתכונים מוכרים. עברו על המצרכים והכמויות ותקנו מה שצריך לפני השמירה.</>}
            {!!recipe.sources?.length && (
              <div className="sources">
                {recipe.sources.slice(0, 3).map((u) => <a key={u} href={u} target="_blank" rel="noreferrer">{hostOf(u)} ↗</a>)}
              </div>
            )}
          </div>
        }
      />
    );
  }

  return (
    <div className="newdish">
      {name && <p className="newdish-title">״{name}״ עוד לא בספר המתכונים. מה עושים?</p>}
      {error && <p className="note warn" role="alert">{error}</p>}

      {step.s === 'choose' && (
        <div className="newdish-options">
          {name && (
            <button className="option" onClick={() => run('find')}>
              <span className="option-emoji">🔎</span>
              <span><strong>מצאי לי מתכון</strong><span>מתכון מוצלח עם מצרכים וכמויות, לבדיקה לפני שמירה</span></span>
            </button>
          )}
          <button className="option" onClick={() => setStep({ s: 'link' })}>
            <span className="option-emoji">🔗</span>
            <span><strong>יש לי קישור</strong><span>מאתר מתכונים או מיוטיוב</span></span>
          </button>
          {name && (onManual ? (
            <button className="option" onClick={() => onManual(name)}>
              <span className="option-emoji">✍️</span>
              <span><strong>אכתוב בעצמי</strong><span>פותח את עורך המתכון</span></span>
            </button>
          ) : (
            <button className="option" onClick={() => (isParent ? setStep({ s: 'name' }) : onWish?.(name))}>
              <span className="option-emoji">📝</span>
              <span><strong>רק שם</strong><span>{isParent ? 'מוסיפים עכשיו, ואת המצרכים אפשר להשלים אחר כך' : 'שולחים להורים כמשאלה'}</span></span>
            </button>
          ))}
        </div>
      )}

      {step.s === 'link' && (
        <div className="stack">
          <label className="field">הקישור למתכון
            <input className="input" dir="ltr" inputMode="url" autoFocus value={url} onChange={(e) => setUrl(e.target.value)}
              placeholder="https://…" onKeyDown={(e) => e.key === 'Enter' && isUrl(url) && run('link')} />
          </label>
          <div className="action-row">
            <button className="btn" disabled={!isUrl(url)} onClick={() => run('link')}>לקרוא את המתכון</button>
            <button className="btn ghost" onClick={() => { setError(''); setStep({ s: 'choose' }); }}>חזרה</button>
          </div>
        </div>
      )}

      {step.s === 'name' && (
        <div className="stack">
          <p>איזו מנה זו?</p>
          <div className="action-row">
            {(['meat', 'dairy', 'parve'] as Kosher[]).map((k) => (
              <button key={k} className={`btn soft kosher-btn-${k}`} disabled={!!slotKosher && !kosherCompatible(k, slotKosher)}
                onClick={() => save(nameOnlyRecipe(name, k, meal))}>
                {KOSHER_LABEL[k]}
              </button>
            ))}
          </div>
          {slotKosher && slotKosher !== 'parve' && <p className="muted small">יש כבר מנה {KOSHER_LABEL[slotKosher]}ת בארוחה הזו.</p>}
          <button className="btn ghost" onClick={() => setStep({ s: 'choose' })}>חזרה</button>
        </div>
      )}
    </div>
  );
}

function hostOf(u: string): string {
  try {
    return new URL(u).hostname.replace(/^www\./, '');
  } catch {
    return u;
  }
}
