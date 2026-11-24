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

test('actualiser les résultats affiche le job documentaire 37 et ses propositions sans relancer le traitement', async ({ page }) => {
  let overviewRequests = 0;
  let analyzeRequests = 0;
  const overview = {
    runs: [],
    documentaryJobs: [{
      id: 37, job_type: 'documentary_research', status: 'failed', attempts: 1, max_attempts: 1,
      created_at: '2026-11-24T10:19:33.000Z',
      last_error: 'GROQ_HTTP_ERROR | HTTP 400 | providerParam=response_format | schéma refusé',
      run_error_code: 'GROQ_HTTP_ERROR | HTTP 400 | invalid_request',
      task_run_id: 'trn-test-job-37', task_run_status: 'pending',
      run_model: 'openai/gpt-oss-20b'
    }],
    pendingCandidates: [{
      id: 88, source_slug: 'web-budget-test', proposal_type: 'create',
      title: 'Construire un budget personnel', source_name: 'Banque de France',
      source_url: 'https://www.banque-france.fr/', confidence: 'high',
      rationale: 'Proposition documentaire en attente de validation.'
    }]
  };

  await page.route('**/api/admin/auth/status', route => route.fulfill({
    status: 200, contentType: 'application/json',
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
  await page.route('**/api/admin/bep-agent/overview', route => {
    overviewRequests += 1;
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(overview) });
  });
  await page.route('**/api/admin/bep-agent/documentary-analyze', route => {
    analyzeRequests += 1;
    return route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'NOT_EXPECTED' }) });
  });

  await page.goto('/admin.html#groq-documentary', { waitUntil: 'load' });
  await expect(page.locator('#groqDocumentaryRuns')).toContainText('Job #37 · failed');
  await expect(page.locator('#groqDocumentaryRuns')).toContainText('GROQ_HTTP_ERROR');
  await expect(page.locator('#groqDocumentaryRuns')).toContainText('providerParam=response_format');
  await expect(page.locator('#groqDocumentaryRuns')).toContainText('trn-test-job-37');
  await expect(page.locator('#groqDocumentaryCandidates')).toContainText('Construire un budget personnel');

  const beforeRefresh = overviewRequests;
  await page.locator('#groqDocumentaryRefreshButton').click();
  await expect.poll(() => overviewRequests).toBeGreaterThan(beforeRefresh);
  await expect(page.locator('#groqDocumentaryRuns')).toContainText('Job #37 · failed');
  expect(analyzeRequests).toBe(0);
});
