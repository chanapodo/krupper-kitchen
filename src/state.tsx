import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { DEFAULT_SETTINGS } from './data/seed';
import { weekIdOf } from './lib/dates';
import { emptyWeek, thawPlan } from './lib/logic';
import { migratePatch } from './lib/pantry';
import type { ApprovalRequest, Member, Notice, PantryItem, Recipe, Settings, ShoppingItem, Vote, Week } from './lib/types';
import { getStore } from './store';
import type { Store } from './store/store';

export interface AppData {
  store: Store;
  loaded: boolean;
  /** null = Firebase family not set up yet */
  settings: Settings | null;
  /** the family's recipe bank (kids' pending suggestions excluded) */
  recipes: Recipe[];
  /** kids' suggestions waiting for a parent */
  pendingRecipes: Recipe[];
  /** every recipe by id, pending included */
  recipeMap: Map<string, Recipe>;
  /** deleted in the last 30 days, restorable */
  removedRecipes: Recipe[];
  /** what's at home (removed items excluded) */
  pantry: PantryItem[];
  /** removed by a parent in the last week, restorable */
  removedPantry: PantryItem[];
  shopping: ShoppingItem[];
  weeks: Map<string, Week>;
  getWeek: (id: string) => Week | undefined;
  votes: Vote[];
  /** in-app notices for the parents about what the kids did */
  notices: Notice[];
  /** kids' requests waiting for (or decided by) a parent */
  requests: ApprovalRequest[];
  /** the published security rules are older than this version of the app */
  rulesOutdated: boolean;
  /** a kid did something the parents should hear about; returns an undo that withdraws the notice */
  notify: (kind: Notice['kind'], text: string) => Promise<(() => Promise<void>) | undefined>;
  isParentDevice: boolean;
  me: Member | null;
  /** parent member on a device that unlocked parent mode */
  isParent: boolean;
  setMeId: (id: string | null) => void;
  toast: (msg: string, undo?: () => void) => void;
}

const Ctx = createContext<AppData | null>(null);

export function useApp(): AppData {
  const v = useContext(Ctx);
  if (!v) throw new Error('no app');
  return v;
}

const ME_KEY = 'kk-me';

export interface ToastState {
  id: number;
  msg: string;
  undo?: () => void;
}

