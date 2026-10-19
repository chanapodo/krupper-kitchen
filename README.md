# בישולי קרופרז 🥘

A family meal-planning web app (Hebrew, RTL, mobile-first, installable):
weekly menu with the kids' votes, thaw reminders, an automatic shopping list,
the home pantry, a family recipe bank with ratings, and "what can we make tonight".

**Setup for the family (Hebrew): [SETUP.md](SETUP.md).**

## Stack

- Vite + React + TypeScript, static, deployed to GitHub Pages by `.github/workflows/deploy.yml`.
- Firebase: Firestore (realtime sync) + anonymous auth. Security in [`firestore.rules`](firestore.rules).
- Config in [`firebase.config.json`](firebase.config.json) (public by design). Empty `apiKey`, or `?demo` in the URL → **demo mode** on `localStorage`, with sample menu, pantry and votes.

## Develop

```bash
npm ci
npm run dev        # http://localhost:5173 (demo mode until firebase.config.json is filled)
npm test           # unit tests: shopping list, pantry, ideas, thaw, votes, kosher
npm run e2e        # Playwright at 360px, 390px and tablet width (CHROMIUM_PATH=... to use a system Chromium; SHOTS_DIR=... saves screenshots)
npm run build
```

## Data model (`families/{familyId}/…`)

| path | what | who writes |
|---|---|---|
| `meta/settings` | family name, members (id, name, role, emoji), Shabbat on/off | parents |
| `meta/thaw` | thaw plan for the next 8 days (see below) | parents' devices, automatically |
| `private/pin` | SHA-256 of `familyId:PIN` — unreadable | created once; then parents |
| `parents/{uid}` | a device that unlocked parent mode (rules check the hash) | that device |
| `recipes/{id}` | recipe, `ratings: {memberId: 1..5}` | anyone adds/rates; parents edit/delete |
| `weeks/{sundayDate}` | `days.{sun..sat}.{lunch,dinner}.recipeIds`, `skipped` list items | parents |
| `votes/{week}_{member}` | kid's picks (max 5) and free-text wishes | anyone |
| `shopping/{id}` | manual items; kids create only `status: "pending"` | parents approve / check / delete |
| `pantry/{id}` | name, qty, unit, `location: fridge/freezer/pantry` | parents |

The menu part of the shopping list is computed live (`src/lib/logic.ts → neededFromMenu`):
week's ingredients, summed, minus pantry stock, minus staples (salt, oil, spices…).
Checking an item moves it into the pantry, which removes it from the list.

## Nightly thaw reminder (for later)

`meta/thaw` holds, per meal date, what to take out of the freezer the evening before:

```json
{ "byDate": { "2026-10-20": { "text": "להוציא מהמקפיא למחר: שוקיים עוף",
  "items": ["שוקיים עוף"], "meals": ["צהריים: עוף בתנור עם תפוחי אדמה ובטטה"] } }, "updatedAt": 0 }
```

A scheduled job can read it with the public web API key:
1. `POST https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=<apiKey>` with `{"returnSecureToken":true}` → `idToken`
2. `GET https://firestore.googleapis.com/v1/projects/<projectId>/databases/(default)/documents/families/krupper/meta/thaw` with `Authorization: Bearer <idToken>`
3. Send `byDate[tomorrow].text` if present.
