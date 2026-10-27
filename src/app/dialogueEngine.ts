import { detectRedFlag } from './symptomIntake.ts';
import { CHILD_NOT_VALIDATED_NOTE } from './dependents.ts';
import type { Analysis, Vitals } from './useVedaApp';

export type DialogueIntent =
  | 'emergency'
  | 'time'
  | 'date'
  | 'greeting'
  | 'gratitude'
  | 'wellbeing'
  | 'emotional'
  | 'clinical'
  | 'vitals'
  | 'symptom'
  | 'medication'
  | 'food'
  | 'fluids'
  | 'daily'
  | 'measurement'
  | 'allergy'
  | 'location'
  | 'general';

export type DialogueQuestion =
  | 'onset'
  | 'severity'
  | 'course'
  | 'medications'
  | 'allergies'
  | 'fluids'
  | 'emotionalCause'
  | 'nextStep'
  | 'emergencySupport';

export interface CurrentEvent {
  symptoms: string[];
  onset: string | null;
  severity: number | null;
  course: 'better' | 'worse' | 'same' | null;
  medications: string[];
  food: string[];
  fluids: string[];
  /** Steps today, as the person stated them (kept as text; never estimated). */
  steps: string | null;
  /** Sleep, as the person stated it. */
  sleep: string | null;
  /** Activity/exercise, as the person stated it. */
  activity: string | null;
  measurements: Partial<Record<'heartRate' | 'bloodPressure' | 'spo2' | 'temperature' | 'glucose', { value: string; unit: string }>>;
  allergies: string[];
  emotionalState: string | null;
  location: string | null;
  emergencyContacts: string[];
  redFlag: string | null;
  riskLevel: 'emergency' | 'unknown';
}

export interface DialogueState {
  currentEvent: CurrentEvent;
  lastIntent: DialogueIntent | null;
  pendingQuestion: DialogueQuestion | null;
  askedQuestions: DialogueQuestion[];
  turnCount: number;
}

export interface DialogueContext {
  vitals: Vitals;
  analysis: Analysis | null;
  adultScoresAllowed?: boolean;
  subjectLabel?: string | null;
  now?: Date;
  emergencyNumber?: string | null;
  /** A place name the app resolved for the current position, when available. */
  locationLabel?: string | null;
  /** Mapped hospitals/pharmacies near the user, closest first. */
  nearbyCare?: NearbyCare;
  /** Water and step targets from the profile; used only to frame a question. */
  dailyGoals?: DailyGoals;
}

export interface DailyGoals {
  /** Glasses of water the person set as a daily target. */
  waterTarget?: number;
  /** Steps the person set as a daily goal. */
  stepGoal?: number;
}

/**
 * A hospital, clinic or pharmacy returned by the map search. These are mapped
 * places, not verified care: every reply that names one says so and never
 * claims VEEDA has contacted it.
 */
export interface NearbyCarePlace {
  name: string;
  /** Metres from the user, when the source supplied it. */
  distM?: number;
  phone?: string | null;
}

export interface NearbyCare {
  hospitals: NearbyCarePlace[];
  pharmacies: NearbyCarePlace[];
}

export interface DialogueResult {
  state: DialogueState;
  reply: string;
  intent: DialogueIntent;
  urgent: boolean;
  providerEligible: boolean;
}

const SYMPTOMS: Array<{ label: string; pattern: RegExp }> = [
  { label: 'headache', pattern: /headache|head\s+(?:is\s+)?(?:hurting|pain)/i },
  { label: 'chest discomfort', pattern: /chest\s+(?:discomfort|tightness|pressure)/i },
  { label: 'breathlessness', pattern: /shortness\s+of\s+breath|breathless/i },
  { label: 'fever', pattern: /fever|feeling\s+hot|chills/i },
  { label: 'cough', pattern: /cough/i },
  { label: 'sore throat', pattern: /sore\s+throat|throat\s+pain/i },
  { label: 'stomach pain', pattern: /stomach\s+(?:pain|ache)|abdominal\s+pain|belly\s+pain/i },
  { label: 'nausea', pattern: /nausea|nauseous|feel\s+sick/i },
  { label: 'vomiting', pattern: /vomit|throwing\s+up/i },
  { label: 'diarrhea', pattern: /diarrh(?:oea|ea)|loose\s+stool/i },
  { label: 'dizziness', pattern: /dizz|lightheaded/i },
  { label: 'back pain', pattern: /back\s+pain|my\s+back\s+(?:hurts|aches)/i },
  { label: 'rash', pattern: /rash|skin\s+spots/i },
  { label: 'swelling', pattern: /swelling|swollen/i },
  { label: 'fatigue', pattern: /fatigue|exhausted|unusually\s+tired/i },
  { label: 'pain', pattern: /\bpain\b|\bhurts?\b|\bache\b/i },
];

