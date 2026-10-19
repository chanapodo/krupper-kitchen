import { expect, test, type Page } from '@playwright/test';

// Shopping list mistakes are easy to undo. Demo mode, phone widths.
test.beforeEach(() => test.skip(!test.info().project.name.startsWith('phone'), 'phone widths'));

const MONDAY_EVENING = new Date('2026-10-19T18:30:00+03:00');
const SHOTS = process.env.SHOTS_DIR;
const shot = async (page: Page, name: string) => {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${test.info().project.name}-${name}.png` });
};

async function shoppingAsParent(page: Page) {
  await page.clock.setFixedTime(MONDAY_EVENING);
  await page.goto('/?demo');
  await page.getByRole('button', { name: /אמא/ }).click();
  for (const d of '1234') await page.getByRole('button', { name: d, exact: true }).click();
  await expect(page.getByText('הורה', { exact: true })).toBeVisible();
  await page.locator('.tabbar').getByRole('button', { name: /קניות/ }).click();
  await page.getByRole('button', { name: 'תפריט השבוע', exact: true }).click();
}

const rows = (page: Page) => page.locator('.aisle .list-row');
const undoToast = (page: Page) => page.locator('.undo-toast');

test('tick: struck through first, a second tap keeps it; then the big undo brings it back and out of the pantry', async ({ page }) => {
  await shoppingAsParent(page);
  const name = (await rows(page).first().locator('.item-name').textContent())!;
  const box = page.getByRole('checkbox', { name: `נקנה: ${name}` });

  await box.click();
  await expect(box).toHaveAttribute('aria-checked', 'true');
  await expect(rows(page).first()).toHaveClass(/leaving/);
  await shot(page, 'u1-leaving');
  await box.click(); // changed my mind
  await expect(box).toHaveAttribute('aria-checked', 'false');
  await page.waitForTimeout(3000);
  await expect(box).toBeVisible();

  await box.click();
  await expect(box).toHaveCount(0, { timeout: 5000 });
  await expect(undoToast(page)).toContainText(`נקנה: ${name}`);
  await shot(page, 'u2-undo-toast');
  await undoToast(page).getByRole('button', { name: /בטל/ }).click();
  await expect(box).toBeVisible();
  await expect(page.getByRole('status')).toContainText('בוטל');
  await expect(page.locator('.history.recent')).toHaveCount(0);
});

test('quick taps gather in one toast; "undo all" restores every one', async ({ page }) => {
  await shoppingAsParent(page);
  const have = page.getByRole('button', { name: /^יש \/ לא צריך:/ });
  const first = (await have.nth(0).getAttribute('aria-label'))!.replace(/^.*: /, '');
  const second = (await have.nth(1).getAttribute('aria-label'))!.replace(/^.*: /, '');
  await have.nth(0).click();
  await expect(page.getByRole('checkbox', { name: `נקנה: ${first}` })).toHaveCount(0);
  await page.getByRole('button', { name: `יש / לא צריך: ${second}` }).click();
  await expect(undoToast(page)).toContainText('2 פעולות');
  await expect(undoToast(page)).toContainText(first);
  await expect(undoToast(page)).toContainText(second);
  await undoToast(page).getByRole('button', { name: /בטל הכול/ }).click();
  await expect(page.getByRole('checkbox', { name: `נקנה: ${first}` })).toBeVisible();
  await expect(page.getByRole('checkbox', { name: `נקנה: ${second}` })).toBeVisible();
});

test('recently bought / removed: restore from the list itself, also after the toast is gone', async ({ page }) => {
  await shoppingAsParent(page);
  // buy one, remove one
  const bought = (await rows(page).nth(0).locator('.item-name').textContent())!;
  await page.getByRole('checkbox', { name: `נקנה: ${bought}` }).click();
  await expect(page.getByRole('checkbox', { name: `נקנה: ${bought}` })).toHaveCount(0, { timeout: 5000 });
  const have = page.getByRole('button', { name: /^יש \/ לא צריך:/ }).first();
  const removed = (await have.getAttribute('aria-label'))!.replace(/^.*: /, '');
  await have.click();
  await expect(undoToast(page)).toHaveCount(0, { timeout: 10_000 });

  const recent = page.locator('.history.recent');
  await expect(recent).toContainText('נקנו והוסרו לאחרונה (2)');
  await recent.locator('summary').click();
  await expect(recent.locator('.history-row', { hasText: bought })).toContainText('נקנה');
  await expect(recent.locator('.history-row', { hasText: removed })).toContainText('הוסר');
  await shot(page, 'u3-recent');

  // the purchase went to the pantry...
  await page.getByRole('button', { name: /מה יש בבית/ }).click();
  await expect(page.locator('.list-row', { hasText: bought })).toBeVisible();
  await page.locator('.tabbar').getByRole('button', { name: /קניות/ }).click();
  await page.getByRole('button', { name: 'תפריט השבוע', exact: true }).click();
  await page.locator('.history.recent summary').click();
  await page.getByRole('button', { name: `להחזיר לרשימה: ${bought}` }).click();
  await page.getByRole('button', { name: `להחזיר לרשימה: ${removed}` }).click();
  await expect(page.getByRole('checkbox', { name: `נקנה: ${bought}` })).toBeVisible();
  await expect(page.getByRole('checkbox', { name: `נקנה: ${removed}` })).toBeVisible();
  await expect(page.locator('.history.recent')).toHaveCount(0);
  // ...and came back out of it
  await page.getByRole('button', { name: /מה יש בבית/ }).click();
  await expect(page.locator('.list-row', { hasText: bought })).toHaveCount(0);
});

test('"at home, so not on the list" is visible, with "add anyway"', async ({ page }) => {
  await shoppingAsParent(page);
  const covered = page.locator('.history.covered');
  await expect(covered).toContainText('יש בבית, ולכן לא ברשימה');
  await covered.locator('summary').click();
  const row = covered.locator('.history-row').first();
  const name = (await row.locator('.item-name').textContent())!;
  await expect(row).toContainText('יש בבית:');
  await shot(page, 'u4-covered');
  await row.getByRole('button', { name: /להוסיף בכל זאת/ }).click();
  await expect(page.locator('.aisle .list-row', { hasText: name })).toBeVisible();
  await expect(undoToast(page)).toContainText(`נוסף לרשימה: ${name}`);
});
