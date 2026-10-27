// Phone-camera rPPG core (quality-gated; not a medical device claim).
export type HRState = 'idle' | 'requesting' | 'measuring' | 'done' | 'error';
export type HRConfidence = 'low' | 'moderate' | 'high';
export interface HRResult {
  bpm: number;
  confidence: HRConfidence;
  signalQuality: number;
  snrDb: number;
  sampleRateHz: number;
  samples: number;
}

export const HR_WINDOW_SECONDS = 30;
export const HR_MIN_BPM = 40;
export const HR_MAX_BPM = 200;
export const HR_CAPTURE_HZ = 30;

type RGB = { r: number; g: number; b: number };

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const std = (xs: number[]) => {
  if (!xs.length) return 0;
  const m = mean(xs);
  return Math.sqrt(mean(xs.map((x) => (x - m) ** 2)));
};
export const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
export const median = (xs: number[]) => {
  if (!xs.length) return 0;
  const a = [...xs].sort((x, y) => x - y);
  return a[Math.floor(a.length / 2)];
};

function detrend(values: number[]) {
  if (values.length < 3) return values.slice();
  const n = values.length;
  let sx = 0, sy = 0, sxx = 0, sxy = 0;
  for (let i = 0; i < n; i++) {
    sx += i; sy += values[i]; sxx += i * i; sxy += i * values[i];
  }
  const den = n * sxx - sx * sx || 1;
  const slope = (n * sxy - sx * sy) / den;
  const intercept = (sy - slope * sx) / n;
  return values.map((v, i) => v - (intercept + slope * i));
}

function periodogram(signal: number[], sampleRate: number) {
  const minHz = HR_MIN_BPM / 60;
  const maxHz = HR_MAX_BPM / 60;
  const x = detrend(signal);
  const sd = std(x);
  if (!Number.isFinite(sd) || sd < 1e-8) return { bpm: 0, snrDb: -Infinity, peakPower: 0, peakHz: 0 };
  const powers: { f: number; p: number }[] = [];
  const n = x.length;
  const stepHz = Math.max(0.01, sampleRate / Math.max(4096, n));
  for (let f = minHz; f <= maxHz; f += stepHz) {
    let re = 0, im = 0;
    for (let i = 0; i < n; i++) {
      const w = 0.5 * (1 - Math.cos((2 * Math.PI * i) / Math.max(1, n - 1)));
      const phase = (2 * Math.PI * f * i) / sampleRate;
      re += x[i] * w * Math.cos(phase);
      im -= x[i] * w * Math.sin(phase);
    }
    powers.push({ f, p: (re * re + im * im) / Math.max(1, n) });
  }
  if (!powers.length) return { bpm: 0, snrDb: -Infinity, peakPower: 0, peakHz: 0 };
  powers.sort((a, b) => b.p - a.p);
  const peak = powers[0];
  const floor = Math.max(1e-12, median(powers.slice(Math.floor(powers.length * 0.25)).map((p) => p.p)));
  return {
    bpm: Math.round(clamp(peak.f * 60, HR_MIN_BPM, HR_MAX_BPM)),
    snrDb: 10 * Math.log10(Math.max(1e-12, peak.p / floor)),
    peakPower: peak.p,
    peakHz: peak.f,
  };
}

function autocorrelationAtPeriod(signal: number[], sampleRate: number, bpm: number) {
  const lag = Math.round((sampleRate * 60) / Math.max(1, bpm));
  if (lag < 2 || lag >= signal.length - 2) return 0;
  let dot = 0, aa = 0, bb = 0;
  for (let i = lag; i < signal.length; i++) {
    const a = signal[i], b = signal[i - lag];
    dot += a * b; aa += a * a; bb += b * b;
  }
  return dot / Math.max(1e-9, Math.sqrt(aa * bb));
}

