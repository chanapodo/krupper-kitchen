import { useEffect, useRef, useState } from 'react';
import ReceiptScan from '../components/ReceiptScan';
import { Chips, Empty, Sheet, X } from '../components/ui';
import { defaultLocation, displayName, ingredientKey, needsThaw, SUGGESTIONS } from '../data/catalog';
import { addToPantry, bumpPantry, newShoppingItem, onList, verb } from '../lib/logic';
import {
  countOf, defaultMode, LEVEL_LABEL, LEVELS, levelOf, modeOf, needsRestock, qtyLabel, rank, switchMode,
} from '../lib/pantry';
import type { Level, Location, PantryItem } from '../lib/types';
import { useApp } from '../state';

export const LOC: Record<Location, { label: string; icon: string }> = {
  fridge: { label: 'מקרר', icon: '🧊' },
  freezer: { label: 'מקפיא', icon: '❄️' },
  pantry: { label: 'ארון', icon: '🥫' },
  home: { label: 'ניקיון וטיפוח', icon: '🧴' },
};
const QUICK = ['ביצים', 'חלב', 'עגבניות', 'מלפפונים', 'בצל', 'גבינה צהובה', 'חזה עוף', 'בשר טחון', 'אורז', 'פסטה', 'לחם', 'תפוחי אדמה', 'סבון כלים', 'נייר טואלט'];
const NOTE_MS = 3000;
const asDoc = (x: unknown) => x as Record<string, unknown>;