export function AppProvider({ children, onToast }: { children: ReactNode; onToast: (t: ToastState) => void }) {
  const [store, setStore] = useState<Store | null>(null);
  const [settings, setSettings] = useState<Settings | null | undefined>(undefined);
  const [allRecipes, setRecipes] = useState<Recipe[]>([]);
  const [allPantry, setPantry] = useState<PantryItem[]>([]);
  const [shopping, setShopping] = useState<ShoppingItem[]>([]);
  const [weekList, setWeekList] = useState<Week[]>([]);
  const [votes, setVotes] = useState<Vote[]>([]);
  const [notices, setNotices] = useState<Notice[]>([]);
  const [requests, setRequests] = useState<ApprovalRequest[]>([]);
  const [rulesOutdated, setRulesOutdated] = useState(false);
  const [isParentDevice, setIsParentDevice] = useState(false);
  const [meId, setMeIdState] = useState<string | null>(() => localStorage.getItem(ME_KEY));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getStore()
      .then(async (s) => {
        await s.ready;
        setStore(s);
      })
      .catch((e) => setError(String(e?.message ?? e)));
  }, []);

  useEffect(() => {
    if (!store) return;
    const outdated = (e: { code?: string }) => {
      if (e.code === 'permission-denied') setRulesOutdated(true);
    };
    const offs = [
      store.subscribeDoc('meta/settings', (d) =>
        setSettings(d ? ({ ...DEFAULT_SETTINGS, ...(d as unknown as Settings) }) : null)),
      store.subscribeCol('recipes', (d) => setRecipes(d as unknown as Recipe[])),
      store.subscribeCol('pantry', (d) => setPantry(d as unknown as PantryItem[])),
      store.subscribeCol('shopping', (d) => setShopping(d as unknown as ShoppingItem[])),
      store.subscribeCol('weeks', (d) => setWeekList(d as unknown as Week[])),
      store.subscribeCol('votes', (d) => setVotes(d as unknown as Vote[])),
      // new in v1.3: refused while the published rules are the old ones
      store.subscribeCol('notices', (d) => setNotices(d as unknown as Notice[]), outdated),
      store.subscribeCol('requests', (d) => setRequests(d as unknown as ApprovalRequest[]), outdated),
      store.subscribeParent(setIsParentDevice),
    ];
    return () => offs.forEach((o) => o());
  }, [store]);

  const pantry = useMemo(() => allPantry.filter((p) => !p.removedAt), [allPantry]);
  const removedPantry = useMemo(() => allPantry.filter((p) => p.removedAt), [allPantry]);
  const liveRecipes = useMemo(() => allRecipes.filter((r) => !r.removedAt), [allRecipes]);
  const removedRecipes = useMemo(() => allRecipes.filter((r) => r.removedAt), [allRecipes]);
  const recipeMap = useMemo(() => new Map(liveRecipes.map((r) => [r.id, r])), [liveRecipes]);
  const recipes = useMemo(() => liveRecipes.filter((r) => r.status !== 'pending'), [liveRecipes]);
  const pendingRecipes = useMemo(() => liveRecipes.filter((r) => r.status === 'pending'), [liveRecipes]);
  const weeks = useMemo(
    () => new Map(weekList.map((w) => [w.id, { ...emptyWeek(w.id), ...w }])),
    [weekList],
  );
  const getWeek = useCallback((id: string) => weeks.get(id), [weeks]);

  const me = settings?.members.find((m) => m.id === meId) ?? null;
  const isParent = !!me && me.role === 'parent' && isParentDevice;

  const setMeId = useCallback((id: string | null) => {
    if (id) localStorage.setItem(ME_KEY, id);
    else localStorage.removeItem(ME_KEY);
    setMeIdState(id);
  }, []);

  const toastId = useRef(0);
  const toast = useCallback((msg: string, undo?: () => void) => {
    onToast({ id: ++toastId.current, msg, undo });
  }, [onToast]);

  // A write the published rules refuse: say so instead of failing silently.
  const guarded = useMemo<Store | null>(() => {
    if (!store) return null;
    const refused = (e: unknown) => {
      if ((e as { code?: string })?.code === 'permission-denied') {
        setRulesOutdated(true);
        toast('לא נשמר: ההורים צריכים לעדכן את חוקי האבטחה של האפליקציה');
      }
      throw e;
    };
    const writes: Partial<Store> = {
      set: (path, data) => store.set(path, data).catch(refused),
      update: (path, patch) => store.update(path, patch).catch(refused),
      remove: (path) => store.remove(path).catch(refused),
      batch: (w) => store.batch(w).catch(refused),
    };
    return new Proxy(store, {
      get(t, k) {
        if (k in writes) return writes[k as keyof Store];
        const v = (t as unknown as Record<string | symbol, unknown>)[k];
        return typeof v === 'function' ? v.bind(t) : v;
      },
    });
  }, [store, toast]);

  const notify = useCallback(async (kind: Notice['kind'], text: string) => {
    if (!store || !me || isParent) return undefined;
    const id = store.newId();
    const n: Omit<Notice, 'id'> = { kind, text, by: me.id, at: Date.now() };
    try {
      await store.set(`notices/${id}`, n as unknown as Record<string, unknown>);
    } catch {
      return undefined; // old rules: the action itself still counts
    }
    return () => store.update(`notices/${id}`, { undone: true }).catch(() => {});
  }, [store, me, isParent]);

  // Pantry docs from before v1.3 get their quantity mode once (nothing is removed).
  useEffect(() => {
    if (!store || !isParent) return;
    for (const p of pantry) {
      const patch = migratePatch(p);
      if (patch) store.update(`pantry/${p.id}`, patch as Record<string, unknown>).catch(() => {});
    }
  }, [store, isParent, pantry]);

  // Parents keep the thaw plan up to date, so a nightly reminder can read it from Firestore.
  const lastPlan = useRef('');
  useEffect(() => {
    if (!store || !isParent || !recipes.length) return;
    const t = setTimeout(() => {
      const plan = thawPlan(new Date(), getWeek, recipeMap, pantry);
      const s = JSON.stringify(plan.byDate);
      if (s === lastPlan.current) return;
      lastPlan.current = s;
      store.set('meta/thaw', plan as unknown as Record<string, unknown>).catch(() => {});
    }, 1500);
    return () => clearTimeout(t);
  }, [store, isParent, getWeek, recipeMap, pantry, recipes.length]);

  if (error) {
    return (
      <div className="center-screen">
        <div className="card">
          <h2>אופס, אין חיבור 😕</h2>
          <p className="muted">{error}</p>
          <button className="btn" onClick={() => location.reload()}>לנסות שוב</button>
        </div>
      </div>
    );
  }
  if (!store || !guarded || settings === undefined) {
    return <div className="center-screen"><div className="loader">🍲</div></div>;
  }

  const value: AppData = {
    store: guarded, loaded: true, settings, recipes, pendingRecipes, recipeMap, removedRecipes, pantry, removedPantry, shopping, weeks, getWeek, votes,
    notices, requests, rulesOutdated, notify, isParentDevice, me, isParent, setMeId, toast,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function currentWeekId() {
  return weekIdOf(new Date());
}