function estimateSegment(signal: number[], sampleRate: number): { bpm: number; quality: number; snrDb: number } {
  const x = detrend(signal);
  const sd = std(x);
  if (sd < 1e-7) return { bpm: 0, quality: 0, snrDb: -Infinity };
  const normalized = x.map((v) => v / sd);
  const p = periodogram(normalized, sampleRate);
  if (!p.bpm) return { bpm: 0, quality: 0, snrDb: p.snrDb };
  const ac = autocorrelationAtPeriod(normalized, sampleRate, p.bpm);
  const snrScore = clamp((p.snrDb - 3) / 9, 0, 1);
  const acScore = clamp((ac - 0.05) / 0.75, 0, 1);
  return { bpm: p.bpm, quality: clamp(0.65 * snrScore + 0.35 * acScore, 0, 1), snrDb: p.snrDb };
}

function posPulse(rgb: RGB[], sampleRate: number) {
  const n = rgb.length;
  const out = new Array(n).fill(0);
  const weight = new Array(n).fill(0);
  const win = Math.max(24, Math.round(sampleRate * 1.6));
  const hop = Math.max(1, Math.round(win / 2));
  for (let start = 0; start + win <= n; start += hop) {
    const rr = rgb.slice(start, start + win).map((v) => v.r);
    const gg = rgb.slice(start, start + win).map((v) => v.g);
    const bb = rgb.slice(start, start + win).map((v) => v.b);
    const rm = mean(rr), gm = mean(gg), bm = mean(bb);
    const r = rr.map((v) => v / Math.max(1, rm) - 1);
    const g = gg.map((v) => v / Math.max(1, gm) - 1);
    const b = bb.map((v) => v / Math.max(1, bm) - 1);
    const s1 = r.map((v, i) => 3 * v - 2 * g[i]);
    const s2 = r.map((v, i) => 1.5 * v + g[i] - 1.5 * b[i]);
    const a = std(s2) > 1e-8 ? std(s1) / std(s2) : 1;
    const h = s1.map((v, i) => v - a * s2[i]);
    const hs = std(h) || 1;
    for (let i = 0; i < win; i++) {
      const w = 0.5 * (1 - Math.cos((2 * Math.PI * i) / Math.max(1, win - 1)));
      out[start + i] += (h[i] / hs) * w;
      weight[start + i] += w;
    }
  }
  return out.map((v, i) => (weight[i] > 0 ? v / weight[i] : 0));
}

