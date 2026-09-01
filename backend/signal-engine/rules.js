/**
 * VEEDA Signal Engine – Clinical Rules + Alert Generator (v1)
 * Pure deterministic rules. Fully explainable. No LLM.
 */

import { randomUUID } from 'crypto';
import { calculateNews2, calculateQsofa } from '../clinical-scoring.js';

function mapSeverity(trajectory, news2, qsofa) {
  if (news2?.urgency?.level === 'High Risk' || (qsofa?.sepsisRiskFlag === true)) {
    return { severity: 'critical', priority: 'URGENT' };
  }
  if (news2?.total >= 5 || news2?.urgency?.level === 'Medium Risk') {
    return { severity: 'high', priority: 'URGENT' };
  }
  if (trajectory.overall === 'worsening' && trajectory.coherent) {
    return { severity: 'high', priority: 'URGENT' };
  }
  if (trajectory.overall === 'worsening') {
    return { severity: 'moderate', priority: 'ATTENTION' };
  }
  if (news2?.total >= 1 || news2?.urgency?.level === 'Low Risk') {
    return { severity: 'low', priority: 'ROUTINE' };
  }
  return { severity: 'low', priority: 'ROUTINE' };
}

function buildReasons(signals, trajectory) {
  const reasons = [];
  for (const s of signals) {
    if (s.magnitude === 'small') continue;
    const dirText = s.direction === 'up' ? 'above' : s.direction === 'down' ? 'below' : 'near';
    const magText = s.magnitude === 'large' ? 'significantly' : 'moderately';
    reasons.push(
      `${s.metric} is ${magText} ${dirText} personal baseline ` +
      `(${s.currentValue} vs ${s.baselineMean.toFixed(1)} ± ${s.baselineStdDev.toFixed(1)}, z=${s.deviation})`
    );
  }
  if (trajectory.coherent) reasons.push('Multiple vital signs are moving in a concerning direction together');
  if (trajectory.overall === 'worsening') reasons.push('Overall trajectory assessed as worsening');
  return reasons;
}

export function assessDeterioration(patientId, tenantId, trajectory, vitalsInput = {}) {
  let news2 = null;
  let qsofa = null;
  try { news2 = calculateNews2(vitalsInput); } catch {}
  try {
    qsofa = calculateQsofa({
      generational: vitalsInput,
      alteredMentalStatus: ['new_confusion', 'voice', 'pain', 'unresponsive'].includes(vitalsInput.consciousness),
      ...vitalsInput,
    });
  } catch {}

  const { severity } = mapSeverity(trajectory, news2, qsofa);
  const reasons = buildReasons(trajectory.signals, trajectory);

  return {
    patientId, tenantId,
    assessedAt: new Date().toISOString(),
    trajectory, severity,
    clinicalScores: {
      news2: news2 ? { total: news2.total, urgency: news2.urgency?.level || 'Unknown' } : undefined,
      qsofa: qsofa ? { total: qsofa.total, sepsisRiskFlag: qsofa.sepsisRiskFlag } : undefined,
    },
    signals: trajectory.signals,
    reasons,
  };
}

export function generateAlert(assessment) {
  const { severity, trajectory, reasons, clinicalScores, signals } = assessment;

  if (severity === 'low' && (!clinicalScores.news2 || clinicalScores.news2.total < 3)) {
    return null;
  }

  const { priority } = mapSeverity(
    trajectory,
    clinicalScores.news2 ? { total: clinicalScores.news2.total, urgency: { level: clinicalScores.news2.urgency } } : null,
    clinicalScores.qsofa || null
  );

  let alertTitle = 'Patient status update';
  let recommended = 'Continue routine monitoring';
  if (priority === 'URGENT') {
    alertTitle = 'Patient deterioration detected';
    recommended = 'Clinician review recommended now';
  } else if (priority === 'ATTENTION') {
    alertTitle = 'Patient requires increased attention';
    recommended = 'Review vitals and clinical context';
  }

  const summaryParts = [];
  if (reasons.length) summaryParts.push(reasons.slice(0, 3).join('. ') + '.');
  if (clinicalScores.news2) summaryParts.push(`NEWS2 score: ${clinicalScores.news2.total} (${clinicalScores.news2.urgency}).`);
  if (clinicalScores.qsofa?.sepsisRiskFlag) summaryParts.push('qSOFA indicates possible sepsis risk.');

  return {
    id: randomUUID(),
    patientId: assessment.patientId,
    tenantId: assessment.tenantId,
    priority,
    alert: alertTitle,
    summary: summaryParts.join(' ') || 'Clinical signals require review.',
    recommendedAttention: recommended,
    supportingSignals: signals.filter(s => s.magnitude !== 'small'),
    clinicalScores,
    trajectory: trajectory.overall,
    createdAt: new Date().toISOString(),
  };
}
