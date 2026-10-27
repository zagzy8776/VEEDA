import test from 'node:test';
import assert from 'node:assert/strict';
import { parseVisionResponseText } from '../src/app/visionObservation.ts';
import { guardObservations } from '../src/app/visionSafetyGuard.ts';

test('parseVisionResponseText returns empty report for empty input', () => {
  const report = parseVisionResponseText('');
  assert.equal(report.observations.length, 0);
  assert.equal(report.readableText.length, 0);
  assert.equal(report.visibleMeasurements.length, 0);
  assert.ok(report.uncertainty.length > 0);
  assert.equal(report.processor.type, 'vision');
});

test('parseVisionResponseText parses lines as observations', () => {
  const report = parseVisionResponseText('A white pill bottle.\nA label with text.');
  assert.equal(report.observations.length, 2);
  assert.equal(report.observations[0].type, 'visual_finding');
  assert.equal(report.observations[0].uncertain, true);
  assert.equal(report.observations[0].source, 'vision');
});

test('guardObservations allows safe descriptions', () => {
  const observations = [
    {
      id: 'vo_1',
      type: 'visual_finding' as const,
      description: 'A white pill bottle with a blue label.',
      confidence: 0.8,
      uncertain: false,
      source: 'vision' as const,
      timestamp: new Date().toISOString(),
    },
  ];
  const result = guardObservations(observations);
  assert.equal(result.safe, true);
});

test('guardObservations blocks clinical terms', () => {
  const observations = [
    {
      id: 'vo_1',
      type: 'visual_finding' as const,
      description: 'This appears to be a cancer diagnosis.',
      confidence: 0.8,
      uncertain: false,
      source: 'vision' as const,
      timestamp: new Date().toISOString(),
    },
  ];
  const result = guardObservations(observations);
  assert.equal(result.safe, false);
  assert.ok(result.notes.some((n) => n.includes('cancer')));
});

test('guardObservations blocks multiple prohibited terms', () => {
  const observations = [
    {
      id: 'vo_1',
      type: 'visual_finding' as const,
      description: 'This is a diagnosis of a disease and requires treatment.',
      confidence: 0.8,
      uncertain: false,
      source: 'vision' as const,
      timestamp: new Date().toISOString(),
    },
  ];
  const result = guardObservations(observations);
  assert.equal(result.safe, false);
  assert.ok(result.notes.some((n) => n.includes('diagnosis')));
  assert.ok(result.notes.some((n) => n.includes('disease')));
  assert.ok(result.notes.some((n) => n.includes('treatment')));
});

test('parseVisionResponseText separates readable text from visual findings', () => {
  const report = parseVisionResponseText('A white pill bottle.\nPARACETAMOL 500mg\nBatch EXP2027');
  const types = report.observations.map(o => o.type);
  assert.ok(types.includes('readable_text'));
  assert.ok(report.readableText.length >= 2, `expected >=2 readableText entries, got ${report.readableText.length}: ${JSON.stringify(report.readableText)}`);
  const textObs = report.observations.find(o => o.type === 'readable_text');
  assert.ok(textObs);
  assert.equal(textObs.uncertain, false);
});

test('parseVisionResponseText detects hypotheses separately from visible facts', () => {
  const report = parseVisionResponseText('A white pill bottle.\nPossible explanation: this could be a medication.');
  const hypotheses = report.observations.filter(o => o.type === 'hypothesis');
  assert.equal(hypotheses.length, 1);
  assert.equal(hypotheses[0].uncertain, true);
  assert.ok(report.uncertainty.some(u => u.includes('Hypothesis')));
});

test('parseVisionResponseText extracts visible measurements', () => {
  const report = parseVisionResponseText('A white pill bottle.\nWeight: 500 mg');
  assert.ok(report.visibleMeasurements.length >= 1);
  assert.equal(report.visibleMeasurements[0].label.toLowerCase(), 'weight');
  assert.equal(report.visibleMeasurements[0].value, '500');
  assert.equal(report.visibleMeasurements[0].unit, 'mg');
  assert.equal(report.visibleMeasurements[0].sourceKind, 'image_printed_text');
  assert.equal(report.visibleMeasurements[0].clinicallyValidated, false);
});

test('numeric photograph hypotheses are not promoted to measurements', () => {
  const report = parseVisionResponseText('Possible size: 5 mg based on the photograph.');
  assert.equal(report.visibleMeasurements.length, 0);
  assert.equal(report.observations[0].type, 'hypothesis');
  assert.equal(report.observations[0].uncertain, true);
});

test('formatVisionReportForChat separates visible findings from hypotheses and never diagnoses', async () => {
  const { formatVisionReportForChat } = await import('../src/app/visionObservation.ts');
  const report = parseVisionResponseText('A white pill bottle.\nPossible explanation: this could be a medication.');
  const chat = formatVisionReportForChat(report);
  assert.match(chat, /Visible findings/);
  assert.match(chat, /white pill bottle/);
  assert.match(chat, /Possible explanations/);
  // Never diagnose/treat/prescribe
  assert.doesNotMatch(chat, /\btreat(?:ment|ing)\b/i);
  // Must not claim diagnosis/treatment/prescribe - disclaimer is required
  assert.match(chat, /no diagnosis/i);
  assert.match(chat, /cannot diagnose/i);
  assert.match(chat, /I cannot diagnose or prescribe/);
});

test('formatVisionReportForChat labels image numbers as transcribed and unvalidated', async () => {
  const { formatVisionReportForChat } = await import('../src/app/visionObservation.ts');
  const chat = formatVisionReportForChat(parseVisionResponseText('Weight: 500 mg'));
  assert.match(chat, /printed in the image/i);
  assert.match(chat, /not a validated device measurement/i);
});

test('formatVisionReportForChat includes source when provider/model supplied', async () => {
  const { formatVisionReportForChat } = await import('../src/app/visionObservation.ts');
  const report = parseVisionResponseText('A white pill bottle.', { type: 'vision', provider: 'openai', model: 'gpt-4o' });
  const chat = formatVisionReportForChat(report);
  assert.match(chat, /openai \/ gpt-4o/);
});