export function robustRppgEstimate(rgb: RGB[], timestampsMs: number[]): HRResult {
  if (rgb.length < 300 || timestampsMs.length !== rgb.length) {
    return { bpm: 0, confidence: 'low', signalQuality: 0, snrDb: -Infinity, sampleRateHz: HR_CAPTURE_HZ, samples: rgb.length };
  }
  const start = timestampsMs[0];
  const end = timestampsMs[timestampsMs.length - 1];
  const duration = Math.max(1, (end - start) / 1000);
  const count = Math.min(1200, Math.floor(duration * HR_CAPTURE_HZ));
  if (count < 300) {
    return { bpm: 0, confidence: 'low', signalQuality: 0, snrDb: -Infinity, sampleRateHz: HR_CAPTURE_HZ, samples: rgb.length };
  }
  const uniform: RGB[] = [];
  let j = 0;
  for (let k = 0; k < count; k++) {
    const target = start + (k * 1000) / HR_CAPTURE_HZ;
    while (j < timestampsMs.length - 2 && timestampsMs[j + 1] < target) j++;
    const t0 = timestampsMs[j], t1 = timestampsMs[Math.min(j + 1, timestampsMs.length - 1)];
    const a = t1 > t0 ? clamp((target - t0) / (t1 - t0), 0, 1) : 0;
    const p = rgb[j], q = rgb[Math.min(j + 1, rgb.length - 1)];
    uniform.push({ r: p.r + (q.r - p.r) * a, g: p.g + (q.g - p.g) * a, b: p.b + (q.b - p.b) * a });
  }
  const rMean = mean(uniform.map((x) => x.r));
  const gMean = mean(uniform.map((x) => x.g));
  const bMean = mean(uniform.map((x) => x.b));
  if (rMean + gMean + bMean < 18) {
    return { bpm: 0, confidence: 'low', signalQuality: 0, snrDb: -Infinity, sampleRateHz: HR_CAPTURE_HZ, samples: uniform.length };
  }
  const pos = posPulse(uniform, HR_CAPTURE_HZ);
  const green = uniform.map((x) => x.g / Math.max(1, gMean) - 1);
  const chrom = uniform.map((x) => x.r / Math.max(1, rMean) - 1).map((r, i) => 3 * r - 2 * (uniform[i].g / Math.max(1, gMean) - 1));
  const channels = [pos, green, chrom];
  const segmentResults: { bpm: number; quality: number; snrDb: number }[] = [];
  for (const channel of channels) {
    const segmentLength = HR_CAPTURE_HZ * 10;
    const local: { bpm: number; quality: number; snrDb: number }[] = [];
    for (let s = 0; s + segmentLength <= channel.length; s += segmentLength) {
      local.push(estimateSegment(channel.slice(s, s + segmentLength), HR_CAPTURE_HZ));
    }
    const good = local.filter((x) => x.bpm > 0 && x.quality >= 0.3);
    if (good.length >= 2) {
      const medBpm = median(good.map((x) => x.bpm));
      const agreement = good.filter((x) => Math.abs(x.bpm - medBpm) <= 8).length / good.length;
      const best = Math.max(...good.map((x) => x.quality));
      segmentResults.push({ bpm: medBpm, quality: clamp(best * (0.5 + 0.5 * agreement), 0, 1), snrDb: median(good.map((x) => x.snrDb)) });
    }
  }
  if (!segmentResults.length) {
    return { bpm: 0, confidence: 'low', signalQuality: 0, snrDb: -Infinity, sampleRateHz: HR_CAPTURE_HZ, samples: uniform.length };
  }
  segmentResults.sort((a, b) => b.quality - a.quality);
  const best = segmentResults[0];
  const agreeing = segmentResults.filter((x) => Math.abs(x.bpm - best.bpm) <= 8);
  if (agreeing.length < 2) {
    return { bpm: 0, confidence: 'low', signalQuality: best.quality * 0.5, snrDb: best.snrDb, sampleRateHz: HR_CAPTURE_HZ, samples: uniform.length };
  }
  const consensusBpm = Math.round(median(agreeing.map((x) => x.bpm)));
  const consensusQuality = median(agreeing.map((x) => x.quality));
  const consensusSnr = median(agreeing.map((x) => x.snrDb));
  if (!Number.isFinite(consensusSnr) || consensusSnr < 3.5) {
    return { bpm: 0, confidence: 'low', signalQuality: consensusQuality, snrDb: consensusSnr, sampleRateHz: HR_CAPTURE_HZ, samples: uniform.length };
  }
  if (consensusBpm < HR_MIN_BPM || consensusBpm > HR_MAX_BPM) {
    return { bpm: 0, confidence: 'low', signalQuality: consensusQuality, snrDb: consensusSnr, sampleRateHz: HR_CAPTURE_HZ, samples: uniform.length };
  }
  const confidence: HRConfidence =
    consensusQuality >= 0.58 && consensusSnr >= 6 ? 'high' :
    consensusQuality >= 0.38 && consensusSnr >= 3.5 ? 'moderate' : 'low';
  if (confidence === 'low') {
    return { bpm: 0, confidence, signalQuality: consensusQuality, snrDb: consensusSnr, sampleRateHz: HR_CAPTURE_HZ, samples: uniform.length };
  }
  return { bpm: consensusBpm, confidence, signalQuality: consensusQuality, snrDb: consensusSnr, sampleRateHz: HR_CAPTURE_HZ, samples: uniform.length };
}

export function __testRppg(rgb: RGB[], timestampsMs: number[]) {
  return robustRppgEstimate(rgb, timestampsMs);
}
