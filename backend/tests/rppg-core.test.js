import test from 'node:test';
import assert from 'node:assert/strict';
import { estimateRppg } from '../rppg-core.mjs';

function syntheticRppg({ bpm = 72, hz = 30, seconds = 30, amplitude = 0.03, noise = 0.0005, artifactHz = 7 }) {
  const rgb = [], timestamps = [];
  for (let i = 0; i < hz * seconds; i++) {
    const t = i / hz;
    const pulse = Math.sin(2 * Math.PI * bpm / 60 * t) * amplitude;
    const artifact = Math.sin(2 * Math.PI * artifactHz * t) * noise;
    rgb.push({
      r: 100 * (1 + 0.9 * pulse + artifact),
      g: 110 * (1 + 1.1 * pulse + artifact),
      b: 120 * (1 + 0.4 * pulse + artifact),
    });
    timestamps.push(t * 1000);
  }
  return { rgb, timestamps };
}

test('rPPG recovers a clean synthetic 72 BPM signal', () => {
  const { rgb, timestamps } = syntheticRppg({ bpm: 72 });
  const result = estimateRppg(rgb, timestamps);
  assert.ok(Math.abs(result.bpm - 72) <= 2, `expected ~72 bpm, got ${result.bpm}`);
  assert.notEqual(result.confidence, 'low');
  assert.ok(result.signalQuality > 0);
});

test('rPPG recovers lower and higher in-band rates', () => {
  for (const bpm of [48, 120]) {
    const { rgb, timestamps } = syntheticRppg({ bpm });
    const result = estimateRppg(rgb, timestamps);
    assert.ok(Math.abs(result.bpm - bpm) <= 3, `expected ~${bpm} bpm, got ${result.bpm}`);
    assert.notEqual(result.confidence, 'low');
  }
});

test('rPPG tolerates moderate deterministic noise without losing the dominant rate', () => {
  const { rgb, timestamps } = syntheticRppg({ bpm: 84, noise: 0.008, artifactHz: 6.5 });
  const result = estimateRppg(rgb, timestamps);
  assert.ok(Math.abs(result.bpm - 84) <= 5, `expected ~84 bpm, got ${result.bpm}`);
});

test('rPPG rejects a flat/no-information signal', () => {
  const rgb = Array.from({ length: 900 }, () => ({ r: 100, g: 100, b: 100 }));
  const timestamps = Array.from({ length: 900 }, (_, i) => i * (1000 / 30));
  const result = estimateRppg(rgb, timestamps);
  assert.equal(result.bpm, 0);
  assert.equal(result.confidence, 'low');
  assert.equal(result.signalQuality, 0);
});

test('rPPG rejects insufficient samples', () => {
  const { rgb, timestamps } = syntheticRppg({ bpm: 72, seconds: 8 });
  const result = estimateRppg(rgb, timestamps);
  assert.equal(result.bpm, 0);
  assert.equal(result.confidence, 'low');
});

test('rPPG rejects an implausible sampling rate', () => {
  const { rgb } = syntheticRppg({ bpm: 72, hz: 8, seconds: 40 });
  const timestamps = rgb.map((_, i) => i * (1000 / 8));
  const result = estimateRppg(rgb, timestamps);
  assert.equal(result.bpm, 0);
  assert.equal(result.confidence, 'low');
});

test('rPPG keeps BPM inside configured physiological bounds', () => {
  const { rgb, timestamps } = syntheticRppg({ bpm: 180 });
  const result = estimateRppg(rgb, timestamps, { minBpm: 50, maxBpm: 150 });
  assert.ok(result.bpm === 0 || (result.bpm >= 50 && result.bpm <= 150));
});
