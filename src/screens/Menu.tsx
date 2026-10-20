import { useState } from 'react';
import NewDish from '../components/NewDish';
import RecipePicker from '../components/RecipePicker';
import { Avatar, go, KosherBadge, RecipeThumb, Sheet, useRoute, Ok, X } from '../components/ui';
import { DAY_NAMES, dateOf, shiftWeek, shortDate, weekIdOf, weekLabel, ymd } from '../lib/dates';
import { useRequests } from '../components/actions';
import { emptyWeek, MEAL_NAMES, recipeNeedsThaw, slotRequests, voteCounts, weekDays, wishSummary } from '../lib/logic';
import type { ApprovalRequest, DayKey, MealType, Recipe, Week } from '../lib/types';
import { useApp } from '../state';

export default function MenuScreen() {
  const route = useRoute();
  const { isParent, me, getWeek, recipeMap, votes, settings, store, toast, requests } = useApp();
  const decisions = useRequests();
  const cur = weekIdOf(new Date());
  const [weekId, setWeekId] = useState(route[1] === 'next' ? shiftWeek(cur, 1) : cur);
  const [picking, setPicking] = useState<{ day: DayKey; meal: MealType } | null>(null);
  const [placing, setPlacing] = useState<Recipe | null>(null);
  const [fromWish, setFromWish] = useState<string | null>(null);
  const week: Week = getWeek(weekId) ?? emptyWeek(weekId);
  const days = weekDays(!!settings?.shabbat);
  const voters = voteCounts(votes, weekId);
  const wishes = wishSummary(week, votes, settings?.members ?? []);
  const todayYmd = ymd(new Date());

  const save = (w: Week) => store.set(`weeks/${w.id}`, w as unknown as Record<string, unknown>);

  const addDish = (day: DayKey, meal: MealType, r: Recipe) => {
    const w = structuredClone(week);
    const d = (w.days[day] ??= {});
    const slot = (d[meal] ??= { recipeIds: [] });
    if (!slot.recipeIds.includes(r.id)) slot.recipeIds.push(r.id);
    save(w);
    toast(`${r.title} נוסף ל${DAY_NAMES[day]} ${MEAL_NAMES[meal]}`);
  };

  /** A kid's dish: shown as "ממתין לאישור" until a parent approves it. */
  const suggestDish = async (day: DayKey, meal: MealType, r: Recipe) => {
    if (!me) return;
    const id = store.newId();
    const req: Omit<ApprovalRequest, 'id'> = {
      kind: 'menu-add', by: me.id, at: Date.now(), status: 'pending', title: r.title,
      weekId, day, meal, recipeId: r.id, uid: store.uid(),
    };
    try {
      await store.set(`requests/${id}`, req as unknown as Record<string, unknown>);
    } catch {
      return; // refused (old security rules): the toast already says so
    }
    toast(`${r.title} נוסף ל${DAY_NAMES[day]} ${MEAL_NAMES[meal]} – ממתין לאישור`, () => store.update(`requests/${id}`, { status: 'cancelled' }));
  };

  const removeDish = (day: DayKey, meal: MealType, id: string) => {
    const w = structuredClone(week);
    const slot = w.days[day]?.[meal];
    if (!slot) return;
    slot.recipeIds = slot.recipeIds.filter((x) => x !== id);
    save(w);
    const before = week;
    toast(`הוסר מהתפריט: ${recipeMap.get(id)?.title ?? ''}`, () => save(structuredClone(before)));
  };

  return (
    <div className="stack">
      <div className="week-nav">
        <button className="icon-btn" aria-label="שבוע קודם" onClick={() => setWeekId(shiftWeek(weekId, -1))}>→</button>
        <div className="week-title">
          <h1>{weekLabel(weekId)}</h1>
          <span className="muted small">{shortDate(dateOf(weekId, 'sun'))}–{shortDate(dateOf(weekId, days[days.length - 1]))}</span>
        </div>
        <button className="icon-btn" aria-label="שבוע הבא" onClick={() => setWeekId(shiftWeek(weekId, 1))}>←</button>
      </div>

      {!isParent && (
        <button className="cta cta-lavender" onClick={() => go('vote')}>
          <span className="cta-emoji">🗳️</span>
          <span><strong>להצביע על התפריט של השבוע הבא</strong><span>ההורים רואים מה בחרת</span></span>
        </button>
      )}

      {isParent && wishes.some((w) => w.wished.length || w.wishes.length) && (
        <section className="card soft-lavender">
          <h2>💭 המשאלות של הילדים</h2>
          {wishes.map((w) => (
            <div key={w.member.id} className="wish-kid">
              <div className="wish-head">
                <Avatar m={w.member} size={30} />
                <strong>{w.member.name}</strong>
                {w.wished.length > 0 && (
                  <span className={`pill ${w.included.length ? 'ok' : 'warn'}`}>
                    {w.included.length}/{w.wished.length} בתפריט {w.included.length ? '' : '– עוד לא נכנס כלום!'}
                  </span>
                )}
              </div>
              <div className="wish-chips">
                {w.wished.map((id) => {
                  const r = recipeMap.get(id);
                  if (!r) return null;
                  const inMenu = w.included.includes(id);
                  if (r.status === 'pending') {
                    return (
                      <button key={id} className="wish" onClick={() => go(`recipe/${id}`)} title="הצעה חדשה – לבדוק ולאשר">
                        {r.emoji} {r.title} <span className="badge pending-badge">חדש – לאשר</span>
                      </button>
                    );
                  }
                  return (
                    <button key={id} className={`wish ${inMenu ? 'in' : ''}`} onClick={() => !inMenu && setPlacing(r)}
                      title={inMenu ? 'כבר בתפריט' : 'להוסיף לתפריט'}>
                      {inMenu ? <Ok /> : '+'} {r.emoji} {r.title}
                    </button>
                  );
                })}
                {w.wishes.map((t, i) => (
                  <button key={i} className="wish free" onClick={() => setFromWish(t)} title="למצוא מתכון ולהוסיף לתפריט">“{t}” +</button>
                ))}
              </div>
            </div>
          ))}
        </section>
      )}

      <div className="days">
        {days.map((day) => {
          const date = dateOf(weekId, day);
          const isToday = ymd(date) === todayYmd;
          return (
            <section key={day} className={`day-card ${isToday ? 'today' : ''}`}>
              <div className="day-head">
                <strong>{DAY_NAMES[day]}</strong>
                <span className="muted small">{shortDate(date)}</span>
                {isToday && <span className="pill ok">היום</span>}
              </div>
              <div className="slots">
                {(['lunch', 'dinner'] as MealType[]).map((meal) => {
                  const ids = week.days[day]?.[meal]?.recipeIds ?? [];
                  const asked = slotRequests(requests, weekId, day, meal);
                  return (
                    <div key={meal} className="slot">
                      <div className="meal-label">{meal === 'lunch' ? '☀️' : '🌙'} {MEAL_NAMES[meal]}</div>
                      {ids.map((id) => {
                        const r = recipeMap.get(id);
                        if (!r) return null;
                        return (
                          <div key={id} className="dish">
                            <button className="dish-main" onClick={() => go(`recipe/${id}`)}>
                              <RecipeThumb recipe={r} size="sm" />
                              <span className="dish-title">{r.title}</span>
                            </button>
                            <span className="dish-tags">
                              <KosherBadge k={r.kosher} />
                              {recipeNeedsThaw(r) && <span className="badge thaw" title="צריך להפשיר">❄️ להפשיר</span>}
                            </span>
                            {isParent && (
                              <button className="icon-btn small" aria-label={`להסיר את ${r.title}`} onClick={() => removeDish(day, meal, id)}><X /></button>
                            )}
                          </div>
                        );
                      })}
                      {asked.map((req) => {
                        const r = req.recipeId ? recipeMap.get(req.recipeId) : undefined;
                        const kid = settings?.members.find((m) => m.id === req.by);
                        return (
                          <div key={req.id} className="dish asked">
                            <button className="dish-main" onClick={() => r && go(`recipe/${r.id}`)}>
                              {r ? <RecipeThumb recipe={r} size="sm" /> : <span className="thumb thumb-sm" />}
                              <span className="dish-title">{r?.title ?? req.title}</span>
                            </button>
                            <span className="dish-tags">
                              <span className="pill warn">⏳ ממתין לאישור{kid ? ` · ${kid.name}` : ''}</span>
                            </span>
                            {isParent && (
                              <span className="asked-actions">
                                <button className="icon-btn small ok" aria-label={`לאשר את ${req.title}`} onClick={() => decisions.approve(req)}><Ok /></button>
                                <button className="icon-btn small" aria-label={`לדחות את ${req.title}`} onClick={() => decisions.reject(req)}><X /></button>
                              </span>
                            )}
                          </div>
                        );
                      })}
                      <button className="add-dish" onClick={() => setPicking({ day, meal })}>
                        + {isParent ? (ids.length ? 'עוד מנה' : 'בחירת מנה') : 'להוסיף מנה (באישור הורים)'}
                      </button>
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>

      {picking && (
        <RecipePicker
          title={`${DAY_NAMES[picking.day]} · ${MEAL_NAMES[picking.meal]}`}
          meal={picking.meal}
          current={week.days[picking.day]?.[picking.meal]?.recipeIds ?? []}
          voters={voters}
          onPick={(r) => { if (isParent) addDish(picking.day, picking.meal, r); else suggestDish(picking.day, picking.meal, r); setPicking(null); }}
          onClose={() => setPicking(null)}
        />
      )}

      {fromWish && (
        <Sheet title={`משאלה: ${fromWish}`} onClose={() => setFromWish(null)}>
          <NewDish query={fromWish} onSaved={(r) => { setFromWish(null); setPlacing(r); }} />
        </Sheet>
      )}

      {placing && (
        <Sheet title={`איפה לשים את ${placing.title}?`} onClose={() => setPlacing(null)}>
          <div className="place-grid">
            {days.map((day) => (['lunch', 'dinner'] as MealType[]).map((meal) => {
              if (!placing.meals.includes(meal)) return null;
              const ids = week.days[day]?.[meal]?.recipeIds ?? [];
              const conflict = ids.some((id) => {
                const o = recipeMap.get(id);
                return o && o.kosher !== 'parve' && placing.kosher !== 'parve' && o.kosher !== placing.kosher;
              });
              return (
                <button key={day + meal} className="place" disabled={conflict}
                  onClick={() => { addDish(day, meal, placing); setPlacing(null); }}>
                  <strong>{DAY_NAMES[day]}</strong> {MEAL_NAMES[meal]}
                  <span className="muted small">{conflict ? 'לא כשר יחד' : ids.length ? `${ids.length} מנות` : 'פנוי'}</span>
                </button>
              );
            }))}
          </div>
        </Sheet>
      )}
    </div>
  );
}
