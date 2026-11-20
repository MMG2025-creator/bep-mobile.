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
  // The Coach requires authentication; remove only the test login overlay so its static layout can be inspected.
  await page.locator('#authGate').evaluate((element) => element.remove());
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


test('les éléments de pied de page du Coach sont invisibles hors du panneau Coach', async ({ page }) => {
  await page.locator('#authGate').evaluate((element) => element.remove());
  await page.locator('.tab[data-tab="home"]').click();
  await expect(page.locator('#coach')).toBeHidden();
  await expect(page.locator('#coach .coach-info-panel')).toBeHidden();
  await expect(page.locator('#coach .coach-privacy')).toBeHidden();

  await page.locator('.tab[data-tab="coach"]').click();
  await expect(page.locator('#coach')).toBeVisible();
  await expect(page.locator('#coach .coach-info-panel')).toBeVisible();
  await expect(page.locator('#coach .coach-privacy')).toBeVisible();

  await page.locator('.tab[data-tab="home"]').click();
  await expect(page.locator('#coach .coach-info-panel')).toBeHidden();
  await expect(page.locator('#coach .coach-privacy')).toBeHidden();
});

test('Paramètres remplace le panneau courant et affiche son contenu', async ({ page }) => {
  await page.locator('#authGate').evaluate((element) => element.remove());
  await page.locator('.tab[data-tab="home"]').click();
  await page.locator('#settingsBtn').click();
  await expect(page.locator('.app')).toHaveClass(/settings-open/);
  await expect(page.locator('#settings')).toBeVisible();
  await expect(page.locator('#settings .settings-page-heading h1')).toHaveText('Paramètres');
  await expect(page.locator('#settingsProfileCard')).toBeVisible();
  await expect(page.locator('#home')).toBeHidden();
  await expect(page.locator('#coach')).toBeHidden();
  await expect(page.locator('#settingsBtn')).toHaveAttribute('aria-expanded', 'true');

  await page.locator('#settingsBtn').click();
  await expect(page.locator('#settings')).toBeHidden();
  await expect(page.locator('#home')).toBeVisible();
  await expect(page.locator('#settingsBtn')).toHaveAttribute('aria-expanded', 'false');
});

test('le robot du Coach reste visible et cadré sur mobile et desktop', async ({ page }) => {
  await page.locator('#authGate').evaluate((element) => element.remove());
  for (const viewport of [{ width: 390, height: 844, name: 'mobile' }, { width: 1440, height: 900, name: 'desktop' }]) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.locator('.tab[data-tab="coach"]').click();
    const hero = page.locator('#coach .coach-hero');
    const visual = page.locator('#coach .coach-hero-visual');
    const robot = page.locator('#coach .coach-hero-bot');
    await expect(hero).toBeVisible();
    await expect(visual).toBeVisible();
    await expect(robot).toBeVisible();
    const bounds = await robot.boundingBox();
    expect(bounds).not.toBeNull();
    expect(bounds.width).toBeGreaterThan(40);
    expect(bounds.height).toBeGreaterThan(40);
    expect(bounds.x).toBeGreaterThanOrEqual(0);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(viewport.width);
    await page.screenshot({ path: `test-results/evidence/coach-${viewport.name}.png`, fullPage: true });
  }
});

test('les donuts budgétaires sont visibles, interactifs et capturés sur mobile et desktop', async ({ page }) => {
  await page.route('**/api/auth/status', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ user: { id: 'playwright-budget-user', email: 'budget-test@example.invalid' } }) }));
  await page.route('**/api/data', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ payload: {} }) }));
  await page.route('**/api/budgets/months', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ months: [{ monthKey: '2026-11', status: 'open', version: 1 }] })
  }));
  await page.route('**/api/budgets/months/2026-11', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ budget: { monthKey: '2026-11', status: 'open', version: 1, items: [
      { itemType: 'income', label: 'Salaire', plannedAmount: 3000 },
      { itemType: 'charge', label: 'Loyer', category: 'Logement', plannedAmount: 900 },
      { itemType: 'charge', label: 'Courses', category: 'Alimentation', plannedAmount: 350 },
      { itemType: 'savings', label: 'Épargne', plannedAmount: 300 }
    ] } })
  }));
  await page.route('**/api/budgets/months/2026-11/actuals**', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ expenses: [], actualExpenseTotal: '0.00', count: 0 })
  }));
  // Reload after installing all routes so the real startup auth flow is deterministic.
  await page.reload({ waitUntil: 'load' });
  await expect.poll(() => page.evaluate(() => window.bepSignedIn)).toBe(true);
  await page.locator('#authGate').evaluate((element) => element.remove());
  await page.locator('.tab[data-tab="budget"]').click();
  await page.locator('[data-budget-module="monthly"]').click();
  await expect(page.locator('#budgetModuleMonthly')).toBeVisible();
  await expect(page.locator('#monthlyBudgetWorkspace')).toBeVisible({ timeout: 10000 });

  for (const viewport of [{ width: 390, height: 844, name: 'mobile' }, { width: 1440, height: 900, name: 'desktop' }]) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    const allocation = page.locator('#monthlyBudgetAllocationDonut');
    const allocationLegend = page.locator('#monthlyBudgetAllocationLegend');
    const category = page.locator('#monthlyBudgetCategoryDonut');
    const categoryLegend = page.locator('#monthlyBudgetCategoryLegend');
    await expect(allocation.locator('.monthly-budget-donut-segment')).toHaveCount(3);
    await expect(allocationLegend.locator('.monthly-budget-donut-legend-item')).toHaveCount(4);
    await expect(category.locator('.monthly-budget-donut-segment')).toHaveCount(2);
    await expect(categoryLegend.locator('.monthly-budget-donut-legend-item')).toHaveCount(2);

    const categorySegments = category.locator('.monthly-budget-donut-segment');
    await categorySegments.nth(1).click();
    await expect(categoryLegend.locator('.monthly-budget-donut-legend-item').nth(1)).toHaveAttribute('aria-pressed', 'true');
    await expect(category.locator('.monthly-budget-donut-center span')).toHaveText('Alimentation');
    await categorySegments.nth(0).focus();
    await page.keyboard.press('Enter');
    await expect(categoryLegend.locator('.monthly-budget-donut-legend-item').nth(0)).toHaveAttribute('aria-pressed', 'true');
    await expect(category.locator('.monthly-budget-donut-center span')).toHaveText('Logement');

    await allocationLegend.locator('.monthly-budget-donut-legend-item').nth(1).click();
    await expect(allocation.locator(':scope > div span')).toHaveText('Épargne prévue');
    await expect(allocationLegend.locator('.monthly-budget-donut-legend-item').nth(1)).toHaveAttribute('aria-pressed', 'true');
    await page.screenshot({ path: `test-results/evidence/budget-${viewport.name}.png`, fullPage: true });
  }
});

