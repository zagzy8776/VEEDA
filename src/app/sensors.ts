import { useRef, useState, useCallback } from 'react';
import { sensorHub } from './sensorHub';
import { NormalizedSensorReading } from './sensorTypes';
import { buildRppgCsv, isRppgResearchEnabled, type RgbSample } from './rppgResearchExport';

// Phone-camera rPPG is an estimate. It is quality-gated and must not be represented
// as a diagnostic/medical-device measurement without external validation.
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

const HR_WINDOW_SECONDS = 30;
const HR_MIN_BPM = 40;
const HR_MAX_BPM = 200;
const HR_CAPTURE_HZ = 30;

type RGB = { r: number; g: number; b: number };

const mean = (xs: number[]) => xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
const std = (xs: number[]) => {
  if (!xs.length) return 0;
  const m = mean(xs);
  return Math.sqrt(mean(xs.map(x => (x - m) ** 2)));
};
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const median = (xs: number[]) => {
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
      const phase = 2 * Math.PI * f * i / sampleRate;
      re += x[i] * w * Math.cos(phase);
      im -= x[i] * w * Math.sin(phase);
    }
    powers.push({ f, p: (re * re + im * im) / Math.max(1, n) });
  }
  if (!powers.length) return { bpm: 0, snrDb: -Infinity, peakPower: 0, peakHz: 0 };
  powers.sort((a, b) => b.p - a.p);
  const peak = powers[0];
  const floor = Math.max(1e-12, median(powers.slice(Math.floor(powers.length * 0.25)).map(p => p.p)));
  return {
    bpm: Math.round(clamp(peak.f * 60, HR_MIN_BPM, HR_MAX_BPM)),
    snrDb: 10 * Math.log10(Math.max(1e-12, peak.p / floor)),
    peakPower: peak.p,
    peakHz: peak.f,
  };
}

function autocorrelationAtPeriod(signal: number[], sampleRate: number, bpm: number) {
  const lag = Math.round(sampleRate * 60 / Math.max(1, bpm));
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
  const normalized = x.map(v => v / sd);
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
    const rr = rgb.slice(start, start + win).map(v => v.r);
    const gg = rgb.slice(start, start + win).map(v => v.g);
    const bb = rgb.slice(start, start + win).map(v => v.b);
    const rm = mean(rr), gm = mean(gg), bm = mean(bb);
    const r = rr.map(v => v / Math.max(1, rm) - 1);
    const g = gg.map(v => v / Math.max(1, gm) - 1);
    const b = bb.map(v => v / Math.max(1, bm) - 1);
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
  return out.map((v, i) => weight[i] > 0 ? v / weight[i] : 0);
}

