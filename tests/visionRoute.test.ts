import test from 'node:test';
import assert from 'node:assert/strict';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-only-jwt-secret-that-is-at-least-32-chars';
process.env.JWT_ISSUER = 'test-issuer';
process.env.JWT_AUDIENCE = 'test-audience';

const { default: visionRouter } = await import('../backend/routes/vision.js');

test('vision route exports a default router', () => {
  assert.equal(typeof visionRouter, 'function');
  assert.ok(visionRouter.stack, 'router should have a stack');
});

test('vision route has a POST /analyze handler', () => {
  const analyzeRoute = visionRouter.stack.find(
    (layer) => layer.route && layer.route.path === '/analyze' && layer.route.methods.post,
  );
  assert.ok(analyzeRoute, 'POST /analyze route should exist');
});
