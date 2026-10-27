import test from 'node:test';
import assert from 'node:assert/strict';

import {
  converse,
  createDialogueState,
  dailyCheckIn,
  type DialogueContext,
  type DialogueState,
} from '../src/app/dialogueEngine.ts';
import type { Analysis } from '../src/app/useVedaApp.ts';

const VITALS = {
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

const CONTEXT: DialogueContext = {
  vitals: VITALS,
  analysis: null,
  now: new Date(2026, 9, 24, 14, 35),
  emergencyNumber: null,
};

function talk(state: DialogueState, message: string, context: DialogueContext = CONTEXT) {
  return converse(state, message, context);
}

function conversation(messages: string[], context: DialogueContext = CONTEXT) {
  let state = createDialogueState();
  const results = [];
  for (const message of messages) {
    const result = talk(state, message, context);
    results.push(result);
    state = result.state;
  }
  return { state, results };
}

test('a symptom conversation remembers CURRENT_EVENT and asks one adaptive question at a time', () => {
  const { state, results } = conversation([
    'I have a bad headache',
    'It started yesterday',
    '6',
    'It is getting worse',
    'I took paracetamol this morning',
    'No allergies',
  ]);

  assert.deepEqual(state.currentEvent.symptoms, ['headache']);
  assert.equal(state.currentEvent.onset, 'It started yesterday');
  assert.equal(state.currentEvent.severity, 6);
  assert.equal(state.currentEvent.course, 'worse');
  assert.deepEqual(state.currentEvent.medications, ['I took paracetamol this morning']);
  assert.deepEqual(state.currentEvent.allergies, ['No allergies']);
  assert.match(results[0].reply, /When did it start/);
  assert.match(results[1].reply, /scale from 1 to 10/);
  assert.match(results[2].reply, /better, worse, or staying/);
  assert.match(results[3].reply, /medicine or treatment/);
  assert.match(results[4].reply, /allergies to medicines/);
  assert.doesNotMatch(results[5].reply, /Have you taken any new medicine/);
  assert.ok(results.every(result => result.reply.includes('?')));
});

test('emergency red flags stay local, urgent, and use only a verified configured number', () => {
  const withoutNumber = talk(createDialogueState(), 'I have chest pain right now');
  assert.equal(withoutNumber.intent, 'emergency');
  assert.equal(withoutNumber.urgent, true);
  assert.equal(withoutNumber.providerEligible, false);
  assert.equal(withoutNumber.state.currentEvent.riskLevel, 'emergency');
  assert.equal(withoutNumber.state.currentEvent.redFlag, 'chest pain');
  assert.match(withoutNumber.reply, /urgent medical assessment/);
  assert.match(withoutNumber.reply, /your local emergency number/);
  assert.match(withoutNumber.reply, /\?$/);

  const withNumber = talk(createDialogueState(), 'I cannot breathe', { ...CONTEXT, emergencyNumber: '112' });
  assert.match(withNumber.reply, /call 112/);
  assert.equal(withNumber.providerEligible, false);
});

test('severity eight or higher escalates without interpreting unrelated measurements as severity', () => {
  const { results } = conversation(['I have stomach pain', 'Since this morning', '8']);
  assert.equal(results[2].urgent, true);
  assert.equal(results[2].state.currentEvent.redFlag, 'symptoms rated 8 or higher out of 10');

  const bp = talk(createDialogueState(), 'My blood pressure is 180/100');
  assert.equal(bp.urgent, false);
  assert.equal(bp.intent, 'measurement');
  assert.equal(bp.state.currentEvent.severity, null);
  assert.deepEqual(bp.state.currentEvent.measurements.bloodPressure, { value: '180/100', unit: 'mmHg' });
});

test('self-harm language receives immediate human-support guidance and never goes to a provider', () => {
  const result = talk(createDialogueState(), 'I am thinking about suicide');
  assert.equal(result.urgent, true);
  assert.equal(result.providerEligible, false);
  assert.match(result.reply, /glad you told me/);
  assert.match(result.reply, /immediate human support/);
  assert.match(result.reply, /immediate danger/);
});

test('emotional support listens and follows up instead of returning clinical scores', () => {
  const first = talk(createDialogueState(), 'I feel overwhelmed and anxious');
  assert.equal(first.intent, 'emotional');
  assert.equal(first.state.currentEvent.emotionalState, 'anxious');
  assert.match(first.reply, /I’m sorry you’re feeling anxious/);
  assert.match(first.reply, /weighing on you/);
  assert.doesNotMatch(first.reply, /NEWS2|qSOFA/);

  const second = talk(first.state, 'My exams and money problems are piling up');
  assert.equal(second.intent, 'general');
  assert.equal(second.state.currentEvent.emotionalState, 'anxious');
  assert.match(second.reply, /Thank you for trusting me/);
  assert.match(second.reply, /keep talking|grounding exercise/);
});

test('time and date are answered locally from the injected clock', () => {
  const time = talk(createDialogueState(), 'Can you tell me the time?');
  assert.equal(time.intent, 'time');
  assert.equal(time.providerEligible, false);
  assert.match(time.reply, /2:35 PM/);
  assert.match(time.reply, /Saturday, October 24, 2026/);

  const date = talk(createDialogueState(), 'What day is it?');
  assert.equal(date.intent, 'date');
  assert.match(date.reply, /Saturday, October 24, 2026/);
});

test('vital answers state provenance and never invent missing phone measurements', () => {
  const heart = talk(createDialogueState(), 'What is my current heart rate?');
  assert.equal(heart.intent, 'vitals');
  assert.match(heart.reply, /88 bpm/);
  assert.match(heart.reply, /phone-based measurement/);

  const oxygen = talk(createDialogueState(), 'Review my SpO2');
  assert.match(oxygen.reply, /no SpO2 reading recorded/i);
  assert.match(oxygen.reply, /phone cannot measure SpO2/i);
  assert.match(oxygen.reply, /pulse oximeter/);

  const temperature = talk(createDialogueState(), 'What is my temperature?');
  assert.match(temperature.reply, /phone cannot measure your body temperature/i);
});

test('adult scores are gated for children and unknown-age profiles', () => {
  const analysis = {
    clinicalScores: {
      news2: { total: 7, components: {}, missing: [], urgency: { level: 'high', action: 'Urgent review', timelineMinutes: 0 } },
      qsofa: { total: 2, sepsisRiskFlag: true, components: {}, missing: [] },
    },
  } as unknown as Analysis;
  const adult = talk(createDialogueState(), 'Explain my NEWS2 score', { ...CONTEXT, analysis });
  assert.match(adult.reply, /NEWS2 is 7/);
  assert.match(adult.reply, /qSOFA is 2/);
  assert.match(adult.reply, /not a sepsis diagnosis/);

  const child = talk(createDialogueState(), 'Explain my NEWS2 score', { ...CONTEXT, analysis, adultScoresAllowed: false, subjectLabel: 'Ada' });
  assert.match(child.reply, /Ada:/);
  assert.match(child.reply, /adult tools/);
  assert.doesNotMatch(child.reply, /NEWS2 is 7|qSOFA is 2|Urgent review/);
});

test('food, fluids, medicines, location, and trusted contacts remain conversational context', () => {
  const food = talk(createDialogueState(), 'I ate rice and chicken');
  assert.equal(food.intent, 'food');
  assert.deepEqual(food.state.currentEvent.food, ['I ate rice and chicken']);
  assert.match(food.reply, /without assuming it caused/);

  const fluids = talk(food.state, 'I drank two glasses of water');
  assert.equal(fluids.intent, 'fluids');
  assert.deepEqual(fluids.state.currentEvent.fluids, ['I drank two glasses of water']);

  const location = talk(fluids.state, 'I am in Lagos');
  assert.equal(location.state.currentEvent.location, 'Lagos');
  assert.match(location.reply, /Lagos/);
  assert.match(location.reply, /no map data for hospitals or pharmacies/);
  assert.match(location.reply, /\?$/);

  const contact = talk(location.state, 'My emergency contact is my sister Ada');
  assert.deepEqual(contact.state.currentEvent.emergencyContacts, ['my sister Ada']);
  assert.match(contact.reply, /have not contacted them/);
});

test('an emergency names the nearest mapped places and still ends with a question', () => {
  const withCare: DialogueContext = {
    ...CONTEXT,
    emergencyNumber: '112',
    nearbyCare: {
      hospitals: [{ name: 'General Hospital', distM: 850, phone: '+234800' }],
      pharmacies: [{ name: 'Corner Pharmacy', distM: 2400 }],
    },
  };
  const result = talk(createDialogueState(), 'I have chest pain right now', withCare);
  assert.equal(result.urgent, true);
  assert.match(result.reply, /General Hospital/);
  assert.match(result.reply, /850 m away/);
  assert.match(result.reply, /Corner Pharmacy/);
  assert.match(result.reply, /2\.4 km away/);
  // It never claims a place is open, able to help, or already contacted.
  assert.match(result.reply, /I have not contacted them/);
  assert.match(result.reply, /\?$/);
});

test('location answers name mapped hospitals and pharmacies without inventing any', () => {
  const withCare: DialogueContext = {
    ...CONTEXT,
    nearbyCare: { hospitals: [{ name: 'St Mary Clinic', distM: 300 }], pharmacies: [] },
  };
  const found = talk(createDialogueState(), 'Where am I?', withCare);
  assert.equal(found.intent, 'location');
  assert.match(found.reply, /St Mary Clinic/);
  assert.match(found.reply, /300 m away/);
  assert.match(found.reply, /cannot confirm they are open/);
  assert.match(found.reply, /\?$/);

  // An empty map search is stated plainly, never filled in from a guess.
  const empty = talk(createDialogueState(), 'Find a hospital near me', { ...CONTEXT, nearbyCare: { hospitals: [], pharmacies: [] } });
  assert.equal(empty.intent, 'location');
  assert.match(empty.reply, /no hospital or pharmacy was found/);
  assert.match(empty.reply, /\?$/);
});

test('reported measurements are remembered without changing device vitals', () => {
  const before = structuredClone(VITALS);
  const result = talk(createDialogueState(), 'My temperature is 38.2 C and my heart rate is 110');
  assert.equal(result.intent, 'measurement');
  assert.deepEqual(result.state.currentEvent.measurements.temperature, { value: '38.2', unit: '°C' });
  assert.deepEqual(result.state.currentEvent.measurements.heartRate, { value: '110', unit: 'bpm' });
  assert.match(result.reply, /separate from phone measurements/);
  assert.deepEqual(VITALS, before);
});

test('conversation continues after improvement, gratitude, greetings, and unstructured messages', () => {
  const { results } = conversation([
    'Hello',
    'I am fine today',
    'Thanks',
    'I have a headache',
    'Since yesterday',
    '5',
    'Getting better',
    'I feel better now',
    'I just wanted someone to talk to',
  ]);
  assert.ok(results.every(result => result.reply.trim().includes('?')));
  assert.match(results[6].reply, /medicine or treatment/);
  assert.match(results[7].reply, /improvement lasted/);
  assert.match(results[8].reply, /headache|listening|following/i);
});

test('every reply offers engagement and factual intents never require a provider', () => {
  const messages = [
    'Hello', 'What is the time?', 'What is the date?', 'What is my heart rate?',
    'Summarize current clinical risk', 'I feel sad', 'I ate rice', 'I drank water',
    'My BP is 120/80', 'I am in Abuja', 'Something is on my mind',
  ];
  for (const message of messages) {
    const result = talk(createDialogueState(), message);
    assert.match(result.reply, /\?/, message);
    if (['time', 'date', 'vitals', 'clinical', 'measurement'].includes(result.intent)) {
      assert.equal(result.providerEligible, false, message);
    }
  }
});

test('the engine does not mutate the previous dialogue state', () => {
  const before = createDialogueState();
  const snapshot = structuredClone(before);
  const result = talk(before, 'I have a fever and cough since yesterday');
  assert.deepEqual(before, snapshot);
  assert.notEqual(result.state, before);
  assert.notEqual(result.state.currentEvent, before.currentEvent);
  assert.deepEqual(result.state.currentEvent.symptoms, ['fever', 'cough']);
});

test('a daily check-in remembers steps, sleep, and activity and keeps the conversation going', () => {
  const result = talk(createDialogueState(), 'I walked 8200 steps today and slept 7 hours');
  assert.equal(result.intent, 'daily');
  assert.equal(result.providerEligible, true);
  assert.equal(result.state.currentEvent.steps, '8200');
  assert.equal(result.state.currentEvent.sleep, '7 hours');
  assert.match(result.reply, /8200 steps/);
  assert.match(result.reply, /How much water have you had/);
  assert.match(result.reply, /\?$/);
});

test('a daily answer references the profile goal without judging the number', () => {
  const context: DialogueContext = { ...CONTEXT, dailyGoals: { stepGoal: 10000, waterTarget: 8 } };
  const result = talk(createDialogueState(), 'I did 4000 steps', context);
  assert.equal(result.intent, 'daily');
  assert.equal(result.state.currentEvent.steps, '4000');
  assert.match(result.reply, /your profile goal of 10000 steps/);
  assert.match(result.reply, /without judging/);
  // The number is echoed, never scored or graded.
  assert.doesNotMatch(result.reply, /well done|not enough|too few|great job/i);
});

test('the daily opener changes with the time of day and always asks a question', () => {
  const morning = dailyCheckIn(new Date(2026, 9, 24, 8, 0));
  assert.match(morning, /Good morning/);
  assert.match(morning, /\?$/);

  const afternoon = dailyCheckIn(new Date(2026, 9, 24, 14, 0), { waterTarget: 8 });
  assert.match(afternoon, /Have you eaten today/);
  assert.match(afternoon, /daily target of 8 glasses/);
  assert.match(afternoon, /\?$/);

  const evening = dailyCheckIn(new Date(2026, 9, 24, 20, 0), { stepGoal: 10000 });
  assert.match(evening, /Good evening/);
  assert.match(evening, /goal of 10000/);
  assert.match(evening, /\?$/);
});
