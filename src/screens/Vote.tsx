import { useMemo, useState } from 'react';
import { Avatar, Chips, go, KosherBadge, RecipeThumb, Ok, X } from '../components/ui';
import { weekLabel } from '../lib/dates';
import { isKidFriendly, MAX_VOTES, toggleVote, votingWeekId } from '../lib/logic';
import type { Vote } from '../lib/types';
import { useApp } from '../state';
import NewDish from '../components/NewDish';
import { matchRecipes } from '../lib/recipeDraft';

type F = 'all' | 'kids' | 'special' | 'quick';

export default function VoteScreen() {
  const { me, votes, recipes, recipeMap, store, settings, toast } = useApp();
  const weekId = votingWeekId();
  const id = `${weekId}_${me?.id}`;
  const mine: Vote = votes.find((v) => v.id === id) ?? { id, weekId, memberId: me!.id, recipeIds: [], wishes: [], updatedAt: 0 };
  const [f, setF] = useState<F>('all');
  const [q, setQ] = useState('');
  const [wish, setWish] = useState('');
  const [adding, setAdding] = useState(false);
  const others = votes.filter((v) => v.weekId === weekId && v.memberId !== me?.id);

  const save = (v: Vote) => store.set(`votes/${v.id}`, { ...v, updatedAt: Date.now() } as unknown as Record<string, unknown>);

  const list = useMemo(() => matchRecipes(q, recipes)
    .filter((r) => f !== 'kids' || isKidFriendly(r, settings?.members ?? []))
    .filter((r) => f !== 'special' || r.tags.includes('מיוחד'))
    .filter((r) => f !== 'quick' || r.minutes <= 30)
    .sort((a, b) => a.title.localeCompare(b.title, 'he')), [recipes, f, q, settings?.members]);

  const toggle = (rid: string) => {
    const next = toggleVote(mine.recipeIds, rid);
    if (next === mine.recipeIds) {
      toast(`אפשר לבחור עד ${MAX_VOTES} מנות. כדי להוסיף, צריך להוריד אחת.`);
      return;
    }
    save({ ...mine, recipeIds: next });
  };

  const addWish = (text?: string) => {
    const t = (text ?? wish).trim();
    if (!t) return;
    save({ ...mine, wishes: [...mine.wishes, t] });
    setWish('');
    setAdding(false);
    setQ('');
    toast('המשאלה נשלחה להורים 💌');
  };

  return (
    <div className="stack">
      <div className="vote-head">
        <h1>🗳️ מה בא לך ל{weekLabel(weekId)}?</h1>
        <p className="muted">בוחרים עד {MAX_VOTES} מנות. ההורים רואים את הבחירות ומכניסים לתפריט.</p>
        <div className="vote-count" aria-live="polite">
          {Array.from({ length: MAX_VOTES }).map((_, i) => (
            <span key={i} className={i < mine.recipeIds.length ? 'on' : ''}>{i < mine.recipeIds.length ? '❤️' : '🤍'}</span>
          ))}
          <span className="muted small">{mine.recipeIds.length}/{MAX_VOTES}</span>
        </div>
      </div>

      <section className="card soft-butter">
        <h2>💌 משהו שאין ברשימה?</h2>
        <div className="add-row">
          <input className="input" placeholder="למשל: ראמן, פנקייק, קציצות דגים…" value={wish}
            onChange={(e) => setWish(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addWish()} />
          <button className="btn" onClick={() => addWish()}>שליחה</button>
        </div>
        {mine.wishes.length > 0 && (
          <div className="wish-chips">
            {mine.wishes.map((w, i) => (
              <span key={i} className="wish free">
                “{w}”
                <button className="x" aria-label="הסרה" onClick={() => save({ ...mine, wishes: mine.wishes.filter((_, j) => j !== i) })}><X /></button>
              </span>
            ))}
          </div>
        )}
      </section>

      <input className="input" placeholder="חיפוש מנה, או שם של מנה חדשה…" value={q} onChange={(e) => { setQ(e.target.value); setAdding(false); }} aria-label="חיפוש מנה" />
      {q.trim() && !adding && !recipes.some((r) => r.title.replace(/\s/g, '') === q.trim().replace(/\s/g, '')) && (
        <button className="add-new" onClick={() => setAdding(true)}>
          <span className="add-new-plus">+</span>
          <span><strong>להציע ״{q.trim()}״ כמנה חדשה</strong><span>אפשר לחפש לה מתכון, ואמא ואבא יאשרו</span></span>
        </button>
      )}
      {adding && q.trim() && (
        <section className="card">
          <NewDish query={q.trim()} onWish={addWish} onSaved={(r) => {
            const next = mine.recipeIds.length < MAX_VOTES ? [...mine.recipeIds, r.id] : mine.recipeIds;
            save({ ...mine, recipeIds: next });
            setAdding(false);
            setQ('');
          }} />
        </section>
      )}
      {mine.recipeIds.some((id) => recipeMap.get(id)?.status === 'pending') && (
        <div className="wish-chips">
          {mine.recipeIds.map((id) => recipeMap.get(id)).filter((r) => r?.status === 'pending').map((r) => (
            <span key={r!.id} className="wish">❤️ {r!.emoji} {r!.title} <span className="badge pending-badge">מחכה לאישור</span>
              <button className="x" aria-label="הסרה" onClick={() => save({ ...mine, recipeIds: mine.recipeIds.filter((x) => x !== r!.id) })}><X /></button>
            </span>
          ))}
        </div>
      )}
      <Chips<F> value={f} onChange={setF} label="סינון" options={[
        { v: 'all', label: 'הכול' }, { v: 'kids', label: '👧 ילדים אוהבים' }, { v: 'special', label: '✨ מיוחד' }, { v: 'quick', label: '⚡ מהיר' },
      ]} />

      <div className="vote-grid">
        {list.map((r) => {
          const on = mine.recipeIds.includes(r.id);
          const by = others.filter((v) => v.recipeIds.includes(r.id));
          return (
            <button key={r.id} className={`vote-card ${on ? 'on' : ''}`} onClick={() => toggle(r.id)} aria-pressed={on}>
              <RecipeThumb recipe={r} />
              <span className="vote-heart">{on ? '❤️' : '🤍'}</span>
              <span className="vote-title">{r.title}</span>
              <span className="vote-meta"><KosherBadge k={r.kosher} /> {r.cuisine}</span>
              {by.length > 0 && (
                <span className="vote-others">
                  {by.map((v) => {
                    const m = settings?.members.find((x) => x.id === v.memberId);
                    return m ? <Avatar key={v.id} m={m} size={22} /> : null;
                  })}
                </span>
              )}
            </button>
          );
        })}
      </div>
      <button className="btn ghost" onClick={() => go('home')}>סיימתי <Ok /></button>
    </div>
  );
}
