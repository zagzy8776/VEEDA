/**
 * Hospital-Grade Medical Risk Scoring Systems
 * Implements NEWS2 (National Early Warning Score 2) and other clinical scores
 */

export interface Vitals {
  heartRate: number | null;
  respiratory: number | null;
  oxygen: number | null;
  temperature: number | null; // Celsius
  systolicBP?: number | null;
  consciousness?: 'Alert' | 'CVPU' | null; // Alert or Voice/Pain/Unresponsive
  supplementalO2?: boolean;
}

export interface PatientProfile {
  age: number;
  weight: number;
  sex: 'male' | 'female' | 'other';
  chronicConditions?: string[];
}

/**
 * NEWS2 (National Early Warning Score 2)
 * Used in UK NHS and internationally for deterioration detection
 * Score range: 0-20+
 */
export function calculateNEWS2(vitals: Vitals): {
  totalScore: number;
  riskLevel: 'Low' | 'Medium' | 'High' | 'Critical';
  breakdown: Record<string, number>;
  recommendations: string[];
} {
  let score = 0;
  const breakdown: Record<string, number> = {};
  const recommendations: string[] = [];
  
  // Respiratory Rate scoring
  if (vitals.respiratory !== null) {
    if (vitals.respiratory <= 8) {
      breakdown.respiratory = 3;
      score += 3;
    } else if (vitals.respiratory <= 11) {
      breakdown.respiratory = 1;
      score += 1;
    } else if (vitals.respiratory <= 20) {
      breakdown.respiratory = 0;
    } else if (vitals.respiratory <= 24) {
      breakdown.respiratory = 2;
      score += 2;
    } else {
      breakdown.respiratory = 3;
      score += 3;
    }
  }
  
  // SpO2 Scale 2 (for most patients)
  if (vitals.oxygen !== null) {
    if (vitals.oxygen <= 91) {
      breakdown.oxygen = 3;
      score += 3;
      recommendations.push('URGENT: Oxygen saturation critically low - administer oxygen immediately');
    } else if (vitals.oxygen <= 93) {
      breakdown.oxygen = 2;
      score += 2;
      recommendations.push('Low oxygen - consider supplemental oxygen');
    } else if (vitals.oxygen <= 95) {
      breakdown.oxygen = 1;
      score += 1;
    } else {
      breakdown.oxygen = 0;
    }
  }

  
  // Supplemental oxygen
  if (vitals.supplementalO2) {
    breakdown.supplementalO2 = 2;
    score += 2;
  }
  
  // Systolic Blood Pressure
  if (vitals.systolicBP !== null && vitals.systolicBP !== undefined) {
    if (vitals.systolicBP <= 90) {
      breakdown.bloodPressure = 3;
      score += 3;
      recommendations.push('URGENT: Hypotension detected - risk of shock');
    } else if (vitals.systolicBP <= 100) {
      breakdown.bloodPressure = 2;
      score += 2;
    } else if (vitals.systolicBP <= 110) {
      breakdown.bloodPressure = 1;
      score += 1;
    } else if (vitals.systolicBP <= 219) {
      breakdown.bloodPressure = 0;
    } else {
      breakdown.bloodPressure = 3;
      score += 3;
      recommendations.push('URGENT: Severe hypertension - stroke risk');
    }
  }
  
  // Heart Rate
  if (vitals.heartRate !== null) {
    if (vitals.heartRate <= 40) {
      breakdown.heartRate = 3;
      score += 3;
      recommendations.push('URGENT: Severe bradycardia - cardiac assessment needed');
    } else if (vitals.heartRate <= 50) {
      breakdown.heartRate = 1;
      score += 1;
    } else if (vitals.heartRate <= 90) {
      breakdown.heartRate = 0;
    } else if (vitals.heartRate <= 110) {
      breakdown.heartRate = 1;
      score += 1;
    } else if (vitals.heartRate <= 130) {
      breakdown.heartRate = 2;
      score += 2;
    } else {
      breakdown.heartRate = 3;
      score += 3;
      recommendations.push('URGENT: Severe tachycardia - immediate assessment');
    }
  }
  
  // Temperature (Celsius)
  if (vitals.temperature !== null) {
    if (vitals.temperature <= 35.0) {
      breakdown.temperature = 3;
      score += 3;
      recommendations.push('URGENT: Hypothermia - warming measures needed');
    } else if (vitals.temperature <= 36.0) {
      breakdown.temperature = 1;
      score += 1;
    } else if (vitals.temperature <= 38.0) {
      breakdown.temperature = 0;
    } else if (vitals.temperature <= 39.0) {
      breakdown.temperature = 1;
      score += 1;
    } else {
      breakdown.temperature = 2;
      score += 2;
      recommendations.push('Fever detected - monitor for infection');
    }
  }
  
  // Consciousness (AVPU scale)
  if (vitals.consciousness === 'CVPU') {
    breakdown.consciousness = 3;
    score += 3;
    recommendations.push('CRITICAL: Altered consciousness - IMMEDIATE medical attention');
  }
  
  // Determine risk level and recommendations
  let riskLevel: 'Low' | 'Medium' | 'High' | 'Critical' = 'Low';
  
  if (score >= 7 || Object.values(breakdown).some(s => s === 3)) {
    riskLevel = 'Critical';
    recommendations.unshift('🚨 EMERGENCY: Score 7+ or red score - Emergency assessment');
    recommendations.push('Call emergency services (911/112) NOW');
    recommendations.push('Continuous monitoring required');
  } else if (score >= 5) {
    riskLevel = 'High';
    recommendations.unshift('⚠️ URGENT: Score 5-6 - Urgent clinical review within 1 hour');
    recommendations.push('Increase monitoring frequency to every hour');
  } else if (score >= 3) {
    riskLevel = 'Medium';
    recommendations.unshift('⚠️ Moderate Risk: Score 3-4 - Medical review within 4-6 hours');
    recommendations.push('Monitor vitals every 4-6 hours');
  } else {
    riskLevel = 'Low';
    recommendations.unshift('✓ Low Risk: Score 0-2 - Continue routine monitoring');
  }
  
  return { totalScore: score, riskLevel, breakdown, recommendations };
}