function robustRppgEstimate(rgb: RGB[], timestampsMs: number[]): HRResult {
  if (rgb.length < 300 || timestampsMs.length !== rgb.length) {
    return { bpm: 0, confidence: 'low', signalQuality: 0, snrDb: -Infinity, sampleRateHz: HR_CAPTURE_HZ, samples: rgb.length };
  }
  const start = timestampsMs[0];
  const end = timestampsMs[timestampsMs.length - 1];
  const duration = Math.max(1, (end - start) / 1000);
  const count = Math.min(1200, Math.floor(duration * HR_CAPTURE_HZ));
  if (count < 300) return { bpm: 0, confidence: 'low', signalQuality: 0, snrDb: -Infinity, sampleRateHz: HR_CAPTURE_HZ, samples: rgb.length };

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

  const rMean = mean(uniform.map(x => x.r));
  const gMean = mean(uniform.map(x => x.g));
  const bMean = mean(uniform.map(x => x.b));
  if (rMean + gMean + bMean < 18) {
    return { bpm: 0, confidence: 'low', signalQuality: 0, snrDb: -Infinity, sampleRateHz: HR_CAPTURE_HZ, samples: uniform.length };
  }

  const pos = posPulse(uniform, HR_CAPTURE_HZ);
  const green = uniform.map(x => x.g / Math.max(1, gMean) - 1);
  const chrom = uniform.map(x => x.r / Math.max(1, rMean) - 1).map((r, i) => 3 * r - 2 * (uniform[i].g / Math.max(1, gMean) - 1));

  const channels = [pos, green, chrom];
  const segmentResults: { bpm: number; quality: number; snrDb: number }[] = [];
  for (const channel of channels) {
    const segmentLength = HR_CAPTURE_HZ * 10;
    const local: { bpm: number; quality: number; snrDb: number }[] = [];
    for (let s = 0; s + segmentLength <= channel.length; s += segmentLength) {
      local.push(estimateSegment(channel.slice(s, s + segmentLength), HR_CAPTURE_HZ));
    }
    const good = local.filter(x => x.bpm > 0 && x.quality >= 0.30);
    if (good.length >= 2) {
      const medBpm = median(good.map(x => x.bpm));
      const agreement = good.filter(x => Math.abs(x.bpm - medBpm) <= 8).length / good.length;
      const best = Math.max(...good.map(x => x.quality));
      segmentResults.push({ bpm: medBpm, quality: clamp(best * (0.5 + 0.5 * agreement), 0, 1), snrDb: median(good.map(x => x.snrDb)) });
    }
  }

  if (!segmentResults.length) {
    return { bpm: 0, confidence: 'low', signalQuality: 0, snrDb: -Infinity, sampleRateHz: HR_CAPTURE_HZ, samples: uniform.length };
  }

  segmentResults.sort((a, b) => b.quality - a.quality);
  const best = segmentResults[0];
  const agreeing = segmentResults.filter(x => Math.abs(x.bpm - best.bpm) <= 8);
  if (agreeing.length < 2) {
    return { bpm: 0, confidence: 'low', signalQuality: best.quality * 0.5, snrDb: best.snrDb, sampleRateHz: HR_CAPTURE_HZ, samples: uniform.length };
  }

  const consensusBpm = Math.round(median(agreeing.map(x => x.bpm)));
  const consensusQuality = median(agreeing.map(x => x.quality));
  const consensusSnr = median(agreeing.map(x => x.snrDb));

  if (!Number.isFinite(consensusSnr) || consensusSnr < 3.5) {
    return { bpm: 0, confidence: 'low', signalQuality: consensusQuality, snrDb: consensusSnr, sampleRateHz: HR_CAPTURE_HZ, samples: uniform.length };
  }
  if (consensusBpm < HR_MIN_BPM || consensusBpm > HR_MAX_BPM) {
    return { bpm: 0, confidence: 'low', signalQuality: consensusQuality, snrDb: consensusSnr, sampleRateHz: HR_CAPTURE_HZ, samples: uniform.length };
  }

  const confidence: HRConfidence =
    consensusQuality >= 0.58 && consensusSnr >= 6 ? 'high' :
    consensusQuality >= 0.38 && consensusSnr >= 3.5 ? 'moderate' :
    'low';

  if (confidence === 'low') {
    return { bpm: 0, confidence, signalQuality: consensusQuality, snrDb: consensusSnr, sampleRateHz: HR_CAPTURE_HZ, samples: uniform.length };
  }

  return {
    bpm: consensusBpm,
    confidence,
    signalQuality: consensusQuality,
    snrDb: consensusSnr,
    sampleRateHz: HR_CAPTURE_HZ,
    samples: uniform.length,
  };
}

export function __testRppg(rgb: RGB[], timestampsMs: number[]) {
  return robustRppgEstimate(rgb, timestampsMs);
}

