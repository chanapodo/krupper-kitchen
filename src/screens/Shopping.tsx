import { useEffect, useRef, useState } from 'react';
import { Avatar, Chips, Empty, Ok, X } from '../components/ui';
import { SUGGESTIONS } from '../data/catalog';
import { shiftWeek, weekIdOf, weekLabel } from '../lib/dates';
import {
  addToPantry, buildList, coveredByPantry, doneRecord, emptyWeek, listPermissions, newShoppingItem, recentDone, restoredItem,
  staleDone, undoPantry, type ListRow,
} from '../lib/logic';
import type { ShoppingItem } from '../lib/types';
import { formatQty } from '../lib/units';
import { useApp } from '../state';

const LEAVE_MS = 2500;

function timeAgo(t: number, now = Date.now()): string {
  const m = Math.round((now - t) / 60000);
  if (m < 1) return 'עכשיו';
  if (m < 60) return `לפני ${m} דק׳`;
  const h = Math.round(m / 60);
  return h === 1 ? 'לפני שעה' : `לפני ${h} שעות`;
}

export default function ShoppingScreen() {
  const { isParent, me, getWeek, recipeMap, pantry, shopping, store, toast, settings } = useApp();
  const cur = weekIdOf(new Date());
  // from Thursday on, the shopping is usually for next week
  const [weekId, setWeekId] = useState(new Date().getDay() >= 4 ? shiftWeek(cur, 1) : cur);
  const [name, setName] = useState('');
  const [qty, setQty] = useState('');
  const perm = listPermissions(isParent);
  const week = getWeek(weekId);
  const { groups, pending } = buildList(week, recipeMap, pantry, shopping);
  const total = groups.reduce((n, g) => n + g.rows.length, 0);
  const memberName = (id: string) => settings?.members.find((m) => m.id === id);
  const covered = isParent ? coveredByPantry(week, recipeMap, pantry, shopping.filter((i) => i.status !== 'pending')) : [];
  const recent = isParent ? recentDone(shopping) : [];

  // undo may run after more changes (or after leaving the screen): read the latest state then
  const latest = useRef({ pantry, getWeek });
  latest.current = { pantry, getWeek };

  // a parent's device tidies history older than a week
  useEffect(() => {
    if (isParent) for (const old of staleDone(shopping)) store.remove(`shopping/${old.id}`);
  }, [isParent, shopping, store]);

  /** Put a bought / removed item back on the list (and take a purchase back out of the pantry). */
  const restore = async (rec: ShoppingItem) => {
    if (rec.pantry) {
      const u = undoPantry(latest.current.pantry, rec.pantry);
      if (u && 'remove' in u) await store.remove(`pantry/${rec.pantry.id}`);
      else if (u) await store.set(`pantry/${rec.pantry.id}`, u.data as unknown as Record<string, unknown>);
    }
    if (rec.menuKey && rec.weekId) {
      const w = latest.current.getWeek(rec.weekId);
      if (w?.skipped?.includes(rec.menuKey)) {
        await store.set(`weeks/${w.id}`, { ...w, skipped: w.skipped.filter((k) => k !== rec.menuKey) } as unknown as Record<string, unknown>);
      }
    }
    if (rec.menuKey) await store.remove(`shopping/${rec.id}`);
    else await store.set(`shopping/${rec.id}`, restoredItem(rec) as unknown as Record<string, unknown>);
  };

  /** Write the history record and offer the big undo toast. */
  const done = async (row: ListRow | ShoppingItem, kind: 'bought' | 'removed', msg: string, extra: Parameters<typeof doneRecord>[3] = {}) => {
    const isRow = 'fromMenu' in row;
    const own = isRow ? row.item : row;
    const id = own?.id ?? store.newId();
    const rec = doneRecord(row, kind, me?.id ?? '', extra);
    await store.set(`shopping/${id}`, rec as unknown as Record<string, unknown>);
    toast(msg, () => restore({ ...rec, id }));
  };

  const add = async () => {
    const n = name.trim();
    if (!n || !me) return;
    const q = qty.trim() ? Number(qty) : undefined;
    const item = newShoppingItem(n, me.id, isParent, Number.isFinite(q) ? q : undefined);
    await store.set(`shopping/${store.newId()}`, item as unknown as Record<string, unknown>);
    setName('');
    setQty('');
    toast(isParent ? `${item.name} נוסף לרשימה` : `${item.name} נשלח לאישור ההורים 🙏`);
  };

  const buy = async (row: ListRow) => {
    const res = addToPantry(latest.current.pantry, { name: row.name, qty: row.qty, unit: row.unit });
    const prev = res.id ? latest.current.pantry.find((p) => p.id === res.id) : undefined;
    const pid = res.id ?? store.newId();
    await store.set(`pantry/${pid}`, res.data as unknown as Record<string, unknown>);
    await done(row, 'bought', `נקנה: ${row.name}`, {
      pantry: { id: pid, created: !prev, qty: row.qty, unit: row.unit, prevQty: prev?.qty, prevUnit: prev?.unit },
    });
  };

  // a ticked row stays a moment, struck through, before it leaves; a second tap keeps it
  const [leaving, setLeaving] = useState<Record<string, true>>({});
  const timers = useRef(new Map<string, { t: ReturnType<typeof setTimeout>; run: () => void }>());
  const tick = (row: ListRow) => {
    const cur = timers.current.get(row.id);
    if (cur) {
      clearTimeout(cur.t);
      timers.current.delete(row.id);
      setLeaving(({ [row.id]: _, ...rest }) => rest);
      return;
    }
    const run = () => {
      timers.current.delete(row.id);
      buy(row).finally(() => setLeaving(({ [row.id]: _, ...rest }) => rest));
    };
    timers.current.set(row.id, { t: setTimeout(run, LEAVE_MS), run });
    setLeaving((l) => ({ ...l, [row.id]: true }));
  };
  // leaving the screen: finish the ticks already made
  useEffect(() => () => {
    for (const { t, run } of timers.current.values()) {
      clearTimeout(t);
      run();
    }
  }, []);

  const skip = async (row: ListRow) => {
    const w = structuredClone(week ?? emptyWeek(weekId));
    const key = row.id.slice('menu:'.length);
    w.skipped = [...new Set([...(w.skipped ?? []), key])];
    await store.set(`weeks/${w.id}`, w as unknown as Record<string, unknown>);
    await done(row, 'removed', `הוסר: ${row.name}`, { weekId: w.id });
  };

  const remove = (row: ListRow) => done(row, 'removed', `הוסר: ${row.name}`);
  const reject = (p: ShoppingItem) => done(p, 'removed', `נדחה: ${p.name}`);

  const addAnyway = async (c: (typeof covered)[number]) => {
    if (!me) return;
    const item = { ...newShoppingItem(c.name, me.id, true, c.qty, c.unit), aisle: c.aisle };
    const id = store.newId();
    await store.set(`shopping/${id}`, item as unknown as Record<string, unknown>);
    toast(`נוסף לרשימה: ${c.name}`, () => store.remove(`shopping/${id}`));
  };

  const myPending = pending.filter((p) => p.addedBy === me?.id);

  return (
    <div className="stack">
      <div className="page-head">
        <h1>🛒 רשימת קניות</h1>
        <span className="muted small">{total} פריטים</span>
      </div>
      <Chips value={weekId} onChange={setWeekId} label="לאיזה שבוע" options={[
        { v: cur, label: `תפריט ${weekLabel(cur)}` }, { v: shiftWeek(cur, 1), label: `תפריט ${weekLabel(shiftWeek(cur, 1))}` },
      ]} />

      <section className="card add-card">
        <div className="add-row">
          <input className="input grow" list="ingredient-suggestions" placeholder={isParent ? 'מה להוסיף?' : 'מה צריך לקנות? (ההורים יאשרו)'}
            value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} aria-label="פריט" />
          <input className="input qty" inputMode="decimal" placeholder="כמה" value={qty} onChange={(e) => setQty(e.target.value)} aria-label="כמות" />
          <button className="btn" onClick={add}>{isParent ? 'הוספה' : 'הצעה'}</button>
        </div>
        <datalist id="ingredient-suggestions">
          {SUGGESTIONS.map((s) => <option key={s} value={s} />)}
        </datalist>
      </section>

      {isParent && pending.length > 0 && (
        <section className="card soft-peach">
          <h2>🙋 בקשות שמחכות לאישור</h2>
          {pending.map((p) => {
            const m = memberName(p.addedBy);
            return (
              <div key={p.id} className="pending-row">
                {m && <Avatar m={m} size={28} />}
                <span className="grow"><strong>{p.name}</strong>{p.qty ? ` · ${formatQty(p.qty, p.unit)}` : ''} <span className="muted small">({m?.name})</span></span>
                <button className="btn small ok" onClick={() => store.update(`shopping/${p.id}`, { status: 'active' })} aria-label={`לאשר ${p.name}`}><Ok /> אישור</button>
                <button className="btn small ghost" onClick={() => reject(p)} aria-label={`לדחות ${p.name}`}><X /></button>
              </div>
            );
          })}
        </section>
      )}

      {!isParent && myPending.length > 0 && (
        <section className="card soft-butter">
          <h2>⏳ ההצעות שלי</h2>
          {myPending.map((p) => (
            <div key={p.id} className="pending-row">
              <span className="grow">{p.name}</span>
              <span className="pill">מחכה לאישור</span>
            </div>
          ))}
        </section>
      )}

      {!isParent && <p className="note">👀 רק ההורים מסמנים ומוחקים פריטים. אפשר להציע תוספות והן יגיעו אליהם לאישור.</p>}

      {total === 0 ? (
        <Empty emoji="🎉">הרשימה ריקה! כל מה שצריך לתפריט כבר בבית.</Empty>
      ) : (
        groups.map((g) => (
          <section key={g.aisle} className="aisle">
            <h3 className="aisle-title">{g.aisle}</h3>
            <ul className="list">
              {g.rows.map((row) => (
                <li key={`${row.id}|${row.unit ?? ""}`} className={`list-row ${leaving[row.id] ? 'leaving' : ''}`}>
                  {perm.check ? (
                    <button className="check" role="checkbox" aria-checked={!!leaving[row.id]} onClick={() => tick(row)} aria-label={`נקנה: ${row.name}`}>
                      {leaving[row.id] && <Ok />}
                    </button>
                  ) : (
                    <span className="dot" aria-hidden />
                  )}
                  <span className="grow">
                    <span className="item-name">{row.name}</span>
                    {row.qty !== undefined && <span className="item-qty"> {formatQty(row.qty, row.unit)}</span>}
                    {row.fromMenu && <span className="from-menu" title={row.recipes?.join(', ')}>📅 {row.recipes?.slice(0, 2).join(', ')}{(row.recipes?.length ?? 0) > 2 ? '…' : ''}</span>}
                  </span>
                  {perm.remove && !leaving[row.id] && (row.fromMenu ? (
                    <button className="btn small ghost have-btn" onClick={() => skip(row)} aria-label={`יש / לא צריך: ${row.name}`}>יש / לא צריך</button>
                  ) : (
                    <button className="icon-btn small" onClick={() => remove(row)} aria-label={`למחוק ${row.name}`}><X /></button>
                  ))}
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
      {isParent && total > 0 && <p className="muted small center">מסמנים את הריבוע כשקונים – הפריט עובר ל״מה יש בבית״. טעות? ״בטל״ למטה, או ״החזר לרשימה״ בסוף הרשימה.</p>}

      {covered.length > 0 && (
        <details className="card history covered">
          <summary>🏠 יש בבית, ולכן לא ברשימה ({covered.length})</summary>
          <ul className="history-list">
            {covered.map((c) => (
              <li key={`${c.key}|${c.unit ?? ""}`} className="history-row">
                <span className="grow">
                  <span className="item-name">{c.name}</span>
                  <span className="from-menu">יש בבית: {c.have.map((h) => h.qty !== undefined ? formatQty(h.qty, h.unit) : 'יש').join(', ')}
                    {c.qty !== undefined && ` · צריך ${formatQty(c.qty, c.unit)}`} · 📅 {c.recipes.slice(0, 2).join(', ')}</span>
                </span>
                <button className="btn small ghost" onClick={() => addAnyway(c)} aria-label={`להוסיף בכל זאת: ${c.name}`}>להוסיף בכל זאת</button>
              </li>
            ))}
          </ul>
        </details>
      )}

      {recent.length > 0 && (
        <details className="card history recent">
          <summary>↩ נקנו והוסרו לאחרונה ({recent.length})</summary>
          <ul className="history-list">
            {recent.map((r) => (
              <li key={r.id} className="history-row">
                <span className="history-icon" aria-hidden>{r.status === 'bought' ? '🧺' : r.prevStatus === 'pending' ? '🙅' : '🗑️'}</span>
                <span className="grow">
                  <span className="item-name">{r.name}</span>
                  {r.qty !== undefined && <span className="item-qty"> {formatQty(r.qty, r.unit)}</span>}
                  <span className="from-menu">
                    {r.status === 'bought' ? 'נקנה' : r.prevStatus === 'pending' ? 'נדחה' : 'הוסר'} {timeAgo(r.doneAt ?? 0)}{r.doneBy && memberName(r.doneBy) ? ` · ${memberName(r.doneBy)?.name}` : ''}
                  </span>
                </span>
                <button className="btn small" onClick={async () => { await restore(r); toast(`${r.name} חזר לרשימה`); }} aria-label={`להחזיר לרשימה: ${r.name}`}>החזר לרשימה</button>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
