import type { Vitals, Analysis } from './useVedaApp';

// Symptom intake: the chat acts like a triage nurse — asks a fixed sequence of
// short questions, records the answers, and produces a summary the user shows
// to a doctor. Pure module: no storage, no AI, no network. Red flags (keyword
// or severity >= 8) end the intake early and surface emergency advice, but
// still let the user keep the summary.

export type IntakeStepId =
  | 'chief'
  | 'started'
  | 'course'
  | 'severity'
  | 'associated'
  | 'medications'
  | 'allergies'
  | 'goal';

export interface IntakeStep {
  id: IntakeStepId;
  question: string;
  optional: boolean;
}

export const INTAKE_STEPS: IntakeStep[] = [
  { id: 'chief', question: 'What is bothering you the most right now? Describe it in your own words.', optional: false },
  { id: 'started', question: 'When did it start? For example: today, three days ago, or last week.', optional: false },
  { id: 'course', question: 'Since it started, is it getting better, getting worse, or staying the same?', optional: false },
  { id: 'severity', question: 'How bad is it right now, on a scale of 1 to 10? (10 = the worst you can imagine)', optional: false },
  { id: 'associated', question: 'Anything else you noticed with it — fever, vomiting, pain somewhere else, dizziness? You can say skip.', optional: true },
  { id: 'medications', question: 'Are you taking any medicines or treatments for it right now? You can say skip.', optional: true },
  { id: 'allergies', question: 'Do you have any allergies to medicines? You can say skip.', optional: true },
  { id: 'goal', question: 'Last one: what do you most want the doctor to check or explain? You can say skip.', optional: true },
];

export const ANSWER_PLACEHOLDER = 'Not provided';

