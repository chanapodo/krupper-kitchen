import { useState } from 'react';
import { aisleOf, AISLES, displayName, ingredientKey, lookup } from '../data/catalog';
import { aiDetail, aiMessage, readReceipt } from '../lib/ai';
import { shiftWeek, weekIdOf } from '../lib/dates';
import { FileError, fileToInline } from '../lib/files';
import { addToPantry, buildList, verb, type ListRow } from '../lib/logic';
import { COUNT_UNIT, countOf, locationForAisle, modeOf } from '../lib/pantry';
import type { ReceiptLine } from '../lib/receipt';
import type { PantryItem, QtyMode, ShoppingItem } from '../lib/types';
import { APP_VERSION } from '../lib/update';
import { useApp } from '../state';
import { useListActions } from './actions';
import { Ok, X } from './ui';

type Step = { s: 'pick' } | { s: 'reading' } | { s: 'review'; lines: ReceiptLine[] };

/**
 * Scan a supermarket receipt (photo or PDF): the AI reads the lines, the family checks them,
 * then everything goes into "מה יש בבית" and what was on the list is marked bought.
 */
export default function ReceiptScan({ weekId, onDone }: { weekId?: string; onDone: () => void }) {
  const { me, pantry, shopping, getWeek, recipeMap, store, toast, notify } = useApp();
  const { buy, restore, latest } = useListActions();
  const [step, setStep] = useState<Step>({ s: 'pick' });
  const [error, setError] = useState('');
  const [detail, setDetail] = useState('');
  const [saving, setSaving] = useState(false);
  const known = [...new Set([...pantry.map((p) => p.name), ...shopping.map((s) => s.name)])];

  // list rows the receipt can tick: hand-added items and the menu's rows (this week and the next)
  const cur = weekIdOf(new Date());
  const weeks = [...new Set([weekId ?? cur, cur, shiftWeek(cur, 1)])];
  const listRows = new Map<string, { row: ListRow; weekId: string }>();
  for (const w of weeks) {
    for (const g of buildList(getWeek(w), recipeMap, pantry, shopping).groups) {
      for (const row of g.rows) {
        const k = ingredientKey(row.name);
        if (!listRows.has(k)) listRows.set(k, { row, weekId: w });
      }
    }
  }

  const read = async (file: File | undefined) => {
    if (!file) return;
    setError('');
    setDetail('');
    setStep({ s: 'reading' });
    try {
      const inline = await fileToInline(file);
      const lines = await readReceipt(inline, { known, pantry });
      setStep({ s: 'review', lines });
    } catch (e) {
      setError(e instanceof FileError ? e.message : aiMessage(e));
      if (!(e instanceof FileError)) setDetail(`${aiDetail(e)} · v${APP_VERSION}`.replace(/^ · /, ''));
      setStep({ s: 'pick' });
    }
  };

  if (step.s === 'reading') {
    return (
      <div className="newdish loading" role="status">
        <div className="loader">🧾</div>
        <p><strong>קוראת את הקבלה…</strong></p>
        <p className="muted small">זה לוקח בדרך כלל 10–30 שניות</p>
      </div>
    );
  }

  if (step.s === 'pick') {
    return (
      <div className="stack receipt-pick">
        <p>מצלמים את הקבלה (או בוחרים קובץ PDF), בודקים את הרשימה, וכל מה שנקנה נכנס ל״מה יש בבית״. מה שהיה ברשימת הקניות מסומן כנקנה.</p>
        {error && (
          <div className="note warn" role="alert">
            {error}
            {detail && <div className="err-detail">{detail}</div>}
          </div>
        )}
        <label className="option file-option">
          <span className="option-emoji">📷</span>
          <span><strong>לצלם את הקבלה</strong><span>ישר, מואר, כל הקבלה בתמונה</span></span>
          <input type="file" accept="image/*" capture="environment" hidden onChange={(e) => read(e.target.files?.[0])} aria-label="צילום קבלה" />
        </label>
        <label className="option file-option">
          <span className="option-emoji">🖼️</span>
          <span><strong>תמונה או PDF מהטלפון</strong><span>למשל קבלה דיגיטלית מהסופר</span></span>
          <input type="file" accept="image/*,application/pdf" hidden onChange={(e) => read(e.target.files?.[0])} aria-label="קובץ קבלה" />
        </label>
      </div>
    );
  }

  const lines = step.lines;
  const setLines = (next: ReceiptLine[]) => setStep({ s: 'review', lines: next });
  const edit = (id: string, patch: Partial<ReceiptLine>) => setLines(lines.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  const drop = (l: ReceiptLine) => {
    const before = lines;
    setLines(lines.filter((x) => x.id !== l.id));
    toast(`הוסרה שורה: ${l.name}`, () => setStep({ s: 'review', lines: before }));
  };
  const onList = (l: ReceiptLine) => listRows.get(ingredientKey(l.name));
  const ticks = lines.filter(onList).length;

  const apply = async () => {
    if (!me || !lines.length) return;
    setSaving(true);
    let working: PantryItem[] = [...latest.current.pantry];
    const put = (p: PantryItem) => { working = [...working.filter((x) => x.id !== p.id), p]; };
    const undos: (() => Promise<void>)[] = [];
    try {
      for (const l of lines) {
        const name = displayName(l.name.trim());
        if (!name) continue;
        const hit = onList(l);
        const existing = working.find((p) => ingredientKey(p.name) === ingredientKey(name));
        // the mode chosen on the review screen wins (and sticks to the item)
        if (existing && modeOf(existing) !== l.mode) {
          const patch = l.mode === 'count' ? { mode: 'count' as QtyMode, qty: countOf(existing) ?? 0, unit: COUNT_UNIT } : { mode: 'level' as QtyMode, level: existing.level ?? 'out' };
          const before = existing;
          await store.update(`pantry/${existing.id}`, { ...patch, updatedAt: Date.now() });
          put({ ...existing, ...patch });
          undos.push(async () => { await store.set(`pantry/${before.id}`, before as unknown as Record<string, unknown>); });
        }
        const qty = l.mode === 'count' ? l.qty ?? 1 : undefined;
        if (hit) {
          // on the list: bought (history + restore), into the pantry
          const row: ListRow = { ...hit.row, qty: l.mode === 'count' ? qty : hit.row.qty, unit: l.mode === 'count' ? COUNT_UNIT : hit.row.unit };
          const { rec, pantryDoc } = await buy(row, undefined, working, l.mode);
          put(pantryDoc);
          undos.push(() => restore(rec as ShoppingItem));
          listRows.delete(ingredientKey(l.name));
        } else {
          // not on the list: just into the pantry
          const loc = lookup(name) ? undefined : locationForAisle(l.aisle);
          const res = addToPantry(working, { name, qty, unit: qty !== undefined ? COUNT_UNIT : undefined, location: loc, mode: l.mode });
          const prev = res.id ? working.find((p) => p.id === res.id) : undefined;
          const pid = res.id ?? store.newId();
          const data = res.id ? res.data : { ...res.data, uid: store.uid() };
          await store.set(`pantry/${pid}`, data as unknown as Record<string, unknown>);
          put({ ...data, id: pid } as PantryItem);
          undos.push(async () => {
            if (!prev) await store.remove(`pantry/${pid}`);
            else await store.set(`pantry/${pid}`, prev as unknown as Record<string, unknown>);
          });
        }
      }
    } finally {
      setSaving(false);
    }
    const n = lines.length;
    const withdraw = await notify('receipt', `${me.name} ${verb(me, 'סרק')} קבלה: ${n} פריטים נוספו למה שיש בבית${ticks ? `, ${ticks} סומנו כנקנו ברשימה` : ''}`);
    toast(`נוספו ${n} פריטים מהקבלה${ticks ? ` · ${ticks} סומנו כנקנו` : ''}`, async () => {
      for (const u of [...undos].reverse()) await u();
      await withdraw?.();
    });
    onDone();
  };

  return (
    <div className="stack receipt-review">
      <p className="small">בדקו את השורות: אפשר לתקן שם, כמות וקטגוריה, או להסיר שורה. פיקדון, שקיות והנחות לא נכנסים.</p>
      <ul className="receipt-lines">
        {lines.map((l) => {
          const hit = onList(l);
          return (
            <li key={l.id} className="receipt-line">
              <div className="rl-top">
                <input className="input grow" value={l.name} onChange={(e) => edit(l.id, { name: e.target.value, aisle: lookup(e.target.value) ? aisleOf(e.target.value) : l.aisle })}
                  aria-label={`שם: ${l.raw}`} />
                <button className="icon-btn small" onClick={() => drop(l)} aria-label={`להסיר שורה: ${l.name}`}><X /></button>
              </div>
              {l.raw !== l.name && <div className="rl-raw muted small">בקבלה: {l.raw}</div>}
              <div className="rl-controls">
                <div className="seg" role="group" aria-label={`איך סופרים: ${l.name}`}>
                  <button className={l.mode === 'count' ? 'on' : ''} aria-pressed={l.mode === 'count'} onClick={() => edit(l.id, { mode: 'count', qty: l.qty ?? 1 })}>כמות</button>
                  <button className={l.mode === 'level' ? 'on' : ''} aria-pressed={l.mode === 'level'} onClick={() => edit(l.id, { mode: 'level' })}>רמה</button>
                </div>
                {l.mode === 'count' ? (
                  <input className="input qty" inputMode="numeric" value={l.qty ?? ''} aria-label={`כמה: ${l.name}`}
                    onChange={(e) => edit(l.id, { qty: e.target.value === '' ? undefined : Math.max(0, Number(e.target.value) || 0) })} />
                ) : <span className="muted small">יהיה ״מלא״</span>}
                <select className="input mini-select aisle-select" value={l.aisle} onChange={(e) => edit(l.id, { aisle: e.target.value })} aria-label={`קטגוריה: ${l.name}`}>
                  {AISLES.map((a) => <option key={a} value={a}>{a}</option>)}
                </select>
              </div>
              {hit && <span className="badge ok-badge"><Ok /> ברשימת הקניות – יסומן כנקנה</span>}
            </li>
          );
        })}
      </ul>
      {!lines.length && <p className="muted">לא נשארו שורות.</p>}
      <div className="action-row sticky-actions">
        <button className="btn" disabled={saving || !lines.length} onClick={apply}>
          {saving ? 'מוסיפה…' : `להוסיף ${lines.length} פריטים ל״מה יש בבית״`}
        </button>
        <button className="btn ghost" onClick={() => setStep({ s: 'pick' })}>קבלה אחרת</button>
      </div>
    </div>
  );
}
