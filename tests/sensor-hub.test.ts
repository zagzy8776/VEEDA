import test from 'node:test';
import assert from 'node:assert/strict';
import { sensorHub } from '../src/app/sensorHub.ts';
import type { NormalizedSensorReading } from '../src/app/sensorTypes.ts';

function reading(capabilityId: string, value: number | string = 1): NormalizedSensorReading {
  return {
    capabilityId: capabilityId as any,
    measurementType: 'heart_rate' as any,
    value,
    unit: 'bpm',
    source: 'PHONE_SENSOR',
    timestamp: new Date().toISOString(),
    freshness: 0,
    quality: 'GOOD',
    description: 'test',
  };
}

test('sensorHub stores and returns the latest reading per capability', () => {
  const r = reading('heart_rate_camera', 72);
  sensorHub.add(r);
  assert.equal(sensorHub.get('heart_rate_camera' as any)?.value, 72);
});

test('sensorHub replaces an older reading for the same capability', () => {
  sensorHub.add(reading('heart_rate_camera', 72));
  sensorHub.add(reading('heart_rate_camera', 80));
  assert.equal(sensorHub.get('heart_rate_camera' as any)?.value, 80);
});

test('sensorHub keeps distinct capabilities independent', () => {
  sensorHub.add(reading('heart_rate_camera', 72));
  sensorHub.add(reading('step_counter', 1000));
  assert.equal(sensorHub.get('heart_rate_camera' as any)?.value, 72);
  assert.equal(sensorHub.get('step_counter' as any)?.value, 1000);
});

test('sensorHub.getAll returns a snapshot of all stored readings', () => {
  sensorHub.add(reading('heart_rate_camera', 72));
  sensorHub.add(reading('step_counter', 1000));
  const all = sensorHub.getAll();
  assert.ok(all.length >= 2);
  assert.ok(all.some(r => r.capabilityId === 'heart_rate_camera'));
  assert.ok(all.some(r => r.capabilityId === 'step_counter'));
});

test('sensorHub.subscribe notifies on add and unsubscribe stops notifications', () => {
  let calls = 0;
  const unsub = sensorHub.subscribe(() => { calls += 1; });
  sensorHub.add(reading('heart_rate_camera', 72));
  assert.ok(calls >= 1);
  unsub();
  const before = calls;
  sensorHub.add(reading('heart_rate_camera', 73));
  assert.equal(calls, before);
});

test('sensorHub.get returns undefined for an unknown capability', () => {
  assert.equal(sensorHub.get('does_not_exist' as any), undefined);
});