export function useHeartRate(onResult: (bpm: number, confidence: HRConfidence, quality?: Partial<HRResult>) => void) {
  const [state, setState] = useState<HRState>('idle');
  const [countdown, setCountdown] = useState(HR_WINDOW_SECONDS);
  const [progress, setProgress] = useState(0);
  const [waveform, setWaveform] = useState<number[]>([]);
  const [error, setError] = useState('');
  const [attempts, setAttempts] = useState(0);
  const attemptsRef = useRef(0);
  const streamRef = useRef<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rgbRef = useRef<RGB[]>([]);
  const tsRef = useRef<number[]>([]);
  const frameRef = useRef(0);
  const startTimeRef = useRef(0);
  const lastCaptureRef = useRef(0);

  const stop = useCallback(() => {
    if (frameRef.current) cancelAnimationFrame(frameRef.current);
    const stream = streamRef.current;
    if (stream) {
      const track = stream.getVideoTracks()[0];
      try { track?.applyConstraints({ advanced: [{ torch: false }] } as any).catch(() => {}); } catch {}
      stream.getTracks().forEach(t => t.stop());
    }
    streamRef.current = null;
    if (videoRef.current?.parentNode) videoRef.current.parentNode.removeChild(videoRef.current);
    videoRef.current = null;
  }, []);

  const start = useCallback(async () => {
    setState('requesting'); setError(''); setCountdown(HR_WINDOW_SECONDS); setProgress(0); setWaveform([]);
    rgbRef.current = []; tsRef.current = []; lastCaptureRef.current = 0;
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('MEDIA_UNAVAILABLE');
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 640 },
            height: { ideal: 480 },
            frameRate: { ideal: 30, min: 15 },
          },
          audio: false,
        });
      } catch {
        stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      }
      streamRef.current = stream;
      const track = stream.getVideoTracks()[0];
      try {
        await track.applyConstraints({ advanced: [{ torch: true }] } as any);
      } catch {}

      const video = document.createElement('video');
      video.srcObject = stream;
      video.setAttribute('playsinline', 'true');
      video.setAttribute('webkit-playsinline', 'true');
      video.muted = true;
      video.autoplay = true;
      video.style.position = 'fixed';
      video.style.left = '-10000px';
      video.style.top = '0';
      video.style.width = '320px';
      video.style.height = '240px';
      video.style.opacity = '0.01';
      video.style.pointerEvents = 'none';
      video.style.zIndex = '-1';
      document.body.appendChild(video);
      videoRef.current = video;
      await video.play();
      if (!video.videoWidth || !video.videoHeight) {
        await new Promise<void>(resolve => video.addEventListener('loadedmetadata', () => resolve(), { once: true }));
      }
      await new Promise(r => setTimeout(r, 350));
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth || 640;
      canvas.height = video.videoHeight || 480;
      canvasRef.current = canvas;
      startTimeRef.current = performance.now();
      setState('measuring');

      const captureFrame = () => {
        const v = videoRef.current, c = canvasRef.current;
        if (!v || !c) return;
        const now = performance.now();
        const elapsed = (now - startTimeRef.current) / 1000;
        if (elapsed >= HR_WINDOW_SECONDS) { finish(); return; }
        setProgress(elapsed / HR_WINDOW_SECONDS * 100); setCountdown(Math.max(0, Math.ceil(HR_WINDOW_SECONDS - elapsed)));
        const interval = 1000 / HR_CAPTURE_HZ;
        if (now - lastCaptureRef.current >= interval) {
          lastCaptureRef.current = now;
          const ctx = c.getContext('2d', { willReadFrequently: true });
          if (!ctx) { frameRef.current = requestAnimationFrame(captureFrame); return; }
          const w = v.videoWidth || c.width || 640, h = v.videoHeight || c.height || 480;
          if (c.width !== w) c.width = w; if (c.height !== h) c.height = h;
          ctx.drawImage(v, 0, 0, w, h);
          const side = Math.max(64, Math.round(Math.min(w, h) * 0.30));
          const centers = [[0.50, 0.50], [0.42, 0.50], [0.58, 0.50], [0.50, 0.42], [0.50, 0.58]];
          const rois: RGB[] = [];
          for (const [cx, cy] of centers) {
            const x = clamp(Math.round(w * cx - side / 2), 0, Math.max(0, w - side));
            const y = clamp(Math.round(h * cy - side / 2), 0, Math.max(0, h - side));
            const data = ctx.getImageData(x, y, side, side).data;
            let r = 0, g = 0, b = 0;
            for (let i = 0; i < data.length; i += 4) { r += data[i]; g += data[i + 1]; b += data[i + 2]; }
            const n = data.length / 4;
            rois.push({ r: r / n, g: g / n, b: b / n });
          }
          const chosen: RGB = { r: median(rois.map(x => x.r)), g: median(rois.map(x => x.g)), b: median(rois.map(x => x.b)) };
          const brightness = chosen.r + chosen.g + chosen.b;
          const maxCh = Math.max(chosen.r, chosen.g, chosen.b);
          if (brightness > 12 && maxCh > 6) {
            rgbRef.current.push(chosen);
            tsRef.current.push(now);
            setWaveform(prev => [...prev.slice(-100), chosen.g]);
          }
        }
        frameRef.current = requestAnimationFrame(captureFrame);
      };
      frameRef.current = requestAnimationFrame(captureFrame);
    } catch (e: any) {
      stop(); setState('error');
      setError(e?.name === 'NotAllowedError' ? 'Camera permission denied. Allow camera access for VEEDA and try again.' : e?.name === 'NotReadableError' ? 'The camera is busy or unavailable. Close other camera apps and try again.' : e?.message === 'MEDIA_UNAVAILABLE' ? 'This browser does not support camera access.' : 'Camera could not be started. Check browser permissions and try again.');
    }
  }, [stop]);

  function finish() {
    stop();
    const n = rgbRef.current.length;
    if (n < 180) {
      const failures = attemptsRef.current + 1;
      attemptsRef.current = failures;
      setAttempts(failures);
      setState('error');
      setError(
        failures >= 3
          ? "We couldn't get a reliable reading. If you feel unwell, check your pulse another way or get medical help."
          : 'Camera did not collect enough fingertip signal.\n' +
            '• Use the rear camera and cover the lens fully\n' +
            '• Press gently so the image is not pitch black\n' +
            '• Allow camera permission and keep the screen on\n' +
            '• Hold still for the full 30 seconds\n' +
            `Frames captured: ${n}. VEEDA will not invent a heart rate.`
      );
      return;
    }
    const result = robustRppgEstimate(rgbRef.current, tsRef.current);
    if (result.bpm > 0 && result.confidence !== 'low') {
      attemptsRef.current = 0;
      setAttempts(0);
      setState('done');
      sensorHub.add({
        capabilityId: 'heart_rate_rppg',
        measurementType: 'heart_rate',
        value: result.bpm,
        unit: 'bpm',
        source: 'PHONE_CAMERA',
        timestamp: new Date().toISOString(),
        freshness: 0,
        quality: result.confidence === 'high' ? 'GOOD' : 'FAIR',
        description: `Camera rPPG estimate (${result.confidence})`,
      });
      onResult(result.bpm, result.confidence, result);
    } else {
      const failures = attemptsRef.current + 1;
      attemptsRef.current = failures;
      setAttempts(failures);
      setState('error');
      setError(
        failures >= 3
          ? "We couldn't get a reliable reading. If you feel unwell, check your pulse another way or get medical help."
          : 'Signal quality was too low for a reliable heart rate. Cover the rear lens fully, hold still, and try again.'
      );
    }
  }

  return { state, start, stop, countdown, progress, waveform, error, attempts };
}

