import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BREATHE,
  DURATION,
  EASE_OUT,
  HEARTBEAT,
  INVITE,
  SONAR,
  SONAR_TRANSITION,
  mapVariants,
  pageVariants,
  pageVariantsFor,
  sheetVariants,
  slideVariants,
  vitalsVariants,
} from '../src/app/motion.ts';

const ROUTES = ['home', 'vitals', 'map', 'history', 'clinician', 'profile'] as const;

/** Read a variant or transition bag without fighting motion's union types. */
function bag(source: unknown): Record<string, unknown> {
  return (source ?? {}) as Record<string, unknown>;
}

function numbers(value: unknown): number[] {
  return Array.isArray(value) ? (value as number[]) : [];
}

test('the calm fade is the default, and only Vitals and Map get their own entrance', () => {
  assert.equal(pageVariantsFor('vitals'), vitalsVariants);
  assert.equal(pageVariantsFor('map'), mapVariants);
  for (const route of ROUTES) {
    if (route === 'vitals' || route === 'map') continue;
    assert.equal(pageVariantsFor(route), pageVariants, route);
  }
  // An unknown route must not silently lose its transition either.
  assert.equal(pageVariantsFor('nope'), pageVariants);
  assert.notEqual(vitalsVariants, mapVariants);
});

test('the two instrument entrances are different shapes', () => {
  // Vitals rises into place; Map zooms in from slightly larger.
  assert.equal(bag(vitalsVariants.initial).y, 16);
  assert.equal(bag(vitalsVariants.initial).scale, 0.985);
  assert.equal(bag(mapVariants.initial).scale, 1.05);
  assert.equal(bag(mapVariants.initial).y, undefined);
  assert.equal(bag(pageVariants.initial).scale, undefined);
});

test('every route wrapper ends untransformed — the invariant the map relies on', () => {
  const entries = [['fade', pageVariants], ['vitals', vitalsVariants], ['map', mapVariants]] as const;
  for (const [name, variants] of entries) {
    const animate = bag(variants.animate);
    assert.equal(animate.opacity, 1, name);
    assert.equal(animate.scale ?? 1, 1, name);
    assert.equal(animate.y ?? 0, 0, name);
    assert.equal(bag(variants.exit).opacity, 0, name);
  }
});

test('looping signals return to rest, so a loop can never leave a card offset', () => {
  const signals = [['heartbeat', HEARTBEAT], ['breathe', BREATHE], ['invite', INVITE]] as const;
  for (const [name, signal] of signals) {
    const frames = numbers(bag(signal).scale);
    assert.ok(frames.length >= 3, name);
    assert.equal(frames[0], 1, name);
    assert.equal(frames[frames.length - 1], 1, name);
    assert.equal(bag(bag(signal).transition).repeat, Infinity, name);
  }
});

test('the sonar ring grows and fades out completely', () => {
  const scale = numbers(bag(SONAR).scale);
  const opacity = numbers(bag(SONAR).opacity);
  assert.equal(scale.length, 2);
  assert.ok(scale[1] > scale[0]);
  assert.equal(opacity[opacity.length - 1], 0);
  assert.equal(SONAR_TRANSITION.repeat, Infinity);
});

test('sheets enter and leave through the bottom edge', () => {
  assert.equal(bag(sheetVariants.initial).y, '100%');
  assert.equal(bag(sheetVariants.exit).y, '100%');
  assert.equal(bag(sheetVariants.animate).y, 0);
});

test('directional slides mirror for back navigation', () => {
  assert.equal(bag(slideVariants(1).initial).x, 28);
  assert.equal(bag(slideVariants(-1).initial).x, -28);
});

test('the shared durations and easing keep their brand values', () => {
  assert.equal(EASE_OUT.length, 4);
  assert.ok(DURATION.fast < DURATION.base);
  assert.ok(DURATION.base < DURATION.slow);
});
