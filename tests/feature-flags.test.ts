import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveFlag, flagContextFromEnv, unavailableMessage } from '../src/app/featureFlags.ts';

test('every gated flag defaults OFF in production, even when requested', () => {
  const flags = [
    'prescribing', 'mentalHealthCrisis', 'carePartnerBooking',
    'partnerPricesStock', 'modelInference', 'clinicianReviewQueue',
  ] as const;
  for (const flag of flags) {
    // Requested but no configuration proof -> off.
    assert.equal(resolveFlag(flag, { production: true, requested: true }).enabled, false, flag);
    // Not requested but "configured" -> off.
    assert.equal(resolveFlag(flag, { production: true, requested: false, configured: 'yes' }).enabled, false, flag);
    // Requested AND configured -> the only way on.
    assert.equal(resolveFlag(flag, { production: true, requested: true, configured: 'yes' }).enabled, true, flag);
  }
});

test('a blank configuration proof keeps a flag off in production', () => {
  assert.equal(resolveFlag('prescribing', { production: true, requested: true, configured: '   ' }).enabled, false);
  assert.equal(resolveFlag('prescribing', { production: true, requested: true, configured: null }).enabled, false);
});

test('development can run the framework but never claims production readiness', () => {
  const state = resolveFlag('modelInference', { production: false, requested: true, configured: 'dev-model' });
  assert.equal(state.enabled, true);
  assert.match(state.reason, /development only/i);
});

test('flagContextFromEnv only treats an exact "true" as a request and follows MODE', () => {
  assert.equal(flagContextFromEnv({ MODE: 'production', VITE_ENABLE_GATED_FEATURES: 'true' }).requested, true);
  assert.equal(flagContextFromEnv({ MODE: 'production', VITE_ENABLE_GATED_FEATURES: '1' }).requested, false);
  assert.equal(flagContextFromEnv({ MODE: 'production' }).production, true);
  assert.equal(flagContextFromEnv({ MODE: 'development' }).production, false);
});

test('the unavailable message is plain and points the user to help', () => {
  const msg = unavailableMessage({ enabled: false, reason: 'not available: no source' });
  assert.match(msg, /not available/i);
  assert.match(msg, /medical help/i);
  assert.doesNotMatch(msg, /\d/);
});
