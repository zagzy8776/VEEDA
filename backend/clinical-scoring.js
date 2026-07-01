const RANGES = {
  heartRate: { min: 20, max: 260, unit: 'beats/min' },
  respiratoryRate: { min: 2, max: 80, unit: '/min' },
  oxygenSaturation: { min: 50, max: 100, unit: '%' },
  temperature: { min: 25, max: 45, unit: 'Cel' },
  systolicBp: { min: 40, max: 300, unit: 'mm[Hg]' },
};

function requireNumber(input, key, aliases = []) {
  const raw = [key, ...aliases].map(k => input[k]).find(v => v !== undefined && v !== null);
  if (raw === undefined || raw === null || raw === '') return { value: null, missing: true };
  const value = Number(raw);
  if (!Number.isFinite(value)) throw new Error(`${key} must be numeric`);
  const range = RANGES[key];
  if (range && (value < range.min || value > range.max)) {
    throw new Error(`${key} out of physiological bounds (${range.min}-${range.max} ${range.unit})`);
  }
  return { value, missing: false };
}

function inRange(value, table) {
  const row = table.find(r => value >= r.min && value <= r.max);
  return row.score;
}

function consciousnessScore(value) {
  const normalized = String(value ?? 'alert').toLowerCase();
  if (['alert', 'a', 'normal'].includes(normalized)) return 0;
  if (['voice', 'v', 'pain', 'p', 'unresponsive', 'u', 'confusion', 'new_confusion'].includes(normalized)) return 3;
  throw new Error('consciousness must be one of alert, voice, pain, unresponsive, or new_confusion');
}

export function validateVitals(input = {}) {
  const heartRate = requireNumber(input, 'heartRate');
  const respiratoryRate = requireNumber(input, 'respiratoryRate', ['respiratory', 'respiratoryEffort']);
  const oxygenSaturation = requireNumber(input, 'oxygenSaturation', ['oxygen', 'spo2', 'spO2']);
  const temperature = requireNumber(input, 'temperature', ['skinTemp']);
  const systolicBp = requireNumber(input, 'systolicBp', ['systolicBP', 'systolicBloodPressure']);

  return {
    heartRate,
    respiratoryRate,
    oxygenSaturation,
    temperature,
    systolicBp,
    supplementalOxygen: Boolean(input.supplementalOxygen),
    spo2Scale: input.spo2Scale === 2 ? 2 : 1,
    consciousness: input.consciousness ?? 'alert',
  };
}

