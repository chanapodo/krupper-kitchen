import { expect, test, type Page } from '@playwright/test';

// v1.3: kids' notices and approvals, receipt scan, pantry levels, link fallbacks. Demo mode, phone widths.
test.beforeEach(() => test.skip(!test.info().project.name.startsWith('phone'), 'phone widths'));

const MONDAY_EVENING = new Date('2026-10-19T18:30:00+03:00');
const SHOTS = process.env.SHOTS_DIR;
const shot = async (page: Page, name: string) => {
  if (!SHOTS) return;
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${SHOTS}/${test.info().project.name}-${name}.png` });
};
// a tiny PNG standing in for a photo of a receipt (demo mode answers with a canned receipt)
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

async function open(page: Page, query = '') {
  await page.clock.setFixedTime(MONDAY_EVENING);
  await page.goto(`/?demo${query}`);
  await expect(page.getByText('מי משתמש/ת עכשיו?')).toBeVisible();
}
async function pin(page: Page) {
  for (const d of '1234') await page.getByRole('button', { name: d, exact: true }).click();
  await expect(page.getByText('הורה', { exact: true })).toBeVisible();
}
async function asParent(page: Page) {
  await page.getByRole('button', { name: /אמא/ }).click();
  await pin(page);
}
async function asKid(page: Page, big = true) {
  await page.getByRole('button', { name: big ? /ילד\/ה גדול\/ה/ : /ילד\/ה קטן\/ה/ }).click();
  await expect(page.locator('.hello')).toBeVisible();
}
async function switchTo(page: Page, who: 'mom' | 'big' | 'small') {
  await page.locator('.me-btn').click();
  await page.getByRole('button', { name: 'החלפת משתמש', exact: true }).click();
  if (who === 'mom') await asParent(page);
  else await asKid(page, who === 'big');
}
const tab = (page: Page, name: RegExp) => page.locator('.tabbar').getByRole('button', { name }).click();

test('kid adds to the list and lowers the pantry; the parent reads it under the bell', async ({ page }) => {
  await open(page);
  // set the PIN once, then hand the phone to a kid
  await asParent(page);
  await switchTo(page, 'big');

  await tab(page, /קניות/);
  await page.getByLabel('פריט').fill('מילקי');
  await page.getByRole('button', { name: 'הוספה' }).click();
  await expect(page.getByRole('checkbox', { name: 'נקנה: מילקי' })).toBeVisible();

  await tab(page, /מה יש בבית/);
  const oil = page.locator('.pantry-row', { hasText: 'שמן קנולה' });
  // a kid can't raise a level
  await oil.getByRole('button', { name: 'חצי' }).click();
  await expect(oil.getByRole('button', { name: 'מלא' })).toBeDisabled();
  await oil.getByRole('button', { name: 'כמעט נגמר' }).click();
  await expect(page.locator('.undo-toast')).toContainText('נוסף לרשימת הקניות');
  await tab(page, /קניות/); // leaving the pantry sends the notice now
  await expect(page.getByRole('checkbox', { name: 'נקנה: שמן' })).toBeVisible();

  await switchTo(page, 'mom');
  await expect(page.locator('.bell-badge')).toHaveText('2');
  await page.locator('.bell-btn').click();
  const unread = page.locator('.notice-row.unread');
  await expect(unread).toHaveCount(2);
  // (the test clock is frozen, so both have the same time: order not checked)
  await expect(page.locator('.notice-list')).toContainText('ילד/ה גדול/ה הוסיף מילקי לרשימת הקניות');
  await expect(page.locator('.notice-list')).toContainText('ילד/ה גדול/ה עדכן שמן קנולה: מלא ← כמעט נגמר');
  await expect(page.locator('.toast')).toHaveCount(0, { timeout: 8000 });
  await shot(page, 'v1-bell');
  await page.getByRole('button', { name: 'סימון הכול כנקרא' }).click();
  await expect(page.locator('.notice-row.unread')).toHaveCount(0);
  await expect(page.locator('.bell-badge')).toHaveCount(0);
  // undo brings them back as unread
  await page.locator('.undo-toast').getByRole('button', { name: /בטל/ }).click();
  await expect(page.locator('.notice-row.unread')).toHaveCount(2);
});

test('kid asks to remove an item and adds a dish; the parent approves from the pop-up, then reverses one', async ({ page }) => {
  await open(page);
  await asParent(page);
  await switchTo(page, 'small');

  await tab(page, /קניות/);
  await page.getByRole('button', { name: 'לא צריך: בננות' }).click();
  await expect(page.locator('.list-row', { hasText: 'בננות' })).toContainText('ממתין לאישור הסרה');
  await expect(page.getByRole('checkbox', { name: 'נקנה: בננות' })).toBeVisible(); // still on the list

  await tab(page, /תפריט/);
  const sunday = page.locator('.day-card').first();
  await sunday.locator('.slot').nth(1).getByRole('button', { name: /להוסיף מנה/ }).click();
  const sheet = page.getByRole('dialog');
  const first = sheet.locator('.pick-row').first();
  const dish = (await first.locator('.pick-title').textContent())!;
  await first.click();
  await expect(sunday.locator('.dish.asked', { hasText: dish })).toContainText('ממתין לאישור');

  await switchTo(page, 'mom');
  const popup = page.getByRole('dialog', { name: /מחכה לאישור שלך/ });
  await expect(popup).toBeVisible();
  await expect(popup.locator('.approval-row')).toHaveCount(2);
  await expect(popup).toContainText(`ילד/ה קטן/ה הוסיפה`);
  await expect(popup).toContainText('ילד/ה קטן/ה ביקשה להוריד מרשימת הקניות: בננות');
  await shot(page, 'v2-approvals-popup');
  await popup.getByRole('button', { name: `לאשר: ${dish}` }).click();
  await popup.getByRole('button', { name: 'לאשר: בננות' }).click();
  await expect(popup).toHaveCount(0);

  await tab(page, /תפריט/);
  await expect(page.locator('.day-card').first().locator('.dish:not(.asked)', { hasText: dish })).toBeVisible();
  await tab(page, /קניות/);
  await expect(page.getByRole('checkbox', { name: 'נקנה: בננות' })).toHaveCount(0);
  await page.locator('.history.recent summary').click();
  await expect(page.locator('.history.recent')).toContainText('בננות');

  // reverse the removal from the bell: back on the list, waiting again
  await page.locator('.bell-btn').click();
  await expect(page.getByRole('heading', { name: /התראות/ })).toBeVisible();
  await page.locator('details.history summary').click();
  await page.getByRole('button', { name: 'לבטל את ההחלטה: בננות' }).click();
  await expect(page.locator('.approval-row', { hasText: 'בננות' })).toBeVisible();
  await page.getByRole('button', { name: 'לדחות: בננות' }).click();
  await tab(page, /קניות/);
  await expect(page.getByRole('checkbox', { name: 'נקנה: בננות' })).toBeVisible();
});

test('receipt scan: review (fix, remove with undo), add; list items marked bought', async ({ page }) => {
  await open(page);
  await asParent(page);
  await tab(page, /מה יש בבית/);
  await page.getByRole('button', { name: /סריקת קבלה/ }).click();
  const sheet = page.getByRole('dialog');
  await sheet.getByLabel('קובץ קבלה').setInputFiles({ name: 'receipt.png', mimeType: 'image/png', buffer: PNG });
  await expect(sheet.locator('.receipt-line')).toHaveCount(7);
  await expect(sheet.locator('.receipt-lines')).not.toContainText('פיקדון');
  await expect(sheet.locator('.receipt-lines')).not.toContainText('שקית');
  await expect(sheet.locator('.receipt-line', { has: page.locator('input[value="בננות"]') })).toContainText('ברשימת הקניות');

  // remove a line, then undo
  await sheet.getByRole('button', { name: 'להסיר שורה: נייר טואלט' }).click();
  await expect(sheet.locator('.receipt-line')).toHaveCount(6);
  await page.locator('.undo-toast').getByRole('button', { name: /בטל/ }).click();
  await expect(sheet.locator('.receipt-line')).toHaveCount(7);
  await sheet.getByLabel('כמה: יוגורט').fill('6');
  await expect(page.locator('.toast')).toHaveCount(0, { timeout: 8000 });
  await sheet.locator('.sheet-body').evaluate((el) => el.scrollTo(0, 0));
  await shot(page, 'v3-receipt-review');
  await sheet.getByRole('button', { name: /להוסיף 7 פריטים/ }).click();
  await expect(page.locator('.undo-toast')).toContainText(/נוספו 7 פריטים מהקבלה · \d+ סומנו כנקנו/);

  await expect(page.locator('.pantry-row', { hasText: 'יוגורט' })).toContainText('6 יח׳');
  await expect(page.locator('.pantry-row', { hasText: 'ביצים' })).toContainText('20 יח׳');
  await expect(page.locator('.loc-home .pantry-row', { hasText: 'סבון כלים' }).getByRole('button', { name: 'מלא' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.loc-home .pantry-row', { hasText: 'נייר טואלט' })).toContainText('1 יח׳');

  await tab(page, /קניות/);
  await expect(page.getByRole('checkbox', { name: 'נקנה: בננות' })).toHaveCount(0);
  await page.locator('.history.recent summary').click();
  await expect(page.locator('.history.recent .history-row', { hasText: 'בננות' })).toContainText('נקנה');
});

test('pantry: levels and counts; running low goes on the list, and undo takes it back', async ({ page }) => {
  await open(page);
  await asParent(page);
  await tab(page, /מה יש בבית/);
  const oil = page.locator('.pantry-row', { hasText: 'שמן קנולה' });
  await oil.getByRole('button', { name: 'כמעט נגמר' }).click();
  await expect(page.locator('.undo-toast')).toContainText('שמן קנולה: כמעט נגמר · נוסף לרשימת הקניות');
  await page.locator('.undo-toast').getByRole('button', { name: /בטל/ }).click();
  await expect(oil.getByRole('button', { name: 'מלא' })).toHaveAttribute('aria-pressed', 'true');

  const eggs = page.locator('.pantry-row', { hasText: 'ביצים' });
  await eggs.getByRole('button', { name: 'פחות ביצים' }).click();
  await expect(eggs).toContainText('7 יח׳');
  const tortillas = page.locator('.pantry-row', { hasText: 'טורטיות' });
  await tortillas.getByRole('button', { name: 'לעבור לרמה: טורטיות' }).click();
  await expect(tortillas.getByRole('button', { name: 'מלא' })).toHaveAttribute('aria-pressed', 'true');
  await tortillas.getByRole('button', { name: 'חצי' }).click();
  await expect(page.locator('.toast')).toHaveCount(0, { timeout: 8000 });
  await shot(page, 'v4-pantry-levels');
  await tortillas.getByRole('button', { name: 'נגמר', exact: true }).click();
  await expect(page.locator('.undo-toast')).toContainText('טורטיות: נגמר · נוסף לרשימת הקניות');

  // remove an item: undo now, or restore later
  await page.getByRole('button', { name: 'להסיר מהבית: שמפו' }).click();
  await expect(page.locator('.pantry-row', { hasText: 'שמפו' })).toHaveCount(0);
  await page.locator('.history.recent summary').click();
  await page.getByRole('button', { name: 'להחזיר: שמפו' }).click();
  await expect(page.locator('.pantry-row', { hasText: 'שמפו' })).toBeVisible();

  await tab(page, /קניות/);
  await expect(page.getByRole('checkbox', { name: 'נקנה: טורטיות' })).toBeVisible();
  await expect(page.locator('.aisle', { hasText: 'טורטיות' }).locator('.aisle-title')).toHaveText('לחם ומאפים');
});

test('recipe link: Google junk is cleaned; a recipe can come from pasted text instead', async ({ page }) => {
  await open(page);
  await asParent(page);
  await tab(page, /מתכונים/);
  await page.getByRole('button', { name: '+ מתכון חדש' }).click();
  const sheet = page.getByRole('dialog');
  await sheet.getByLabel(/שם המנה, או קישור/).fill('https://www.foodsdictionary.co.il/Recipes/6590&sa=U&sqi=2&ved=2ahUKEwjj1p_GusiXAxXWQkEAHRy3FX4QFnoECB0QAQ&usg=AOvVaw3C1IkcE13ZIBPuxdq6GfK7');
  await sheet.getByRole('button', { name: 'המשך' }).click();
  await expect(sheet.getByRole('button', { name: /הדבקת טקסט המתכון/ })).toBeVisible();
  await expect(sheet.getByRole('button', { name: /צילום\/צילום מסך של המתכון/ })).toBeVisible();
  await sheet.getByRole('button', { name: 'לקרוא את המתכון' }).click();
  await expect(sheet.getByText(/נקרא מהקישור/)).toBeVisible();
  await sheet.getByRole('button', { name: 'סגירה' }).click();

  await page.getByRole('button', { name: '+ מתכון חדש' }).click();
  await sheet.getByLabel(/שם המנה, או קישור/).fill('https://www.foodsdictionary.co.il/Recipes/6590');
  await sheet.getByRole('button', { name: 'המשך' }).click();
  await sheet.getByRole('button', { name: /הדבקת טקסט המתכון/ }).click();
  await sheet.getByLabel('טקסט המתכון').fill('פאי רועים: 600 גרם בשר טחון, בצל, גזר, אפונה, תפוחי אדמה. מטגנים, מבשלים, מכסים בפירה ואופים.');
  await sheet.getByRole('button', { name: 'לקרוא את המתכון' }).click();
  await expect(sheet.getByText(/נקרא מהטקסט/)).toBeVisible();
});

test('old security rules: the parent is told to re-paste them; a kid\'s request says it was not saved', async ({ page }) => {
  await open(page, '&oldrules');
  await asParent(page);
  await expect(page.getByRole('heading', { name: /צריך לעדכן את חוקי האבטחה/ })).toBeVisible();
  await expect(page.getByRole('link', { name: 'הקובץ firestore.rules' })).toHaveAttribute('href', /krupper-kitchen\/blob\/main\/firestore\.rules/);
  await switchTo(page, 'big');
  await expect(page.getByRole('heading', { name: /צריך לעדכן/ })).toHaveCount(0);
  await tab(page, /קניות/);
  await page.getByRole('button', { name: 'לא צריך: בננות' }).click();
  await expect(page.getByRole('status')).toContainText('ההורים צריכים לעדכן את חוקי האבטחה');
  // adding still works (the notice just isn't sent)
  await page.getByLabel('פריט').fill('שוקו');
  await page.getByRole('button', { name: 'הוספה' }).click();
  await expect(page.getByRole('checkbox', { name: 'נקנה: שוקו' })).toBeVisible();
});
