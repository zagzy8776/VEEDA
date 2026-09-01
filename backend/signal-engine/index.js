/**
 * VEEDA Signal Engine – Public API (v1)
 * Deterministic + statistical. No LLM.
 */

import { computeBaselines, computeBaseline, normalizeMetric } from './baseline.js';
import { buildSignal, computeTrajectory } from './trajectory.js';
import { assessDeterioration, generateAlert } from './rules.js';
import sql from '../db.js';

async function loadLatestObservations(patientId, tenantId, metrics = ['HEART_RATE', 'RESP_RATE', 'SPO2']) {
  const observations = [];
  for (const metric of metrics) {
    const { rows } = await sql.query(
      `SELECT value::float AS value, unit, timestamp, metadata
       FROM raw_biometrics
       WHERE tenant_id = $1 AND patient_id = $2 AND metric_type = $3
       ORDER BY timestamp DESC LIMIT 1`,
      [tenantId, patientId, metric]
    );
    if (rows.length === 0) continue;
    const row = rows[0];
    const meta = typeof row.metadata === 'string' ? JSON.parse(row.metadata) : (row.metadata || {});
    observations.push({
      patientId, tenantId, metric,
      value: Number(row.value),
      unit: row.unit,
      timestamp: row.timestamp,
      quality: {
        score: typeof meta.signalQuality === 'number' ? meta.signalQuality : 0.5,
        confidence: meta.confidence || 'moderate',
        snrDb: meta.snrDb,
        sampleCount: meta.samples,
        source: meta.source || 'phone_rppg',
        flags: meta.flags,
      },
      metadata: meta,
    });
  }
  return observations;
}

export async function runSignalEngine(patientId, tenantId, options = {}) {
  const { latestObservations: injectedObs, vitalsInput = {}, generateAlertIfNeeded = true } = options;

  const observations = injectedObs?.length ? injectedObs : await loadLatestObservations(patientId, tenantId);

  const baselines = await computeBaselines(patientId, tenantId, observations.map(o => o.metric), ['24h']);
  const baselineMap = new Map();
  for (const b of baselines) baselineMap.set(b.metric, b);

  const signals = [];
  for (const obs of observations) {
    const signal = buildSignal(obs, baselineMap.get(obs.metric));
    if (signal) signals.push(signal);
  }

  const trajectory = computeTrajectory(patientId, '24h', signals);

  const scoringInput = { ...vitalsInput };
  for (const obs of observations) {
    if (obs.metric === 'HEART_RATE') scoringInput.heartRate = obs.value;
    if (obs.metric === 'RESP_RATE') scoringInput.respiratoryRate = obs.value;
    if (obs.metric === 'SPO2') scoringInput.oxygenSaturation = obs.value;
  }

  const assessment = assessDeterioration(patientId, tenantId, trajectory, scoringInput);
  const alert = generateAlertIfNeeded ? generateAlert(assessment) : null;

  return { assessment, alert };
}

export {
  computeBaselines, computeBaseline, normalizeMetric,
  buildSignal, computeTrajectory,
  assessDeterioration, generateAlert,
};
