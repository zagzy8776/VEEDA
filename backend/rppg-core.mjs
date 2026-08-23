export const HR_DEFAULTS = Object.freeze({
  minBpm: 40,
  maxBpm: 200,
  lowHz: 0.67,
  highHz: 3.33,
});

const mean = xs => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
const std = xs => { const m = mean(xs); return Math.sqrt(mean(xs.map(x => (x - m) ** 2))); };
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

function movingAverage(values, radius) {
  const out = new Array(values.length);
  let sum = 0;
  const q = [];
  for (let i = 0; i < values.length; i++) {
    q.push(values[i]); sum += values[i];
    if (q.length > radius * 2 + 1) sum -= q.shift();
    out[i] = sum / q.length;
  }
  return out;
}

function bandpass(values, sampleRate, lowHz, highHz) {
  const fast = Math.max(1, Math.round(sampleRate / (2 * highHz)));
  const slow = Math.max(1, Math.round(sampleRate / (2 * lowHz)));
  const smoothed = movingAverage(values, fast);
  const baseline = movingAverage(smoothed, slow);
  return smoothed.map((v, i) => v - baseline[i]);
}

function robustSpectralEstimate(signal, sampleRate, minBpm, maxBpm) {
  const minHz = minBpm / 60;
  const maxHz = maxBpm / 60;
  const stepHz = Math.max(0.025, sampleRate / Math.max(1024, signal.length));
  let bestHz = 0;
  let bestPower = -Infinity;
  let totalPower = 0;

  for (let f = minHz; f <= maxHz; f += stepHz) {
    let re = 0, im = 0;
    for (let i = 0; i < signal.length; i++) {
      const phase = 2 * Math.PI * f * i / sampleRate;
      re += signal[i] * Math.cos(phase);
      im -= signal[i] * Math.sin(phase);
    }
    const power = (re * re + im * im) / Math.max(1, signal.length);
    totalPower += power;
    if (power > bestPower) { bestPower = power; bestHz = f; }
  }

  const noisePower = Math.max(1e-9, totalPower - bestPower);
  return {
    bpm: Math.round(clamp(bestHz * 60, minBpm, maxBpm)),
    snrDb: 10 * Math.log10(Math.max(1e-9, bestPower / noisePower)),
  };
}

export function estimateRppg(rgb, timestampsMs, options = {}) {
  const cfg = { ...HR_DEFAULTS, ...options };
  if (!Array.isArray(rgb) || !Array.isArray(timestampsMs) || rgb.length < 300 || timestampsMs.length !== rgb.length) {
    return { bpm: 0, confidence: 'low', signalQuality: 0, snrDb: -Infinity, sampleRateHz: 0, samples: rgb?.length || 0 };
  }

  const duration = Math.max(1e-3, (timestampsMs[timestampsMs.length - 1] - timestampsMs[0]) / 1000);
  const sampleRateHz = rgb.length / duration;
  if (!Number.isFinite(sampleRateHz) || sampleRateHz < 10 || sampleRateHz > 60) {
    return { bpm: 0, confidence: 'low', signalQuality: 0, snrDb: -Infinity, sampleRateHz, samples: rgb.length };
  }

  const rMean = mean(rgb.map(x => x.r));
  const gMean = mean(rgb.map(x => x.g));
  const bMean = mean(rgb.map(x => x.b));
  const eps = 1e-6;
  const r = rgb.map(x => x.r / Math.max(eps, rMean) - 1);
  const g = rgb.map(x => x.g / Math.max(eps, gMean) - 1);
  const b = rgb.map(x => x.b / Math.max(eps, bMean) - 1);

  // CHROM-style normalized chrominance projection. This is a model-driven
  // baseline commonly used in rPPG research and is more illumination-robust
  // than a raw green-channel peak detector.
  const xs = r.map((v, i) => 3 * v - 2 * g[i]);
  const ys = r.map((v, i) => 1.5 * v + g[i] - 1.5 * b[i]);
  const sx = std(xs) || 1;
  const sy = std(ys) || 1;
  const pulse = bandpass(xs.map((x, i) => x / sx - ys[i] / sy), sampleRateHz, cfg.lowHz, cfg.highHz);
  const signalStd = std(pulse);
  if (!Number.isFinite(signalStd) || signalStd < 1e-5) {
    return { bpm: 0, confidence: 'low', signalQuality: 0, snrDb: -Infinity, sampleRateHz, samples: rgb.length };
  }

  const normalized = pulse.map(v => v / signalStd);
  const { bpm, snrDb } = robustSpectralEstimate(normalized, sampleRateHz, cfg.minBpm, cfg.maxBpm);
  const half = Math.floor(normalized.length / 2);
  const first = normalized.slice(0, half);
  const second = normalized.slice(normalized.length - half).reverse();
  let dot = 0, aa = 0, bb = 0;
  for (let i = 0; i < half; i++) { dot += first[i] * second[i]; aa += first[i] ** 2; bb += second[i] ** 2; }
  const stability = clamp(dot / Math.max(1e-9, Math.sqrt(aa * bb)), -1, 1);
  const stabilityScore = (stability + 1) / 2;
  const snrScore = clamp((snrDb + 3) / 12, 0, 1);
  const amplitudeScore = clamp(signalStd * 100, 0, 1);
  const signalQuality = clamp(0.55 * snrScore + 0.30 * stabilityScore + 0.15 * amplitudeScore, 0, 1);
  const confidence = signalQuality >= 0.70 ? 'high' : signalQuality >= 0.45 ? 'moderate' : 'low';

  if (confidence === 'low' || snrDb < 0) {
    return { bpm: 0, confidence, signalQuality, snrDb, sampleRateHz, samples: rgb.length };
  }
  return { bpm, confidence, signalQuality, snrDb, sampleRateHz, samples: rgb.length };
}
