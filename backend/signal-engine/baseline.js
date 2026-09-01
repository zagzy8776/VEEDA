/**
 * VEEDA Signal Engine – Baseline Calculator (v1)
 * Quality-weighted personal baselines from raw_biometrics. Deterministic. No LLM.
 */

import sql from '../db.js';

const WINDOW_HOURS = { '6h': 6, '24h': 24, '7d': 168 };
const MIN_VALID_SAMPLES = { '6h': 4, '24h': 8, '7d': 20 };
const MIN_AVG_QUALITY = 0.35;

const METRIC_ALIASES = {
  HEART_RATE: 'HEART_RATE', heart_rate: 'HEART_RATE', heartRate: 'HEART_RATE',
  RESP_RATE: 'RESP_RATE', breath_rate: 'RESP_RATE', respiratory: 'RESP_RATE', respiratoryRate: 'RESP_RATE',
  SPO2: 'SPO2', oxygen: 'SPO2', oxygenSaturation: 'SPO2', spo2: 'SPO2',
  SYSTOLIC_BP: 'SYSTOLIC_BP', systolic_bp: 'SYSTOLIC_BP', systolicBp: 'SYSTOLIC_BP',
  TEMPERATURE: 'TEMPERATURE', temperature: 'TEMPERATURE', skinTemp: 'TEMPERATURE',
};

function extractQuality(metadata = {}) {
  const score = typeof metadata.signalQuality === 'number'
    ? Math.max(0, Math.min(1, metadata.signalQuality))
    : typeof metadata.quality === 'number' ? Math.max(0, Math.min(1, metadata.quality)) : 0.5;

  let confidence = 'moderate';
  if (metadata.confidence === 'high' || score >= 0.65) confidence = 'high';
  else if (metadata.confidence === 'low' || score < 0.35) confidence = 'low';

  const flags = [];
  if (metadata.motion || metadata.flags?.includes?.('motion')) flags.push('motion');
  if (score < 0.35) flags.push('weak_signal');
  if (metadata.lowLight) flags.push('low_light');

  return {
    score, confidence,
    snrDb: typeof metadata.snrDb === 'number' ? metadata.snrDb : undefined,
    sampleCount: typeof metadata.samples === 'number' ? metadata.samples : undefined,
    source: metadata.source || (metadata.confidence ? 'phone_rppg' : 'unknown'),
    flags: flags.length ? flags : undefined,
  };
}

function computeStats(values, qualities) {
  if (!values.length) return { mean: 0, stdDev: 0, median: 0, sampleCount: 0 };

  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;
  const median = n % 2 === 0 ? (sorted[n / 2 - 1] + sorted[n / 2]) / 2 : sorted[Math.floor(n / 2)];

  const q1 = sorted[Math.floor(n * 0.25)];
  const q3 = sorted[Math.floor(n * 0.75)];
  const iqr = q3 - q1;
  const lower = q1 - 1.5 * iqr;
  const upper = q3 + 1.5 * iqr;

  const filtered = [];
  const filteredQ = [];
  for (let i = 0; i < values.length; i++) {
    if (values[i] >= lower && values[i] <= upper) {
      filtered.push(values[i]);
      filteredQ.push(qualities[i] ?? 0.5);
    }
  }
  if (!filtered.length) {
    filtered.push(...values);
    filteredQ.push(...qualities.map(q => q ?? 0.5));
  }

  let weightSum = 0, weightedSum = 0;
  for (let i = 0; i < filtered.length; i++) {
    const w = Math.max(0.1, filteredQ[i]);
    weightedSum += filtered[i] * w;
    weightSum += w;
  }
  const mean = weightSum > 0 ? weightedSum / weightSum : filtered.reduce((a, b) => a + b, 0) / filtered.length;
  const variance = filtered.reduce((acc, v) => acc + (v - mean) ** 2, 0) / filtered.length;
  const stdDev = Math.sqrt(variance) || 0.0001;

  return { mean, stdDev, median, sampleCount: filtered.length };
}

export async function computeBaseline(patientId, tenantId, metric, window = '24h') {
  const hours = WINDOW_HOURS[window] || 24;
  const minSamples = MIN_VALID_SAMPLES[window] || 8;

  const { rows } = await sql.query(
    `SELECT value::float AS value, metadata, timestamp
     FROM raw_biometrics
     WHERE tenant_id = $1 AND patient_id = $2 AND metric_type = $3
       AND timestamp >= NOW() - ($4 || ' hours')::interval
     ORDER BY timestamp DESC LIMIT 500`,
    [tenantId, patientId, metric, hours]
  );

  const values = [];
  const qualities = [];
  for (const row of rows) {
    const meta = typeof row.metadata === 'string' ? JSON.parse(row.metadata) : (row.metadata || {});
    const q = extractQuality(meta);
    if (q.score < 0.15) continue;
    values.push(Number(row.value));
    qualities.push(q.score);
  }

  const stats = computeStats(values, qualities);
  const avgQuality = qualities.length ? qualities.reduce((a, b) => a + b, 0) / qualities.length : 0;
  const sufficient = stats.sampleCount >= minSamples && avgQuality >= MIN_AVG_QUALITY;

  return {
    patientId, metric, window,
    mean: Number(stats.mean.toFixed(3)),
    stdDev: Number(stats.stdDev.toFixed(3)),
    median: Number(stats.median.toFixed(3)),
    sampleCount: stats.sampleCount,
    minValidSamples: minSamples,
    qualityWeighted: true,
    computedAt: new Date().toISOString(),
    sufficient,
  };
}

export async function computeBaselines(patientId, tenantId, metrics = ['HEART_RATE', 'RESP_RATE', 'SPO2'], windows = ['24h', '7d']) {
  const results = [];
  for (const metric of metrics) {
    for (const window of windows) {
      results.push(await computeBaseline(patientId, tenantId, metric, window));
    }
  }
  return results;
}

export function normalizeMetric(raw) {
  return METRIC_ALIASES[raw] || null;
}
