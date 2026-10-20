// Security rules check against the local Firestore emulator (never the live project).
// Run from the repo root:  npx firebase emulators:exec --config firebase.rules-test.json --only firestore --project demo-krupper "node rules-test/check-rules.mjs"
import { createHash } from 'node:crypto';

const HOST = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8181';
const PROJECT = 'demo-krupper';
const FID = 'krupper';
const BASE = `http://${HOST}/v1/projects/${PROJECT}/databases/(default)/documents`;
const ROOT = `families/${FID}`;
const PIN_HASH = createHash('sha256').update(`${FID}:1234`).digest('hex');

// the emulator accepts unsigned tokens; "owner" skips the rules (setup only)
const token = (uid) => {
  const b = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  return `${b({ alg: 'none', typ: 'JWT' })}.${b({ sub: uid, user_id: uid, aud: PROJECT, iss: `https://securetoken.google.com/${PROJECT}`, iat: 0, exp: 9999999999, firebase: { sign_in_provider: 'anonymous' } })}.`;
};
const auth = (who) => (who === 'owner' ? { Authorization: 'Bearer owner' } : who ? { Authorization: `Bearer ${token(who)}` } : {});

const val = (v) => {
  if (v === null) return { nullValue: null };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (typeof v === 'string') return { stringValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(val) } };
  return { mapValue: { fields: fields(v) } };
};
const fields = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, val(v)]));

async function call(who, method, path, data, mask) {
  const q = mask ? '?' + mask.map((m) => `updateMask.fieldPaths=${encodeURIComponent(m)}`).join('&') : '';
  const res = await fetch(`${BASE}/${ROOT}/${path}${q}`, {
    method, headers: { 'Content-Type': 'application/json', ...auth(who) },
    body: data ? JSON.stringify({ fields: fields(data) }) : undefined,
  });
  return res.status;
}
const get = (who, path) => call(who, 'GET', path);
const set = (who, path, data) => call(who, 'PATCH', path, data);
// a partial update (only these fields), like updateDoc
const upd = (who, path, data) => call(who, 'PATCH', path, data, Object.keys(data));
const del = (who, path) => call(who, 'DELETE', path);

let fails = 0;
let n = 0;
async function expect(name, p, ok) {
  const status = await p;
  n++;
  const pass = ok ? status === 200 : status === 403;
  if (!pass) fails++;
  console.log(`${pass ? '✓' : '✗'} ${name} (${status})`);
}

const PARENT = 'parentUid';
const KID = 'kidUid';
const KID2 = 'kid2Uid';
const now = 1;

// ---- setup (bypasses rules) ----
await set('owner', 'private/pin', { hash: PIN_HASH });
await set('owner', `parents/${PARENT}`, { hash: PIN_HASH, at: now });
await set('owner', 'meta/settings', { familyName: 'x', pinSet: true });
await set('owner', 'shopping/parentItem', { name: 'חלב', aisle: 'חלב וביצים', status: 'active', addedBy: 'mom', createdAt: now });
await set('owner', 'pantry/oil', { name: 'שמן', location: 'pantry', mode: 'level', level: 'full', updatedAt: now });
await set('owner', 'weeks/2026-10-18', { days: {}, skipped: [] });

// ---- nobody signed in ----
await expect('anonymous web: read shopping refused', get(null, 'shopping/parentItem'), false);
await expect('anonymous web: write pantry refused', set(null, 'pantry/x', { name: 'x' }), false);
await expect('anyone: read the PIN hash refused', get(KID, 'private/pin'), false);

// ---- kid: shopping ----
await expect('kid: read the list', get(KID, 'shopping/parentItem'), true);
await expect('kid: add an item (active, own uid)', set(KID, 'shopping/k1', { name: 'מילקי', aisle: 'חלב וביצים', status: 'active', addedBy: 'kid2', createdAt: now, uid: KID }), true);
await expect('kid: add without uid refused', set(KID, 'shopping/k2', { name: 'x', status: 'active', addedBy: 'kid2', createdAt: now }), false);
await expect('kid: add as removed refused', set(KID, 'shopping/k3', { name: 'x', status: 'removed', uid: KID }), false);
await expect('kid: tick a parent item bought', upd(KID, 'shopping/parentItem', { status: 'bought', doneAt: now, doneBy: 'kid2' }), true);
await expect('kid: undo the tick (back to active)', upd(KID, 'shopping/parentItem', { status: 'active' }), true);
await expect('kid: remove a parent item refused', upd(KID, 'shopping/parentItem', { status: 'removed' }), false);
await expect('kid: delete a parent item refused', del(KID, 'shopping/parentItem'), false);
await expect('another kid: delete my item refused', del(KID2, 'shopping/k1'), false);
await expect('kid: delete own item (undo)', del(KID, 'shopping/k1'), true);