export default function PantryScreen() {
  const { isParent, pantry, removedPantry, store, toast, me, shopping, notify } = useApp();
  const [loc, setLoc] = useState<Location | 'all'>('all');
  const [q, setQ] = useState('');
  const [name, setName] = useState('');
  const [qty, setQty] = useState('');
  const [where, setWhere] = useState<Location | ''>('');
  const [scan, setScan] = useState(false);

  // a parent's device tidies items removed more than a week ago
  useEffect(() => {
    if (!isParent) return;
    for (const p of removedPantry) if ((p.removedAt ?? 0) < Date.now() - 7 * 24 * 3600_000) store.remove(`pantry/${p.id}`);
  }, [isParent, removedPantry, store]);

  // a kid's taps on one item become one notice for the parents, a moment after the last tap
  const notes = useRef(new Map<string, { t: ReturnType<typeof setTimeout>; before: PantryItem; send: (after: PantryItem) => void; after: PantryItem }>());
  useEffect(() => () => {
    for (const n of notes.current.values()) {
      clearTimeout(n.t);
      n.send(n.after);
    }
  }, []);
  const kidNote = (before: PantryItem, after: PantryItem) => {
    if (isParent || !me) return;
    const cur = notes.current.get(before.id);
    if (cur) clearTimeout(cur.t);
    const first = cur?.before ?? before;
    const send = (a: PantryItem) => {
      notes.current.delete(before.id);
      const out = modeOf(a) === 'level' ? levelOf(a) === 'out' : a.qty === 0;
      notify('pantry', out
        ? `${me.name} ${verb(me, 'סימן')} ש${a.name} נגמר`
        : `${me.name} ${verb(me, 'עדכן')} ${a.name}: ${qtyLabel(first)} ← ${qtyLabel(a)}`);
    };
    notes.current.set(before.id, { t: setTimeout(() => send(after), NOTE_MS), before: first, send, after });
  };

  /** Running low: put it on the shopping list (unless it's there already). Returns an undo. */
  const autoAdd = async (p: PantryItem) => {
    if (!me) return undefined;
    if (shopping.some((s) => onList(s) && ingredientKey(s.name) === ingredientKey(p.name))) return undefined;
    const id = store.newId();
    await store.set(`shopping/${id}`, asDoc({ ...newShoppingItem(p.name, me.id, true), uid: store.uid(), note: 'נגמר בבית' }));
    return () => store.remove(`shopping/${id}`);
  };

  const change = async (p: PantryItem, patch: Partial<PantryItem>) => {
    const after = { ...p, ...patch };
    await store.update(`pantry/${p.id}`, { ...patch, updatedAt: Date.now(), ...(me ? { updatedBy: me.id } : {}) });
    kidNote(p, after);
    const back = () => store.set(`pantry/${p.id}`, asDoc((({ id: _id, ...doc }) => doc)(p)));
    if (needsRestock(after) && !needsRestock(p)) {
      const undoList = await autoAdd(after);
      toast(`${p.name}: ${qtyLabel(after)}${undoList ? ' · נוסף לרשימת הקניות' : ''}`, async () => {
        await undoList?.();
        await back();
      });
    }
  };

  const remove = async (p: PantryItem) => {
    const { id: _id, ...doc } = p;
    await store.set(`pantry/${p.id}`, asDoc({ ...doc, removedAt: Date.now() }));
    toast(`הוסר: ${p.name}`, () => store.set(`pantry/${p.id}`, asDoc(doc)));
  };
  const unremove = async (p: PantryItem) => {
    const { id: _id, removedAt: _r, ...doc } = p;
    await store.set(`pantry/${p.id}`, asDoc(doc));
    toast(`${p.name} חזר ל״מה יש בבית״`);
  };

  const add = async (n: string, count?: number, location?: Location) => {
    if (!n.trim() || !me) return;
    const res = addToPantry(pantry, { name: n, qty: count, location });
    const prev = res.id ? pantry.find((p) => p.id === res.id) : undefined;
    const id = res.id ?? store.newId();
    await store.set(`pantry/${id}`, asDoc(res.id ? res.data : { ...res.data, uid: store.uid() }));
    const label = displayName(n);
    const withdraw = await notify('pantry', `${me.name} ${verb(me, 'הוסיף')} ${label} למה שיש בבית`);
    toast(`${label} נוסף ל${LOC[res.data.location].label}`, async () => {
      if (prev) {
        const { id: _id, ...doc } = prev;
        await store.set(`pantry/${id}`, asDoc(doc));
      } else await store.remove(`pantry/${id}`);
      await withdraw?.();
    });
  };

  const typedMode = name.trim() ? defaultMode(name, qty.trim() ? Number(qty) : undefined) : 'count';
  const submit = async () => {
    const q2 = qty.trim() ? Number(qty) : undefined;
    await add(name, Number.isFinite(q2) ? q2 : undefined, where || undefined);
    setName('');
    setQty('');
    setWhere('');
  };

  const shown = pantry
    .filter((p) => loc === 'all' || p.location === loc)
    .filter((p) => !q.trim() || p.name.includes(q.trim()))
    .sort((a, b) => a.name.localeCompare(b.name, 'he'));
  const have = new Set(pantry.map((p) => ingredientKey(p.name)));
  const quick = QUICK.filter((n) => !have.has(ingredientKey(n)));
  const recentlyRemoved = isParent ? [...removedPantry].sort((a, b) => (b.removedAt ?? 0) - (a.removedAt ?? 0)) : [];

  return (
    <div className="stack">
      <div className="page-head">
        <h1>🧺 מה יש בבית</h1>
        <span className="muted small">{pantry.length} פריטים</span>
      </div>

      <button className="cta cta-butter slim" onClick={() => setScan(true)}>
        <span className="cta-emoji">🧾</span>
        <span><strong>סריקת קבלה</strong><span>מה שקניתם נכנס לכאן, ומסומן ברשימת הקניות</span></span>
      </button>

      <section className="card add-card">
        <div className="add-row wrap">
          <input className="input grow" list="pantry-suggestions" placeholder="מה הכנסנו הביתה?" value={name}
            onChange={(e) => { setName(e.target.value); setWhere(''); }} onKeyDown={(e) => e.key === 'Enter' && submit()} aria-label="פריט" />
          {typedMode === 'count' && (
            <input className="input qty" inputMode="decimal" placeholder="כמה" value={qty} onChange={(e) => setQty(e.target.value)} aria-label="כמות" />
          )}
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
                <PantryRow key={p.id} p={p} isParent={isParent} onChange={change} onRemove={remove}
                  onMove={(to) => store.update(`pantry/${p.id}`, { location: to, updatedAt: Date.now() })} />
              ))}
            </ul>
          </section>
        );
      })}

      {!isParent && <p className="note">👀 אפשר להוסיף, להוריד כמות או לסמן ״נגמר״. מה שכמעט נגמר נכנס לבד לרשימת הקניות.</p>}

      {recentlyRemoved.length > 0 && (
        <details className="card history recent">
          <summary>↩ הוסרו לאחרונה ({recentlyRemoved.length})</summary>
          <ul className="history-list">
            {recentlyRemoved.map((p) => (
              <li key={p.id} className="history-row">
                <span className="grow"><span className="item-name">{p.name}</span> <span className="muted small">{LOC[p.location]?.label}</span></span>
                <button className="btn small" onClick={() => unremove(p)} aria-label={`להחזיר: ${p.name}`}>להחזיר</button>
              </li>
            ))}
          </ul>
        </details>
      )}

      {scan && (
        <Sheet title="🧾 סריקת קבלה" onClose={() => setScan(false)}>
          <ReceiptScan onDone={() => setScan(false)} />
        </Sheet>
      )}
    </div>
  );
}

