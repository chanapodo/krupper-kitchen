import { useRef } from 'react';
import { aisleOf } from '../data/catalog';
import { DAY_NAMES } from '../lib/dates';
import {
  addToPantry, canAddToSlot, doneRecord, emptyWeek, MEAL_NAMES, onList, restoredItem, undoPantry, type ListRow,
} from '../lib/logic';
import type { ApprovalRequest, PantryItem, QtyMode, ShoppingItem } from '../lib/types';
import { useApp } from '../state';

const asDoc = (x: unknown) => x as Record<string, unknown>;

/**
 * Shopping list writes shared by the list, the receipt scan and the approvals:
 * every removal / purchase leaves a history record, so it can be undone now and restored later.
 */
export function useListActions() {
  const { store, me, toast, pantry, getWeek } = useApp();
  // undo may run after more changes (or after leaving the screen): read the latest state then
  const latest = useRef({ pantry, getWeek });
  latest.current = { pantry, getWeek };

  /** Put a bought / removed item back on the list (and take a purchase back out of the pantry). */
  const restore = async (rec: ShoppingItem, pantryNow: PantryItem[] = latest.current.pantry) => {
    if (rec.pantry) {
      const u = undoPantry(pantryNow, rec.pantry);
      if (u && 'remove' in u) await store.remove(`pantry/${rec.pantry.id}`);
      else if (u) await store.set(`pantry/${rec.pantry.id}`, asDoc(u.data));
    }
    if (rec.menuKey && rec.weekId) {
      const w = latest.current.getWeek(rec.weekId);
      if (w?.skipped?.includes(rec.menuKey)) {
        await store.set(`weeks/${w.id}`, asDoc({ ...w, skipped: w.skipped.filter((k) => k !== rec.menuKey) }));
      }
    }
    if (rec.menuKey) await store.remove(`shopping/${rec.id}`);
    else await store.set(`shopping/${rec.id}`, asDoc(restoredItem(rec)));
  };

  /** Write the history record; with a message, offer the big undo toast. */
  const done = async (
    row: ListRow | ShoppingItem, kind: 'bought' | 'removed', msg?: string, extra: Parameters<typeof doneRecord>[3] = {},
  ): Promise<{ id: string; rec: ShoppingItem }> => {
    const isRow = 'fromMenu' in row;
    const own = isRow ? row.item : row;
    const id = own?.id ?? store.newId();
    const rec = { ...doneRecord(row, kind, me?.id ?? '', extra), ...(own ? {} : { uid: store.uid() }) };
    await store.set(`shopping/${id}`, asDoc(rec));
    const full = { ...rec, id };
    if (msg) toast(msg, () => restore(full));
    return { id, rec: full };
  };

  /** Bought: into the pantry (a level item back to "מלא"), then into the history. */
  const buy = async (row: ListRow, msg?: string, pantryNow: PantryItem[] = latest.current.pantry, mode?: QtyMode) => {
    const res = addToPantry(pantryNow, { name: row.name, qty: row.qty, unit: row.unit, mode });
    const prev = res.id ? pantryNow.find((p) => p.id === res.id) : undefined;
    const pid = res.id ?? store.newId();
    const data = res.id ? res.data : { ...res.data, uid: store.uid() };
    await store.set(`pantry/${pid}`, asDoc(data));
    const levelItem = data.mode === 'level';
    const out = await done(row, 'bought', msg, {
      pantry: {
        id: pid, created: !prev,
        ...(levelItem ? { prevLevel: prev?.level ?? null } : { qty: row.qty, unit: row.unit, prevQty: prev?.qty, prevUnit: prev?.unit }),
      },
    });
    return { ...out, pantryDoc: { ...data, id: pid } as PantryItem };
  };

  /** A menu row a parent doesn't need this week. */
  const skip = async (row: ListRow, weekId: string, msg?: string) => {
    const w = structuredClone(latest.current.getWeek(weekId) ?? emptyWeek(weekId));
    const key = row.id.slice('menu:'.length);
    w.skipped = [...new Set([...(w.skipped ?? []), key])];
    await store.set(`weeks/${w.id}`, asDoc(w));
    return done(row, 'removed', msg, { weekId: w.id });
  };

  return { restore, done, buy, skip, latest };
}