// ---- kid: pantry ----
await expect('kid: add to pantry (own uid)', set(KID, 'pantry/k1', { name: 'יוגורט', location: 'fridge', mode: 'count', qty: 4, updatedAt: now, uid: KID }), true);
await expect('kid: lower a level', upd(KID, 'pantry/oil', { level: 'low', updatedAt: now, updatedBy: 'kid1' }), true);
await expect('kid: buy into an existing item (whole doc, same other fields)', set(KID, 'pantry/oil', { name: 'שמן', location: 'pantry', mode: 'level', level: 'full', updatedAt: 2 }), true);
await expect('kid: whole-doc write that drops a field refused', set(KID, 'pantry/oil', { name: 'שמן', mode: 'level', level: 'full', updatedAt: 3 }), false);
await expect('kid: move an item refused', upd(KID, 'pantry/oil', { location: 'fridge' }), false);
await expect('kid: rename refused', upd(KID, 'pantry/oil', { name: 'זית' }), false);
await expect('kid: remove from pantry (soft) refused', upd(KID, 'pantry/oil', { removedAt: now }), false);
await expect('kid: delete a parent pantry item refused', del(KID, 'pantry/oil'), false);
await expect('kid: delete own new pantry item (undo)', del(KID, 'pantry/k1'), true);

// ---- kid: recipes, menu ----
await expect('kid: add a recipe', set(KID, 'recipes/r1', { title: 'עוף מוקפץ', createdBy: 'kid1' }), true);
await expect('kid: rate a recipe', upd(KID, 'recipes/r1', { ratings: { kid1: 5 } }), true);
await expect('kid: edit a recipe refused', upd(KID, 'recipes/r1', { title: 'x' }), false);
await expect('kid: write the menu refused', upd(KID, 'weeks/2026-10-18', { skipped: ['x'] }), false);

// ---- notices ----
await expect('kid: write a notice', set(KID, 'notices/n1', { text: 'נעם הוסיף עוף מוקפץ למתכונים', kind: 'recipe', by: 'kid1', at: now }), true);
await expect('kid: notice already read refused', set(KID, 'notices/n2', { text: 'x', readBy: { mom: true } }), false);
await expect('kid: mark notice read refused', upd(KID, 'notices/n1', { readBy: { mom: true } }), false);
await expect('kid: withdraw own notice (undone)', upd(KID, 'notices/n1', { undone: true }), true);
await expect('kid: delete notice refused', del(KID, 'notices/n1'), false);
await expect('parent: mark notice read', upd(PARENT, 'notices/n1', { readBy: { mom: true } }), true);

// ---- requests ----
await expect('kid: ask to add a dish (pending)', set(KID, 'requests/q1', { kind: 'menu-add', by: 'kid1', at: now, status: 'pending', title: 'עוף מוקפץ', uid: KID }), true);
await expect('kid: create an approved request refused', set(KID, 'requests/q2', { kind: 'menu-add', status: 'approved', uid: KID }), false);
await expect('kid: approve own request refused', upd(KID, 'requests/q1', { status: 'approved' }), false);
await expect('another kid: cancel my request refused', upd(KID2, 'requests/q1', { status: 'cancelled' }), false);
await expect('kid: cancel own waiting request', upd(KID, 'requests/q1', { status: 'cancelled' }), true);
await set('owner', 'requests/q3', { kind: 'shop-remove', by: 'kid1', at: now, status: 'pending', title: 'חלב', itemId: 'parentItem', uid: KID });
await expect('parent: approve a request', upd(PARENT, 'requests/q3', { status: 'approved', decidedAt: now, decidedBy: 'mom' }), true);
await expect('kid: cancel a decided request refused', upd(KID, 'requests/q3', { status: 'cancelled' }), false);

// ---- parent ----
await expect('parent: remove from the list', upd(PARENT, 'shopping/parentItem', { status: 'removed' }), true);
await expect('parent: write the menu', upd(PARENT, 'weeks/2026-10-18', { skipped: ['חלב'] }), true);
await expect('parent: soft-remove from pantry', upd(PARENT, 'pantry/oil', { removedAt: now }), true);
await expect('parent: delete a recipe', del(PARENT, 'recipes/r1'), true);
await expect('kid: write settings refused', upd(KID, 'meta/settings', { familyName: 'y' }), false);
await expect('kid: become parent with a wrong PIN refused', set(KID, `parents/${KID}`, { hash: 'nope', at: now }), false);

console.log(`\n${n - fails}/${n} passed`);
process.exit(fails ? 1 : 0);
