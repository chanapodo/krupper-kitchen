import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { DEFAULT_SETTINGS } from './data/seed';
import { weekIdOf } from './lib/dates';
import { emptyWeek, thawPlan } from './lib/logic';
import type { Member, PantryItem, Recipe, Settings, ShoppingItem, Vote, Week } from './lib/types';
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
  pantry: PantryItem[];
  shopping: ShoppingItem[];
  weeks: Map<string, Week>;
  getWeek: (id: string) => Week | undefined;
  votes: Vote[];
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
  const [pantry, setPantry] = useState<PantryItem[]>([]);
  const [shopping, setShopping] = useState<ShoppingItem[]>([]);
  const [weekList, setWeekList] = useState<Week[]>([]);
  const [votes, setVotes] = useState<Vote[]>([]);
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
    const offs = [
      store.subscribeDoc('meta/settings', (d) =>
        setSettings(d ? ({ ...DEFAULT_SETTINGS, ...(d as unknown as Settings) }) : null)),
      store.subscribeCol('recipes', (d) => setRecipes(d as unknown as Recipe[])),
      store.subscribeCol('pantry', (d) => setPantry(d as unknown as PantryItem[])),
      store.subscribeCol('shopping', (d) => setShopping(d as unknown as ShoppingItem[])),
      store.subscribeCol('weeks', (d) => setWeekList(d as unknown as Week[])),
      store.subscribeCol('votes', (d) => setVotes(d as unknown as Vote[])),
      store.subscribeParent(setIsParentDevice),
    ];
    return () => offs.forEach((o) => o());
  }, [store]);

  const recipeMap = useMemo(() => new Map(allRecipes.map((r) => [r.id, r])), [allRecipes]);
  const recipes = useMemo(() => allRecipes.filter((r) => r.status !== 'pending'), [allRecipes]);
  const pendingRecipes = useMemo(() => allRecipes.filter((r) => r.status === 'pending'), [allRecipes]);
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
  if (!store || settings === undefined) {
    return <div className="center-screen"><div className="loader">🍲</div></div>;
  }

  const value: AppData = {
    store, loaded: true, settings, recipes, pendingRecipes, recipeMap, pantry, shopping, weeks, getWeek, votes,
    isParentDevice, me, isParent, setMeId, toast,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function currentWeekId() {
  return weekIdOf(new Date());
}
