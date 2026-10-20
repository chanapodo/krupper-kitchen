import { useState } from 'react';
import { APP_VERSION } from '../lib/update';
import { AiError, aiDetail, aiMessage, findRecipe, recipeFromImage, recipeFromLink, recipeFromText, type FoundRecipe } from '../lib/ai';
import { FileError, fileToInline } from '../lib/files';
import { cleanUrl, firstUrl } from '../lib/links';
import { kosherCompatible, verb } from '../lib/logic';
import { isUrl, nameOnlyRecipe } from '../lib/recipeDraft';
import type { Kosher, MealType, Recipe } from '../lib/types';
import { useApp } from '../state';
import RecipeForm from './RecipeForm';
import { KOSHER_LABEL } from './ui';

type What = 'find' | 'link' | 'text' | 'image';
type Step = { s: 'choose' } | { s: 'link' } | { s: 'text' } | { s: 'image' } | { s: 'name' } | { s: 'loading'; what: What } | { s: 'preview'; found: FoundRecipe };

const LOADING: Record<What, { emoji: string; text: string }> = {
  find: { emoji: '🔎', text: '' },
  link: { emoji: '🔗', text: 'קוראת את המתכון מהקישור…' },
  text: { emoji: '📋', text: 'קוראת את טקסט המתכון…' },
  image: { emoji: '📸', text: 'קוראת את המתכון מהצילום…' },
};