/**
 * Sepsis Detection (qSOFA - quick Sequential Organ Failure Assessment)
 * Early detection of sepsis can save lives
 */
export function assessSepsisRisk(vitals: Vitals): {
  qSOFAScore: number;
  sepsisRisk: 'Low' | 'Moderate' | 'High';
  warning: string | null;
} {
  let score = 0;
  
  // Respiratory rate >= 22
  if (vitals.respiratory && vitals.respiratory >= 22) score += 1;
  
  // Altered mentation
  if (vitals.consciousness === 'CVPU') score += 1;
  
  // Systolic BP <= 100
  if (vitals.systolicBP && vitals.systolicBP <= 100) score += 1;
  
  let sepsisRisk: 'Low' | 'Moderate' | 'High' = 'Low';
  let warning: string | null = null;
  
  if (score >= 2) {
    sepsisRisk = 'High';
    warning = '🚨 HIGH SEPSIS RISK (qSOFA ≥2): Seek immediate medical attention. Sepsis is life-threatening.';
  } else if (score === 1) {
    sepsisRisk = 'Moderate';
    warning = '⚠️ Possible sepsis indicators present. Monitor closely and seek medical advice if condition worsens.';
  }
  
  return { qSOFAScore: score, sepsisRisk, warning };
}

/**
 * Age-adjusted vital sign ranges
 * Returns normal ranges based on patient age
 */
export function getAgeAdjustedRanges(age: number): {
  heartRate: { min: number; max: number };
  respiratory: { min: number; max: number };
  systolicBP: { min: number; max: number };
} {
  if (age < 1) {
    return {
      heartRate: { min: 100, max: 160 },
      respiratory: { min: 30, max: 60 },
      systolicBP: { min: 70, max: 100 }
    };
  } else if (age < 3) {
    return {
      heartRate: { min: 90, max: 150 },
      respiratory: { min: 24, max: 40 },
      systolicBP: { min: 80, max: 110 }
    };
  } else if (age < 12) {
    return {
      heartRate: { min: 70, max: 120 },
      respiratory: { min: 18, max: 30 },
      systolicBP: { min: 90, max: 120 }
    };
  } else if (age < 18) {
    return {
      heartRate: { min: 60, max: 100 },
      respiratory: { min: 12, max: 20 },
      systolicBP: { min: 100, max: 130 }
    };
  } else if (age < 65) {
    return {
      heartRate: { min: 60, max: 100 },
      respiratory: { min: 12, max: 20 },
      systolicBP: { min: 90, max: 140 }
    };
  } else {
    return {
      heartRate: { min: 50, max: 90 },
      respiratory: { min: 12, max: 20 },
      systolicBP: { min: 90, max: 150 }
    };
  }
}

/**
 * Comprehensive risk assessment combining multiple scores
 */
export function comprehensiveRiskAssessment(
  vitals: Vitals,
  profile: PatientProfile,
  vitalTrends?: { deteriorating: boolean; timeframe: string }
): {
  news2: ReturnType<typeof calculateNEWS2>;
  sepsis: ReturnType<typeof assessSepsisRisk>;
  overallRisk: 'Low' | 'Medium' | 'High' | 'Critical';
  priorityActions: string[];
  stabilizationSteps: string[];
} {
  const news2 = calculateNEWS2(vitals);
  const sepsis = assessSepsisRisk(vitals);
  
  const priorityActions: string[] = [];
  const stabilizationSteps: string[] = [];
  
  // Determine overall risk
  let overallRisk: 'Low' | 'Medium' | 'High' | 'Critical' = news2.riskLevel;
  
  if (sepsis.sepsisRisk === 'High' || news2.riskLevel === 'Critical') {
    overallRisk = 'Critical';
    priorityActions.push('🚨 CALL EMERGENCY SERVICES (911/112) IMMEDIATELY');
    stabilizationSteps.push('Stay calm and keep patient still');
    stabilizationSteps.push('If conscious, help patient sit upright');
    stabilizationSteps.push('Loosen tight clothing');
    stabilizationSteps.push('Do not give food or drink');
    stabilizationSteps.push('Monitor breathing continuously');
  } else if (vitalTrends?.deteriorating) {
    // Upgrade risk if vitals are deteriorating
    if (overallRisk === 'Low') overallRisk = 'Medium';
    else if (overallRisk === 'Medium') overallRisk = 'High';
    
    priorityActions.push(`⚠️ Vitals deteriorating over ${vitalTrends.timeframe} - seek medical review`);
  }
  
  // Add age-specific considerations
  if (profile.age < 18 || profile.age > 65) {
    priorityActions.push(`Patient is ${profile.age < 18 ? 'pediatric' : 'elderly'} - heightened monitoring needed`);
  }
  
  // Add chronic condition warnings
  if (profile.chronicConditions?.length) {
    priorityActions.push(`Chronic conditions present: ${profile.chronicConditions.join(', ')} - inform healthcare provider`);
  }
  
  return {
    news2,
    sepsis,
    overallRisk,
    priorityActions,
    stabilizationSteps
  };
}
