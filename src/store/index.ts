import { FAMILY_ID, FIREBASE } from '../config';
import { LocalStore } from './local';
import type { Store } from './store';

let store: Store | null = null;

export async function getStore(): Promise<Store> {
  if (store) return store;
  if (FIREBASE) {
    // loaded only when configured, so demo mode stays light
    const { FirebaseStore } = await import('./firebase');
    store = new FirebaseStore(FIREBASE, FAMILY_ID);
  } else {
    store = new LocalStore();
  }
  return store;
}
