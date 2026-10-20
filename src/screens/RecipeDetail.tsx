import { useState } from 'react';
import { Avatar, Chips, Empty, go, KosherBadge, RATING_FACES, RecipeThumb, Sheet, youtubeId, youtubeSearch, Ok } from '../components/ui';
import { ingredientKey, isStaple } from '../data/catalog';
import { DAY_NAMES, shiftWeek, weekIdOf, weekLabel } from '../lib/dates';
import { avgRating, canAddToSlot, emptyWeek, haveAtHome, MEAL_NAMES, newShoppingItem, pantryIndex, weekDays, onList, verb } from '../lib/logic';
import type { MealType } from '../lib/types';
import { formatQty } from '../lib/units';
import { useApp } from '../state';

const DIFF = ['', 'קל', 'בינוני', 'מאתגר'];

export default function RecipeDetail({ id }: { id: string }) {
  const { recipeMap, me, isParent, store, settings, pantry, shopping, toast, getWeek, notify } = useApp();
  const r = recipeMap.get(id);
  const [planning, setPlanning] = useState(false);
  const cur = weekIdOf(new Date());
  const [wk, setWk] = useState(cur);
  if (!r) return <Empty emoji="🤷">המתכון לא נמצא</Empty>;

  const idx = pantryIndex(pantry);
  const missing = r.ingredients.filter((i) => !isStaple(i.name) && !haveAtHome(i.name, idx));
  const listed = new Set(shopping.filter(onList).map((s) => ingredientKey(s.name)));
  const avg = avgRating(r);
  const vid = youtubeId(r.videoUrl);

  const rate = (v: number) => me && store.update(`recipes/${r.id}`, { [`ratings.${me.id}`]: v });

  const addMissing = async () => {
    if (!me) return;
    const todo = missing.filter((i) => !listed.has(ingredientKey(i.name)));
    const ids: string[] = [];
    for (const i of todo) {
      const id = store.newId();
      await store.set(`shopping/${id}`, { ...newShoppingItem(i.name, me.id, isParent, i.qty, i.unit), uid: store.uid() } as unknown as Record<string, unknown>);
      ids.push(id);
    }
    if (!todo.length) return toast('הכול כבר ברשימה');
    const withdraw = await notify('shop', `${me.name} ${verb(me, 'הוסיף')} לרשימת הקניות ${todo.length} מצרכים ל${r.title}: ${todo.map((i) => i.name).join(', ')}`);
    toast(`${todo.length} פריטים נוספו לרשימה`, async () => {
      for (const id of ids) await store.remove(`shopping/${id}`);
      await withdraw?.();
    });
  };

  const place = async (day: keyof typeof DAY_NAMES, meal: MealType) => {
    const w = structuredClone(getWeek(wk) ?? emptyWeek(wk));
    const slot = ((w.days[day] ??= {})[meal] ??= { recipeIds: [] });
    if (!slot.recipeIds.includes(r.id)) slot.recipeIds.push(r.id);
    await store.set(`weeks/${wk}`, w as unknown as Record<string, unknown>);
    setPlanning(false);
    toast(`נוסף ל${DAY_NAMES[day]} ${MEAL_NAMES[meal]}, ${weekLabel(wk)}`);
  };

  const approve = async () => {
    const { status: _status, ...rest } = r;
    await store.set(`recipes/${r.id}`, rest as unknown as Record<string, unknown>);
    toast(`${r.title} נכנס לספר המתכונים 🎉`);
  };

  // kept for 30 days under "נמחקו לאחרונה" in the recipe bank, so it can be restored later
  const softDelete = () => store.update(`recipes/${r.id}`, { removedAt: Date.now() });
  const back = () => store.set(`recipes/${r.id}`, r as unknown as Record<string, unknown>);

  const reject = async () => {
    if (!confirm(`לדחות את ההצעה ${r.title}?`)) return;
    await softDelete();
    toast(`נדחתה ההצעה: ${r.title}`, back);
    history.back();
  };

  const del = async () => {
    if (!confirm(`למחוק את ${r.title}?`)) return;
    await softDelete();
    toast(`נמחק: ${r.title}`, back);
    go('recipes');
  };

  return (
    <div className="stack recipe-detail">
      <button className="link back" onClick={() => history.back()}>→ חזרה</button>
      {r.status === 'pending' && (
        <section className="card soft-butter">
          <strong>💡 הצעה של {settings?.members.find((m) => m.id === r.createdBy)?.name ?? 'הילדים'} – מחכה לאישור הורה</strong>
          {isParent ? (
            <div className="action-row">
              <button className="btn" onClick={approve}><Ok /> לאשר לספר המתכונים</button>
              <button className="btn ghost" onClick={() => go(`edit/${r.id}`)}>✏️ לערוך קודם</button>
              <button className="btn ghost danger" onClick={reject}>לא הפעם</button>
            </div>
          ) : <span className="small">אחרי שאמא או אבא יאשרו, המנה תיכנס לספר המתכונים.</span>}
        </section>
      )}
      <div className="hero">
        <RecipeThumb recipe={r} size="lg" />
        <div className="hero-text">
          <h1>{r.title}</h1>
          <div className="meta-line">
            <KosherBadge k={r.kosher} />
            <span className="badge">{r.cuisine}</span>
            <span className="badge">⏱ {r.minutes} דק׳</span>
            <span className="badge">{'●'.repeat(r.difficulty)}{'○'.repeat(3 - r.difficulty)} {DIFF[r.difficulty]}</span>
            {r.kidsCanHelp && <span className="badge kids">👧 הילדים יכולים לעזור</span>}
          </div>
          {r.tags.length > 0 && <div className="tags">{r.tags.map((t) => <span key={t} className="tag">#{t}</span>)}</div>}
        </div>
      </div>

      <div className="action-row">
        {isParent && <button className="btn" onClick={() => setPlanning(true)}>📅 לתפריט</button>}
        {missing.length > 0 && <button className="btn soft" onClick={addMissing}>🛒 {isParent ? 'חסרים לרשימה' : 'לבקש את החסרים'} ({missing.length})</button>}
        {isParent && <button className="btn ghost" onClick={() => go(`edit/${r.id}`)}>✏️ עריכה</button>}
      </div>

      <section className="card">
        <div className="card-head">
          <h2>מה המשפחה חושבת</h2>
          {avg !== undefined && <span className="muted">⭐ {avg.toFixed(1)}</span>}
        </div>
        <div className="ratings">
          {settings?.members.map((m) => {
            const v = r.ratings?.[m.id];
            const mine = m.id === me?.id;
            return (
              <div key={m.id} className={`rating-row ${mine ? 'mine' : ''}`}>
                <Avatar m={m} size={30} />
                <span className="rating-name">{m.name}</span>
                <span className="faces" role={mine ? 'radiogroup' : undefined} aria-label={mine ? 'הדירוג שלי' : undefined}>
                  {RATING_FACES.map((f, i) => (
                    mine ? (
                      <button key={i} className={`face ${v === i + 1 ? 'on' : ''}`} onClick={() => rate(i + 1)} aria-label={`דירוג ${i + 1}`} role="radio" aria-checked={v === i + 1}>{f}</button>
                    ) : (
                      <span key={i} className={`face ${v === i + 1 ? 'on' : 'off'}`}>{f}</span>
                    )
                  ))}
                </span>
              </div>
            );
          })}
        </div>
      </section>

      <section className="card">
        <h2>מצרכים</h2>
        <ul className="ing-list">
          {r.ingredients.map((i, n) => {
            const staple = isStaple(i.name);
            const has = staple || haveAtHome(i.name, idx);
            return (
              <li key={n} className={has ? 'has' : 'missing'}>
                <span className="ing-mark">{has ? <Ok /> : '○'}</span>
                <span className="grow">{i.name}</span>
                <span className="muted">{formatQty(i.qty, i.unit)}</span>
                {!has && <span className="small missing-tag">{listed.has(ingredientKey(i.name)) ? 'ברשימה' : 'חסר'}</span>}
              </li>
            );
          })}
        </ul>
      </section>

      <section className="card">
        <h2>אופן ההכנה</h2>
        <ol className="steps">
          {r.steps.map((s, n) => <li key={n}><span className="step-num">{n + 1}</span><span>{s}</span></li>)}
        </ol>
      </section>

      <section className="card">
        <h2>🎬 סרטון</h2>
        {vid ? (
          <div className="video">
            <iframe src={`https://www.youtube-nocookie.com/embed/${vid}`} title={r.title} allowFullScreen loading="lazy"
              allow="accelerometer; encrypted-media; gyroscope; picture-in-picture" />
          </div>
        ) : (
          <a className="btn soft" href={youtubeSearch(r.title)} target="_blank" rel="noreferrer">חיפוש סרטון ביוטיוב ↗</a>
        )}
        {r.link && <p><a href={r.link} target="_blank" rel="noreferrer">🔗 קישור למתכון המקורי</a></p>}
      </section>

      {isParent && <button className="btn ghost danger" onClick={del}>מחיקת המתכון</button>}

      {planning && (
        <Sheet title={`לתפריט: ${r.title}`} onClose={() => setPlanning(false)}>
          <Chips value={wk} onChange={setWk} label="שבוע" options={[
            { v: cur, label: weekLabel(cur) }, { v: shiftWeek(cur, 1), label: weekLabel(shiftWeek(cur, 1)) },
          ]} />
          <div className="place-grid">
            {weekDays(!!settings?.shabbat).map((day) => (['lunch', 'dinner'] as MealType[]).filter((m) => r.meals.includes(m)).map((meal) => {
              const ids = getWeek(wk)?.days[day]?.[meal]?.recipeIds ?? [];
              const ok = canAddToSlot(r, ids, recipeMap);
              return (
                <button key={day + meal} className="place" disabled={!ok || ids.includes(r.id)} onClick={() => place(day, meal)}>
                  <strong>{DAY_NAMES[day]}</strong> {MEAL_NAMES[meal]}
                  <span className="muted small">{!ok ? 'לא כשר יחד' : ids.length ? ids.map((x) => recipeMap.get(x)?.title ?? '').join(', ') : 'פנוי'}</span>
                </button>
              );
            }))}
          </div>
        </Sheet>
      )}
    </div>
  );
}
