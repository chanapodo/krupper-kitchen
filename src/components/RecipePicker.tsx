import { useMemo, useState } from 'react';
import { avgRating, canAddToSlot, kidIds, slotKosher } from '../lib/logic';
import { matchRecipes } from '../lib/recipeDraft';
import NewDish from './NewDish';
import type { Kosher, MealType, Recipe } from '../lib/types';
import { useApp } from '../state';
import { Avatar, Chips, KOSHER_LABEL, KosherBadge, RecipeThumb, Sheet } from './ui';

/** Choose a dish for a meal slot. Dishes that would mix meat and dairy are hidden. */
export default function RecipePicker({ title, meal, current, voters, onPick, onClose }: {
  title: string;
  meal: MealType;
  current: string[];
  voters: Map<string, string[]>;
  onPick: (r: Recipe) => void;
  onClose: () => void;
}) {
  const { recipes, recipeMap, settings } = useApp();
  const [q, setQ] = useState('');
  const [k, setK] = useState<Kosher | 'all'>('all');
  const [mealOnly, setMealOnly] = useState(true);
  const [adding, setAdding] = useState(false);
  const slotK = slotKosher(current, recipeMap);
  const kids = kidIds(settings?.members ?? []);

  const list = useMemo(() => {
    return matchRecipes(q, recipes)
      .filter((r) => !current.includes(r.id))
      .filter((r) => canAddToSlot(r, current, recipeMap))
      .filter((r) => k === 'all' || r.kosher === k)
      .filter((r) => !mealOnly || r.meals.includes(meal))
      .map((r) => ({ r, votes: voters.get(r.id) ?? [], kids: avgRating(r, kids) ?? 0, all: avgRating(r) ?? 0 }))
      .sort((a, b) => b.votes.length - a.votes.length || b.kids - a.kids || b.all - a.all || a.r.title.localeCompare(b.r.title, 'he'));
  }, [recipes, current, recipeMap, k, mealOnly, meal, q, voters, kids]);

  const typed = q.trim();
  // exact title already in the bank? then no "new dish" offer
  const exact = typed && recipes.some((r) => r.title.replace(/\s/g, '') === typed.replace(/\s/g, ''));

  if (adding && typed) {
    return (
      <Sheet title={title} onClose={onClose}>
        <NewDish query={typed} meal={meal} slotKosher={slotK}
          onSaved={(r) => (canAddToSlot(r, current, recipeMap) ? onPick(r) : onClose())} />
        <button className="btn ghost" onClick={() => setAdding(false)}>חזרה לרשימה</button>
      </Sheet>
    );
  }

  const hidden = slotK !== 'parve' ? (slotK === 'meat' ? 'חלביות' : 'בשריות') : null;

  return (
    <Sheet title={title} onClose={onClose}>
      <input className="input" placeholder="איזו מנה? חפשו או כתבו שם חדש…" value={q} onChange={(e) => setQ(e.target.value)} autoFocus
        aria-label="חיפוש מנה" />
      {typed && !exact && (
        <button className="add-new" onClick={() => setAdding(true)}>
          <span className="add-new-plus">+</span>
          <span><strong>להוסיף ״{typed}״ כמנה חדשה</strong><span>חיפוש מתכון, קישור או רק שם</span></span>
        </button>
      )}
      <Chips<Kosher | 'all'> value={k} onChange={setK} label="כשרות"
        options={[{ v: 'all', label: 'הכול' }, ...(['meat', 'dairy', 'parve'] as Kosher[]).map((v) => ({ v, label: KOSHER_LABEL[v] }))]} />
      <label className="check-line">
        <input type="checkbox" checked={mealOnly} onChange={(e) => setMealOnly(e.target.checked)} />
        רק מנות שמתאימות ל{meal === 'lunch' ? 'צהריים' : 'ערב'}
      </label>
      {hidden && <p className="note">🔒 יש כבר מנה {KOSHER_LABEL[slotK]}ת בארוחה, אז מנות {hidden} מוסתרות.</p>}
      <div className="pick-list">
        {list.map(({ r, votes }) => (
          <button key={r.id} className="pick-row" onClick={() => onPick(r)}>
            <RecipeThumb recipe={r} size="sm" />
            <span className="pick-main">
              <span className="pick-title">{r.title}</span>
              <span className="pick-meta"><KosherBadge k={r.kosher} /> {r.cuisine} · {r.minutes} דק׳</span>
            </span>
            {votes.length > 0 && (
              <span className="voters" title="הילדים ביקשו">
                {votes.map((id) => {
                  const m = settings?.members.find((x) => x.id === id);
                  return m ? <Avatar key={id} m={m} size={24} /> : null;
                })}
              </span>
            )}
          </button>
        ))}
        {!list.length && !typed && <p className="muted">לא נמצאו מנות</p>}
      </div>
    </Sheet>
  );
}
