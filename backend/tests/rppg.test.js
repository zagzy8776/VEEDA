import test from 'node:test';
import assert from 'node:assert/strict';
import { __testRppg } from '../../src/app/sensors.ts';

function syntheticRppg({ bpm = 72, hz = 30, seconds = 30, amplitude = 8, noise = 0.2 }) {
  const rgb = [];
  const timestamps = [];
  for (let i = 0; i < Math.floor(hz * seconds); i++) {
    const t = i / hz;
    const p = Math.sin(2 * Math.PI * bpm / 60 * t) * amplitude;
    const n = Math.sin(2 * Math.PI * 7 * t) * noise;
    rgb.push({ r: 100 + p * 0.9 + n, g: 110 + p * 1.1 + n, b: 120 + p * 0.4 + n });
    timestamps.push(t * 1000);
  }
  return { rgb, timestamps };
}

test('rPPG recovers a clean synthetic heart rate', () => {
  const { rgb, timestamps } = syntheticRppg({ bpm: 72 });
  const result = __testRppg(rgb, timestamps);
  assert.ok(Math.abs(result.bpm - 72) <= 2, `expected ~72 bpm, got ${result.bpm}`);
  assert.notEqual(result.confidence, 'low');
});

test('rPPG rejects a flat/no-information signal', () => {
  const rgb = Array.from({ length: 900 }, () => ({ r: 100, g: 100, b: 100 }));
  const timestamps = Array.from({ length: 900 }, (_, i) => i * (1000 / 30));
  const result = __testRppg(rgb, timestamps);
  assert.equal(result.bpm, 0);
  assert.equal(result.confidence, 'low');
});
