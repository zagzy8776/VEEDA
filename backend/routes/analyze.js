import { Router } from 'express';
const router = Router();

/**
 * NEWS2 (National Early Warning Score 2) Implementation
 * Hospital-grade risk assessment
 */
function calculateNEWS2(vitals) {
  let score = 0;
  const breakdown = {};
  const recommendations = [];
  
  // Respiratory Rate
  if (vitals.respiratory) {
    if (vitals.respiratory <= 8) { breakdown.respiratory = 3; score += 3; }
    else if (vitals.respiratory <= 11) { breakdown.respiratory = 1; score += 1; }
    else if (vitals.respiratory <= 20) { breakdown.respiratory = 0; }
    else if (vitals.respiratory <= 24) { breakdown.respiratory = 2; score += 2; }
    else { breakdown.respiratory = 3; score += 3; }
  }
  
  // SpO2
  if (vitals.oxygen) {
    if (vitals.oxygen <= 91) { 
      breakdown.oxygen = 3; 
      score += 3; 
      recommendations.push('URGENT: Oxygen saturation critically low');
    }
    else if (vitals.oxygen <= 93) { breakdown.oxygen = 2; score += 2; }
    else if (vitals.oxygen <= 95) { breakdown.oxygen = 1; score += 1; }
    else { breakdown.oxygen = 0; }
  }
  
  // Heart Rate
  if (vitals.heartRate) {
    if (vitals.heartRate <= 40) { 
      breakdown.heartRate = 3; 
      score += 3;
      recommendations.push('URGENT: Severe bradycardia');
    }
    else if (vitals.heartRate <= 50) { breakdown.heartRate = 1; score += 1; }
    else if (vitals.heartRate <= 90) { breakdown.heartRate = 0; }
    else if (vitals.heartRate <= 110) { breakdown.heartRate = 1; score += 1; }
    else if (vitals.heartRate <= 130) { breakdown.heartRate = 2; score += 2; }
    else { 
      breakdown.heartRate = 3; 
      score += 3;
      recommendations.push('URGENT: Severe tachycardia');
    }
  }
  
  // Temperature (Celsius)
  if (vitals.skinTemp) {
    if (vitals.skinTemp <= 35.0) { 
      breakdown.temperature = 3; 
      score += 3;
      recommendations.push('URGENT: Hypothermia detected');
    }
    else if (vitals.skinTemp <= 36.0) { breakdown.temperature = 1; score += 1; }
    else if (vitals.skinTemp <= 38.0) { breakdown.temperature = 0; }
    else if (vitals.skinTemp <= 39.0) { breakdown.temperature = 1; score += 1; }
    else { 
      breakdown.temperature = 2; 
      score += 2;
      recommendations.push('Fever detected - monitor for infection');
    }
  }
  
  // Risk level determination
  let riskLevel, headline, emergencyMode, stabilizationSteps;
  
  if (score >= 7 || Object.values(breakdown).some(s => s === 3)) {
    riskLevel = 'Critical';
    headline = '🚨 CRITICAL: Emergency assessment required NOW';
    emergencyMode = true;
    stabilizationSteps = [
      'Call emergency services (911/112) IMMEDIATELY',
      'Keep patient still and comfortable',
      'Monitor breathing continuously',
      'Do not give food or drink',
      'Loosen tight clothing'
    ];
    recommendations.push('Emergency medical attention required within minutes');
  } else if (score >= 5) {
    riskLevel = 'Urgent';
    headline = '⚠️ URGENT: Medical review needed within 1 hour';
    emergencyMode = true;
    stabilizationSteps = [
      'Seek immediate medical attention',
      'Rest in comfortable position',
      'Monitor vitals every 15-30 minutes',
      'Prepare medical history for healthcare provider'
    ];
  } else if (score >= 3) {
    riskLevel = 'Watch';
    headline = '⚠️ Moderate concern: Medical review within 4-6 hours';
    emergencyMode = false;
    stabilizationSteps = [
      'Schedule medical consultation today',
      'Rest and monitor symptoms',
      'Track vital signs every hour',
      'Stay hydrated'
    ];
  } else {
    riskLevel = 'Stable';
    headline = '✓ Vitals within acceptable range';
    emergencyMode = false;
    stabilizationSteps = [
      'Continue normal activity',
      'Maintain hydration',
      'Regular vital monitoring'
    ];
  }
  
  return {
    totalScore: score,
    riskLevel,
    headline,
    breakdown,
    recommendations,
    emergencyMode,
    stabilizationSteps
  };
}

router.post('/analyze', (req, res) => {
  const { vitals = {}, symptoms = [], environment = {}, profile = {} } = req.body;

  // Calculate NEWS2 score
  const news2 = calculateNEWS2(vitals);
  
  // Add environmental context
  const natureContext = environment.weather
    ? `Outside: ${environment.outsideTemp ?? '--'}°C, ${environment.weather}`
    : null;
  
  // Add sepsis check
  let sepsisWarning = null;
  let qSOFAScore = 0;
  if (vitals.respiratory >= 22) qSOFAScore++;
  if (vitals.heartRate > 100 && vitals.skinTemp > 38) qSOFAScore++;
  
  if (qSOFAScore >= 2) {
    sepsisWarning = '🚨 HIGH SEPSIS RISK: Seek immediate medical attention. Sepsis is life-threatening.';
  }

  res.json({
    riskLevel: news2.riskLevel,
    headline: news2.headline,
    news2Score: news2.totalScore,
    scoreBreakdown: news2.breakdown,
    nurseGreeting: `Hi${profile.name ? ' ' + profile.name : ''}, NEWS2 score: ${news2.totalScore}`,
    natureContext,
    supportCheck: news2.emergencyMode 
      ? 'This is an emergency. Seeking medical help immediately is crucial.'
      : 'How are you feeling right now?',
    safetyNotice: sepsisWarning || (news2.emergencyMode ? 'Emergency medical attention required' : null),
    stabilizationSteps: news2.stabilizationSteps,
    warningSigns: [
      'Severe chest pain or pressure',
      'Difficulty breathing or shortness of breath',
      'Sudden confusion or inability to stay awake',
      'Severe headache with stiff neck',
      'Bluish lips or face',
      'Severe abdominal pain'
    ],
    nextAction: news2.emergencyMode 
      ? 'Call emergency services (911/112) now.' 
      : news2.riskLevel === 'Watch'
      ? 'Schedule medical consultation today.'
      : 'Continue monitoring your vitals regularly.',
    emergencyMode: news2.emergencyMode,
    recommendations: news2.recommendations,
    clinicalGuidelines: 'Based on NEWS2 (National Early Warning Score 2) - UK NHS standard'
  });
});

export default router;
