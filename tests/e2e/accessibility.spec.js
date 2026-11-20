const { test, expect } = require('@playwright/test');

test.beforeEach(async ({ page }) => {
  await page.goto('/index.html', { waitUntil: 'load' });
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

test('le formulaire Questions libres reste dans le panneau Coach sur mobile et desktop', async ({ page }) => {
  for (const viewport of [{ width: 390, height: 844 }, { width: 1440, height: 900 }]) {
    await page.setViewportSize(viewport);
    await page.locator('.tab[data-tab="coach"]').click();
    await expect(page.locator('#coach')).toHaveClass(/active/);
    const freeTab = page.locator('#coachTabOpen');
    await expect(freeTab).toBeVisible();
    await expect(page.locator('#coachPanelOpen')).toBeVisible();
    const form = page.locator('#coachPromptForm');
    await expect(form).toBeVisible();
    await expect(page.locator('#coachPanelOpen #coachPromptForm')).toHaveCount(1);
    await expect(page.locator('#coachPanelOpen > .coach-conversation #coachPromptForm')).toHaveCount(1);
    const layout = await page.evaluate(() => {
      const panel = document.querySelector('#coachPanelOpen');
      const tabs = document.querySelector('.coach-tabs');
      const form = document.querySelector('#coachPromptForm');
      const conversation = form.closest('.coach-conversation');
      const p = panel.getBoundingClientRect();
      const t = tabs.getBoundingClientRect();
      const f = form.getBoundingClientRect();
      const c = conversation.getBoundingClientRect();
      return {
        panel: { left: p.left, right: p.right, top: p.top, bottom: p.bottom },
        tabsBottom: t.bottom,
        form: { left: f.left, right: f.right, top: f.top, bottom: f.bottom },
        conversation: { left: c.left, right: c.right, top: c.top, bottom: c.bottom },
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth
      };
    });
    expect(layout.form.top).toBeGreaterThan(layout.tabsBottom);
    expect(layout.conversation.top).toBeLessThan(layout.form.top);
    expect(layout.conversation.bottom).toBeGreaterThan(layout.form.bottom);
    expect(layout.form.left).toBeGreaterThanOrEqual(layout.panel.left);
    expect(layout.form.right).toBeLessThanOrEqual(layout.panel.right);
    expect(layout.scrollWidth).toBeLessThanOrEqual(layout.clientWidth);
  }
});
