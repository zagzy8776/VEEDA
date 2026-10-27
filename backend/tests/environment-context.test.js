import test from 'node:test';
import assert from 'node:assert/strict';
import { environmentContext } from '../ai/environment-context.js';
const now = Date.parse('2026-10-27T01:00:00Z');

test('outdoor context is bounded, sourced and distinguished from body measurements', () => {
  const result = environmentContext({ outsideTemp: 23, feelsLike: 29, humidity: 80, air: 'AQI 103', weather: 'Drizzle', retrievedAt: new Date(now).toISOString(), lat: 5.123, apiKey: 'secret' }, now);
  assert.match(result, /"outsideTemp":23/);
  assert.match(result, /not body temperature/);
  assert.match(result, /retrieval time is not observation time/);
  assert.doesNotMatch(result, /secret|5\.123/);
});

test('missing, stale, future and invalid data cannot become current readings', () => {
  for (const value of [null, {}, { retrievedAt: new Date(now - 31 * 60_000).toISOString() }, { retrievedAt: new Date(now + 120_000).toISOString() }]) {
    assert.match(environmentContext(value, now), /unavailable/);
  }
  const result = environmentContext({ retrievedAt: new Date(now).toISOString(), outsideTemp: 900, humidity: '80', feelsLike: Infinity, weather: 'x'.repeat(1000) }, now);
  assert.doesNotMatch(result, /900|Infinity|"humidity"/);
  assert.ok(result.length < 900);
});
