import { Router } from 'express';
import { calculateNews2, calculateQsofa } from '../clinical-scoring.js';
import { audit } from '../security.js';
const router = Router();

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

  // Consumer-friendly language (no clinical jargon on the home screen)
  res.json({
    riskLevel,
    headline: riskLevel === 'Urgent'
      ? 'Your readings need attention. Please rest and seek help if you feel unwell.'
      : riskLevel === 'Watch'
      ? 'Some readings are outside the usual range. Keep monitoring.'
      : 'Your readings look within a typical range.',
    nurseGreeting: riskLevel === 'Urgent'
      ? 'Please take care and consider contacting a healthcare professional.'
      : riskLevel === 'Watch'
      ? 'A few values are elevated — rest and check again soon.'
      : 'Looking good. Keep tracking your wellness.',
    natureContext: environment.weather
      ? `Outside it is ${environment.outsideTemp ?? '--'}°C and ${environment.weather}.`
      : null,
    supportCheck: missing.size
      ? `Measure more vitals for a fuller picture. Still needed: ${[...missing].join(', ')}.`
      : 'You have a complete set of readings.',
    safetyNotice: riskLevel === 'Urgent' ? 'If you feel chest pain, severe shortness of breath, or confusion, seek emergency care.' : null,
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
