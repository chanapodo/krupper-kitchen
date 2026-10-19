import { useState } from 'react';
import { Avatar, Chips, Empty, Ok, X } from '../components/ui';
import { SUGGESTIONS } from '../data/catalog';
import { shiftWeek, weekIdOf, weekLabel } from '../lib/dates';
import { addToPantry, buildList, emptyWeek, listPermissions, newShoppingItem, type ListRow } from '../lib/logic';
import { formatQty } from '../lib/units';
import { useApp } from '../state';

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
    const res = addToPantry(pantry, { name: row.name, qty: row.qty, unit: row.unit });
    const prev = res.id ? pantry.find((p) => p.id === res.id) : undefined;
    const pid = res.id ?? store.newId();
    await store.set(`pantry/${pid}`, res.data as unknown as Record<string, unknown>);
    if (row.item) await store.remove(`shopping/${row.item.id}`);
    toast(`${row.name} עבר ל״מה יש בבית״ 🧺`, async () => {
      if (prev) await store.set(`pantry/${pid}`, prev as unknown as Record<string, unknown>);
      else await store.remove(`pantry/${pid}`);
      if (row.item) await store.set(`shopping/${row.item.id}`, row.item as unknown as Record<string, unknown>);
    });
  };

  const skip = async (row: ListRow) => {
    const w = structuredClone(week ?? emptyWeek(weekId));
    const key = row.id.slice('menu:'.length);
    w.skipped = [...new Set([...(w.skipped ?? []), key])];
    await store.set(`weeks/${w.id}`, w as unknown as Record<string, unknown>);
    toast(`${row.name} הוסר מהרשימה`, async () => {
      const w2 = structuredClone(w);
      w2.skipped = w2.skipped.filter((k) => k !== key);
      await store.set(`weeks/${w2.id}`, w2 as unknown as Record<string, unknown>);
    });
  };

  const remove = async (row: ListRow) => {
    if (!row.item) return;
    await store.remove(`shopping/${row.item.id}`);
    const item = row.item;
    toast(`${row.name} נמחק`, () => store.set(`shopping/${item.id}`, item as unknown as Record<string, unknown>));
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
                <button className="btn small ghost" onClick={() => store.remove(`shopping/${p.id}`)} aria-label={`לדחות ${p.name}`}><X /></button>
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
                <li key={row.id} className="list-row">
                  {perm.check ? (
                    <button className="check" onClick={() => buy(row)} aria-label={`נקנה: ${row.name}`} />
                  ) : (
                    <span className="dot" aria-hidden />
                  )}
                  <span className="grow">
                    <span className="item-name">{row.name}</span>
                    {row.qty !== undefined && <span className="item-qty"> {formatQty(row.qty, row.unit)}</span>}
                    {row.fromMenu && <span className="from-menu" title={row.recipes?.join(', ')}>📅 {row.recipes?.slice(0, 2).join(', ')}{(row.recipes?.length ?? 0) > 2 ? '…' : ''}</span>}
                  </span>
                  {perm.remove && (row.fromMenu ? (
                    <button className="link small" onClick={() => skip(row)}>יש / לא צריך</button>
                  ) : (
                    <button className="icon-btn small" onClick={() => remove(row)} aria-label={`למחוק ${row.name}`}><X /></button>
                  ))}
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
      {isParent && total > 0 && <p className="muted small center">מסמנים <Ok /> כשקונים – הפריט עובר אוטומטית ל״מה יש בבית״.</p>}
    </div>
  );
}
