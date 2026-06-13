import { Router } from 'express';
const router = Router();

router.post('/analyze', (req, res) => {
  const { vitals = {}, symptoms = [], environment = {} } = req.body;

  let riskScore = 0;
  if (vitals.heartRate > 120 || vitals.heartRate < 50) riskScore += 2;
  if (vitals.oxygen < 94) riskScore += 3;
  if (vitals.respiratoryEffort > 24 || vitals.respiratoryEffort < 10) riskScore += 2;
  if (vitals.skinTemp > 38.5 || vitals.skinTemp < 35) riskScore += 2;
  if (symptoms.includes('breathing') || symptoms.includes('fever')) riskScore += 2;

  const riskLevel = riskScore >= 6 ? 'Urgent' : riskScore >= 3 ? 'Watch' : 'Stable';

  res.json({
    riskLevel,
    headline: riskLevel === 'Urgent'
      ? 'Urgent health signals detected — seek care now.'
      : riskLevel === 'Watch'
      ? 'Some vitals need attention. Monitor closely.'
      : 'All vitals within normal range. You are doing well.',
    nurseGreeting: `Hi Zagzy, your current wellness level is ${riskLevel.toLowerCase()}.`,
    natureContext: environment.weather
      ? `Outside it is ${environment.outsideTemp ?? '--'}°C and ${environment.weather}.`
      : null,
    supportCheck: 'How are you feeling right now?',
    safetyNotice: riskLevel === 'Urgent' ? 'Please contact emergency services if symptoms worsen.' : null,
    stabilizationSteps: riskLevel !== 'Stable' ? ['Sit or lie down', 'Breathe slowly', 'Drink water'] : [],
    warningSigns: ['Chest pain', 'Difficulty breathing', 'Confusion'],
    nextAction: riskLevel === 'Urgent' ? 'Call emergency services now.' : 'Continue monitoring your vitals.',
    emergencyMode: riskLevel === 'Urgent',
  });
});

export default router;
