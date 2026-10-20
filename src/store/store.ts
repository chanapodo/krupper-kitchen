/**
 * Storage behind the app. Paths are relative to the family root
 * ("meta/settings", "recipes/<id>"). Two implementations:
 * LocalStore (demo mode, localStorage) and FirebaseStore (Firestore, realtime).
 */
export type Unsub = () => void;
export type Doc = Record<string, unknown> & { id: string };

export interface Store {
  mode: 'demo' | 'firebase';
  /** resolves once signed in / loaded */
  ready: Promise<void>;
  subscribeDoc(path: string, cb: (doc: Doc | null) => void): Unsub;
  /** onError: e.g. { code: 'permission-denied' } when the published security rules are older than the app */
  subscribeCol(col: string, cb: (docs: Doc[]) => void, onError?: (e: { code?: string }) => void): Unsub;
  set(path: string, data: Record<string, unknown>): Promise<void>;
  /** shallow merge; supports dotted keys ("ratings.kid1") */
  update(path: string, patch: Record<string, unknown>): Promise<void>;
  remove(path: string): Promise<void>;
  /** several writes at once (used for first-time setup) */
  batch(writes: { path: string; data: Record<string, unknown> }[]): Promise<void>;
  newId(): string;
  /** this device's anonymous user id (lets a kid undo their own add) */
  uid(): string;

  // parent mode
  subscribeParent(cb: (isParent: boolean) => void): Unsub;
  setPin(pin: string): Promise<void>;
  changePin(pin: string): Promise<void>;
  unlockParent(pin: string): Promise<boolean>;
  lockParent(): Promise<void>;
}

export async function hashPin(familyId: string, pin: string): Promise<string> {
  const data = new TextEncoder().encode(`${familyId}:${pin}`);
  const buf = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function setDotted(obj: Record<string, unknown>, patch: Record<string, unknown>): Record<string, unknown> {
  const out = structuredClone(obj);
  for (const [k, v] of Object.entries(patch)) {
    const parts = k.split('.');
    let cur = out as Record<string, unknown>;
    for (const p of parts.slice(0, -1)) {
      if (typeof cur[p] !== 'object' || cur[p] === null) cur[p] = {};
      cur = cur[p] as Record<string, unknown>;
    }
    const last = parts[parts.length - 1];
    if (v === undefined) delete cur[last];
    else cur[last] = v;
  }
  return out;
}

/** Firestore rejects `undefined` values; drop them (recursively). */
export function clean<T>(v: T): T {
  if (Array.isArray(v)) return v.map(clean) as T;
  if (v && typeof v === 'object') {
    const o: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v)) if (x !== undefined) o[k] = clean(x);
    return o as T;
  }
  return v;
}
