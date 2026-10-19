import { useCallback, useEffect, useState } from 'react';
import { Avatar, go, PinPad, useRoute } from './components/ui';
import { DEFAULT_SETTINGS, freshRecipes } from './data/seed';
import { SEED_RECIPES } from './data/recipes';
import { AppProvider, useApp, type ToastState } from './state';
import Home from './screens/Home';
import MenuScreen from './screens/Menu';
import VoteScreen from './screens/Vote';
import ShoppingScreen from './screens/Shopping';
import PantryScreen from './screens/Pantry';
import RecipesScreen from './screens/Recipes';
import RecipeDetail from './screens/RecipeDetail';
import RecipeEdit from './screens/RecipeEdit';
import IdeasScreen from './screens/Ideas';
import SettingsScreen from './screens/Settings';
import type { Member } from './lib/types';
import { watchForUpdates } from './lib/update';

const UNDO_MS = 8000;

export default function App() {
  const [toast, setToast] = useState<ToastState | null>(null);
  // undoable actions: one big toast that gathers quick taps; 8 seconds from the last one
  const [undos, setUndos] = useState<{ id: number; msg: string; undo: () => unknown }[]>([]);
  const onToast = useCallback((t: ToastState) => {
    const undo = t.undo;
    if (undo) setUndos((u) => [...u, { id: t.id, msg: t.msg, undo }]);
    else setToast(t);
  }, []);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);
  const lastUndo = undos[undos.length - 1]?.id;
  useEffect(() => {
    if (lastUndo === undefined) return;
    const t = setTimeout(() => setUndos([]), UNDO_MS);
    return () => clearTimeout(t);
  }, [lastUndo]);
  const undoAll = async () => {
    const list = undos;
    setUndos([]);
    for (const u of [...list].reverse()) await u.undo();
    setToast({ id: Date.now(), msg: list.length > 1 ? `${list.length} פעולות בוטלו` : 'בוטל' });
  };
  const [update, setUpdate] = useState(false);
  useEffect(() => watchForUpdates(() => setUpdate(true)), []);
  return (
    <AppProvider onToast={onToast}>
      <Shell />
      {update && (
        <div className="toast update-toast" role="status">
          <span>יש גרסה חדשה של האפליקציה</span>
          <button onClick={() => location.reload()}>לרענן</button>
        </div>
      )}
      {undos.length > 0 ? (
        <div className="toast undo-toast" role="status" key={lastUndo}>
          <span className="undo-text">
            {undos.length === 1 ? undos[0].msg : `${undos.length} פעולות: ${undos.map((u) => u.msg.replace(/^[^:]*:\s*/, '')).join(' · ')}`}
          </span>
          <button className="undo-btn" onClick={undoAll}>↩ {undos.length > 1 ? 'בטל הכול' : 'בטל'}</button>
          <span className="undo-timer" style={{ animationDuration: `${UNDO_MS}ms` }} aria-hidden />
        </div>
      ) : toast && (
        <div className="toast" role="status">
          <span>{toast.msg}</span>
        </div>
      )}
    </AppProvider>
  );
}

function Shell() {
  const { settings, me, isParent, shopping, store } = useApp();
  const route = useRoute();

  if (!settings) return <FirstSetup />;
  if (!me) return <WhoAreYou />;

  const pending = shopping.filter((s) => s.status === 'pending').length;
  const tab = route[0];
  const screen = (() => {
    switch (tab) {
      case 'menu': return <MenuScreen />;
      case 'vote': return <VoteScreen />;
      case 'shop': return <ShoppingScreen />;
      case 'pantry': return <PantryScreen />;
      case 'recipes': return <RecipesScreen />;
      case 'recipe': return <RecipeDetail id={route[1]} />;
      case 'edit': return <RecipeEdit id={route[1]} name={route[2] ? decodeURIComponent(route[2]) : undefined} />;
      case 'ideas': return <IdeasScreen />;
      case 'settings': return <SettingsScreen />;
      default: return <Home />;
    }
  })();

  const nav = [
    { id: 'home', icon: '🏠', label: 'בית' },
    { id: 'menu', icon: '📅', label: 'תפריט' },
    { id: 'shop', icon: '🛒', label: 'קניות', badge: isParent ? pending : 0 },
    { id: 'pantry', icon: '🧺', label: 'מה יש בבית' },
    { id: 'recipes', icon: '📖', label: 'מתכונים' },
  ];
  const activeTab = tab === 'recipe' || tab === 'edit' || tab === 'ideas' ? 'recipes' : tab === 'vote' ? 'menu' : tab;

  return (
    <div className="app">
      <header className="topbar">
        <button className="brand" onClick={() => go('home')}>
          <span className="brand-logo">🥘</span>
          <span className="brand-name">{settings.familyName}</span>
        </button>
        {store.mode === 'demo' && <span className="demo-pill">דמו</span>}
        <button className="me-btn" onClick={() => go('settings')} aria-label="הגדרות והחלפת משתמש">
          {isParent && <span className="parent-pill">הורה</span>}
          <Avatar m={me} size={38} />
        </button>
      </header>
      <main className="content">{screen}</main>
      <nav className="tabbar" aria-label="ניווט">
        {nav.map((n) => (
          <button key={n.id} className={`tab ${activeTab === n.id ? 'on' : ''}`} onClick={() => go(n.id)}
            aria-current={activeTab === n.id ? 'page' : undefined}>
            <span className="tab-icon">{n.icon}</span>
            <span className="tab-label">{n.label}</span>
            {!!n.badge && <span className="tab-badge">{n.badge}</span>}
          </button>
        ))}
      </nav>
    </div>
  );
}

