import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate } from 'k6/metrics';

const web = __ENV.K6_WEB_URL || 'https://bep-mobile.onrender.com';
const api = __ENV.K6_API_URL || 'https://bep-v2-api.onrender.com';
const requestFailures = new Rate('request_failures');

const sessionRequests = [
  { name: 'frontend_html', url: `${web}/` },
  { name: 'frontend_css', url: `${web}/styles.css` },
  { name: 'frontend_app_js', url: `${web}/app.js` },
  { name: 'frontend_financial_engine', url: `${web}/financial-engine.js` },
  { name: 'frontend_offline_storage', url: `${web}/offline-storage.js` },
  { name: 'frontend_monthly_budget', url: `${web}/monthly-budget-ui.js` },
  { name: 'frontend_spend_experience', url: `${web}/spend-experience.js` },
  { name: 'frontend_pwa', url: `${web}/pwa.js` },
  { name: 'api_health', url: `${api}/api/health` },
  { name: 'api_auth_status', url: `${api}/api/auth/status` },
];

const stages = [{ duration: '2m', target: 20 }];
for (let users = 22; users <= 50; users += 2) {
  stages.push({ duration: '2m', target: users });
}
stages.push({ duration: '5m', target: 50 });

export const options = {
  scenarios: {
    bep_production_virtual_users: {
      executor: 'ramping-vus',
      startVUs: 20,
      stages,
      gracefulRampDown: '30s',
      gracefulStop: '30s',
    },
  },
  thresholds: {
    http_req_failed: [
      { threshold: 'rate<0.01' },
      { threshold: 'rate<0.05', abortOnFail: true, delayAbortEval: '30s' },
    ],
    request_failures: [
      { threshold: 'rate<0.01' },
      { threshold: 'rate<0.05', abortOnFail: true, delayAbortEval: '30s' },
    ],
    http_req_duration: [
      { threshold: 'p(95)<1000' },
      { threshold: 'p(99)<2000' },
      { threshold: 'p(95)<2500', abortOnFail: true, delayAbortEval: '30s' },
    ],
  },
};

export function setup() {
  for (const item of sessionRequests) {
    const response = http.get(item.url, {
      tags: { name: item.name, phase: 'preflight' },
      timeout: '10s',
    });
    if (response.status !== 200) {
      throw new Error(`Preflight failed for ${item.name}: HTTP ${response.status}`);
    }
  }
  return { startedAt: new Date().toISOString() };
}

export default function () {
  for (const item of sessionRequests) {
    const response = http.get(item.url, {
      tags: { name: item.name, phase: 'load' },
      timeout: '10s',
    });
    const ok = check(response, {
      [`${item.name} returns HTTP 200`]: (r) => r.status === 200,
    });
    requestFailures.add(!ok, { endpoint: item.name });
    sleep(30);
  }
}

export function handleSummary(data) {
  return {
    'k6-summary.json': JSON.stringify(data, null, 2),
  };
}