export type BreathState = 'idle' | 'requesting' | 'measuring' | 'done' | 'error';

export function useBreathRate(onResult: (rate: number) => void) {
  const [state, setState] = useState<BreathState>('idle');
  const [countdown, setCountdown] = useState(30);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');
  const streamRef = useRef<MediaStream | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const timerRef = useRef<number | null>(null);

  const stop = useCallback(() => {
    if (timerRef.current) window.clearInterval(timerRef.current);
    timerRef.current = null;
    try { ctxRef.current?.close(); } catch {}
    ctxRef.current = null;
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
  }, []);

  const start = useCallback(async () => {
    setState('requesting'); setError(''); setCountdown(30); setProgress(0);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      streamRef.current = stream;
      const ctx = new AudioContext();
      ctxRef.current = ctx;
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;
      source.connect(analyser);
      const data = new Uint8Array(analyser.fftSize);
      const energies: number[] = [];
      const started = performance.now();
      setState('measuring');
      timerRef.current = window.setInterval(() => {
        const elapsed = (performance.now() - started) / 1000;
        setProgress(Math.min(100, (elapsed / 30) * 100));
        setCountdown(Math.max(0, Math.ceil(30 - elapsed)));
        analyser.getByteTimeDomainData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i++) {
          const v = (data[i] - 128) / 128;
          sum += v * v;
        }
        energies.push(Math.sqrt(sum / data.length));
        if (elapsed >= 30) {
          stop();
          // Peak-based breath estimate from mic energy envelope
          const win = Math.max(4, Math.floor(energies.length / 40));
          const smooth: number[] = [];
          for (let i = 0; i < energies.length; i++) {
            const a = Math.max(0, i - win);
            const b = Math.min(energies.length, i + win + 1);
            smooth.push(energies.slice(a, b).reduce((x, y) => x + y, 0) / (b - a));
          }
          let peaks = 0;
          for (let i = 2; i < smooth.length - 2; i++) {
            if (smooth[i] > smooth[i - 1] && smooth[i] > smooth[i + 1] && smooth[i] > 0.02) peaks++;
          }
          const rate = Math.round(clamp(peaks, 6, 40));
          setState('done');
          onResult(rate);
        }
      }, 100);
    } catch (e: any) {
      stop();
      setState('error');
      setError(e?.name === 'NotAllowedError' ? 'Microphone permission denied.' : 'Could not start breath measurement.');
    }
  }, [onResult, stop]);

  return { state, start, stop, countdown, progress, error };
}

export type StepStatus = 'idle' | 'requesting' | 'listening' | 'denied' | 'unsupported' | 'permission_required';