/** Parents approve, reject, or later reverse a kid's request. */
export function useRequests() {
  const { store, me, toast, getWeek, recipeMap, shopping, settings } = useApp();
  const list = useListActions();
  const live = useRef({ shopping, getWeek, recipeMap });
  live.current = { shopping, getWeek, recipeMap };
  const who = (id: string) => settings?.members.find((m) => m.id === id)?.name ?? '';

  const decide = (r: ApprovalRequest, status: ApprovalRequest['status'], extra: Partial<ApprovalRequest> = {}) =>
    store.update(`requests/${r.id}`, { status, decidedAt: Date.now(), decidedBy: me?.id ?? '', ...extra });

  /** Back to "waiting", undoing what an approval did. */
  const revert = async (r: ApprovalRequest) => {
    if (r.status === 'approved' && r.kind === 'menu-add' && r.weekId && r.day && r.meal && r.recipeId) {
      const w = live.current.getWeek(r.weekId);
      const slot = w?.days[r.day]?.[r.meal];
      if (w && slot?.recipeIds.includes(r.recipeId)) {
        const next = structuredClone(w);
        next.days[r.day]![r.meal]!.recipeIds = slot.recipeIds.filter((x) => x !== r.recipeId);
        await store.set(`weeks/${w.id}`, asDoc(next));
      }
    }
    if (r.status === 'approved' && r.kind === 'shop-remove' && r.resultId) {
      const rec = live.current.shopping.find((s) => s.id === r.resultId);
      if (rec && (rec.status === 'removed' || rec.status === 'bought')) await list.restore(rec);
    }
    await store.update(`requests/${r.id}`, { status: 'pending' });
  };

  const approve = async (r: ApprovalRequest) => {
    if (r.kind === 'menu-add' && r.weekId && r.day && r.meal && r.recipeId) {
      const recipe = live.current.recipeMap.get(r.recipeId);
      if (!recipe) return toast('המתכון הזה כבר לא בספר המתכונים');
      const w = structuredClone(live.current.getWeek(r.weekId) ?? emptyWeek(r.weekId));
      const slot = ((w.days[r.day] ??= {})[r.meal] ??= { recipeIds: [] });
      if (!canAddToSlot(recipe, slot.recipeIds, live.current.recipeMap)) {
        return toast(`${recipe.title} לא כשר יחד עם מה שכבר יש ב${DAY_NAMES[r.day]} ${MEAL_NAMES[r.meal]}. אפשר לדחות או להזיז מנה.`);
      }
      if (!slot.recipeIds.includes(recipe.id)) slot.recipeIds.push(recipe.id);
      await store.set(`weeks/${w.id}`, asDoc(w));
      await decide(r, 'approved');
      toast(`אושר: ${recipe.title} ב${DAY_NAMES[r.day]} ${MEAL_NAMES[r.meal]}`, () => revert({ ...r, status: 'approved' }));
      return;
    }
    if (r.kind === 'shop-remove') {
      let resultId: string | undefined;
      if (r.itemId) {
        const item = live.current.shopping.find((s) => s.id === r.itemId);
        if (item && onList(item)) resultId = (await list.done(item, 'removed')).id;
      } else if (r.menuKey && r.weekId) {
        const row: ListRow = { id: `menu:${r.menuKey}`, name: r.title, aisle: aisleOf(r.title), fromMenu: true, recipes: [] };
        resultId = (await list.skip(row, r.weekId)).id;
      }
      await decide(r, 'approved', resultId ? { resultId } : {});
      toast(`הוסר מהרשימה: ${r.title} (${who(r.by)} ביקש/ה)`, () => revert({ ...r, status: 'approved', resultId }));
    }
  };

  const reject = async (r: ApprovalRequest) => {
    await decide(r, 'rejected');
    toast(r.kind === 'menu-add' ? `נדחה: ${r.title}` : `נשאר ברשימה: ${r.title}`, () => revert({ ...r, status: 'rejected' }));
  };

  return { approve, reject, revert };
}
