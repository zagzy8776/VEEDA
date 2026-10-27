import test from 'node:test';
import assert from 'node:assert/strict';

import {
  INTAKE_STEPS,
  createIntakeSession,
  answerIntake,
  buildConsultationRecord,
  ANSWER_PLACEHOLDER,
  CONSULTATION_DISCLAIMER,
} from '../src/app/symptomIntake.ts';
import { consultationsStorageKey, saveConsultation, listConsultations } from '../src/app/consultations.ts';
import { perUserDeviceKeys } from '../src/app/api.ts';

// Minimal localStorage stand-in so the storage functions run under node:test.
const store = new Map<string, string>();
(globalThis as { localStorage?: unknown }).localStorage = {
  getItem: (key: string) => store.get(key) ?? null,
  setItem: (key: string, value: string) => void store.set(key, String(value)),
  removeItem: (key: string) => void store.delete(key),
};

const FULL_ANSWERS = [
  'Bad headache with light sensitivity',
  'Since yesterday, about 30 hours',
  'It is getting worse',
  '6',
  'Mild fever',
  'Paracetamol',
  'None',
  'Why it will not go away',
];

function walkIntake(answers: string[]) {
  let session = createIntakeSession();
  const results = [];
  for (const answer of answers) {
    const result = answerIntake(session, answer);
    results.push(result);
    session = result.session;
  }
  return { session, results };
}

const BASE_VITALS = {
  heartRate: 88,
  respiratory: null,
  oxygen: null,
  stamina: null,
  hydration: null,
  skinTemp: null,
  systolicBp: null,
  supplementalOxygen: false,
  consciousness: 'alert' as const,
};

test('the intake walks every step in order and completes with recorded answers', () => {
  const { session, results } = walkIntake(FULL_ANSWERS);
  assert.equal(results.length, INTAKE_STEPS.length);
  assert.ok(results.slice(0, -1).every(r => !r.completed), 'only the final answer completes the intake');
  assert.ok(results.every(r => r.nextQuestion !== null || r.completed));
  assert.ok(session.done);
  assert.equal(session.redFlag, null);
  assert.equal(session.answers.chief, FULL_ANSWERS[0]);
  assert.equal(session.answers.severity, '6');
  assert.equal(session.answers.goal, FULL_ANSWERS[7]);
});

test('optional steps accept "skip" and record an honest placeholder', () => {
  const answers = [...FULL_ANSWERS];
  answers[4] = 'skip';
  const { session } = walkIntake(answers);
  assert.equal(session.answers.associated, ANSWER_PLACEHOLDER);
  assert.equal(session.answers.medications, 'Paracetamol');
});

test('a red-flag symptom ends the intake immediately with the emergency rung', () => {
  const { session, results } = walkIntake(['I have chest pain since this morning']);
  assert.ok(results[0].completed, 'the first answer should end the intake');
  assert.equal(session.redFlag, 'chest pain');
  assert.ok(session.done);
  assert.equal(session.answers.chief, 'I have chest pain since this morning');
});

test('severity 8 or higher is a red flag; lower severity continues the interview', () => {
  const high = walkIntake(['Stomach pain', 'Since morning', 'The same', 'it is like a 9 out of 10']);
  assert.equal(high.session.redFlag, 'pain or severity rated 8 or higher');

  const low = walkIntake(['Stomach pain', 'Since morning', 'The same', 'about 4']);
  assert.equal(low.session.redFlag, null);
  assert.ok(!low.results[3].completed, 'severity 4 must continue to the next question');
});

test('"stop" ends the intake without a red flag', () => {
  const { session } = walkIntake(['Headache', 'stop']);
  assert.ok(session.done);
  assert.equal(session.redFlag, null);
  assert.ok(session.answers.chief);
  assert.equal(session.answers.started, undefined);
});

test('the consultation record carries provenance-honest readings and adult scores', () => {
  const { session } = walkIntake(FULL_ANSWERS);
  const record = buildConsultationRecord({
    session,
    subjectLabel: null,
    adultScoresAllowed: true,
    vitals: BASE_VITALS,
    analysis: { clinicalScores: { news2: { total: 4, urgency: { level: 'low', action: 'routine monitoring' } } } } as never,
  });
  const heart = record.readings.find(r => r.label === 'Heart rate');
  assert.ok(heart, 'a measured heart rate must appear');
  assert.match(heart.value, /88 bpm/);
  assert.match(heart.provenance, /phone camera/);

  assert.ok(record.readings.some(r => r.label.includes('Consciousness')));
  assert.equal(record.scores.length, 1);
  assert.match(record.scores[0].value, /Total 4/);
  assert.equal(record.pediatricNote, null);
  assert.equal(record.disclaimer, CONSULTATION_DISCLAIMER);
  assert.ok(record.answers.chief);
});

test('a child profile never carries adult scores in the record', () => {
  const { session } = walkIntake(FULL_ANSWERS);
  const record = buildConsultationRecord({
    session,
    subjectLabel: 'Ada',
    adultScoresAllowed: false,
    vitals: BASE_VITALS,
    analysis: { clinicalScores: { news2: { total: 4, urgency: { level: 'low' } } } } as never,
  });
  assert.equal(record.scores.length, 0);
  assert.match(record.pediatricNote ?? '', /NEWS2 and qSOFA are adult tools/);
  assert.equal(record.subjectLabel, 'Ada');
});

test('consultations are per-user device records inside the logout clear set', () => {
  const { session } = walkIntake(FULL_ANSWERS);
  const record = buildConsultationRecord({
    session,
    subjectLabel: null,
    adultScoresAllowed: true,
    vitals: BASE_VITALS,
    analysis: null,
  });
  assert.ok(saveConsultation('u-intake', record));
  const listed = listConsultations('u-intake');
  assert.equal(listed.length, 1);
  assert.equal(listed[0].id, record.id);
  assert.ok(perUserDeviceKeys('u-intake').includes(consultationsStorageKey('u-intake')));
});
