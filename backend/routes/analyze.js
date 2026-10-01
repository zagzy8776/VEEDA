import { Router } from 'express';
import { calculateNews2, calculateQsofa } from '../clinical-scoring.js';
import { audit } from '../security.js';
const router = Router();

// The emergency number is verified configuration, never hard-coded. It is read
// from the environment (same source as the triage route) so the guidance the
// user sees always names the number configured for the deployment region.
const EMERGENCY_NUMBER = process.env.EMERGENCY_NUMBER || null;

/**
 * Plain-language safety line shown when the engine cannot produce a usable
 * evaluation. It must never be blank and must never guess a number: if no
 * verified number is configured we still tell the user to get help.
 */
function safetyFallbackLine() {
  return EMERGENCY_NUMBER
    ? `If you feel very unwell, get medical help now or call ${EMERGENCY_NUMBER}.`
    : 'If you feel very unwell, get medical help now or call your local emergency number.';
}

router.post('/analyze', async (req, res) => {
  const { vitals = {}, symptoms = [], environment = {} } = req.body;

  let news2;
  let qsofa;
  try {
    const clinicalInput = {
      ...vitals,
      alteredMentalStatus: symptoms.includes('confusion') || symptoms.includes('altered_mental_status'),
    };
    news2 = calculateNews2(clinicalInput);
    qsofa = calculateQsofa(clinicalInput);
  } catch (err) {
    await audit(req, 'ACCESS_DENIED', req.user.id);
    return res.status(400).json({ error: err.message });
  }

  let riskLevel = 'Stable';
  if (news2.urgency.level === 'High Risk' || qsofa.sepsisRiskFlag) riskLevel = 'Urgent';
  else if (news2.urgency.level === 'Medium Risk' || news2.total >= 3 || qsofa.total === 1) riskLevel = 'Watch';

  // The engine can only speak when it has a complete set of observations.
  // Until then it must not show a calm "all fine" screen with no safety line:
  // the user gets a plain instruction to seek help instead.
  const evaluated = news2.complete === true;

  const missing = new Set([...(news2.missing || []), ...(qsofa.missing || [])]);
  const sensorControl = {
    mode: riskLevel === 'Urgent' ? 'urgent_review' : 'monitor',
    automaticCollection: ['heartRate', 'respiratoryRate'],
    deviceCollection: [],
    missing: [...missing],
    actions: [],
  };
  if (vitals.heartRate == null) sensorControl.actions.push('collect_heart_rate');
  if (vitals.respiratoryRate == null && vitals.respiratory == null) sensorControl.actions.push('collect_respiratory_rate');
  if (vitals.oxygenSaturation == null && vitals.oxygen == null) sensorControl.deviceCollection.push('SpO2');
  if (vitals.systolicBp == null) sensorControl.deviceCollection.push('systolic_blood_pressure');
  if (vitals.temperature == null && vitals.skinTemp == null) sensorControl.deviceCollection.push('temperature');
  if (riskLevel === 'Urgent') sensorControl.actions.push('escalate_clinician_review');

  await audit(req, 'READ', req.user.id);

  // Consumer-friendly language (no clinical jargon on the home screen).
  // When the engine cannot evaluate (incomplete observations) the headline must
  // say so plainly and the safety line must always tell the user to get help.
  const headline = !evaluated
    ? 'Not enough readings yet. If you feel unwell, get help now.'
    : riskLevel === 'Urgent'
    ? 'Your readings need attention. Please rest and seek help if you feel unwell.'
    : riskLevel === 'Watch'
    ? 'Some readings are outside the usual range. Keep monitoring.'
    : 'Your readings look within a typical range.';
  const nurseGreeting = !evaluated
    ? 'Measure more vitals so we can give you a clear picture.'
    : riskLevel === 'Urgent'
    ? 'Please take care and consider contacting a healthcare professional.'
    : riskLevel === 'Watch'
    ? 'A few values are elevated — rest and check again soon.'
    : 'Looking good. Keep tracking your wellness.';

  res.json({
    riskLevel,
    evaluated,
    headline,
    nurseGreeting,
    natureContext: environment.weather
      ? `Outside it is ${environment.outsideTemp ?? '--'}°C and ${environment.weather}.`
      : null,
    supportCheck: missing.size
      ? `Measure more vitals for a fuller picture. Still needed: ${[...missing].join(', ')}.`
      : 'You have a complete set of readings.',
    // Never null: an emergency line is always on screen. It names the verified
    // emergency number from configuration when one is set.
    safetyNotice: !evaluated
      ? safetyFallbackLine()
      : riskLevel === 'Urgent'
      ? `If you feel chest pain, severe shortness of breath, or confusion, seek emergency care now${EMERGENCY_NUMBER ? ` or call ${EMERGENCY_NUMBER}` : ''}.`
      : safetyFallbackLine(),
    emergencyNumber: EMERGENCY_NUMBER,
    stabilizationSteps: riskLevel !== 'Stable' ? ['Sit or lie down', 'Breathe slowly', 'Drink water if you can'] : [],
    warningSigns: ['Chest pain', 'Difficulty breathing', 'Confusion', 'Fainting'],
    nextAction: riskLevel === 'Urgent'
      ? 'Rest and contact a healthcare professional if symptoms worsen.'
      : sensorControl.actions.length
      ? 'Complete a heart rate or breathing check for a better score.'
      : 'Continue monitoring your vitals.',
    emergencyMode: riskLevel === 'Urgent',
    clinicalScores: { news2, qsofa },
    sensorControl,
  });
});

export default router;
