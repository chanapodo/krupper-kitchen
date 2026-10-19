import { useMemo, useState } from 'react';
import { Sheet, Chips, go, KOSHER_LABEL, KosherBadge, RecipeThumb } from '../components/ui';
import { avgRating, isKidFriendly, isSpecial, kidsFavorites } from '../lib/logic';
import type { Kosher } from '../lib/types';
import { useApp } from '../state';
import NewDish from '../components/NewDish';
import { matchRecipes } from '../lib/recipeDraft';

type F = 'all' | 'quick' | 'kids' | 'special' | Kosher;

export default function RecipesScreen() {
  const { recipes, pendingRecipes, settings, isParent, me } = useApp();
  const [q, setQ] = useState('');
  const [f, setF] = useState<F>('all');
  const [cuisine, setCuisine] = useState('');
  const [adding, setAdding] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const members = settings?.members ?? [];
  const cuisines = [...new Set(recipes.map((r) => r.cuisine))].sort((a, b) => a.localeCompare(b, 'he'));
  const favs = kidsFavorites(recipes, members).slice(0, 10);

  const list = useMemo(() => recipes
    .filter((r) => !q.trim() || matchRecipes(q, [r]).length > 0 || r.ingredients.some((i) => i.name.includes(q.trim())))
    .filter((r) => !cuisine || r.cuisine === cuisine)
    .filter((r) => {
      switch (f) {
        case 'quick': return r.minutes <= 30;
        case 'kids': return isKidFriendly(r, members);
        case 'special': return isSpecial(r);
        case 'meat': case 'dairy': case 'parve': return r.kosher === f;
        default: return true;
      }
    })
    .sort((a, b) => (avgRating(b) ?? 0) - (avgRating(a) ?? 0) || a.title.localeCompare(b.title, 'he')), [recipes, q, cuisine, f, members]);

  return (
    <div className="stack">
      <div className="page-head">
        <h1>📖 מתכונים</h1>
        <button className="btn small" onClick={() => { setNewName(''); setAdding(''); }}>+ מתכון חדש</button>
      </div>

      <button className="cta cta-mint slim" onClick={() => go('ideas')}>
        <span className="cta-emoji">✨</span>
        <span><strong>מה מכינים הערב?</strong><span>לפי מה שיש בבית</span></span>
      </button>

      {favs.length > 0 && !q && f === 'all' && !cuisine && (
        <section>
          <h2 className="section-title">💜 הילדים הכי אוהבים</h2>
          <div className="hscroll">
            {favs.map((r) => (
              <button key={r.id} className="mini-card" onClick={() => go(`recipe/${r.id}`)}>
                <RecipeThumb recipe={r} />
                <span>{r.title}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      {(isParent ? pendingRecipes : pendingRecipes.filter((r) => r.createdBy === me?.id)).length > 0 && (
        <section className="card soft-butter">
          <h2>{isParent ? '💡 הצעות של הילדים – מחכות לאישור' : '⏳ ההצעות שלי'}</h2>
          {(isParent ? pendingRecipes : pendingRecipes.filter((r) => r.createdBy === me?.id)).map((r) => (
            <button key={r.id} className="row-btn" onClick={() => go(`recipe/${r.id}`)}>
              {r.emoji} {r.title}
              <span className="muted small">{settings?.members.find((m) => m.id === r.createdBy)?.name}</span>
            </button>
          ))}
        </section>
      )}

      <input className="input" placeholder="חיפוש מתכון, מצרך או תגית…" value={q} onChange={(e) => setQ(e.target.value)} />
      {q.trim() && list.length === 0 && (
        <button className="add-new" onClick={() => { setNewName(q.trim()); setAdding(q.trim()); }}>
          <span className="add-new-plus">+</span>
          <span><strong>להוסיף ״{q.trim()}״ לספר המתכונים</strong><span>חיפוש מתכון, קישור או כתיבה ידנית</span></span>
        </button>
      )}
      <Chips<F> value={f} onChange={setF} label="סינון" options={[
        { v: 'all', label: 'הכול' }, { v: 'quick', label: '⚡ עד חצי שעה' }, { v: 'kids', label: '👧 לילדים' }, { v: 'special', label: '✨ מיוחד' },
        ...(['meat', 'dairy', 'parve'] as Kosher[]).map((v) => ({ v: v as F, label: KOSHER_LABEL[v] })),
      ]} />
      <select className="input" value={cuisine} onChange={(e) => setCuisine(e.target.value)} aria-label="מטבח">
        <option value="">🌍 כל המטבחים</option>
        {cuisines.map((c) => <option key={c} value={c}>{c}</option>)}
      </select>

      <div className="recipe-grid">
        {list.map((r) => {
          const avg = avgRating(r);
          return (
            <button key={r.id} className="recipe-card" onClick={() => go(`recipe/${r.id}`)}>
              <RecipeThumb recipe={r} size="lg" />
              <span className="rc-body">
                <span className="rc-title">{r.title}</span>
                <span className="rc-meta"><KosherBadge k={r.kosher} /> {r.cuisine} · ⏱ {r.minutes} דק׳</span>
                <span className="rc-meta">
                  {avg !== undefined ? `⭐ ${avg.toFixed(1)}` : 'עוד לא דורג'}
                  {r.kidsCanHelp && ' · 👧 הילדים עוזרים'}
                </span>
              </span>
            </button>
          );
        })}
      </div>
      {!list.length && !q.trim() && <p className="muted center">לא נמצאו מתכונים</p>}
      {adding !== null && (
        <Sheet title="מתכון חדש" onClose={() => setAdding(null)}>
          {adding === '' ? (
            <>
              <label className="field">שם המנה, או קישור למתכון
                <input className="input" autoFocus value={newName} onChange={(e) => setNewName(e.target.value)}
                  placeholder="למשל: פאי רועים" onKeyDown={(e) => e.key === 'Enter' && newName.trim() && setAdding(newName.trim())} />
              </label>
              <div className="action-row">
                <button className="btn" disabled={!newName.trim()} onClick={() => setAdding(newName.trim())}>המשך</button>
                <button className="btn ghost" onClick={() => go('edit/new')}>✍️ לכתוב בעצמי</button>
              </div>
            </>
          ) : (
            <NewDish query={adding} onManual={(n) => go(`edit/new/${encodeURIComponent(n)}`)}
              onSaved={(r) => { setAdding(null); setQ(''); if (isParent) go(`recipe/${r.id}`); }} />
          )}
        </Sheet>
      )}
    </div>
  );
}