export function calculateNews2(input = {}) {
  const v = validateVitals(input);
  const missing = [];
  const components = {};

  if (v.respiratoryRate.missing) missing.push('respiratoryRate');
  else components.respiration = inRange(v.respiratoryRate.value, [
    { min: 2, max: 8, score: 3 },
    { min: 9, max: 11, score: 1 },
    { min: 12, max: 20, score: 0 },
    { min: 21, max: 24, score: 2 },
    { min: 25, max: 80, score: 3 },
  ]);

  if (v.oxygenSaturation.missing) missing.push('oxygenSaturation');
  else if (v.spo2Scale === 2) {
    components.oxygenSaturation = inRange(v.oxygenSaturation.value, [
      { min: 50, max: 83, score: 3 },
      { min: 84, max: 85, score: 2 },
      { min: 86, max: 87, score: 1 },
      { min: 88, max: 92, score: 0 },
      { min: 93, max: 94, score: 1 },
      { min: 95, max: 96, score: 2 },
      { min: 97, max: 100, score: 3 },
    ]);
  } else {
    components.oxygenSaturation = inRange(v.oxygenSaturation.value, [
      { min: 50, max: 91, score: 3 },
      { min: 92, max: 93, score: 2 },
      { min: 94, max: 95, score: 1 },
      { min: 96, max: 100, score: 0 },
    ]);
  }

  components.supplementalOxygen = v.supplementalOxygen ? 2 : 0;

  if (v.temperature.missing) missing.push('temperature');
  else components.temperature = inRange(v.temperature.value, [
    { min: 25, max: 35.0, score: 3 },
    { min: 35.1, max: 36.0, score: 1 },
    { min: 36.1, max: 38.0, score: 0 },
    { min: 38.1, max: 39.0, score: 1 },
    { min: 39.1, max: 45, score: 2 },
  ]);

  if (v.systolicBp.missing) missing.push('systolicBp');
  else components.systolicBp = inRange(v.systolicBp.value, [
    { min: 40, max: 90, score: 3 },
    { min: 91, max: 100, score: 2 },
    { min: 101, max: 110, score: 1 },
    { min: 111, max: 219, score: 0 },
    { min: 220, max: 300, score: 3 },
  ]);

  if (v.heartRate.missing) missing.push('heartRate');
  else components.heartRate = inRange(v.heartRate.value, [
    { min: 20, max: 40, score: 3 },
    { min: 41, max: 50, score: 1 },
    { min: 51, max: 90, score: 0 },
    { min: 91, max: 110, score: 1 },
    { min: 111, max: 130, score: 2 },
    { min: 131, max: 260, score: 3 },
  ]);

  components.consciousness = consciousnessScore(v.consciousness);
  const total = Object.values(components).reduce((sum, value) => sum + value, 0);
  const singleParameterScore = Math.max(...Object.values(components));
  const urgency = news2Urgency(total, singleParameterScore, missing);

  return {
    standard: 'NEWS2',
    total,
    spo2Scale: v.spo2Scale,
    components,
    missing,
    complete: missing.length === 0,
    urgency,
  };
}

export function news2Urgency(total, singleParameterScore, missing = []) {
  if (missing.length) {
    return {
      level: 'Incomplete',
      action: 'Collect missing observations before final NEWS2 escalation.',
      timelineMinutes: null,
    };
  }
  if (total >= 7) {
    return { level: 'High Risk', action: 'Emergency assessment by clinical team or critical care outreach.', timelineMinutes: 0 };
  }
  if (total >= 5 || singleParameterScore === 3) {
    return { level: 'Medium Risk', action: 'Urgent review by clinician with competency in acute illness.', timelineMinutes: 60 };
  }
  if (total >= 1) {
    return { level: 'Low Risk', action: 'Ward-based registered nurse review and frequency adjustment per local protocol.', timelineMinutes: 240 };
  }
  return { level: 'Low Risk', action: 'Continue routine monitoring per care plan.', timelineMinutes: 720 };
}

export function calculateQsofa(input = {}) {
  const v = validateVitals(input);
  const missing = [];
  if (v.respiratoryRate.missing) missing.push('respiratoryRate');
  if (v.systolicBp.missing) missing.push('systolicBp');

  const alteredMentalStatus = Boolean(input.alteredMentalStatus) || consciousnessScore(v.consciousness) === 3;
  const components = {
    respiratoryRate: !v.respiratoryRate.missing && v.respiratoryRate.value >= 22 ? 1 : 0,
    systolicBp: !v.systolicBp.missing && v.systolicBp.value <= 100 ? 1 : 0,
    alteredMentalStatus: alteredMentalStatus ? 1 : 0,
  };
  const total = Object.values(components).reduce((sum, value) => sum + value, 0);
  return {
    standard: 'qSOFA',
    total,
    components,
    missing,
    complete: missing.length === 0,
    sepsisRiskFlag: missing.length === 0 && total >= 2,
    urgency: missing.length
      ? { level: 'Incomplete', action: 'Collect respiratory rate and systolic BP before qSOFA interpretation.', timelineMinutes: null }
      : total >= 2
        ? { level: 'High Risk', action: 'Assess for sepsis and escalate according to sepsis pathway.', timelineMinutes: 0 }
        : { level: 'Low Risk', action: 'Continue clinical monitoring and reassess if condition changes.', timelineMinutes: 240 },
  };
}
