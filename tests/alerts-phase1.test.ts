import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildAlertPanel, isSourceTrusted, loadAlertPack, raiseAlert, type AlertRule } from '../src/app/alerts.ts';
import { readBarometer, readBatteryTemperature } from '../src/app/deviceSensors.ts';

const example = JSON.parse(
  readFileSync(fileURLToPath(new URL('../src/app/alertPack.example.json', import.meta.url)), 'utf8'),
);

const reviewed = {
  id: 'alerts.test', version: '1.0.0', reviewer: 'Dr. Test', reviewerCredential: 'Physician',
  reviewDate: '2026-01-01', region: 'NG', clinicallyReviewed: true,
  entries: [
    { id: 'fire.nearby', kind: 'fire', severity: 'warning', message: 'Fire nearby.', allowedSources: ['trusted_feed', 'paired_alarm'] },
    { id: 'home.co', kind: 'home_safety', severity: 'danger', message: 'CO alarm.', allowedSources: ['paired_alarm'] },
    { id: 'weather.heat', kind: 'weather', severity: 'advisory', message: 'Heat advisory.', allowedSources: ['trusted_feed'] },
  ],
};

test('a phone guess can NEVER raise a fire, smoke or CO alert', () => {
  assert.equal(isSourceTrusted('fire', 'phone_guess'), false);
  assert.equal(isSourceTrusted('home_safety', 'phone_guess'), false);
  const fireRule: AlertRule = reviewed.entries[0] as AlertRule;
  const meta = { id: 'x', version: '1', reviewer: 'R', reviewDate: '2026-01-01', region: 'NG', clinicallyReviewed: true };
  assert.equal(raiseAlert(fireRule, 'phone_guess', meta), null);
  assert.notEqual(raiseAlert(fireRule, 'trusted_feed', meta), null);
});

test('only trusted feeds raise weather and air-quality alerts', () => {
  assert.equal(isSourceTrusted('weather', 'device_sensor'), false);
  assert.equal(isSourceTrusted('weather', 'trusted_feed'), true);
  assert.equal(isSourceTrusted('air_quality', 'trusted_feed'), true);
});

test('the example alert pack is refused in production and works in development', () => {
  assert.equal(loadAlertPack(example, { production: true }).ok, false);
  assert.equal(loadAlertPack(example).ok, true);
});

test('a missing or unreviewed pack yields an "unavailable" panel, never a false all-clear', () => {
  const missing = buildAlertPanel(null, [{ ruleId: 'fire.nearby', source: 'trusted_feed' }]);
  assert.equal(missing.status, 'unavailable');
  const unreviewed = buildAlertPanel({ ...reviewed, clinicallyReviewed: false }, [{ ruleId: 'fire.nearby', source: 'trusted_feed' }], { production: true });
  assert.equal(unreviewed.status, 'unavailable');
});

test('a reviewed pack raises only the alerts whose source is trusted', () => {
  const panel = buildAlertPanel(reviewed, [
    { ruleId: 'fire.nearby', source: 'trusted_feed' },
    { ruleId: 'home.co', source: 'phone_guess' }, // must be dropped
    { ruleId: 'weather.heat', source: 'trusted_feed' },
  ]);
  assert.equal(panel.status, 'ok');
  if (panel.status === 'ok') {
    assert.deepEqual(panel.alerts.map(a => a.id), ['fire.nearby', 'weather.heat']);
    assert.ok(panel.alerts.every(a => a.reviewedBy.reviewer === 'Dr. Test'));
  }
});

test('barometer and battery-temperature read a real value or report unavailable', () => {
  assert.equal(readBarometer({ pressure: 1013 }).available, true);
  assert.equal(readBarometer(null).available, false);
  assert.equal(readBarometer({ pressure: 0 }).available, false);
  assert.equal(readBatteryTemperature({ temperatureCelsius: 41 }).available, true);
  assert.equal(readBatteryTemperature({}).available, false);
});
