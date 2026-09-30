import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SUMMARY_DISCLAIMER,
  SUMMARY_HEADLINE,
  SOURCE_LABEL,
  buildHealthSummaryHtml,
  selectSections,
  summaryFilename,
  type SummarySection,
} from '../src/app/healthSummary.ts';

const GENERATED = '2026-03-04T09:30:00.000Z';

const sections: SummarySection[] = [
  {
    id: 'vitals',
    title: 'Vitals',
    values: [
      { label: 'Heart rate', value: '72 bpm', source: 'camera_estimate', recordedAt: '2026-03-04T08:00:00.000Z' },
      { label: 'Temperature', value: '36.8 °C', source: 'typed_in' },
    ],
  },
  { id: 'bp_glucose', title: 'Blood pressure and glucose', values: [{ label: 'Blood glucose', value: '5.4 mmol/L', source: 'device' }] },
  { id: 'medications', title: 'Medications', values: [] },
];

test('the disclaimer states it is self-recorded and not a diagnosis', () => {
  assert.match(SUMMARY_DISCLAIMER, /self-recorded|recorded by the person/i);
  assert.match(SUMMARY_DISCLAIMER, /not a diagnosis/i);
  assert.match(SUMMARY_DISCLAIMER, /not been checked by a clinician/i);
});

test('only user-selected sections are included', () => {
  const html = buildHealthSummaryHtml({ generatedAt: GENERATED, sections }, ['vitals']);
  assert.match(html, /Vitals/);
  assert.doesNotMatch(html, /Blood pressure and glucose/);
});

test('a selected but empty section is omitted (no implied data)', () => {
  const html = buildHealthSummaryHtml({ generatedAt: GENERATED, sections }, ['medications']);
  assert.doesNotMatch(html, /<h2>Medications<\/h2>/);
  assert.match(html, /No sections were selected/);
});

test('each value shows its measurement source', () => {
  const html = buildHealthSummaryHtml({ generatedAt: GENERATED, sections }, ['vitals', 'bp_glucose']);
  assert.match(html, /Camera estimate/);
  assert.match(html, /Typed in/);
  assert.match(html, /Device/);
});

test('unknown sources are labelled, never silently blank', () => {
  assert.equal(SOURCE_LABEL.unknown, 'Source not recorded');
  const html = buildHealthSummaryHtml(
    { generatedAt: GENERATED, sections: [{ id: 'vitals', title: 'Vitals', values: [{ label: 'X', value: '1', source: 'unknown' }] }] },
    ['vitals'],
  );
  assert.match(html, /Source not recorded/);
});

test('the document shows a generated-on date', () => {
  const html = buildHealthSummaryHtml({ generatedAt: GENERATED, sections }, ['vitals']);
  assert.match(html, /Generated on 2026-03-04/);
});

test('the filename is neutral and date-stamped with no personal name', () => {
  const name = summaryFilename(GENERATED);
  assert.equal(name, 'health-summary-2026-03-04.pdf');
  assert.doesNotMatch(name, /veeda|patient|blood|glucose|bp/i);
});

test('values are HTML-escaped to avoid broken or injected markup', () => {
  const html = buildHealthSummaryHtml(
    { generatedAt: GENERATED, sections: [{ id: 'vitals', title: 'Vitals', values: [{ label: '<b>x</b>', value: '1 & 2', source: 'typed_in' }] }] },
    ['vitals'],
  );
  assert.match(html, /1 &amp; 2/);
  assert.match(html, /&lt;b&gt;x&lt;\/b&gt;/);
  assert.doesNotMatch(html, /<b>x<\/b>/);
});

test('the headline is a neutral descriptive title', () => {
  assert.equal(SUMMARY_HEADLINE, 'Self-recorded health summary');
});

test('selectSections keeps order and drops unselected or empty sections', () => {
  const chosen = selectSections(sections, ['medications', 'bp_glucose', 'vitals']);
  assert.deepEqual(chosen.map((s) => s.id), ['vitals', 'bp_glucose']);
});
