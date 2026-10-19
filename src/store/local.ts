import { demoData } from '../data/seed';
import { clean, hashPin, setDotted, type Doc, type Store, type Unsub } from './store';

const KEY = 'kk-demo-v1';
const PARENT_KEY = 'kk-demo-parent';
const FAMILY = 'demo';

type DB = Record<string, Record<string, unknown>>;

/** Demo mode: everything lives in this browser's localStorage (shared between tabs). */
export class LocalStore implements Store {
  mode = 'demo' as const;
  ready = Promise.resolve();
  private db: DB;
  private listeners = new Set<() => void>();

  constructor() {
    this.db = this.load() ?? this.seed();
    window.addEventListener('storage', (e) => {
      if (e.key === KEY) {
        this.db = this.load() ?? {};
        this.emit();
      } else if (e.key === PARENT_KEY) this.emit();
    });
  }

  private load(): DB | null {
    try {
      const raw = localStorage.getItem(KEY);
      return raw ? (JSON.parse(raw) as DB) : null;
    } catch {
      return null;
    }
  }

  private seed(): DB {
    const d = demoData();
    const db: DB = { 'meta/settings': { ...d.settings } as unknown as Record<string, unknown> };
    const put = (col: string, items: { id: string }[]) => {
      for (const it of items) db[`${col}/${it.id}`] = it as unknown as Record<string, unknown>;
    };
    put('recipes', d.recipes);
    put('pantry', d.pantry);
    put('weeks', d.weeks);
    put('votes', d.votes);
    put('shopping', d.shopping);
    localStorage.setItem(KEY, JSON.stringify(db));
    localStorage.removeItem(PARENT_KEY);
    localStorage.removeItem('kk-demo-pin');
    return db;
  }

  /** Wipe the demo and start over. */
  reset() {
    this.db = this.seed();
    this.emit();
  }

  private save() {
    localStorage.setItem(KEY, JSON.stringify(this.db));
    this.emit();
  }

  private emit() {
    for (const l of this.listeners) l();
  }

  private listen(fn: () => void): Unsub {
    this.listeners.add(fn);
    fn();
    return () => this.listeners.delete(fn);
  }

  subscribeDoc(path: string, cb: (doc: Doc | null) => void): Unsub {
    let last = '';
    return this.listen(() => {
      const d = this.db[path];
      const s = JSON.stringify(d ?? null);
      if (s === last) return;
      last = s;
      cb(d ? ({ ...structuredClone(d), id: path.split('/')[1] } as Doc) : null);
    });
  }

  subscribeCol(col: string, cb: (docs: Doc[]) => void): Unsub {
    let last = '';
    return this.listen(() => {
      const docs = Object.entries(this.db)
        .filter(([k]) => k.startsWith(`${col}/`))
        .map(([k, v]) => ({ ...v, id: k.slice(col.length + 1) }) as Doc);
      const s = JSON.stringify(docs);
      if (s === last) return;
      last = s;
      cb(structuredClone(docs));
    });
  }

  async set(path: string, data: Record<string, unknown>) {
    const { id: _id, ...rest } = data;
    this.db[path] = clean(rest);
    this.save();
  }

  async update(path: string, patch: Record<string, unknown>) {
    this.db[path] = setDotted(this.db[path] ?? {}, patch);
    this.save();
  }

  async remove(path: string) {
    delete this.db[path];
    this.save();
  }

  async batch(writes: { path: string; data: Record<string, unknown> }[]) {
    for (const w of writes) this.db[w.path] = clean(w.data);
    this.save();
  }

  newId() {
    return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
  }

  subscribeParent(cb: (isParent: boolean) => void): Unsub {
    return this.listen(() => cb(localStorage.getItem(PARENT_KEY) === '1'));
  }

  async setPin(pin: string) {
    localStorage.setItem('kk-demo-pin', await hashPin(FAMILY, pin));
    localStorage.setItem(PARENT_KEY, '1');
    await this.update('meta/settings', { pinSet: true });
  }

  async changePin(pin: string) {
    localStorage.setItem('kk-demo-pin', await hashPin(FAMILY, pin));
  }

  async unlockParent(pin: string) {
    const ok = localStorage.getItem('kk-demo-pin') === (await hashPin(FAMILY, pin));
    if (ok) {
      localStorage.setItem(PARENT_KEY, '1');
      this.emit();
    }
    return ok;
  }

  async lockParent() {
    localStorage.removeItem(PARENT_KEY);
    this.emit();
  }
}
