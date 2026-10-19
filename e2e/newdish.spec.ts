import { expect, test, type Page } from '@playwright/test';

// Demo mode: the AI is mocked (src/data/mockAi.ts). Phone widths only.
test.beforeEach(() => test.skip(!test.info().project.name.startsWith('phone'), 'phone widths'));

const MONDAY_EVENING = new Date('2026-10-19T18:30:00+03:00');
const SHOTS = process.env.SHOTS_DIR;
const shot = async (page: Page, name: string) => {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${test.info().project.name}-${name}.png` });
};

async function open(page: Page) {
  await page.clock.setFixedTime(MONDAY_EVENING);
  await page.goto('/?demo');
  await expect(page.getByText('מי משתמש/ת עכשיו?')).toBeVisible();
}

async function pin(page: Page) {
  for (const d of '1234') await page.getByRole('button', { name: d, exact: true }).click();
}

async function asParent(page: Page) {
  await open(page);
  await page.getByRole('button', { name: /אמא/ }).click();
  await pin(page);
  await expect(page.getByText('הורה', { exact: true })).toBeVisible();
}

async function nextWeekMondayLunch(page: Page) {
  await page.locator('.tabbar').getByRole('button', { name: /תפריט/ }).click();
  await page.getByRole('button', { name: 'שבוע הבא' }).click();
  await expect(page.getByRole('heading', { name: 'השבוע הבא' })).toBeVisible();
  await page.locator('.day-card').nth(1).locator('.slot').first().getByRole('button', { name: /בחירת מנה/ }).click();
}

test('parent: a dish that is not in the bank — find a recipe, review it, it lands in the menu and the list', async ({ page }) => {
  await asParent(page);
  await nextWeekMondayLunch(page);
  const sheet = page.getByRole('dialog');
  await sheet.getByLabel('חיפוש מנה').fill('פאי רועים');
  await sheet.getByRole('button', { name: /להוסיף ״פאי רועים״ כמנה חדשה/ }).click();
  await expect(sheet.getByText('״פאי רועים״ עוד לא בספר המתכונים')).toBeVisible();
  await shot(sheet.page(), 'n1-options');
  await sheet.getByRole('button', { name: /מצאי לי מתכון/ }).click();
  await expect(sheet.getByText(/מחפשת מתכון לפאי רועים/)).toBeVisible();

  // editable preview, normalized names
  await expect(sheet.getByText(/נמצא באינטרנט/)).toBeVisible();
  await expect(sheet.getByLabel('מצרך 1')).toHaveValue('בשר טחון');
  await expect(sheet.getByLabel('מצרך 2')).toHaveValue('בצל');
  await expect(sheet.locator('.chip.kosher-chip-meat.on')).toBeVisible();
  await shot(page, 'n2-preview');
  await sheet.getByLabel('מצרך 2').fill('בצל סגול'); // the parent edits before saving
  await sheet.getByRole('button', { name: 'שמירה והוספה לתפריט' }).click();

  await expect(page.getByRole('dialog')).toHaveCount(0);
  const monday = page.locator('.day-card').nth(1);
  await expect(monday.getByText('פאי רועים')).toBeVisible();
  await expect(monday.getByText('להפשיר')).toBeVisible();
  await shot(page, 'n3-menu');

  // shopping list for next week now has the new ingredients (beef minus the 500g at home)
  await page.locator('.tabbar').getByRole('button', { name: /קניות/ }).click();
  await page.getByRole('button', { name: 'תפריט השבוע הבא' }).click();
  await expect(page.locator('.list-row', { hasText: 'ציר בקר' })).toBeVisible();
  await expect(page.locator('.list-row', { hasText: 'בצל סגול' })).toContainText('פאי רועים');
  await expect(page.locator('.list-row', { hasText: 'בשר טחון' })).toContainText('100 גרם');

  // and it's in the recipe bank for good
  await page.locator('.tabbar').getByRole('button', { name: /מתכונים/ }).click();
  await page.getByPlaceholder(/חיפוש מתכון/).fill('פאי');
  await expect(page.locator('.recipe-card', { hasText: 'פאי רועים' })).toBeVisible();
});

test('parent: "just a name" adds the dish at once; kosher clash is blocked', async ({ page }) => {
  await asParent(page);
  // this week's Monday dinner already has a dairy dish (quesadilla)
  await page.locator('.tabbar').getByRole('button', { name: /תפריט/ }).click();
  await page.locator('.day-card').nth(1).locator('.slot').nth(1).getByRole('button', { name: /עוד מנה/ }).click();
  const sheet = page.getByRole('dialog');
  await sheet.getByLabel('חיפוש מנה').fill('מרק תירס');
  await sheet.getByRole('button', { name: /כמנה חדשה/ }).click();
  await sheet.getByRole('button', { name: /רק שם/ }).click();
  await expect(sheet.getByRole('button', { name: 'בשרי' })).toBeDisabled();
  await sheet.getByRole('button', { name: 'חלבי' }).click();
  await expect(page.locator('.day-card').nth(1).getByText('מרק תירס')).toBeVisible();
});

test('kid: proposes a new dish with a found recipe; it waits until a parent approves', async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: /ילד\/ה קטן\/ה/ }).click();
  await page.getByRole('button', { name: /מה בא לך לאכול/ }).click();
  await page.getByLabel('חיפוש מנה').fill('פאי רועים');
  await page.getByRole('button', { name: /להציע ״פאי רועים״/ }).click();
  await page.getByRole('button', { name: /מצאי לי מתכון/ }).click();
  await page.getByRole('button', { name: 'לשלוח להורים לאישור' }).click();
  await expect(page.getByRole('status')).toContainText('נשלחה להורים');
  await expect(page.locator('.wish', { hasText: 'פאי רועים' })).toContainText('מחכה לאישור');
  await expect(page.getByText('4/5')).toBeVisible();
  await shot(page, 'n4-kid-pending');

  // not in the bank yet
  await page.locator('.tabbar').getByRole('button', { name: /מתכונים/ }).click();
  await expect(page.getByText('ההצעות שלי')).toBeVisible();
  await page.getByPlaceholder(/חיפוש מתכון/).fill('פאי');
  await expect(page.locator('.recipe-card')).toHaveCount(0);

  // a parent approves it
  await page.locator('.me-btn').click();
  await page.getByRole('button', { name: 'החלפת משתמש', exact: true }).click();
  await page.getByRole('button', { name: /אמא/ }).click();
  await pin(page);
  await page.getByRole('button', { name: /מתכון חדש שהילדים הציעו: פאי רועים/ }).click();
  await expect(page.getByText(/מחכה לאישור הורה/)).toBeVisible();
  await page.getByRole('button', { name: /לאשר לספר המתכונים/ }).click();
  await expect(page.getByText(/מחכה לאישור הורה/)).toHaveCount(0);
  await page.locator('.tabbar').getByRole('button', { name: /מתכונים/ }).click();
  await page.getByPlaceholder(/חיפוש מתכון/).fill('פאי');
  await expect(page.locator('.recipe-card', { hasText: 'פאי רועים' })).toBeVisible();
});

test('recipe bank: import a recipe from a YouTube link', async ({ page }) => {
  await asParent(page);
  await page.locator('.tabbar').getByRole('button', { name: /מתכונים/ }).click();
  await page.getByRole('button', { name: '+ מתכון חדש' }).click();
  const sheet = page.getByRole('dialog');
  await sheet.getByLabel(/שם המנה, או קישור/).fill('https://www.youtube.com/watch?v=abcdefghijk');
  await sheet.getByRole('button', { name: 'המשך' }).click();
  await expect(sheet.getByLabel('הקישור למתכון')).toHaveValue('https://www.youtube.com/watch?v=abcdefghijk');
  await sheet.getByRole('button', { name: 'לקרוא את המתכון' }).click();
  await expect(sheet.getByText(/נקרא מהקישור/)).toBeVisible();
  await sheet.getByRole('button', { name: 'שמירה בספר המתכונים' }).click();
  await expect(page.getByRole('heading', { name: 'מתכון מהקישור' })).toBeVisible();
  await expect(page.locator('.video iframe')).toHaveAttribute('src', /abcdefghijk/);
});
