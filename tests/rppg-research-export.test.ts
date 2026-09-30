import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildRppgCsv,
  isRppgResearchEnabled,
  RPPG_CSV_HEADER,
  RPPG_EXPORT_CONSENT,
} from '../src/app/rppgResearchExport.ts';

test('CSV starts with the t_ms,r,g,b header the validation harness expects', () => {
  const csv = buildRppgCsv([{ r: 1, g: 2, b: 3 }], [1000]);
  const lines = csv.split('\n');
  assert.equal(lines[0], 't_ms,r,g,b');
  assert.equal(RPPG_CSV_HEADER, 't_ms,r,g,b');
});

test('emits one row per sample with t normalised to start at 0 ms', () => {
  const rgb = [
    { r: 101.2, g: 118.4, b: 131.0 },
    { r: 99.9, g: 120.1, b: 130.2 },
  ];
  const ts = [5000, 5033];
  const csv = buildRppgCsv(rgb, ts);
  const rows = csv.trimEnd().split('\n');
  assert.equal(rows.length, 3); // header + 2 samples
  assert.equal(rows[1], '0,101.2,118.4,131');
  assert.equal(rows[2], '33,99.9,120.1,130.2');
});

test('row count is bounded by the shorter of rgb/timestamps', () => {
  const csv = buildRppgCsv(
    [{ r: 1, g: 1, b: 1 }, { r: 2, g: 2, b: 2 }],
    [0],
  );
  assert.equal(csv.trimEnd().split('\n').length, 2); // header + 1
});

test('file contains no identifiers, only the numeric trace', () => {
  const csv = buildRppgCsv([{ r: 10, g: 20, b: 30 }], [0]);
  // The entire output must match the header + purely numeric rows.
  for (const line of csv.trimEnd().split('\n')) {
    assert.match(line, /^(t_ms,r,g,b|\d+,-?\d+(\.\d+)?,-?\d+(\.\d+)?,-?\d+(\.\d+)?)$/);
  }
  for (const banned of ['name', 'email', 'user', 'id,', 'account', '@']) {
    assert.equal(csv.toLowerCase().includes(banned), false, `must not contain "${banned}"`);
  }
});

test('non-finite channel values fall back to 0 rather than NaN', () => {
  const csv = buildRppgCsv([{ r: NaN, g: Infinity, b: 12.3456 }], [0]);
  const row = csv.trimEnd().split('\n')[1];
  assert.equal(row, '0,0,0,12.346');
});

test('empty input yields only the header row', () => {
  const csv = buildRppgCsv([], []);
  assert.equal(csv, 't_ms,r,g,b\n');
});

test('research mode is off unless explicitly enabled at build time', () => {
  // No VITE_RPPG_RESEARCH is set in the test environment, so it must be off.
  assert.equal(isRppgResearchEnabled(), false);
});

test('consent text promises no upload and no identifiers', () => {
  assert.match(RPPG_EXPORT_CONSENT, /no video/i);
  assert.match(RPPG_EXPORT_CONSENT, /no images/i);
  assert.match(RPPG_EXPORT_CONSENT, /no name or account/i);
  assert.match(RPPG_EXPORT_CONSENT, /nothing is uploaded/i);
  assert.match(RPPG_EXPORT_CONSENT, /stays on your device/i);
});
