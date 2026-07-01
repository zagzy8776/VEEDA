import 'dotenv/config';
import sql from '../db.js';

function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function aggregate(values) {
  if (!values.length) return { count: 0, min: null, max: null, mean: null, median: null };
  const sum = values.reduce((a, b) => a + b, 0);
  return {
    count: values.length,
    min: Math.min(...values),
    max: Math.max(...values),
    mean: Number((sum / values.length).toFixed(2)),
    median: Number(median(values).toFixed(2)),
  };
}

function rmssd(rrIntervals) {
  if (rrIntervals.length < 2) return null;
  const diffs = [];
  for (let i = 1; i < rrIntervals.length; i++) diffs.push((rrIntervals[i] - rrIntervals[i - 1]) ** 2);
  return Number(Math.sqrt(diffs.reduce((a, b) => a + b, 0) / diffs.length).toFixed(2));
}

function sustainedSpo2Drop(points) {
  const sorted = points.filter(p => p.value < 92).sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  if (sorted.length < 2) return false;
  let start = new Date(sorted[0].timestamp).getTime();
  let prev = start;
  for (let i = 1; i < sorted.length; i++) {
    const now = new Date(sorted[i].timestamp).getTime();
    if (now - prev > 45000) start = now;
    if (now - start >= 120000) return true;
    prev = now;
  }
  return false;
}

export async function synthesizeWindow({ tenantId, patientId, windowStart, windowEnd }) {
  const { rows } = await sql.query(
    `SELECT timestamp, metric_type, value::float AS value
     FROM raw_biometrics
     WHERE tenant_id = $1 AND patient_id = $2 AND timestamp >= $3 AND timestamp < $4
     ORDER BY timestamp ASC`,
    [tenantId, patientId, windowStart, windowEnd],
  );

  const byMetric = rows.reduce((acc, row) => {
    (acc[row.metric_type] ||= []).push(row);
    return acc;
  }, {});
  const hr = (byMetric.HEART_RATE || []).map(p => p.value);
  const spo2Points = byMetric.SPO2 || [];
  const spo2 = spo2Points.map(p => p.value);
  const resp = (byMetric.RESP_RATE || []).map(p => p.value);
  const rrIntervals = (byMetric.RR_INTERVAL || []).map(p => p.value);
  const rhrCandidates = hr.filter(v => v >= 35 && v <= 120);
  const rhr = rhrCandidates.length ? Number(median(rhrCandidates).toFixed(2)) : null;
  const hrAgg = aggregate(hr);

  const summary = {
    schemaVersion: 1,
    tenantId,
    patientId,
    window: { start: windowStart, end: windowEnd, hours: 4 },
    baselines: {
      restingHeartRate: rhr,
      meanSpo2: aggregate(spo2).mean,
      meanRespiratoryRate: aggregate(resp).mean,
    },
    variability: {
      rmssdMs: rmssd(rrIntervals),
      rrIntervalCount: rrIntervals.length,
    },
    aggregates: {
      heartRate: hrAgg,
      spo2: aggregate(spo2),
      respiratoryRate: aggregate(resp),
    },
    anomalies: {
      sustainedSpo2Below92ForTwoMinutes: sustainedSpo2Drop(spo2Points),
      restingHeartRateSpike: rhr !== null && hrAgg.max !== null ? hrAgg.max >= rhr + 30 : false,
    },
    clinicalNarrative: [
      rhr !== null ? `RHR baseline ${rhr} beats/min.` : 'RHR baseline unavailable.',
      spo2.length ? `SpO2 mean ${aggregate(spo2).mean}%, minimum ${aggregate(spo2).min}%.` : 'SpO2 stream unavailable.',
      resp.length ? `Respiratory mean ${aggregate(resp).mean}/min.` : 'Respiratory stream unavailable.',
    ].join(' '),
  };

  await sql.query(
    `INSERT INTO clinical_summaries (tenant_id, patient_id, window_start, window_end, summary)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (tenant_id, patient_id, window_start, window_end)
     DO UPDATE SET summary = EXCLUDED.summary, created_at = NOW()`,
    [tenantId, patientId, windowStart, windowEnd, JSON.stringify(summary)],
  );
  return summary;
}

export async function runSynthesis() {
  const windowEnd = new Date();
  const windowStart = new Date(windowEnd.getTime() - 4 * 60 * 60 * 1000);
  const { rows: patients } = await sql.query(
    `SELECT DISTINCT tenant_id, patient_id
     FROM raw_biometrics
     WHERE timestamp >= $1 AND timestamp < $2`,
    [windowStart.toISOString(), windowEnd.toISOString()],
  );
  const summaries = [];
  for (const patient of patients) {
    summaries.push(await synthesizeWindow({
      tenantId: patient.tenant_id,
      patientId: patient.patient_id,
      windowStart: windowStart.toISOString(),
      windowEnd: windowEnd.toISOString(),
    }));
  }
  return summaries;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const once = process.argv.includes('--once');
  const execute = () => runSynthesis().then(s => console.log(`synthesized ${s.length} patient windows`)).catch(err => {
    console.error(err);
    process.exitCode = 1;
  });
  execute();
  if (!once) setInterval(execute, 4 * 60 * 60 * 1000);
}
