import { useState } from 'react';
import { Chips, Empty } from '../components/ui';
import { defaultLocation, displayName, ingredientKey, needsThaw, SUGGESTIONS } from '../data/catalog';
import { addToPantry, bumpPantry, newShoppingItem, onList } from '../lib/logic';
import type { Location, PantryItem } from '../lib/types';
import { formatQty } from '../lib/units';
import { useApp } from '../state';

const LOC: Record<Location, { label: string; icon: string }> = {
  fridge: { label: 'מקרר', icon: '🧊' },
  freezer: { label: 'מקפיא', icon: '❄️' },
  pantry: { label: 'ארון', icon: '🥫' },
};
const QUICK = ['ביצים', 'חלב', 'עגבניות', 'מלפפונים', 'בצל', 'גבינה צהובה', 'חזה עוף', 'בשר טחון', 'אורז', 'פסטה', 'לחם', 'תפוחי אדמה'];

export default function PantryScreen() {
  const { isParent, pantry, store, toast, me, shopping } = useApp();
  const [loc, setLoc] = useState<Location | 'all'>('all');
  const [q, setQ] = useState('');
  const [name, setName] = useState('');
  const [qty, setQty] = useState('');
  const [where, setWhere] = useState<Location | ''>('');

  const put = (id: string, data: Omit<PantryItem, 'id'>) => store.set(`pantry/${id}`, data as unknown as Record<string, unknown>);

  const add = async (n: string, q?: number, location?: Location) => {
    if (!n.trim()) return;
    const res = addToPantry(pantry, { name: n, qty: q });
    if (location && !res.id) res.data.location = location;
    await put(res.id ?? store.newId(), res.data);
    toast(`${displayName(n)} נוסף ל${LOC[res.data.location].label}`);
  };

  const submit = async () => {
    const q2 = qty.trim() ? Number(qty) : undefined;
    await add(name, Number.isFinite(q2) ? q2 : undefined, where || undefined);
    setName('');
    setQty('');
    setWhere('');
  };

  const bump = async (p: PantryItem, dir: 1 | -1) => {
    const next = bumpPantry(p, dir);
    if (next === null) {
      await store.remove(`pantry/${p.id}`);
      toast(`נגמר: ${p.name}`, () => put(p.id, p));
    } else {
      await store.update(`pantry/${p.id}`, { qty: next, updatedAt: Date.now() });
    }
  };

  const ranOut = async (p: PantryItem) => {
    if (!me) return;
    if (shopping.some((s) => onList(s) && ingredientKey(s.name) === ingredientKey(p.name))) {
      toast(`${p.name} כבר ברשימה`);
      return;
    }
    await store.set(`shopping/${store.newId()}`, newShoppingItem(p.name, me.id, isParent) as unknown as Record<string, unknown>);
    toast(isParent ? `${p.name} נוסף לרשימת הקניות` : `ביקשת מההורים לקנות ${p.name} 🙏`);
  };

  const shown = pantry
    .filter((p) => loc === 'all' || p.location === loc)
    .filter((p) => !q.trim() || p.name.includes(q.trim()))
    .sort((a, b) => a.name.localeCompare(b.name, 'he'));
  const have = new Set(pantry.map((p) => ingredientKey(p.name)));
  const quick = QUICK.filter((n) => !have.has(ingredientKey(n)));

  return (
    <div className="stack">
      <div className="page-head">
        <h1>🧺 מה יש בבית</h1>
        <span className="muted small">{pantry.length} פריטים</span>
      </div>

      {isParent && (
        <section className="card add-card">
          <div className="add-row wrap">
            <input className="input grow" list="pantry-suggestions" placeholder="מה הכנסנו הביתה?" value={name}
              onChange={(e) => { setName(e.target.value); setWhere(''); }} onKeyDown={(e) => e.key === 'Enter' && submit()} aria-label="פריט" />
            <input className="input qty" inputMode="decimal" placeholder="כמה" value={qty} onChange={(e) => setQty(e.target.value)} aria-label="כמות" />
            <select className="input loc" value={where || (name ? defaultLocation(name) : 'pantry')} onChange={(e) => setWhere(e.target.value as Location)} aria-label="איפה">
              {(Object.keys(LOC) as Location[]).map((l) => <option key={l} value={l}>{LOC[l].icon} {LOC[l].label}</option>)}
            </select>
            <button className="btn" onClick={submit}>הוספה</button>
          </div>
          <datalist id="pantry-suggestions">{SUGGESTIONS.map((s) => <option key={s} value={s} />)}</datalist>
          {quick.length > 0 && (
            <div className="quick">
              <span className="muted small">הוספה מהירה:</span>
              {quick.map((n) => <button key={n} className="chip" onClick={() => add(n)}>+ {n}</button>)}
            </div>
          )}
        </section>
      )}

      <div className="add-row">
        <input className="input grow" placeholder="חיפוש בבית…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <Chips<Location | 'all'> value={loc} onChange={setLoc} label="מיקום" options={[
        { v: 'all', label: 'הכול' }, ...(Object.keys(LOC) as Location[]).map((l) => ({ v: l, label: `${LOC[l].icon} ${LOC[l].label}` })),
      ]} />

      {!shown.length && <Empty emoji="🫙">אין כאן כלום עדיין</Empty>}

      {(Object.keys(LOC) as Location[]).filter((l) => loc === 'all' || loc === l).map((l) => {
        const items = shown.filter((p) => p.location === l);
        if (!items.length) return null;
        return (
          <section key={l} className={`pantry-section loc-${l}`}>
            <h3 className="aisle-title">{LOC[l].icon} {LOC[l].label}</h3>
            <ul className="list">
              {items.map((p) => (
                <li key={p.id} className="list-row">
                  <span className="grow">
                    <span className="item-name">{p.name}</span>
                    {l === 'freezer' && needsThaw(p.name) && <span className="badge thaw">צריך הפשרה</span>}
                  </span>
                  {isParent ? (
                    <span className="stepper">
                      <button className="step" onClick={() => bump(p, -1)} aria-label={`פחות ${p.name}`}>−</button>
                      <span className="step-val">{p.qty !== undefined ? formatQty(p.qty, p.unit) : 'יש'}</span>
                      <button className="step" onClick={() => bump(p, 1)} aria-label={`יותר ${p.name}`}>+</button>
                      <select className="mini-select" value={p.location} aria-label={`להעביר את ${p.name}`}
                        onChange={(e) => store.update(`pantry/${p.id}`, { location: e.target.value, updatedAt: Date.now() })}>
                        {(Object.keys(LOC) as Location[]).map((x) => <option key={x} value={x}>{LOC[x].icon}</option>)}
                      </select>
                    </span>
                  ) : (
                    <>
                      <span className="item-qty">{p.qty !== undefined ? formatQty(p.qty, p.unit) : ''}</span>
                      <button className="link small" onClick={() => ranOut(p)}>נגמר?</button>
                    </>
                  )}
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
