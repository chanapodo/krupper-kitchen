import type { FirebaseOptions } from 'firebase/app';
import file from '../firebase.config.json';

/**
 * Firebase settings come from firebase.config.json (not secret — the security
 * rules protect the data). With no apiKey, or with ?demo in the address, the
 * app runs in demo mode on this device only.
 */
const env = import.meta.env.VITE_FIREBASE_CONFIG as string | undefined;
const fromEnv = env ? (JSON.parse(env) as FirebaseOptions) : null;
const fb = fromEnv ?? (file.firebase as FirebaseOptions);

const forceDemo = typeof location !== 'undefined' && /[?&]demo\b/.test(location.search);

export const FAMILY_ID: string = (import.meta.env.VITE_FAMILY_ID as string | undefined) || file.familyId || 'family';
export const FIREBASE: FirebaseOptions | null = !forceDemo && fb.apiKey ? fb : null;