const EMOTIONS: Array<{ label: string; pattern: RegExp }> = [
  { label: 'anxious', pattern: /anxious|anxiety|panicky|panic\b/i },
  { label: 'sad', pattern: /\bsad\b|feeling\s+low|down\s+today|depressed/i },
  { label: 'overwhelmed', pattern: /overwhelmed|too\s+much|can'?t\s+cope/i },
  { label: 'stressed', pattern: /stress|under\s+pressure/i },
  { label: 'lonely', pattern: /lonely|alone\s+with\s+this/i },
  { label: 'scared', pattern: /scared|afraid|frightened/i },
  { label: 'angry', pattern: /angry|frustrated|irritated/i },
];

export function createDialogueState(): DialogueState {
  return {
    currentEvent: {
      symptoms: [], onset: null, severity: null, course: null,
      medications: [], food: [], fluids: [], steps: null, sleep: null, activity: null,
      measurements: {}, allergies: [],
      emotionalState: null, location: null, emergencyContacts: [],
      redFlag: null, riskLevel: 'unknown',
    },
    lastIntent: null,
    pendingQuestion: null,
    askedQuestions: [],
    turnCount: 0,
  };
}

/**
 * The opener for a day's check-in, chosen by the time of day. It asks one
 * question and never states a target as an instruction. The goals only frame
 * the question; nothing here judges or scores the answer.
 */
export function dailyCheckIn(now: Date, goals: DailyGoals = {}): string {
  const hour = now.getHours();
  if (hour < 12) {
    return 'Good morning. How did you sleep, and how are you feeling compared with yesterday?';
  }
  if (hour < 18) {
    const water = goals.waterTarget ? ` You set a daily target of ${goals.waterTarget} glasses — about how many have you had?` : ' About how much water have you had?';
    return `Hello. Have you eaten today?${water}`;
  }
  if (goals.stepGoal) {
    return `Good evening. How are you feeling now compared with this morning, and roughly how many steps did you get against your goal of ${goals.stepGoal}?`;
  }
  return 'Good evening. How are you feeling now compared with this morning, and roughly how many steps did you get today?';
}

function unique(items: string[]): string[] {
  return [...new Set(items)];
}

function extractSymptoms(text: string): string[] {
  return SYMPTOMS.filter(({ pattern }) => pattern.test(text)).map(({ label }) => label);
}

function extractOnset(text: string): string | null {
  const match = text.match(/\b((?:since|for)\s+[^,.!?]+|started\s+[^,.!?]+)\b/i);
  if (match) return match[1].trim();
  const relative = text.match(/\b(today|yesterday|last\s+night|this\s+morning|this\s+afternoon|this\s+evening|\d+\s+(?:hours?|days?|weeks?|months?)\s+ago)\b/i);
  return relative?.[0] ?? null;
}

function extractSeverity(text: string, pending: DialogueQuestion | null): number | null {
  const rated = text.match(/\b(10|[1-9])\s*(?:\/|out\s+of)\s*10\b/i);
  const direct = pending === 'severity' ? text.match(/^\s*(?:about\s+|around\s+)?(10|[1-9])\s*$/) : null;
  const labeled = text.match(/\b(?:pain|severity)\s*(?:is|was|of|:)?\s*(10|[1-9])\b/i);
  const value = rated?.[1] ?? direct?.[1] ?? labeled?.[1];
  return value == null ? null : Number(value);
}

function extractCourse(text: string): CurrentEvent['course'] {
  if (/getting\s+worse|worsening|much\s+worse|feel\s+worse/i.test(text)) return 'worse';
  if (/getting\s+better|improv|feel\s+better|feeling\s+better/i.test(text)) return 'better';
  if (/staying\s+the\s+same|still\s+the\s+same|no\s+change|unchanged/i.test(text)) return 'same';
  return null;
}

function extractMeasurements(text: string): CurrentEvent['measurements'] {
  const measurements: CurrentEvent['measurements'] = {};
  const bp = text.match(/\b(?:bp|blood\s+pressure)\s*(?:is|was|of|:)?\s*(\d{2,3})\s*(?:\/|over)\s*(\d{2,3})\b/i);
  if (bp) measurements.bloodPressure = { value: `${bp[1]}/${bp[2]}`, unit: 'mmHg' };
  const hr = text.match(/\b(?:heart\s+rate|pulse|hr)\s*(?:is|was|of|:)?\s*(\d{2,3})\b/i) ?? text.match(/\b(\d{2,3})\s*bpm\b/i);
  if (hr) measurements.heartRate = { value: hr[1], unit: 'bpm' };
  const spo2 = text.match(/\b(?:spo2|oxygen\s+saturation)\s*(?:is|was|of|:)?\s*(\d{2,3})\s*%?/i);
  if (spo2) measurements.spo2 = { value: spo2[1], unit: '%' };
  const temp = text.match(/\b(?:temperature|temp)\s*(?:is|was|of|:)?\s*(\d{2}(?:\.\d+)?)\s*(?:°?\s*(c|f))?\b/i);
  if (temp) measurements.temperature = { value: temp[1], unit: `°${(temp[2] ?? 'C').toUpperCase()}` };
  const glucose = text.match(/\b(?:glucose|blood\s+sugar)\s*(?:is|was|of|:)?\s*(\d{2,3}(?:\.\d+)?)\s*(mg\/dl|mmol\/l)?/i);
  if (glucose) measurements.glucose = { value: glucose[1], unit: glucose[2] ?? 'units not stated' };
  return measurements;
}

function extractDaily(text: string): { steps: string | null; sleep: string | null; activity: string | null } {
  const steps = text.match(/\b(\d[\d,]{2,6})\s*steps?\b/i) ?? text.match(/\bsteps?\b\D{0,15}?(\d[\d,]{2,6})\b/i);
  const sleep = text.match(/\b(?:slept|sleep|sleeping)\D{0,15}?(\d+(?:\.\d+)?)\s*(?:hours?|hrs?)\b/i)
    ?? text.match(/\b(\d+(?:\.\d+)?)\s*(?:hours?|hrs?)\s*(?:of\s+)?(?:sleep|sleeping)\b/i);
  const activity = text.match(/\b(\d+\s*(?:minutes?|mins?)\s*(?:of\s+)?[a-z]+|went\s+for\s+a\s+(?:walk|run|swim)|did\s+(?:some\s+)?exercise)\b/i);
  return {
    steps: steps ? steps[1].replace(/,/g, '') : null,
    sleep: sleep ? `${sleep[1]} hours` : null,
    activity: activity ? activity[1] : null,
  };
}

function detectIntent(text: string, state: DialogueState, hasMeasurement: boolean, symptoms: string[]): DialogueIntent {
  if (/\b(what(?:'s| is)?\s+the\s+time|current\s+time|time\s+is\s+it|(?:can\s+you\s+)?tell\s+me\s+the\s+time)\b/i.test(text)) return 'time';
  if (/\b(what(?:'s| is)?\s+(?:the\s+)?date|today(?:'s| is)\s+date|what\s+day\s+is\s+it|(?:can\s+you\s+)?tell\s+me\s+today'?s\s+date)\b/i.test(text)) return 'date';
  if (/\b(emergency|need\s+urgent\s+help|call\s+an\s+ambulance)\b/i.test(text) && !/\b(?:emergency|trusted)\s+contact\b/i.test(text)) return 'emergency';
  if (/\b(news2|qsofa|clinical\s+risk|sepsis\s+risk|recovery\s+trend|score)\b/i.test(text)) return 'clinical';
  if (/\b(heart\s+rate|pulse|bpm|breathing\s+rate|respiratory\s+rate|oxygenation|spo2|temperature)\b/i.test(text) && /\b(what|how|show|current|latest|check|review|read)\b/i.test(text)) return 'vitals';
  if (hasMeasurement) return 'measurement';
  if (/\b(steps?|step\s+count|walked|sleep|slept|exerci[sz]e|workout|how\s+active|physical\s+activity)\b/i.test(text)) return 'daily';
  if (/^\s*(hi|hello|hey|good\s+(?:morning|afternoon|evening))\b/i.test(text)) return 'greeting';
  if (/\b(thank\s+you|thanks|i\s+appreciate\s+it)\b/i.test(text)) return 'gratitude';
  if (/\b(i'?m\s+(?:fine|okay|ok|well|good)|feeling\s+(?:fine|okay|well|good)|(?:feel|feeling)\s+better)\b/i.test(text)) return 'wellbeing';
  if (state.pendingQuestion === 'medications' || /\b(medicine|medication|tablet|pill|paracetamol|ibuprofen|dose)\b/i.test(text)) return 'medication';
  if (state.pendingQuestion === 'allergies' || /\ballerg/i.test(text)) return 'allergy';
  if (state.pendingQuestion === 'fluids' || /\b(drank|drinking|water|fluids?|urine)\b/i.test(text)) return 'fluids';
  if (/\b(i\s+(?:ate|had)\s+(?:breakfast|lunch|dinner|food|rice|bread|beans)|my\s+(?:meal|food)|after\s+eating|food\s+I\s+ate)\b/i.test(text)) return 'food';
  if (/\b(emergency\s+contact|my\s+location|where\s+am\s+i|hospitals?|clinics?|pharmac(?:y|ies)|chemists?|nearby\s+care)\b/i.test(text) || /\bi(?:\s+am|'?m)\s+in\s+\S+/i.test(text)) return 'location';
  const emotional = EMOTIONS.some(({ pattern }) => pattern.test(text));
  if (emotional) return 'emotional';
  if (symptoms.length || state.pendingQuestion === 'onset' || state.pendingQuestion === 'severity' || state.pendingQuestion === 'course' || /\b(unwell|sick|not\s+feeling\s+well)\b/i.test(text)) return 'symptom';
  return 'general';
}

function captureAnswer(event: CurrentEvent, text: string, pending: DialogueQuestion | null, intent: DialogueIntent): void {
  if (pending === 'onset' && !event.onset) event.onset = text;
  if (pending === 'medications' && !event.medications.length) event.medications = [text];
  if (pending === 'allergies' && !event.allergies.length) event.allergies = [text];
  if (pending === 'fluids' && !event.fluids.length) event.fluids = [text];
  if (intent === 'medication' && !event.medications.length) event.medications = [text];
  if (intent === 'allergy' && !event.allergies.length) event.allergies = [text];
  if (intent === 'food') event.food = unique([...event.food, text]);
  if (intent === 'fluids' && !event.fluids.length) event.fluids = [text];
}

function nextClinicalQuestion(state: DialogueState): { key: DialogueQuestion; text: string } | null {
  const event = state.currentEvent;
  const candidates: Array<{ key: DialogueQuestion; missing: boolean; text: string }> = [
    { key: 'onset', missing: !event.onset, text: 'When did it start, and did it begin suddenly or gradually?' },
    { key: 'severity', missing: event.severity == null, text: 'On a scale from 1 to 10, how severe is it right now?' },
    { key: 'course', missing: !event.course, text: 'Since it started, has it been getting better, worse, or staying about the same?' },
    { key: 'medications', missing: !event.medications.length, text: 'Have you taken any medicine or treatment for it? Include the name and when you took it, if you know.' },
    { key: 'allergies', missing: !event.allergies.length, text: 'Do you have any allergies to medicines?' },
  ];
  if (event.symptoms.some(s => ['vomiting', 'diarrhea', 'fever', 'stomach pain', 'nausea'].includes(s))) {
    candidates.push({ key: 'fluids', missing: !event.fluids.length, text: 'How much water or other fluid have you been able to keep down today?' });
  }
  return candidates.find(c => c.missing && !state.askedQuestions.includes(c.key)) ?? null;
}

function withQuestion(state: DialogueState, question: { key: DialogueQuestion; text: string } | null): DialogueState {
  if (!question) return { ...state, pendingQuestion: 'nextStep' };
  return {
    ...state,
    pendingQuestion: question.key,
    askedQuestions: unique([...state.askedQuestions, question.key]) as DialogueQuestion[],
  };
}

function emergencyReply(redFlag: string, number: string | null | undefined, careLine: string): string {
  const contact = number ? `call ${number}` : 'call your local emergency number';
  if (/self-harm|suicide/.test(redFlag)) {
    return `I’m really glad you told me. Thoughts of self-harm need immediate human support. If you might act on them now, move away from anything you could use to hurt yourself, get to another person, and ${contact}.${careLine} You do not have to handle this alone. Are you in immediate danger right now?`;
  }
  return `You reported ${redFlag}. That needs urgent medical assessment. If this is happening now, get emergency medical help or ${contact}; do not wait for this chat.${careLine} Are you with someone who can help you right now?`;
}

function formatDistance(distM?: number): string {
  if (typeof distM !== 'number' || !Number.isFinite(distM)) return '';
  return distM < 1000 ? ` (about ${Math.round(distM)} m away)` : ` (about ${(distM / 1000).toFixed(1)} km away)`;
}

/**
 * Name the nearest mapped hospital and pharmacy. Every phrase says these are
 * mapped places, and that VEEDA has not contacted them — nothing here claims a
 * place is open, able to help, or verified. Returns null when there is no data.
 */
export function nearbyCareLine(nearby: NearbyCare | undefined): string | null {
  if (!nearby) return null;
  const lines: string[] = [];
  const hospital = nearby.hospitals[0];
  const pharmacy = nearby.pharmacies[0];
  if (hospital) {
    lines.push(`the nearest mapped hospital or clinic is ${hospital.name}${formatDistance(hospital.distM)}${hospital.phone ? `, phone ${hospital.phone}` : ''}`);
  }
  if (pharmacy) {
    lines.push(`the nearest mapped pharmacy is ${pharmacy.name}${formatDistance(pharmacy.distM)}${pharmacy.phone ? `, phone ${pharmacy.phone}` : ''}`);
  }
  if (!lines.length) return 'no hospital or pharmacy was found in the current search area';
  return `${lines.join('; ')}. These are mapped places: I have not contacted them and cannot confirm they are open`;
}

function clinicalReply(context: DialogueContext): string {
  if (context.adultScoresAllowed === false) {
    const who = context.subjectLabel ? `${context.subjectLabel}: ` : '';
    return `${who}${CHILD_NOT_VALIDATED_NOTE}. NEWS2 and qSOFA are adult tools, so I will not apply them to this profile. What symptoms or changes have you noticed?`;
  }
  const news2 = context.analysis?.clinicalScores?.news2;
  const qsofa = context.analysis?.clinicalScores?.qsofa;
  const lines: string[] = [];
  if (news2) lines.push(`The available adult NEWS2 is ${news2.total}. ${news2.urgency?.action ?? 'Use the local clinical protocol for interpretation.'}`);
  else lines.push('NEWS2 is pending complete observations, so I will not guess a score.');
  if (qsofa) lines.push(`The available adult qSOFA is ${qsofa.total}${qsofa.sepsisRiskFlag ? ', which is a trigger for further assessment—not a sepsis diagnosis.' : '.'}`);
  if (!context.analysis) lines.push('There is no current clinical analysis available on this device.');
  lines.push('What symptoms or changes would you like to understand alongside these results?');
  return lines.join('\n');
}

function vitalsReply(text: string, context: DialogueContext): string {
  const { vitals } = context;
  if (/heart|pulse|bpm/i.test(text)) {
    return vitals.heartRate == null
      ? 'I do not have a recorded heart rate for this profile. You can measure it in Vitals. Are you feeling palpitations, dizziness, or another symptom?'
      : `The latest recorded heart rate is ${vitals.heartRate} bpm, from the phone-based measurement rather than a medical device. How are you feeling alongside that reading?`;
  }
  if (/breath|respiratory/i.test(text)) {
    return vitals.respiratory == null
      ? 'I do not have a recorded breathing rate yet. You can check it in Vitals. Are you having any trouble breathing right now?'
      : `The latest recorded breathing rate is ${vitals.respiratory} breaths/min, from the phone-based estimate. Are you feeling breathless or otherwise unwell?`;
  }
  if (/oxygen|spo2/i.test(text)) {
    return vitals.oxygen == null
      ? 'There is no SpO2 reading recorded. This phone cannot measure SpO2 in this build. Do you have a reading from a pulse oximeter?'
      : `The recorded SpO2 is ${vitals.oxygen}%, manually entered rather than measured by this phone. Are you having breathing symptoms or other changes?`;
  }
  if (/temp/i.test(text)) {
    return vitals.skinTemp == null
      ? 'There is no temperature recorded. This phone cannot measure your body temperature; you can enter a thermometer reading. Do you feel feverish or have chills?'
      : `The recorded temperature is ${vitals.skinTemp}°C, manually entered rather than measured by this phone. When did you take that reading?`;
  }
  return 'Which reading would you like to review: heart rate, breathing, SpO2, or temperature?';
}

function dateReply(intent: DialogueIntent, now: Date): string {
  const time = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  const date = now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  return intent === 'time'
    ? `It is ${time} on ${date}. How are you feeling right now?`
    : `Today is ${date}. What would you like to talk through today?`;
}

function emotionalReply(state: DialogueState, text: string): { reply: string; question: DialogueQuestion } {
  if (state.pendingQuestion === 'emotionalCause' || (state.currentEvent.emotionalState && !EMOTIONS.some(({ pattern }) => pattern.test(text)))) {
    return { reply: 'Thank you for trusting me with that. We can take this gently, one piece at a time. Would it help more to keep talking about what happened, or to try a short grounding exercise together?', question: 'nextStep' };
  }
  const emotion = state.currentEvent.emotionalState ?? 'overwhelmed';
  return { reply: `I’m sorry you’re feeling ${emotion}. You do not have to minimize it or solve everything at once; I’m here to listen. What has been weighing on you the most today?`, question: 'emotionalCause' };
}

export function converse(previous: DialogueState, rawMessage: string, context: DialogueContext): DialogueResult {
  const text = rawMessage.trim();
  const currentEvent: CurrentEvent = {
    ...previous.currentEvent,
    symptoms: [...previous.currentEvent.symptoms],
    medications: [...previous.currentEvent.medications],
    food: [...previous.currentEvent.food],
    fluids: [...previous.currentEvent.fluids],
    measurements: { ...previous.currentEvent.measurements },
    allergies: [...previous.currentEvent.allergies],
    emergencyContacts: [...previous.currentEvent.emergencyContacts],
  };
  const symptoms = extractSymptoms(text);
  currentEvent.symptoms = unique([...currentEvent.symptoms, ...symptoms]);
  const inSymptomContext = currentEvent.symptoms.length > 0 || ['onset', 'severity', 'course', 'medications', 'allergies', 'fluids'].includes(previous.pendingQuestion ?? '');
  currentEvent.onset = currentEvent.onset ?? (previous.pendingQuestion === 'onset' ? text : inSymptomContext ? extractOnset(text) : null);
  currentEvent.severity = currentEvent.severity ?? (inSymptomContext ? extractSeverity(text, previous.pendingQuestion) : null);
  currentEvent.course = currentEvent.course ?? (inSymptomContext ? extractCourse(text) : null);
  currentEvent.measurements = { ...currentEvent.measurements, ...extractMeasurements(text) };
  const emotion = EMOTIONS.find(({ pattern }) => pattern.test(text));
  if (emotion) currentEvent.emotionalState = emotion.label;
  const daily = extractDaily(text);
  currentEvent.steps = currentEvent.steps ?? daily.steps;
  currentEvent.sleep = currentEvent.sleep ?? daily.sleep;
  currentEvent.activity = currentEvent.activity ?? daily.activity;
  const location = text.match(/\b(?:my\s+location\s+is|i\s+am\s+in|i'?m\s+in)\s+([^,.!?]+)/i);
  if (location) currentEvent.location = location[1].trim();
  const contact = text.match(/\b(?:emergency|trusted)\s+contact\s*(?:is|:)?\s*([^,.!?]+)/i);
  if (contact) currentEvent.emergencyContacts = unique([...currentEvent.emergencyContacts, contact[1].trim()]);

  const hasMeasurement = Object.keys(extractMeasurements(text)).length > 0;
  let intent = detectIntent(text, previous, hasMeasurement, symptoms);
  captureAnswer(currentEvent, text, previous.pendingQuestion, intent);

  const selfHarm = /\b(suicid(?:e|al)|kill\s+myself|end\s+my\s+life|self[-\s]*harm|hurt\s+myself)\b/i.test(text);
  const redFlag = selfHarm ? 'thoughts of suicide or self-harm' : detectRedFlag(text);
  const severe = currentEvent.severity != null && currentEvent.severity >= 8 && (extractSeverity(text, previous.pendingQuestion) != null || previous.currentEvent.redFlag != null);
  let state: DialogueState = { ...previous, currentEvent, lastIntent: intent, turnCount: previous.turnCount + 1, pendingQuestion: null };

  if (redFlag || severe) {
    const label = redFlag ?? 'symptoms rated 8 or higher out of 10';
    currentEvent.redFlag = label;
    currentEvent.riskLevel = 'emergency';
    intent = 'emergency';
    state = withQuestion({ ...state, lastIntent: intent }, { key: 'emergencySupport', text: '' });
    const care = nearbyCareLine(context.nearbyCare);
    const careLine = care ? ` From the map data near you, ${care}.` : '';
    return { state, reply: `${emergencyReply(label, context.emergencyNumber, careLine)}`, intent, urgent: true, providerEligible: false };
  }

  let reply: string;
  let question: { key: DialogueQuestion; text: string } | null = null;
  switch (intent) {
    case 'emergency': {
      const care = nearbyCareLine(context.nearbyCare);
      const careLine = care ? ` From the map data near you, ${care}.` : '';
      reply = `I cannot confirm an emergency from text alone, but I can help you act safely. If you or someone else is in immediate danger, ${context.emergencyNumber ? `call ${context.emergencyNumber}` : 'call your local emergency number'} now.${careLine} What is happening right now?`;
      question = { key: 'nextStep', text: '' };
      break;
    }
    case 'time':
    case 'date':
      reply = dateReply(intent, context.now ?? new Date());
      question = { key: 'nextStep', text: '' };
      break;
    case 'clinical':
      reply = clinicalReply(context);
      question = { key: 'nextStep', text: '' };
      break;
    case 'vitals':
      reply = vitalsReply(text, context);
      question = { key: 'nextStep', text: '' };
      break;
    case 'greeting':
      reply = 'I’m here with you. We can talk about a symptom, your medicines, your mood, or anything affecting your health. How are you feeling right now?';
      question = { key: 'nextStep', text: '' };
      break;
    case 'gratitude':
      reply = 'You’re welcome. I’m still here with you. What would you like to talk through next?';
      question = { key: 'nextStep', text: '' };
      break;
    case 'wellbeing':
      reply = currentEvent.course === 'better' && currentEvent.symptoms.length
        ? 'I’m glad you’re feeling better. Has the improvement lasted, or do the symptoms keep returning?'
        : 'I’m glad you’re feeling okay. Is there anything about your health or how you’re feeling that you would like to check in on?';
      question = { key: 'nextStep', text: '' };
      break;
    case 'emotional': {
      const emotional = emotionalReply(state, text);
      reply = emotional.reply;
      question = { key: emotional.question, text: '' };
      break;
    }
    case 'measurement': {
      const [key] = Object.keys(extractMeasurements(text));
      const labels: Record<string, string> = { heartRate: 'heart rate', bloodPressure: 'blood pressure', spo2: 'SpO2', temperature: 'temperature', glucose: 'glucose' };
      const measurement = currentEvent.measurements[key as keyof CurrentEvent['measurements']];
      reply = `I’ve noted your reported ${labels[key]} of ${measurement?.value} ${measurement?.unit}. I’ll keep that separate from phone measurements. How are you feeling right now?`;
      question = { key: 'nextStep', text: '' };
      break;
    }
    case 'medication': {
      const negative = /^(?:no|none|nothing|not\s+taking\s+any)\b/i.test(text);
      question = currentEvent.symptoms.length ? nextClinicalQuestion(state) : { key: 'course', text: '' };
      const followUp = question?.text || (negative ? 'What else would you like to tell me about how you feel?' : 'Did it help, or are you still feeling the same?');
      reply = negative
        ? `Okay, I’ve noted that you have not reported taking medicine for this. ${followUp}`
        : `I’ve noted the medicine information you shared, without assuming a dose, benefit, or interaction. ${followUp}`;
      break;
    }
    case 'food':
      reply = 'I’ve noted what you ate, without assuming it caused or prevented anything. Did you notice any symptoms begin or worsen after eating?';
      question = { key: 'course', text: '' };
      break;
    case 'daily': {
      const parts: string[] = [];
      if (currentEvent.steps) parts.push(`${currentEvent.steps} steps`);
      if (currentEvent.sleep) parts.push(currentEvent.sleep);
      if (currentEvent.activity) parts.push(currentEvent.activity);
      const goal = currentEvent.steps && context.dailyGoals?.stepGoal
        ? ` I’ve kept your profile goal of ${context.dailyGoals.stepGoal} steps next to that, without judging it.`
        : '';
      reply = `${parts.length ? `I’ve noted ${parts.join(', ')}.` : 'Thank you — that helps me picture your day.'}${goal} How much water have you had, and are you feeling any different from this morning?`;
      question = { key: 'nextStep', text: '' };
      break;
    }
    case 'fluids':
      question = currentEvent.symptoms.length ? nextClinicalQuestion(state) : { key: 'course', text: '' };
      reply = `I’ve noted what you told me about fluids. ${question?.text || 'How are you feeling now compared with earlier?'}`;
      break;
    case 'allergy': {
      question = currentEvent.symptoms.length ? nextClinicalQuestion(state) : { key: 'medications', text: '' };
      const followUp = question?.text || (currentEvent.symptoms.length ? 'Is there anything else about how you feel that you want me to know?' : 'Have you taken any new medicine or treatment today?');
      reply = `I’ve noted your allergy information. ${followUp}`;
      break;
    }
    case 'location': {
      const where = currentEvent.location ?? context.locationLabel ?? null;
      const care = nearbyCareLine(context.nearbyCare);
      if (contact) {
        reply = `I’ve noted ${contact[1].trim()} as the trusted contact you named. I have not contacted them. Are they with you or able to check on you now?`;
      } else if (care) {
        reply = `${where ? `You told me you are in ${where}` : 'I have your device position, but I have not confirmed the place name'}. From the map search near you, ${care}. Is there someone with you who can help if you need it?`;
      } else if (where) {
        reply = `I’ve noted ${where} as the place you told me you are in, but I have no map data for hospitals or pharmacies near it. Is there someone nearby you trust if you need help?`;
      } else {
        reply = 'I do not have a verified place name to tell you where you are. You can allow location access, or share your city or area, and I will look for hospitals and pharmacies near you. What can you see around you right now?';
      }
      question = { key: 'nextStep', text: '' };
      break;
    }
    case 'symptom': {
      const primary = currentEvent.symptoms.at(-1);
      const followUps: Partial<Record<DialogueQuestion, string>> = {
        onset: 'Thank you—that gives me a useful timeline.',
        severity: 'Thank you—that helps me understand how much this is affecting you.',
        course: 'That change is useful to note.',
      };
      const acknowledgment = symptoms.length && primary
        ? `I hear you—the ${primary} matters, and I want to understand it rather than guess at a cause.`
        : followUps[previous.pendingQuestion ?? 'nextStep']
          ?? (primary ? `I’m still with you, and I’m keeping the ${primary} in mind.` : 'I hear that you’re not feeling well. Let’s understand what is happening together.');
      question = nextClinicalQuestion(state);
      reply = `${acknowledgment} ${question?.text ?? 'Is there anything else about it that you have not told me yet?'}`;
      break;
    }
    case 'general':
    default:
      if (currentEvent.emotionalState) {
        const emotional = emotionalReply(state, text);
        reply = emotional.reply;
        question = { key: emotional.question, text: '' };
      } else if (currentEvent.symptoms.length) {
        question = nextClinicalQuestion(state);
        reply = `I’m following you, and I’m keeping your ${currentEvent.symptoms[0]} in mind. ${question?.text ?? 'What else would you like me to understand about what is happening?'}`;
      } else {
        reply = 'I’m listening, and we do not have to rush. Tell me what is on your mind or what you need right now—where would you like to start?';
        question = { key: 'nextStep', text: '' };
      }
      break;
  }

  state = withQuestion({ ...state, currentEvent }, question);
  const providerEligible = ['symptom', 'emotional', 'medication', 'food', 'fluids', 'daily', 'general'].includes(intent);
  return { state, reply, intent, urgent: false, providerEligible };
}
