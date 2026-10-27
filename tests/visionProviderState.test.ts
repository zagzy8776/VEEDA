import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getVisionAllowlist,
  isVisionCapableProvider,
  resolveVisionState,
  visionStateLabel,
} from '../src/app/visionProviderAllowlist.ts';

test('vision allowlist is empty by default', () => {
  assert.equal(getVisionAllowlist().length, 0);
});

test('isVisionCapableProvider returns false for unknown provider', () => {
  assert.equal(isVisionCapableProvider('openai', 'gpt-4o'), false);
  assert.equal(isVisionCapableProvider('cerebras', 'gpt-oss-120b'), false);
});

test('resolveVisionState returns NOT_CONFIGURED when no provider', () => {
  const state = resolveVisionState({
    hasVisionProvider: false,
    providerName: null,
    model: null,
  });
  assert.equal(state, 'NOT_CONFIGURED');
});

test('resolveVisionState returns PROCESSING when processing flag set', () => {
  const state = resolveVisionState({
    hasVisionProvider: false,
    processing: true,
  });
  assert.equal(state, 'PROCESSING');
});

test('resolveVisionState returns FAILED when failed flag set', () => {
  const state = resolveVisionState({
    hasVisionProvider: false,
    failed: true,
  });
  assert.equal(state, 'FAILED');
});

test('resolveVisionState returns PERMISSION_DENIED when permission denied', () => {
  const state = resolveVisionState({
    hasVisionProvider: false,
    permissionDenied: true,
  });
  assert.equal(state, 'PERMISSION_DENIED');
});

test('resolveVisionState returns PROVIDER_UNAVAILABLE when provider down', () => {
  const state = resolveVisionState({
    hasVisionProvider: false,
    providerDown: true,
  });
  assert.equal(state, 'PROVIDER_UNAVAILABLE');
});

test('resolveVisionState returns UNSUPPORTED_MODEL for text-only model', () => {
  const state = resolveVisionState({
    hasVisionProvider: true,
    providerName: 'openai',
    model: 'gpt-4o-mini',
  });
  assert.equal(state, 'UNSUPPORTED_MODEL');
});

test('visionStateLabel returns correct labels', () => {
  assert.equal(visionStateLabel('AVAILABLE'), 'Vision available (validated)');
  assert.equal(visionStateLabel('NOT_CONFIGURED'), 'No validated vision model configured');
  assert.equal(visionStateLabel('UNSUPPORTED_MODEL'), 'Configured model does not support images');
  assert.equal(visionStateLabel('PROVIDER_UNAVAILABLE'), 'Vision provider unavailable');
  assert.equal(visionStateLabel('PERMISSION_DENIED'), 'Camera permission denied');
  assert.equal(visionStateLabel('PROCESSING'), 'Processing image');
  assert.equal(visionStateLabel('FAILED'), 'Vision processing failed');
});