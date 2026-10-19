import { useState } from 'react';
import { Chips, go, KOSHER_LABEL, KosherBadge, RecipeThumb } from '../components/ui';
import { ingredientKey } from '../data/catalog';
import { dinnerIdeas, newShoppingItem, type IdeaFilter, onList } from '../lib/logic';
import type { Kosher, MealType } from '../lib/types';
import { useApp } from '../state';

export default function IdeasScreen() {
  const { recipes, pantry, settings, me, isParent, store, shopping, toast } = useApp();
  const [filter, setFilter] = useState<IdeaFilter>('all');
  const [kosher, setKosher] = useState<Kosher | 'any'>('any');
  const [meal, setMeal] = useState<MealType | 'any'>(new Date().getHours() < 14 ? 'lunch' : 'dinner');
  const ideas = dinnerIdeas(recipes, pantry, settings?.members ?? [], { filter, kosher, meal }).slice(0, 12);

  const ask = async (names: string[]) => {
    if (!me) return;
    const listed = new Set(shopping.filter(onList).map((s) => ingredientKey(s.name)));
    const todo = names.filter((n) => !listed.has(ingredientKey(n)));
    for (const n of todo) await store.set(`shopping/${store.newId()}`, newShoppingItem(n, me.id, isParent) as unknown as Record<string, unknown>);
    toast(todo.length ? (isParent ? 'נוסף לרשימת הקניות' : 'נשלח להורים לאישור 🙏') : 'כבר ברשימה');
  };

  return (
    <div className="stack">
      <div className="page-head">
        <h1>✨ מה מכינים {meal === 'lunch' ? 'בצהריים' : 'הערב'}?</h1>
      </div>
      <p className="muted">לפי מה שיש עכשיו בבית ומה שהמשפחה אוהבת. למעלה – מה שאפשר להכין בלי לצאת לסופר.</p>
      <Chips<IdeaFilter> value={filter} onChange={setFilter} label="סוג" options={[
        { v: 'all', label: '🍽️ הכול' }, { v: 'quick', label: '⚡ מהיר' }, { v: 'special', label: '✨ משהו מיוחד' }, { v: 'kids', label: '👧 הילדים מכינים' },
      ]} />
      <div className="chip-rows">
        <Chips<MealType | 'any'> value={meal} onChange={setMeal} label="ארוחה" options={[
          { v: 'dinner', label: '🌙 ערב' }, { v: 'lunch', label: '☀️ צהריים' }, { v: 'any', label: 'כל ארוחה' },
        ]} />
        <Chips<Kosher | 'any'> value={kosher} onChange={setKosher} label="כשרות" options={[
          { v: 'any', label: 'כל כשרות' }, ...(['dairy', 'meat', 'parve'] as Kosher[]).map((k) => ({ v: k as Kosher | 'any', label: KOSHER_LABEL[k] })),
        ]} />
      </div>

      <div className="ideas">
        {ideas.map((i, n) => (
          <article key={i.recipe.id} className={`idea ${i.missing.length === 0 ? 'ready' : ''}`}>
            <button className="idea-main" onClick={() => go(`recipe/${i.recipe.id}`)}>
              <RecipeThumb recipe={i.recipe} />
              <span className="idea-body">
                <span className="idea-title">{n === 0 && '🏆 '}{i.recipe.title}</span>
                <span className="rc-meta"><KosherBadge k={i.recipe.kosher} /> {i.recipe.cuisine} · ⏱ {i.recipe.minutes} דק׳{i.rating ? ` · ⭐ ${i.rating.toFixed(1)}` : ''}</span>
                <span className="meter" aria-label={`${Math.round(i.coverage * 100)}% מהמצרכים בבית`}>
                  <span style={{ width: `${Math.round(i.coverage * 100)}%` }} />
                </span>
                <span className="small">
                  {i.missing.length === 0 ? '✅ יש הכול בבית!' : `יש ${i.have.length} מתוך ${i.have.length + i.missing.length} · חסר: ${i.missing.join(', ')}`}
                </span>
              </span>
            </button>
            {i.missing.length > 0 && i.missing.length <= 4 && (
              <button className="link small" onClick={() => ask(i.missing)}>{isParent ? '+ חסרים לרשימה' : 'לבקש את החסרים'}</button>
            )}
          </article>
        ))}
      </div>
      {!ideas.length && <p className="muted center">אין רעיונות לסינון הזה – נסו סינון אחר</p>}
    </div>
  );
}
