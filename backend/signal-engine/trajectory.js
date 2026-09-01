/**
 * VEEDA Signal Engine – Trajectory & Signal Calculator (v1)
 */

function classifyMagnitude(absZ) {
  if (absZ >= 2.5) return 'large';
  if (absZ >= 1.5) return 'moderate';
  return 'small';
}

function classifyDirection(z) {
  if (z >= 1.0) return 'up';
  if (z <= -1.0) return 'down';
  return 'stable';
}

export function buildSignal(obs, baseline) {
  if (!baseline || !baseline.sufficient) return null;

  const z = (obs.value - baseline.mean) / (baseline.stdDev || 0.0001);
  const absZ = Math.abs(z);
  const measurementConf = obs.quality?.score ?? 0.5;
  const baselineConf = baseline.sufficient ? 0.8 : 0.3;
  const confidence = Number((0.6 * measurementConf + 0.4 * baselineConf).toFixed(3));

  return {
    metric: obs.metric,
    currentValue: obs.value,
    baselineMean: baseline.mean,
    baselineStdDev: baseline.stdDev,
    deviation: Number(z.toFixed(3)),
    direction: classifyDirection(z),
    magnitude: classifyMagnitude(absZ),
    confidence,
    window: baseline.window,
    quality: obs.quality,
  };
}

export function computeTrajectory(patientId, window, signals) {
  if (!signals.length) {
    return { patientId, window, overall: 'insufficient_data', signals: [], coherent: false };
  }

  const concerning = signals.filter(s => {
    if (s.magnitude === 'small') return false;
    if (s.metric === 'SPO2') return s.direction === 'down';
    if (s.metric === 'HEART_RATE' || s.metric === 'RESP_RATE') return s.direction === 'up';
    return s.magnitude === 'large';
  });

  const improving = signals.filter(s => {
    if (s.magnitude === 'small') return false;
    if (s.metric === 'SPO2') return s.direction === 'up';
    if (s.metric === 'HEART_RATE' || s.metric === 'RESP_RATE') return s.direction === 'down';
    return false;
  });

  let overall = 'stable';
  if (concerning.length >= 2) overall = 'worsening';
  else if (concerning.length === 1 && concerning[0].magnitude === 'large') overall = 'worsening';
  else if (improving.length >= 2) overall = 'improving';

  return {
    patientId,
    window,
    overall,
    signals,
    coherent: concerning.length >= 2,
  };
}