function PantryRow({ p, isParent, onChange, onRemove, onMove }: {
  p: PantryItem;
  isParent: boolean;
  onChange: (p: PantryItem, patch: Partial<PantryItem>) => void;
  onRemove: (p: PantryItem) => void;
  onMove: (to: Location) => void;
}) {
  const mode = modeOf(p);
  const level = levelOf(p);
  const n = countOf(p);
  const out = mode === 'level' ? level === 'out' : n === 0;
  const setLevel = (l: Level) => l !== level && onChange(p, { mode: 'level', level: l });
  return (
    <li className={`list-row pantry-row ${out ? 'out' : ''} ${mode === 'level' && level === 'low' ? 'low' : ''}`}>
      <div className="pr-top">
        <span className="grow">
          <span className="item-name">{p.name}</span>
          {p.location === 'freezer' && needsThaw(p.name) && <span className="badge thaw">צריך הפשרה</span>}
        </span>
        {isParent && (
          <span className="pr-tools">
            <button className="link small" onClick={() => onChange(p, switchMode(p))}
              aria-label={mode === 'count' ? `לעבור לרמה: ${p.name}` : `לעבור לכמות: ${p.name}`}
              title={mode === 'count' ? 'לעבור למלא / חצי / נגמר' : 'לעבור לספירת יחידות'}>
              {mode === 'count' ? 'לרמה' : 'לכמות'}
            </button>
            <select className="mini-select" value={p.location} aria-label={`להעביר את ${p.name}`} onChange={(e) => onMove(e.target.value as Location)}>
              {(Object.keys(LOC) as Location[]).map((x) => <option key={x} value={x}>{LOC[x].icon}</option>)}
            </select>
            <button className="icon-btn small" onClick={() => onRemove(p)} aria-label={`להסיר מהבית: ${p.name}`}><X /></button>
          </span>
        )}
      </div>
      {mode === 'count' ? (
        <div className="pr-controls">
          <span className="stepper">
            <button className="step" onClick={() => onChange(p, { mode: 'count', qty: bumpPantry(p, -1) })} disabled={n === 0} aria-label={`פחות ${p.name}`}>−</button>
            <span className="step-val">{qtyLabel(p)}</span>
            {isParent && <button className="step" onClick={() => onChange(p, { mode: 'count', qty: bumpPantry(p, 1) })} aria-label={`יותר ${p.name}`}>+</button>}
          </span>
          {!out && <button className="btn small ghost" onClick={() => onChange(p, { mode: 'count', qty: 0 })} aria-label={`נגמר: ${p.name}`}>נגמר</button>}
        </div>
      ) : (
        <div className="seg levels" role="group" aria-label={`כמה נשאר: ${p.name}`}>
          {LEVELS.map((l) => (
            <button key={l} className={`lv-${l} ${l === level ? 'on' : ''}`} aria-pressed={l === level}
              disabled={!isParent && rank(l) < rank(level)} onClick={() => setLevel(l)}>
              {LEVEL_LABEL[l]}
            </button>
          ))}
        </div>
      )}
    </li>
  );
}
