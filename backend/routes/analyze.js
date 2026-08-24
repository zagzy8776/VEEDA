import { Router } from 'express';
import { calculateNews2, calculateQsofa } from '../clinical-scoring.js';
import { audit } from '../security.js';
const router = Router();

router.post('/analyze', async (req, res) => {
  const { vitals = {}, symptoms = [], environment = {}, patient_id } = req.body;

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
    await audit(req, 'ACCESS_DENIED', patient_id || req.actor?.patientId, { action: 'clinical_analysis_validation_failed', error: err.message });
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

  await audit(req, 'READ', patient_id || req.actor?.patientId, {
    action: 'clinical_analysis',
    news2: news2.total,
    qsofa: qsofa.total,
    sensorControl,
  });

  res.json({
    riskLevel,
    headline: riskLevel === 'Urgent'
      ? 'Clinical warning score is elevated. Escalate for clinician review.'
      : riskLevel === 'Watch'
      ? 'Some vitals need attention. Continue monitoring and review clinically.'
      : 'Clinical warning score is currently low.',
    nurseGreeting: `Current VEEDA risk level is ${riskLevel.toLowerCase()}.`,
    natureContext: environment.weather
      ? `Outside it is ${environment.outsideTemp ?? '--'}°C and ${environment.weather}.`
      : null,
    supportCheck: missing.size
      ? `VEEDA is collecting available sensor data. Missing clinical parameters: ${[...missing].join(', ')}.`
      : 'All required NEWS2/qSOFA observations are present.',
    safetyNotice: riskLevel === 'Urgent' ? 'Escalate according to the local clinical protocol.' : null,
    stabilizationSteps: riskLevel !== 'Stable' ? ['Sit or lie down', 'Breathe slowly'] : [],
    warningSigns: ['Chest pain', 'Difficulty breathing', 'Confusion'],
    nextAction: riskLevel === 'Urgent' ? 'Escalate to clinical staff now.' : sensorControl.actions.length ? 'Allow VEEDA to collect available measurements, then review the updated score.' : 'Continue monitoring vitals.',
    emergencyMode: riskLevel === 'Urgent',
    clinicalScores: { news2, qsofa },
    sensorControl,
  });
});

export default router;
