import { useState } from 'react';
import { Avatar, go, RecipeThumb, Ok } from '../components/ui';
import { dayKeyOf, weekIdOf } from '../lib/dates';
import { kidsFavorites, MEAL_NAMES, pendingRequests, thawBanner, votingWeekId } from '../lib/logic';
import type { MealType } from '../lib/types';
import { useApp } from '../state';

function greeting(h: number) {
  if (h < 5) return 'לילה טוב';
  if (h < 12) return 'בוקר טוב';
  if (h < 17) return 'צהריים טובים';
  return 'ערב טוב';
}

export default function Home() {
  const { me, isParent, getWeek, recipeMap, recipes, pendingRecipes, pantry, shopping, votes, settings, requests } = useApp();
  const asks = pendingRequests(requests);
  const now = new Date();
  const banner = thawBanner(now, getWeek, recipeMap, pantry);
  const doneKey = banner ? `kk-thaw-done-${banner.date}-${banner.when}` : '';
  const [done, setDone] = useState(() => (doneKey ? localStorage.getItem(doneKey) === banner?.text : false));
  const today = getWeek(weekIdOf(now))?.days[dayKeyOf(now)];
  const vw = votingWeekId(now);
  const myVote = votes.find((v) => v.weekId === vw && v.memberId === me?.id);
  const kidVotes = votes.filter((v) => v.weekId === vw && v.recipeIds.length);
  const pending = shopping.filter((s) => s.status === 'pending');
  const favs = kidsFavorites(recipes, settings?.members ?? []).slice(0, 8);

  return (
    <div className="stack">
      <h1 className="hello">{greeting(now.getHours())}, {me?.name} 👋</h1>

      {banner && !done && (
        <section className="thaw-banner" role="alert">
          <div className="thaw-icon">🧊</div>
          <div className="thaw-text">
            <strong>{banner.text}</strong>
            <span>{banner.alerts.map((a) => `${MEAL_NAMES[a.meal]}: ${a.recipe}`).join(' · ')}</span>
          </div>
          <button className="btn small white" onClick={() => {
            localStorage.setItem(doneKey, banner.text);
            setDone(true);
          }}>הוצאתי <Ok /></button>
        </section>
      )}

      <section className="card">
        <div className="card-head">
          <h2>מה אוכלים היום</h2>
          <button className="link" onClick={() => go('menu')}>לכל השבוע ←</button>
        </div>
        <div className="today-grid">
          {(['lunch', 'dinner'] as MealType[]).map((meal) => {
            const ids = today?.[meal]?.recipeIds ?? [];
            return (
              <div key={meal} className="today-meal">
                <div className="meal-label">{meal === 'lunch' ? '☀️' : '🌙'} {MEAL_NAMES[meal]}</div>
                {ids.length ? ids.map((id) => {
                  const r = recipeMap.get(id);
                  return r ? (
                    <button key={id} className="today-dish" onClick={() => go(`recipe/${id}`)}>
                      <RecipeThumb recipe={r} size="sm" />
                      <span>{r.title}</span>
                    </button>
                  ) : null;
                }) : <div className="muted small">עוד לא נקבע</div>}
              </div>
            );
          })}
        </div>
      </section>

      {!isParent && (
        <button className="cta cta-lavender" onClick={() => go('vote')}>
          <span className="cta-emoji">🗳️</span>
          <span>
            <strong>מה בא לך לאכול בשבוע הבא?</strong>
            <span>{myVote?.recipeIds.length ? `בחרת ${myVote.recipeIds.length} מנות – אפשר לשנות` : 'בוחרים עד 5 מנות ואמא ואבא יכניסו לתפריט'}</span>
          </span>
        </button>
      )}

      {isParent && (asks.length > 0 || pending.length > 0 || kidVotes.length > 0 || pendingRecipes.length > 0) && (
        <section className="card soft-peach">
          <h2>מחכה לך</h2>
          {asks.length > 0 && (
            <button className="row-btn" onClick={() => go('bell')}>
              🙋 {asks.length === 1 ? 'בקשה אחת של הילדים מחכה לאישור' : `${asks.length} בקשות של הילדים מחכות לאישור`}
            </button>
          )}
          {pending.length > 0 && (
            <button className="row-btn" onClick={() => go('shop')}>
              🛒 {pending.length} בקשות לרשימת הקניות מחכות לאישור
            </button>
          )}
          {pendingRecipes.length > 0 && (
            <button className="row-btn" onClick={() => go(pendingRecipes.length === 1 ? `recipe/${pendingRecipes[0].id}` : 'recipes')}>
              📖 {pendingRecipes.length === 1 ? `מתכון חדש שהילדים הציעו: ${pendingRecipes[0].title}` : `${pendingRecipes.length} מתכונים חדשים שהילדים הציעו`}
            </button>
          )}
          {kidVotes.length > 0 && (
            <button className="row-btn" onClick={() => go('menu/next')}>
              <span className="avatars">
                {kidVotes.map((v) => {
                  const m = settings?.members.find((x) => x.id === v.memberId);
                  return m ? <Avatar key={v.id} m={m} size={26} /> : null;
                })}
              </span>
              הילדים בחרו מנות לשבוע הבא – לבנות תפריט
            </button>
          )}
        </section>
      )}

      <button className="cta cta-mint" onClick={() => go('ideas')}>
        <span className="cta-emoji">✨</span>
        <span>
          <strong>מה מכינים הערב?</strong>
          <span>רעיונות לפי מה שיש בבית ומה שהמשפחה אוהבת</span>
        </span>
      </button>

      {favs.length > 0 && (
        <section>
          <h2 className="section-title">💜 הכי אהובים על הילדים</h2>
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
    </div>
  );
}
