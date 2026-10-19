import { initializeApp, type FirebaseOptions } from 'firebase/app';
import { getAuth, onAuthStateChanged, signInAnonymously, type User } from 'firebase/auth';
import {
  collection, deleteDoc, doc, initializeFirestore, onSnapshot, persistentLocalCache,
  persistentMultipleTabManager, setDoc, updateDoc, writeBatch, type Firestore,
} from 'firebase/firestore';
import { clean, hashPin, type Doc, type Store, type Unsub } from './store';

/** Realtime Firestore under families/<familyId>/..., signed in anonymously. */
export class FirebaseStore implements Store {
  mode = 'firebase' as const;
  ready: Promise<void>;
  private db: Firestore;
  private user: User | null = null;
  private root: string;

  constructor(config: FirebaseOptions, private familyId: string) {
    const app = initializeApp(config);
    this.db = initializeFirestore(app, {
      localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
    });
    this.root = `families/${familyId}`;
    const auth = getAuth(app);
    this.ready = new Promise((resolve, reject) => {
      const off = onAuthStateChanged(auth, (u) => {
        if (u) {
          this.user = u;
          off();
          resolve();
        }
      });
      signInAnonymously(auth).catch(reject);
    });
  }

  private ref(path: string) {
    return doc(this.db, `${this.root}/${path}`);
  }

  subscribeDoc(path: string, cb: (d: Doc | null) => void): Unsub {
    return onSnapshot(
      this.ref(path),
      (s) => {
        // an empty local cache says "missing" before the server answers: wait for the server
        if (!s.exists() && s.metadata.fromCache) return;
        cb(s.exists() ? ({ ...s.data(), id: s.id } as Doc) : null);
      },
      (e) => {
        console.warn('subscribeDoc', path, e);
        cb(null);
      },
    );
  }

  subscribeCol(col: string, cb: (docs: Doc[]) => void): Unsub {
    return onSnapshot(
      collection(this.db, `${this.root}/${col}`),
      (s) => cb(s.docs.map((d) => ({ ...d.data(), id: d.id }) as Doc)),
      (e) => console.warn('subscribeCol', col, e),
    );
  }

  async set(path: string, data: Record<string, unknown>) {
    const { id: _id, ...rest } = data;
    await setDoc(this.ref(path), clean(rest));
  }

  async update(path: string, patch: Record<string, unknown>) {
    await updateDoc(this.ref(path), clean(patch));
  }

  async remove(path: string) {
    await deleteDoc(this.ref(path));
  }

  async batch(writes: { path: string; data: Record<string, unknown> }[]) {
    // Firestore allows 500 writes per batch
    for (let i = 0; i < writes.length; i += 400) {
      const b = writeBatch(this.db);
      for (const w of writes.slice(i, i + 400)) {
        const { id: _id, ...rest } = w.data;
        b.set(this.ref(w.path), clean(rest));
      }
      await b.commit();
    }
  }

  newId() {
    return doc(collection(this.db, '_')).id;
  }

  private parentPath() {
    return `parents/${this.user?.uid}`;
  }

  subscribeParent(cb: (isParent: boolean) => void): Unsub {
    let off: Unsub = () => {};
    let cancelled = false;
    this.ready.then(() => {
      if (cancelled) return;
      off = onSnapshot(
        this.ref(this.parentPath()),
        (s) => cb(s.exists()),
        () => cb(false),
      );
    });
    return () => {
      cancelled = true;
      off();
    };
  }

  /** First time only: the PIN can be created once; after that only a parent can change it. */
  async setPin(pin: string) {
    await this.ready;
    const hash = await hashPin(this.familyId, pin);
    const b = writeBatch(this.db);
    b.set(this.ref('private/pin'), { hash });
    b.set(this.ref(this.parentPath()), { hash, at: Date.now() });
    await b.commit();
    await setDoc(this.ref('meta/settings'), { pinSet: true }, { merge: true });
  }

  /** Changing the PIN (already a parent). */
  async changePin(pin: string) {
    const hash = await hashPin(this.familyId, pin);
    await setDoc(this.ref('private/pin'), { hash });
    await setDoc(this.ref(this.parentPath()), { hash, at: Date.now() });
  }

  async unlockParent(pin: string) {
    await this.ready;
    const hash = await hashPin(this.familyId, pin);
    try {
      // the security rules only accept this when the hash matches the family PIN
      await setDoc(this.ref(this.parentPath()), { hash, at: Date.now() });
      return true;
    } catch {
      return false;
    }
  }

  async lockParent() {
    await deleteDoc(this.ref(this.parentPath()));
  }
}
