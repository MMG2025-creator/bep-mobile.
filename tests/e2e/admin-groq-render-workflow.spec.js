const { test, expect } = require('@playwright/test');

test('le panneau documentaire admin annonce Render Workflows et confirme le dispatch', async ({ page }) => {
  let dispatchPayload = null;

  await page.route('**/api/admin/auth/status', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ authenticated: true, email: 'admin@example.invalid' })
  }));
  await page.route('**/api/admin/console/documents', route => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({ documents: [] })
  }));
  await page.route('**/api/admin/console/audit', route => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({ events: [] })
  }));
  await page.route('**/api/admin/bep-agent/status', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ ready: true, provider: 'groq', documentaryRunnerEnabled: true })
  }));
  await page.route('**/api/admin/bep-agent/source-search/status', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ enabled: true, allowedDomains: ['service-public.fr'] })
  }));
  await page.route('**/api/admin/bep-agent/overview', route => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({ runs: [] })
  }));
  await page.route('**/api/admin/bep-agent/documentary-analyze', async route => {
    dispatchPayload = route.request().postDataJSON();
    await route.fulfill({
      status: 202, contentType: 'application/json',
      body: JSON.stringify({
        queued: true, jobId: 'job-test-42', provider: 'groq', searchProvider: 'exa',
        execution: 'render_workflows_on_demand', workflowDispatched: true,
        taskRunId: 'task-run-test-42', taskRunStatus: 'pending', automaticPublication: false
      })
    });
  });

  await page.goto('/admin.html#groq-documentary', { waitUntil: 'load' });
  await expect(page.locator('#groqDocumentaryPanel')).toBeVisible();
  await expect(page.locator('#groqDocumentaryTitle')).toHaveText('Optimisation de la bibliothèque — Groq');
  await expect(page.locator('#groqDocumentaryPanel')).not.toContainText('GitHub Actions');
  await expect(page.locator('#groqPipelineStatus')).toContainText('Agent Groq : prêt');
  await expect(page.locator('#groqPipelineStatusDetail')).toContainText('Render Workflows à la demande');

  await page.locator('#groqDocumentaryQuery').fill('Règles officielles du surendettement');
  await page.locator('#groqDocumentaryAnalyzeButton').click();

  await expect(page.locator('#groqDocumentaryNotice')).toContainText('job-test-42');
  await expect(page.locator('#groqDocumentaryNotice')).toContainText('dispatch Render Workflow confirmé');
  await expect(page.locator('#groqDocumentaryNotice')).toContainText('task-run-test-42');
  await expect(page.locator('#groqDocumentaryNotice')).toContainText('validation humaine');
  expect(dispatchPayload).toEqual({ query: 'Règles officielles du surendettement' });
});
