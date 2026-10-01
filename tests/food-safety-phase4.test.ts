import test from 'node:test';
import assert from 'node:assert/strict';
import {
  lookupProduct, parseExpiry, expiryStatus, spoilageState,
  visibleCrowdReports, maySubmitReport, CROWD_REPORT_LABEL, loadStripGuidance,
} from '../src/app/foodSafety.ts';
import { buildRegistry } from '../src/app/modelRegistry.ts';

test('product lookup returns "unknown" with no configured source', async () => {
  const result = await lookupProduct('123456', { endpoint: '' });
  assert.equal(result.verdict, 'unknown');
  assert.match(result.note, /unknown/i);
});

test('product lookup never guesses a verdict from a failing source', async () => {
  const failing = { endpoint: 'https://example.test', fetchImpl: async () => { throw new Error('down'); } };
  assert.equal((await lookupProduct('1', failing)).verdict, 'unknown');
  const bad = { endpoint: 'https://example.test', fetchImpl: async () => new Response(JSON.stringify({ verdict: 'safe' }), { status: 200 }) };
  assert.equal((await lookupProduct('1', bad)).verdict, 'unknown'); // 'safe' is not an allowed verdict
});

test('expiry parsing reads ISO and month/year and classifies status', () => {
  assert.equal(parseExpiry('EXP 2026-03-15'), '2026-03-15');
  assert.equal(parseExpiry('best before 07/2027'), '2027-07-01');
  assert.equal(parseExpiry('no date here'), null);
  assert.equal(expiryStatus('2020-01-01', 30, new Date('2026-01-01')), 'expired');
  assert.equal(expiryStatus('2026-01-20', 30, new Date('2026-01-01')), 'soon');
  assert.equal(expiryStatus('2027-01-01', 30, new Date('2026-01-01')), 'ok');
  assert.equal(expiryStatus(null), 'unknown');
});

test('spoilage detection is disabled because no model is registered', () => {
  const state = spoilageState(buildRegistry([]));
  assert.equal(state.available, false);
});

test('only approved crowd reports are visible and every report is unverified-labelled', () => {
  const visible = visibleCrowdReports([
    { id: '1', text: 'a', reportedAt: '2026-01-01', moderation: 'approved' },
    { id: '2', text: 'b', reportedAt: '2026-01-01', moderation: 'pending' },
    { id: '3', text: 'c', reportedAt: '2026-01-01', moderation: 'rejected' },
  ]);
  assert.deepEqual(visible.map(r => r.id), ['1']);
  assert.match(CROWD_REPORT_LABEL, /unverified/i);
});

test('the crowd-report abuse control rate-gates submissions', () => {
  const now = new Date('2026-01-01T00:10:00.000Z');
  assert.equal(maySubmitReport([], now), true);
  assert.equal(maySubmitReport(['2026-01-01T00:09:30.000Z'], now), false);
  assert.equal(maySubmitReport(['2026-01-01T00:08:00.000Z'], now), true);
});

test('test-strip guidance comes only from a pack', () => {
  const meta = { id: 's', version: '1', reviewer: 'R', reviewDate: '2026-01-01', region: 'NG', clinicallyReviewed: false };
  assert.equal(loadStripGuidance(null).ok, false);
  const ok = loadStripGuidance({ ...meta, entries: [{ id: 'c1', colour: 'red', meaning: 'pack meaning' }] });
  assert.equal(ok.ok, true);
});
