import { expect, test, type Page } from '@playwright/test';

// Monday evening: the thaw banner should warn about Tuesday's chicken.
const MONDAY_EVENING = new Date('2026-10-19T18:30:00+03:00');
const SHOTS = process.env.SHOTS_DIR;

async function shot(page: Page, name: string) {
  if (!SHOTS) return;
  await page.waitForTimeout(250);
  await page.screenshot({ path: `${SHOTS}/${test.info().project.name}-${name}.png`, fullPage: false });
}

async function open(page: Page) {
  await page.clock.setFixedTime(MONDAY_EVENING);
  await page.goto('/');
  await expect(page.getByText('מי משתמש/ת עכשיו?')).toBeVisible();
}

async function asKid(page: Page) {
  await open(page);
  await page.getByRole('button', { name: /ילד\/ה גדול\/ה/ }).click();
  await expect(page.getByRole('heading', { name: /ערב טוב/ })).toBeVisible();
}

async function asParent(page: Page) {
  await open(page);
  await page.getByRole('button', { name: /אמא/ }).click();
  await expect(page.getByText('בוחרים קוד הורים')).toBeVisible();
  for (const d of '1234') await page.getByRole('button', { name: d, exact: true }).click();
  await expect(page.getByText('הורה', { exact: true })).toBeVisible();
}

test('kid: home, voting and suggesting to the shopping list (no checking or deleting)', async ({ page }) => {
  await open(page);
  await shot(page, '0-who');
  await page.getByRole('button', { name: /ילד\/ה גדול\/ה/ }).click();

  // thaw banner the evening before
  await expect(page.getByRole('alert')).toContainText('להוציא מהמקפיא למחר: שוקיים עוף');
  await shot(page, '1-home-kid');

  // vote
  await page.getByRole('button', { name: /מה בא לך לאכול/ }).click();
  await expect(page.getByText('3/5')).toBeVisible(); // seeded picks
  await page.getByRole('button', { name: /פיצה ביתית/ }).click();
  await expect(page.getByText('4/5')).toBeVisible();
  await page.getByPlaceholder(/ראמן/).fill('פנקייק');
  await page.getByRole('button', { name: 'שליחה' }).click();
  await expect(page.getByText('“פנקייק”')).toBeVisible();
  await shot(page, '2-vote');

  // shopping: kids only suggest
  await page.getByRole('button', { name: /קניות/ }).click();
  await expect(page.getByRole('heading', { name: /רשימת קניות/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /^נקנה:/ })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /^למחוק/ })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'יש / לא צריך' })).toHaveCount(0);
  await page.getByLabel('פריט').fill('שוקו');
  await page.getByRole('button', { name: 'הצעה' }).click();
  await expect(page.getByText('ההצעות שלי')).toBeVisible();
  await expect(page.locator('.pending-row', { hasText: 'שוקו' })).toContainText('מחכה לאישור');
  await shot(page, '3-shopping-kid');
});

test('parent: build the menu from the kids wishes, approve, buy into the pantry', async ({ page }) => {
  await asParent(page);
  await shot(page, '4-home-parent');

  // the kids' wishes for next week are waiting
  await page.getByRole('button', { name: /הילדים בחרו מנות/ }).click();
  await expect(page.getByRole('heading', { name: 'השבוע הבא' })).toBeVisible();
  const wishes = page.locator('.soft-lavender');
  await expect(wishes).toContainText('0/3 בתפריט');
  await wishes.getByRole('button', { name: /סושי ביתי/ }).click();
  await page.getByRole('button', { name: /שני ערב/ }).click();
  await expect(wishes).toContainText('1/3 בתפריט');
  await expect(wishes.locator('.wish.in', { hasText: 'סושי ביתי' })).toBeVisible();
  await shot(page, '5-menu-parent');

  // kosher: Sunday lunch already has schnitzel (meat) this week -> dairy dishes hidden
  await page.getByRole('button', { name: 'שבוע קודם' }).click();
  await expect(page.getByRole('heading', { name: 'השבוע', exact: true })).toBeVisible();
  await page.locator('.day-card').first().locator('.slot').first().getByRole('button', { name: /עוד מנה/ }).click();
  const sheet = page.getByRole('dialog');
  await expect(sheet).toContainText('מנות חלביות מוסתרות');
  await expect(sheet.getByRole('button', { name: /פיצה ביתית/ })).toHaveCount(0);
  await expect(sheet.getByRole('button', { name: /אורז מטוגן/ })).toBeVisible();
  await sheet.getByRole('button', { name: 'סגירה' }).click();

  // shopping: approve the kid's request, check an item -> pantry
  await page.getByRole('button', { name: /קניות/ }).click();
  await page.getByRole('button', { name: 'תפריט השבוע', exact: true }).click();
  await expect(page.getByText('בקשות שמחכות לאישור')).toBeVisible();
  await page.getByRole('button', { name: 'לאשר במבה' }).click();
  await expect(page.getByText('בקשות שמחכות לאישור')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'נקנה: במבה' })).toBeVisible();
  await shot(page, '6-shopping-parent');
  await page.getByRole('button', { name: 'נקנה: במבה' }).click();
  await expect(page.getByRole('status')).toContainText('במבה עבר');
  await expect(page.getByRole('button', { name: 'נקנה: במבה' })).toHaveCount(0);

  await page.getByRole('button', { name: /מה יש בבית/ }).click();
  await expect(page.locator('.list-row', { hasText: 'במבה' })).toBeVisible();
  await page.getByLabel('פריט').fill('יוגורט');
  await page.getByRole('button', { name: 'הוספה', exact: true }).click();
  await expect(page.locator('.loc-fridge .list-row', { hasText: 'יוגורט' })).toBeVisible();
  await shot(page, '7-pantry');
});

test('recipes, ratings and dinner ideas', async ({ page }) => {
  await asKid(page);
  await page.getByRole('button', { name: /מתכונים/ }).click();
  await expect(page.locator('.recipe-card')).toHaveCount(41);
  await shot(page, '8-recipes');
  await page.getByPlaceholder(/חיפוש מתכון/).fill('טאקו');
  await page.locator('.recipe-card').first().click();
  await expect(page.getByRole('heading', { name: 'טאקו בשר' })).toBeVisible();
  await page.getByRole('radio', { name: 'דירוג 5' }).click();
  await expect(page.getByRole('radio', { name: 'דירוג 5' })).toHaveAttribute('aria-checked', 'true');
  await shot(page, '9-recipe');

  await page.getByRole('button', { name: /מתכונים/ }).click();
  await page.getByRole('button', { name: /מה מכינים הערב/ }).click();
  await expect(page.locator('.idea').first()).toBeVisible();
  await shot(page, '10-ideas');
  await page.getByRole('button', { name: '⚡ מהיר' }).click();
  await expect(page.locator('.idea').first()).toContainText('דק׳');
});
