const { test, expect } = require('@playwright/test');

test('le KPI Sous impulsion reste court et contenu après les mises à jour asynchrones, sur mobile et desktop', async ({ page }) => {
  await page.goto('/index.html', { waitUntil: 'load' });
  await page.locator('#authGate').evaluate((element) => element.remove());
  await page.locator('.tab[data-tab="purchases"]').click();

  await page.evaluate(() => {
    const rows = document.querySelector('#purchaseRows');
    const row = document.createElement('div');
    row.className = 'purchase-row';
    row.dataset.amount = '24.90';
    row.dataset.psychology = 'pressure';
    const now = new Date();
    row.dataset.date = [now.getFullYear(), String(now.getMonth() + 1).padStart(2, '0'), String(now.getDate()).padStart(2, '0')].join('-');
    rows.replaceChildren(row);
    window.dispatchEvent(new Event('bep:state-rendered'));
    window.dispatchEvent(new Event('bep:expense-saved'));
  });

  for (const viewport of [{ width: 390, height: 844 }, { width: 812, height: 1200 }, { width: 1440, height: 900 }]) {
    await page.setViewportSize(viewport);
    const kpi = page.locator('#bepSpendMonthDecisions');
    await expect(kpi).toHaveText('1 achat');
    await expect(kpi).not.toContainText('sous impulsion');
    const geometry = await kpi.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return {
        card: element.parentElement.getBoundingClientRect().toJSON(),
        text: rect.toJSON(),
        whiteSpace: style.whiteSpace,
        scrollWidth: element.scrollWidth,
        clientWidth: element.clientWidth,
        documentWidth: document.documentElement.scrollWidth,
        viewportWidth: document.documentElement.clientWidth
      };
    });
    expect(geometry.whiteSpace).not.toBe('nowrap');
    expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.clientWidth + 1);
    expect(geometry.documentWidth).toBeLessThanOrEqual(geometry.viewportWidth);
    expect(geometry.text.right).toBeLessThanOrEqual(geometry.card.right + 1);
  }
});
