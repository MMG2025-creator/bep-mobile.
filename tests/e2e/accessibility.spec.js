const { test, expect } = require('@playwright/test');

test.beforeEach(async ({ page }) => {
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
});

test('les champs de formulaire possèdent un id ou un name', async ({ page }) => {
  const invalid = await page.locator('input, select, textarea').evaluateAll((fields) => fields.filter((field) => !field.id && !field.name).map((field) => field.outerHTML));
  expect(invalid, 'Champs sans attribut id ni name').toEqual([]);
});

test('les champs de formulaire ont un nom accessible', async ({ page }) => {
  const unlabeled = await page.locator('input:not([type="hidden"]):not([type="submit"]):not([type="button"]), select, textarea').evaluateAll((fields) => fields.filter((field) => !(field.hasAttribute('aria-label') || field.hasAttribute('aria-labelledby') || (field.labels && field.labels.length > 0))).map((field) => field.outerHTML));
  expect(unlabeled, 'Champs sans label, aria-label ou aria-labelledby').toEqual([]);
});

test('cliquer sur le texte d’une ligne active sa case à cocher', async ({ page }) => {
  const details = page.locator('#budgetCheckupDetails');
  await expect(details).toHaveCount(1);
  await details.evaluate((element) => { element.open = true; });
  await expect(details).toHaveAttribute('open', '');
  const row = details.locator('.budget-checkup-row').first();
  const checkbox = row.locator('input[type="checkbox"]');
  await expect(checkbox).not.toBeChecked();
  await row.locator('span').evaluate((element) => element.dispatchEvent(new MouseEvent('click', { bubbles: true })));
  await expect(checkbox).toBeChecked();
  await row.locator('span').evaluate((element) => element.dispatchEvent(new MouseEvent('click', { bubbles: true })));
  await expect(checkbox).not.toBeChecked();
});
