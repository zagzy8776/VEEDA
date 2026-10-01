import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';

// Legacy-API-key removal: prove the API surface has no key-based bypass. Every
// /api route except the health probe must reject an unauthenticated request with
// 401 — including one that carries an old `x-veda-api-key` header. If a legacy
// header were ever re-wired as an auth input, this test turns red.
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-only-jwt-secret-that-is-at-least-32-chars';
process.env.JWT_ISSUER = 'test-issuer';
process.env.JWT_AUDIENCE = 'test-audience';
delete process.env.LEGACY_API_KEY_ENABLED;
delete process.env.VEDA_API_KEY;

const { app } = await import('../server.js');

// Every method+path the server mounts under /api, read from backend/routes/*.js.
// /api/health (GET) is the only public endpoint and is asserted separately.
const PROTECTED_ROUTES = [
  { method: 'POST', path: '/api/analyze' },
  { method: 'POST', path: '/api/biometric-event' },
  { method: 'GET', path: '/api/wellness-history' },
  { method: 'POST', path: '/api/wellness-event' },
  { method: 'POST', path: '/api/raw-biometrics' },
  { method: 'GET', path: '/api/clinician/roster' },
  { method: 'POST', path: '/api/triage/referral' },
  { method: 'POST', path: '/api/consent' },
  { method: 'GET', path: '/api/consent' },
  { method: 'GET', path: '/api/map/context' },
  { method: 'POST', path: '/api/map/context' },
  { method: 'GET', path: '/api/map/nearby' },
  { method: 'GET', path: '/api/map/search' },
  { method: 'GET', path: '/api/map/reverse-geocode' },
  { method: 'GET', path: '/api/map/eta' },
  { method: 'GET', path: '/api/map/route' },
  { method: 'GET', path: '/api/map/tiles-token' },
  { method: 'GET', path: '/api/integrations/fitbit/status' },
  { method: 'GET', path: '/api/integrations/fitbit/connect' },
  { method: 'GET', path: '/api/integrations/fitbit/callback' },
  { method: 'POST', path: '/api/integrations/fitbit/sync' },
  { method: 'POST', path: '/api/fhir/Observation' },
  { method: 'GET', path: '/api/fhir/Patient/pat-1/vitals' },
  { method: 'GET', path: '/api/fhir/Patient/pat-1/clinical-bundle' },
  { method: 'GET', path: '/api/fhir/Practitioner/prac-1' },
  { method: 'POST', path: '/api/ai-chat' },
  { method: 'GET', path: '/api/admin/proxy-debug' },
];

async function startServer() {
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  return { server, baseUrl: `http://127.0.0.1:${address.port}` };
}

async function closeServer(server) {
  await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
}

async function callRoute(baseUrl, { method, path }, headers = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: { 'content-type': 'application/json', ...headers },
    body: method === 'POST' ? JSON.stringify({}) : undefined,
  });
  return response;
}

test('the health probe is the only public /api route', async () => {
  const testServer = await startServer();
  try {
    const response = await callRoute(testServer.baseUrl, { method: 'GET', path: '/api/health' });
    assert.notEqual(response.status, 401, '/api/health must not require a token');
  } finally {
    await closeServer(testServer.server);
  }
});

test('every other /api route returns 401 without a bearer token', async () => {
  const testServer = await startServer();
  try {
    for (const route of PROTECTED_ROUTES) {
      const response = await callRoute(testServer.baseUrl, route);
      assert.equal(response.status, 401, `${route.method} ${route.path} must require authentication`);
    }
  } finally {
    await closeServer(testServer.server);
  }
});

test('an old x-veda-api-key header never authorizes a request', async () => {
  const testServer = await startServer();
  try {
    for (const route of PROTECTED_ROUTES) {
      const response = await callRoute(testServer.baseUrl, route, {
        'x-veda-api-key': 'legacy-key-that-should-be-dead',
        'x-veda-user-id': 'user-1',
        'x-veda-role': 'admin',
      });
      assert.equal(response.status, 401, `${route.method} ${route.path} must ignore legacy headers`);
      const body = await response.json();
      assert.equal(body.error, 'Authentication required');
    }
  } finally {
    await closeServer(testServer.server);
  }
});

test('a legacy api key in the query string never authorizes a request', async () => {
  const testServer = await startServer();
  try {
    const response = await callRoute(testServer.baseUrl, { method: 'GET', path: '/api/map/nearby?apiKey=legacy&api_key=legacy' });
    assert.equal(response.status, 401);
  } finally {
    await closeServer(testServer.server);
  }
});
