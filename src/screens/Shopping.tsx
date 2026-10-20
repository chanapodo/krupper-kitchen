import { useEffect, useRef, useState } from 'react';
import { useListActions, useRequests } from '../components/actions';
import ReceiptScan from '../components/ReceiptScan';
import { Avatar, Chips, Empty, Ok, Sheet, X } from '../components/ui';
import { SUGGESTIONS } from '../data/catalog';
import { shiftWeek, weekIdOf, weekLabel } from '../lib/dates';
import {
  buildList, coveredByPantry, listPermissions, newShoppingItem, recentDone, removalRequests, staleDone, verb, type ListRow,
} from '../lib/logic';
import { qtyLabel } from '../lib/pantry';
import type { ApprovalRequest, ShoppingItem } from '../lib/types';
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
  const { isParent, me, getWeek, recipeMap, pantry, shopping, store, toast, settings, requests, notify } = useApp();
  const { restore, done, buy, skip } = useListActions();
  const decisions = useRequests();
  const [scan, setScan] = useState(false);
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

  const removals = removalRequests(requests, weekId);

  // a parent's device tidies history older than a week
  useEffect(() => {
    if (isParent) for (const old of staleDone(shopping)) store.remove(`shopping/${old.id}`);
  }, [isParent, shopping, store]);

  const add = async () => {
    const n = name.trim();
    if (!n || !me) return;
    const q = qty.trim() ? Number(qty) : undefined;
    const item = { ...newShoppingItem(n, me.id, isParent, Number.isFinite(q) ? q : undefined), uid: store.uid() };
    const id = store.newId();
    try {
      await store.set(`shopping/${id}`, item as unknown as Record<string, unknown>);
    } catch (e) {
      // security rules from before v1.3: a kid's item can only be a suggestion
      if (isParent || (e as { code?: string })?.code !== 'permission-denied') throw e;
      await store.set(`shopping/${id}`, { ...item, status: 'pending' } as unknown as Record<string, unknown>);
      setName('');
      setQty('');
      toast(`${item.name} נשלח לאישור ההורים 🙏`);
      return;
    }
    setName('');
    setQty('');
    const withdraw = await notify('shop', `${me.name} ${verb(me, 'הוסיף')} ${item.name} לרשימת הקניות`);
    toast(`${item.name} נוסף לרשימה`, async () => {
      await store.remove(`shopping/${id}`);
      await withdraw?.();
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
      buy(row, `נקנה: ${row.name}`).finally(() => setLeaving(({ [row.id]: _, ...rest }) => rest));
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

  const notNeeded = (row: ListRow) => skip(row, weekId, `הוסר: ${row.name}`);
  const remove = (row: ListRow) => done(row, 'removed', `הוסר: ${row.name}`);
  const reject = (p: ShoppingItem) => done(p, 'removed', `נדחה: ${p.name}`);

  /** A kid's "not needed": a request a parent approves. */
  const askRemove = async (row: ListRow) => {
    if (!me) return;
    const id = store.newId();
    const req: Omit<ApprovalRequest, 'id'> = {
      kind: 'shop-remove', by: me.id, at: Date.now(), status: 'pending', title: row.name, uid: store.uid(),
      ...(row.fromMenu ? { menuKey: row.id.slice('menu:'.length), weekId } : { itemId: row.id }),
    };
    try {
      await store.set(`requests/${id}`, req as unknown as Record<string, unknown>);
    } catch {
      return; // refused (old security rules): the toast already says so
    }
    toast(`ביקשת להוריד את ${row.name}. ההורים יאשרו`, () => store.update(`requests/${id}`, { status: 'cancelled' }));
  };

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
          <input className="input grow" list="ingredient-suggestions" placeholder="מה להוסיף?"
            value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} aria-label="פריט" />
          <input className="input qty" inputMode="decimal" placeholder="כמה" value={qty} onChange={(e) => setQty(e.target.value)} aria-label="כמות" />
          <button className="btn" onClick={add}>הוספה</button>
        </div>
        <button className="link small receipt-link" onClick={() => setScan(true)}>🧾 חזרנו מהסופר? סריקת קבלה מסמנת מה נקנה</button>
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

      {!isParent && <p className="note">👀 מוסיפים, ומסמנים את הריבוע כשקונים. כדי להוריד פריט מהרשימה, ההורים צריכים לאשר.</p>}

      {total === 0 ? (
        <Empty emoji="🎉">הרשימה ריקה! כל מה שצריך לתפריט כבר בבית.</Empty>
      ) : (
        groups.map((g) => (
          <section key={g.aisle} className="aisle">
            <h3 className="aisle-title">{g.aisle}</h3>
            <ul className="list">
              {g.rows.map((row) => {
                const asked = removals.get(row.id);
                return (
                <li key={`${row.id}|${row.unit ?? ""}`} className={`list-row ${leaving[row.id] ? 'leaving' : ''} ${asked ? 'asked' : ''}`}>
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
                    {asked && (
                      <span className="asked-line">
                        {isParent ? `🙋 ${memberName(asked.by)?.name ?? ''} ${verb(memberName(asked.by), 'ביקש')} להוריד` : '⏳ ממתין לאישור הסרה'}
                      </span>
                    )}
                  </span>
                  {isParent && asked && !leaving[row.id] && (
                    <span className="asked-actions">
                      <button className="btn small ok" onClick={() => decisions.approve(asked)} aria-label={`לאשר הסרה: ${row.name}`}><Ok /> להוריד</button>
                      <button className="btn small ghost" onClick={() => decisions.reject(asked)} aria-label={`להשאיר: ${row.name}`}>להשאיר</button>
                    </span>
                  )}
                  {perm.remove && !asked && !leaving[row.id] && (row.fromMenu ? (
                    <button className="btn small ghost have-btn" onClick={() => notNeeded(row)} aria-label={`יש / לא צריך: ${row.name}`}>יש / לא צריך</button>
                  ) : (
                    <button className="icon-btn small" onClick={() => remove(row)} aria-label={`למחוק ${row.name}`}><X /></button>
                  ))}
                  {perm.requestRemove && !asked && !leaving[row.id] && (
                    <button className="btn small ghost have-btn" onClick={() => askRemove(row)} aria-label={`לא צריך: ${row.name}`}>לא צריך</button>
                  )}
                </li>
                );
              })}
            </ul>
          </section>
        ))
      )}
      {total > 0 && <p className="muted small center">מסמנים את הריבוע כשקונים – הפריט עובר ל״מה יש בבית״. טעות? ״בטל״ למטה, או ״החזר לרשימה״ בסוף הרשימה.</p>}

      {covered.length > 0 && (
        <details className="card history covered">
          <summary>🏠 יש בבית, ולכן לא ברשימה ({covered.length})</summary>
          <ul className="history-list">
            {covered.map((c) => (
              <li key={`${c.key}|${c.unit ?? ""}`} className="history-row">
                <span className="grow">
                  <span className="item-name">{c.name}</span>
                  <span className="from-menu">יש בבית: {c.have.map(qtyLabel).join(', ')}
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

      {scan && (
        <Sheet title="🧾 סריקת קבלה" onClose={() => setScan(false)}>
          <ReceiptScan weekId={weekId} onDone={() => setScan(false)} />
        </Sheet>
      )}
    </div>
  );
}