function WhoAreYou() {
  const { settings, setMeId, store, isParentDevice } = useApp();
  const [parent, setParent] = useState<Member | null>(null);
  const [error, setError] = useState('');
  const submit = useCallback(async (pin: string) => {
    if (!parent) return;
    if (!settings?.pinSet) {
      await store.setPin(pin);
      setMeId(parent.id);
      return;
    }
    if (await store.unlockParent(pin)) return setMeId(parent.id);
    if (store.mode === 'firebase') {
      // the PIN doc was deleted in the console (forgotten PIN): this PIN becomes the new one
      try {
        await store.setPin(pin);
        return setMeId(parent.id);
      } catch { /* a PIN exists and this one is wrong */ }
    }
    setError('קוד לא נכון, נסו שוב');
  }, [parent, settings?.pinSet, store, setMeId]);

  if (parent) {
    return (
      <div className="center-screen">
        <div className="card">
          <PinPad
            title={settings?.pinSet ? `שלום ${parent.name}! מה הקוד?` : 'בוחרים קוד הורים'}
            subtitle={settings?.pinSet ? 'קוד ההורים בן 4 ספרות' : '4 ספרות שרק ההורים יודעים. אפשר לשנות אחר כך בהגדרות.'}
            error={error}
            onSubmit={submit}
            onCancel={() => { setParent(null); setError(''); }}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="center-screen welcome">
      <div className="welcome-hero">🥘</div>
      <h1>{settings?.familyName}</h1>
      <p className="muted">מי משתמש/ת עכשיו?</p>
      <div className="who-grid">
        {settings?.members.map((m) => (
          <button key={m.id} className="who" style={{ background: m.color }}
            onClick={() => (m.role === 'parent' && !isParentDevice ? setParent(m) : setMeId(m.id))}>
            <span className="who-emoji">{m.emoji}</span>
            <span className="who-name">{m.name}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

/** Firebase mode, very first open: Chana picks the parent PIN and the family is created. */
function FirstSetup() {
  const { store, setMeId } = useApp();
  const [step, setStep] = useState<'hello' | 'pin' | 'working'>('hello');
  const [error, setError] = useState('');
  const submit = useCallback(async (pin: string) => {
    setStep('working');
    try {
      try {
        await store.setPin(pin);
      } catch {
        // the PIN already exists (an earlier, interrupted setup): unlock with it instead
        if (!(await store.unlockParent(pin))) throw new Error('הקוד כבר נקבע במכשיר אחר. הקישו את אותו קוד.');
      }
      await store.batch([
        { path: 'meta/settings', data: { ...DEFAULT_SETTINGS, pinSet: true } as unknown as Record<string, unknown> },
        ...freshRecipes().map((r) => ({ path: `recipes/${r.id}`, data: r as unknown as Record<string, unknown> })),
      ]);
      setMeId('mom');
      go('settings');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'משהו השתבש');
      setStep('pin');
    }
  }, [store, setMeId]);

  return (
    <div className="center-screen welcome">
      <div className="card">
        {step === 'hello' && (
          <>
            <div className="welcome-hero">🥘</div>
            <h1>ברוכים הבאים לבישולי קרופרז!</h1>
            <p>זו הפעם הראשונה שהאפליקציה נפתחת. נבחר קוד הורים, ונטען {SEED_RECIPES.length} מתכונים משפחתיים כדי להתחיל.</p>
            <button className="btn big" onClick={() => setStep('pin')}>יאללה, מתחילים</button>
          </>
        )}
        {step === 'pin' && (
          <PinPad title="בוחרים קוד הורים" subtitle="4 ספרות שרק ההורים יודעים" error={error} onSubmit={submit} />
        )}
        {step === 'working' && <div className="loader">🍲</div>}
      </div>
    </div>
  );
}