/** Walking step counter — loosened thresholds for mobile Safari pocket/hand use. */
export function useStepCounter(onStep: (total: number) => void, initialTotal = 0) {
  const [status, setStatus] = useState<StepStatus>('idle');
  const stepsRef = useRef(initialTotal);
  const listeningRef = useRef(false);
  const handlerRef = useRef<((e: DeviceMotionEvent) => void) | null>(null);
  const magWindowRef = useRef<number[]>([]);
  const peakTimesRef = useRef<number[]>([]);
  const lastPeakMagRef = useRef(0);
  const lastSampleMagRef = useRef(0);
  const pendingRef = useRef(0);
  const lastCountedPeakRef = useRef(0);

  const start = useCallback(async () => {
    if (listeningRef.current) return;
    if (typeof window === 'undefined' || !('DeviceMotionEvent' in window)) {
      setStatus('unsupported');
      return;
    }
    try {
      const DME = DeviceMotionEvent as typeof DeviceMotionEvent & { requestPermission?: () => Promise<string> };
      if (DME.requestPermission) {
        setStatus('requesting');
        const p = await DME.requestPermission();
        if (p !== 'granted') { setStatus('denied'); return; }
      }
      magWindowRef.current = [];
      peakTimesRef.current = [];
      pendingRef.current = 0;
      lastPeakMagRef.current = 0;
      lastSampleMagRef.current = 0;
      lastCountedPeakRef.current = 0;

      handlerRef.current = (e: DeviceMotionEvent) => {
        if (!listeningRef.current) return;
        const lin = e.acceleration;
        const grav = e.accelerationIncludingGravity;
        let mag = 0;
        if (lin && (lin.x != null || lin.y != null || lin.z != null)) {
          mag = Math.sqrt((lin.x || 0) ** 2 + (lin.y || 0) ** 2 + (lin.z || 0) ** 2);
        } else if (grav) {
          const gMag = Math.sqrt((grav.x || 0) ** 2 + (grav.y || 0) ** 2 + (grav.z || 0) ** 2);
          mag = Math.abs(gMag - 9.81);
        } else return;

        const now = performance.now();
        const prev = lastSampleMagRef.current;
        lastSampleMagRef.current = mag;

        const win = magWindowRef.current;
        win.push(mag);
        if (win.length > 90) win.shift();
        if (win.length < 20) return;

        const mean = win.reduce((a, b) => a + b, 0) / win.length;
        const variance = win.reduce((a, b) => a + (b - mean) ** 2, 0) / win.length;
        const stdev = Math.sqrt(variance);
        if (stdev < 0.35) { pendingRef.current = 0; return; }

        const threshold = Math.max(1.05, mean + 0.95 * stdev);
        const isPeak = prev > threshold && mag < prev && prev >= lastPeakMagRef.current * 0.8;
        if (!isPeak) return;

        if (now - lastCountedPeakRef.current < 320 && lastCountedPeakRef.current > 0) return;
        if (peakTimesRef.current.length && now - peakTimesRef.current[peakTimesRef.current.length - 1] < 320) return;

        lastPeakMagRef.current = prev;
        peakTimesRef.current.push(now);
        if (peakTimesRef.current.length > 6) peakTimesRef.current.shift();

        const times = peakTimesRef.current;
        if (times.length >= 2) {
          const i1 = times[times.length - 1] - times[times.length - 2];
          const i2 = times.length >= 3 ? times[times.length - 2] - times[times.length - 3] : i1;
          const rhythmic =
            i1 >= 350 && i1 <= 1600 &&
            i2 >= 350 && i2 <= 1600 &&
            Math.abs(i1 - i2) < 700;
          if (!rhythmic) { pendingRef.current = 0; return; }

          const toAdd = 1 + pendingRef.current;
          pendingRef.current = 0;
          stepsRef.current += toAdd;
          lastCountedPeakRef.current = now;
          sensorHub.add({
            capabilityId: 'step_counter',
            measurementType: 'step_count',
            value: stepsRef.current,
            unit: 'steps',
            source: 'PHONE_SENSOR',
            timestamp: new Date().toISOString(),
            freshness: 0,
            quality: 'GOOD',
            description: 'Accelerometer-based step count',
          });
          onStep(stepsRef.current);
        } else {
          pendingRef.current = Math.min(2, pendingRef.current + 1);
        }
      };

      listeningRef.current = true;
      window.addEventListener('devicemotion', handlerRef.current, { passive: true });
      setStatus('listening');
    } catch {
      setStatus('permission_required');
    }
  }, [onStep]);

  const stop = useCallback(() => {
    listeningRef.current = false;
    if (handlerRef.current) {
      window.removeEventListener('devicemotion', handlerRef.current);
      handlerRef.current = null;
    }
    setStatus('idle');
  }, []);

  const reset = useCallback(() => {
    stepsRef.current = 0;
    magWindowRef.current = [];
    peakTimesRef.current = [];
    pendingRef.current = 0;
    lastPeakMagRef.current = 0;
    lastSampleMagRef.current = 0;
    lastCountedPeakRef.current = 0;
  }, []);

  return { start, stop, reset, status };
}