// Matched phrases name the emergency rung, never a diagnosis.
const RED_FLAG_PATTERNS: Array<{ label: string; pattern: RegExp }> = [
  { label: 'chest pain', pattern: /chest\s*pain|pain\s*in\s*(my|the|his|her)\s*chest/i },
  { label: 'severe breathing difficulty', pattern: /can'?t\s*breathe|cannot\s*breathe|difficulty\s+breathing|struggling\s*to\s*breathe|gasping/i },
  { label: 'loss of consciousness or collapse', pattern: /unconscious|unresponsive|passed\s*out|collapsed|fainted/i },
  { label: 'seizure', pattern: /seizure|convulsion|fitting/i },
  { label: 'severe bleeding', pattern: /severe\s*bleeding|bleeding\s*(heavily|a\s*lot|won'?t\s*stop)|coughing\s*(up\s*)?blood|vomiting\s*blood/i },
  { label: 'possible stroke signs', pattern: /face\s*droop|slurred\s*speech|sudden\s*weakness\s*(on|of)\s*one\s*side|cannot\s*speak|can'?t\s*speak/i },
  { label: 'stiff neck with fever', pattern: /stiff\s*neck.*fever|fever.*stiff\s*neck/i },
];

export function detectRedFlag(text: string): string | null {
  for (const { label, pattern } of RED_FLAG_PATTERNS) {
    if (pattern.test(text)) return label;
  }
  return null;
}

function severityAtLeastEight(text: string): boolean {
  const match = text.match(/\b(10|[1-9])\b/);
  return match !== null && Number(match[1]) >= 8;
}

export interface IntakeSession {
  stepIndex: number;
  answers: Partial<Record<IntakeStepId, string>>;
  redFlag: string | null;
  done: boolean;
}

export interface IntakeResult {
  session: IntakeSession;
  /** The next question to ask, or a completion line when the intake ended. */
  nextQuestion: string | null;
  completed: boolean;
  redFlag: string | null;
}

export function createIntakeSession(): IntakeSession {
  return { stepIndex: 0, answers: {}, redFlag: null, done: false };
}

export function currentQuestion(session: IntakeSession): string | null {
  return INTAKE_STEPS[session.stepIndex]?.question ?? null;
}

export function answerIntake(session: IntakeSession, rawText: string): IntakeResult {
  if (session.done) return { session, nextQuestion: null, completed: true, redFlag: session.redFlag };
  const step = INTAKE_STEPS[session.stepIndex];
  if (!step) return { session: { ...session, done: true }, nextQuestion: null, completed: true, redFlag: session.redFlag };

  const text = rawText.trim();
  if (/^(stop|cancel|quit)$/i.test(text)) {
    return { session: { ...session, done: true, redFlag: null }, nextQuestion: null, completed: true, redFlag: null };
  }

  const optionalSkip = step.optional && /^skip$/i.test(text);
  const answer = optionalSkip || !text ? ANSWER_PLACEHOLDER : text;

  const answers = { ...session.answers, [step.id]: answer };
  const isLast = session.stepIndex >= INTAKE_STEPS.length - 1;

  // Red flags end the intake early — the user's safety question is "is this an
  // emergency now", not "what is the next interview question".
  const redFlag = optionalSkip || answer === ANSWER_PLACEHOLDER
    ? null
    : detectRedFlag(answer) ?? (step.id === 'severity' && severityAtLeastEight(answer) ? 'pain or severity rated 8 or higher' : null);

  if (redFlag) {
    return {
      session: { ...session, answers, redFlag, done: true },
      nextQuestion: null,
      completed: true,
      redFlag,
    };
  }

  if (isLast) {
    return { session: { ...session, answers, done: true }, nextQuestion: null, completed: true, redFlag: null };
  }

  const next: IntakeSession = { ...session, answers, stepIndex: session.stepIndex + 1 };
  return { session: next, nextQuestion: currentQuestion(next), completed: false, redFlag: null };
}

export interface ConsultationReading {
  label: string;
  value: string;
  /** Where this number came from, in plain honest words. */
  provenance: string;
}

export interface ConsultationRecord {
  id: string;
  createdAt: string;
  subjectLabel: string | null;
  adultScoresAllowed: boolean;
  answers: Partial<Record<IntakeStepId, string>>;
  /** Set when the intake ended early because of an emergency red flag. */
  redFlag: string | null;
  readings: ConsultationReading[];
  scores: Array<{ label: string; value: string }>;
  pediatricNote: string | null;
  disclaimer: string;
}

export const CONSULTATION_DISCLAIMER =
  'This summary was prepared by the VEEDA app from what you reported and the readings stored in the app at the time. It is not a diagnosis and it was not written by a doctor. Give it to a licensed clinician and describe your symptoms in your own words too.';

// Provenance follows the app's capability truths: the phone measures heart rate
// and breathing; SpO2, blood pressure, temperature, and hydration are
// manual-entry or wellness-estimate fields, and the document must say so.
const READING_FIELDS: Array<{ key: keyof Vitals; label: string; format: (v: never) => string; provenance: string }> = [
  { key: 'heartRate', label: 'Heart rate', format: v => `${v} bpm`, provenance: 'phone camera measurement — not a medical device' },
  { key: 'respiratory', label: 'Respiratory rate', format: v => `${v} breaths/min`, provenance: 'phone microphone measurement — not a medical device' },
  { key: 'oxygen', label: 'SpO2', format: v => `${v}%`, provenance: 'manual entry — a phone cannot measure this' },
  { key: 'systolicBp', label: 'Systolic blood pressure', format: v => `${v} mmHg`, provenance: 'manual entry — a phone cannot measure this' },
  { key: 'skinTemp', label: 'Temperature', format: v => `${v}°C`, provenance: 'manual entry — a phone cannot measure this' },
  { key: 'hydration', label: 'Hydration estimate', format: v => `${v}%`, provenance: 'wellness estimate, not a clinical measurement' },
];

export function buildConsultationRecord({ session, subjectLabel, adultScoresAllowed, vitals, analysis }: {
  session: IntakeSession;
  subjectLabel: string | null;
  adultScoresAllowed: boolean;
  vitals: Vitals;
  analysis: Analysis | null;
}): ConsultationRecord {
  const readings: ConsultationReading[] = [];
  for (const field of READING_FIELDS) {
    const value = vitals[field.key];
    if (value != null) readings.push({ label: field.label, value: (field.format as (v: unknown) => string)(value), provenance: field.provenance });
  }
  readings.push({ label: 'Consciousness (ACVPU, user-reported)', value: vitals.consciousness || 'alert', provenance: 'user-reported in the app' });
  readings.push({ label: 'Supplemental oxygen (user-reported)', value: vitals.supplementalOxygen ? 'Yes' : 'No', provenance: 'user-reported in the app' });

  const scores: Array<{ label: string; value: string }> = [];
  const news2 = adultScoresAllowed ? analysis?.clinicalScores?.news2 : null;
  const qsofa = adultScoresAllowed ? analysis?.clinicalScores?.qsofa : null;
  if (news2) scores.push({ label: 'NEWS2 (adult tool)', value: `Total ${news2.total} — ${news2.urgency?.level || 'urgency unknown'}${news2.urgency?.action ? `; ${news2.urgency.action}` : ''}` });
  if (qsofa) scores.push({ label: 'qSOFA (adult tool)', value: `Total ${qsofa.total}${qsofa.sepsisRiskFlag ? ' — risk trigger present, needs clinical assessment' : ''}` });

  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    createdAt: new Date().toISOString(),
    subjectLabel,
    adultScoresAllowed,
    answers: { ...session.answers },
    redFlag: session.redFlag,
    readings,
    scores,
    pediatricNote: adultScoresAllowed ? null : 'The subject is a child or of unknown age. NEWS2 and qSOFA are adult tools and were not applied.',
    disclaimer: CONSULTATION_DISCLAIMER,
  };
}