/**
 * "The dish isn't in the list": find a recipe with AI, read one from a link (or pasted text / a photo
 * when the link can't be read), or add just the name. Everyone's recipes go straight into the bank;
 * a kid's send the parents a notice.
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
  const { isParent, me, store, toast, pantry, shopping, notify } = useApp();
  const [pasted, setPasted] = useState('');
  const [blocked, setBlocked] = useState(false);
  const [step, setStep] = useState<Step>(isUrl(query) ? { s: 'link' } : { s: 'choose' });
  const [url, setUrl] = useState(isUrl(query) ? query.trim() : '');
  const [error, setError] = useState('');
  const [detail, setDetail] = useState('');
  const name = isUrl(query) ? '' : query.trim();
  const known = [...new Set([...pantry.map((p) => p.name), ...shopping.map((s) => s.name)])];

  const run = async (what: What, file?: File) => {
    setError('');
    setBlocked(false);
    setStep({ s: 'loading', what });
    try {
      let found: FoundRecipe;
      if (what === 'find') found = await findRecipe(name, { known });
      else if (what === 'link') {
        const clean = cleanUrl(url);
        if (clean !== url.trim()) setUrl(clean);
        found = await recipeFromLink(clean, { known });
      } else if (what === 'text') found = await recipeFromText(pasted, { known });
      else found = await recipeFromImage(await fileToInline(file!), { known });
      if (meal && !found.recipe.meals.includes(meal)) found.recipe.meals = [...found.recipe.meals, meal];
      setStep({ s: 'preview', found });
    } catch (e) {
      setError(e instanceof FileError ? e.message : aiMessage(e));
      setDetail(e instanceof FileError ? '' : `${aiDetail(e)} · v${APP_VERSION}`.replace(/^ · /, ''));
      // a link that can't be read: offer pasting the text or a screenshot right there
      setBlocked(what === 'link' && (!(e instanceof AiError) || e.kind === 'blocked' || e.kind === 'no-recipe'));
      setStep(what === 'find' ? { s: 'choose' } : { s: what });
    }
  };

  const save = async (r: Recipe) => {
    const id = store.newId();
    const data: Recipe = { ...r, id, createdAt: Date.now(), createdBy: me?.id };
    await store.set(`recipes/${id}`, data as unknown as Record<string, unknown>);
    if (me && !isParent) {
      await notify('recipe', `${me.name} ${verb(me, 'הוסיף')} ${data.title} למתכונים`);
      toast(`${data.title} נוסף לספר המתכונים 🎉`);
    } else if (slotKosher && !kosherCompatible(data.kosher, slotKosher)) {
      toast(`${data.title} נשמר בספר המתכונים, אבל הוא ${KOSHER_LABEL[data.kosher]} ולא נכנס לארוחה ה${KOSHER_LABEL[slotKosher]}ת`);
    }
    onSaved(data);
  };

  if (step.s === 'loading') {
    return (
      <div className="newdish loading" role="status">
        <div className="loader">{LOADING[step.what].emoji}</div>
        <p><strong>{step.what === 'find' ? `מחפשת מתכון ל${name}…` : LOADING[step.what].text}</strong></p>
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
        submitLabel={slotKosher !== undefined || meal ? (isParent ? 'שמירה והוספה לתפריט' : 'שמירה והוספה לתפריט (באישור הורים)') : 'שמירה בספר המתכונים'}
        onSubmit={save}
        top={
          <div className={`note ${via === 'ai' ? 'warn' : ''}`}>
            {via === 'link' && <>🔗 נקרא מהקישור. עברו על המצרכים והכמויות ותקנו מה שצריך לפני השמירה.</>}
            {via === 'text' && <>📋 נקרא מהטקסט שהדבקתם. עברו על המצרכים והכמויות ותקנו מה שצריך לפני השמירה.</>}
            {via === 'image' && <>📸 נקרא מהצילום. עברו על המצרכים והכמויות ותקנו מה שצריך לפני השמירה.</>}
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
      {error && (
        <div className="note warn" role="alert">
          {error}
          {detail && <div className="err-detail">{detail}</div>}
        </div>
      )}

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
            <span><strong>יש לי קישור, טקסט או צילום</strong><span>מאתר מתכונים, מיוטיוב, או צילום מסך</span></span>
          </button>
          {name && (onManual ? (
            <button className="option" onClick={() => onManual(name)}>
              <span className="option-emoji">✍️</span>
              <span><strong>אכתוב בעצמי</strong><span>פותח את עורך המתכון</span></span>
            </button>
          ) : (
            <button className="option" onClick={() => (!isParent && onWish ? onWish(name) : setStep({ s: 'name' }))}>
              <span className="option-emoji">📝</span>
              <span><strong>רק שם</strong><span>{!isParent && onWish ? 'שולחים להורים כמשאלה' : 'מוסיפים עכשיו, ואת המצרכים אפשר להשלים אחר כך'}</span></span>
            </button>
          ))}
        </div>
      )}

      {step.s === 'link' && (
        <div className="stack">
          <label className="field">הקישור למתכון
            <input className="input" dir="ltr" inputMode="url" autoFocus={!blocked} value={url} onChange={(e) => setUrl(e.target.value)}
              placeholder="https://…" onKeyDown={(e) => e.key === 'Enter' && firstUrl(url) && run('link')} />
          </label>
          <div className="action-row">
            <button className="btn" disabled={!firstUrl(url)} onClick={() => run('link')}>לקרוא את המתכון</button>
            <button className="btn ghost" onClick={() => { setError(''); setBlocked(false); setStep({ s: 'choose' }); }}>חזרה</button>
          </div>
          <div className={`fallbacks ${blocked ? 'stand-out' : ''}`}>
            <p className="small"><strong>{blocked ? 'אפשר אחרת:' : 'הקישור לא נפתח, או שאין קישור?'}</strong></p>
            <button className="option" onClick={() => { setError(''); setStep({ s: 'text' }); }}>
              <span className="option-emoji">📋</span>
              <span><strong>הדבקת טקסט המתכון</strong><span>מסמנים באתר את המצרכים וההוראות, מעתיקים ומדביקים</span></span>
            </button>
            <button className="option" onClick={() => { setError(''); setStep({ s: 'image' }); }}>
              <span className="option-emoji">📸</span>
              <span><strong>צילום/צילום מסך של המתכון</strong><span>מספר מתכונים, מאתר או מפוסט</span></span>
            </button>
          </div>
        </div>
      )}

      {step.s === 'text' && (
        <div className="stack">
          <label className="field">טקסט המתכון
            <textarea className="input paste" rows={8} autoFocus value={pasted} onChange={(e) => setPasted(e.target.value)}
              placeholder="מדביקים כאן את המצרכים ואת אופן ההכנה" />
          </label>
          <div className="action-row">
            <button className="btn" disabled={pasted.trim().length < 20} onClick={() => run('text')}>לקרוא את המתכון</button>
            <button className="btn ghost" onClick={() => { setError(''); setStep({ s: 'link' }); }}>חזרה</button>
          </div>
        </div>
      )}

      {step.s === 'image' && (
        <div className="stack">
          <label className="option file-option">
            <span className="option-emoji">📷</span>
            <span><strong>לצלם עכשיו</strong><span>דף מספר מתכונים, או מסך אחר</span></span>
            <input type="file" accept="image/*" capture="environment" hidden onChange={(e) => e.target.files?.[0] && run('image', e.target.files[0])} aria-label="צילום מתכון" />
          </label>
          <label className="option file-option">
            <span className="option-emoji">🖼️</span>
            <span><strong>צילום מסך מהגלריה</strong><span>אפשר לצלם מסך באתר ולבחור כאן</span></span>
            <input type="file" accept="image/*" hidden onChange={(e) => e.target.files?.[0] && run('image', e.target.files[0])} aria-label="תמונת מתכון" />
          </label>
          <button className="btn ghost" onClick={() => { setError(''); setStep({ s: 'link' }); }}>חזרה</button>
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
