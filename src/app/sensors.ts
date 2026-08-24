import { useRef, useState, useCallback } from 'react';

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

function hann(n: number) {
  return n <= 1 ? 1 : 0.5 * (1 - Math.cos((2 * Math.PI * 0) / (n - 1)));
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

// POS-style chrominance projection. It is applied over short overlapping windows
// so slow illumination changes do not dominate the pulse component.
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

  // The camera callback is not uniformly timed on mobile browsers. Resample the
  // captured RGB sequence onto a fixed 30 Hz grid before doing frequency analysis.
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
  if (rMean < 12 || gMean < 12 || bMean < 12) return { bpm: 0, confidence: 'low', signalQuality: 0, snrDb: -Infinity, sampleRateHz: HR_CAPTURE_HZ, samples: uniform.length };

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
    const good = local.filter(x => x.bpm > 0 && x.quality >= 0.25);
    if (good.length >= 2) {
      const medBpm = median(good.map(x => x.bpm));
      const agreement = good.filter(x => Math.abs(x.bpm - medBpm) <= 8).length / good.length;
      const best = Math.max(...good.map(x => x.quality));
      segmentResults.push({ bpm: medBpm, quality: clamp(best * (0.5 + 0.5 * agreement), 0, 1), snrDb: median(good.map(x => x.snrDb)) });
    }
  }

  if (!segmentResults.length) return { bpm: 0, confidence: 'low', signalQuality: 0, snrDb: -Infinity, sampleRateHz: HR_CAPTURE_HZ, samples: uniform.length };
  segmentResults.sort((a, b) => b.quality - a.quality);
  const best = segmentResults[0];
  const confidence: HRConfidence = best.quality >= 0.65 ? 'high' : best.quality >= 0.35 ? 'moderate' : 'low';
  if (confidence === 'low') return { bpm: 0, confidence, signalQuality: best.quality, snrDb: best.snrDb, sampleRateHz: HR_CAPTURE_HZ, samples: uniform.length };
  return { bpm: best.bpm, confidence, signalQuality: best.quality, snrDb: best.snrDb, sampleRateHz: HR_CAPTURE_HZ, samples: uniform.length };
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
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { exact: 'environment' }, width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 30 } }, audio: false });
      } catch {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
      }
      streamRef.current = stream;
      const track = stream.getVideoTracks()[0];
      // Try the torch even when getCapabilities() is incomplete on Safari.
      try { await track?.applyConstraints({ advanced: [{ torch: true }] } as any); } catch {}

      const video = document.createElement('video');
      video.srcObject = stream; video.setAttribute('playsinline', 'true'); video.muted = true; video.autoplay = true;
      video.style.position = 'fixed'; video.style.opacity = '0'; video.style.pointerEvents = 'none'; video.style.width = '1px'; video.style.height = '1px'; video.style.top = '-9999px'; video.style.left = '-9999px';
      document.body.appendChild(video); videoRef.current = video;
      await video.play();
      if (!video.videoWidth || !video.videoHeight) await new Promise<void>(resolve => video.addEventListener('loadedmetadata', () => resolve(), { once: true }));
      const canvas = document.createElement('canvas'); canvas.width = video.videoWidth || 640; canvas.height = video.videoHeight || 480; canvasRef.current = canvas;
      startTimeRef.current = performance.now(); setState('measuring');

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
          // Do NOT switch ROI from frame to frame. That creates artificial pulses.
          // A per-channel median keeps the aggregate stable when one ROI contains background.
          const chosen: RGB = { r: median(rois.map(x => x.r)), g: median(rois.map(x => x.g)), b: median(rois.map(x => x.b)) };
          if (chosen.r + chosen.g + chosen.b > 35) {
            rgbRef.current.push(chosen); tsRef.current.push(now); setWaveform(prev => [...prev.slice(-100), chosen.g]);
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
    const result = robustRppgEstimate(rgbRef.current, tsRef.current);
    if (result.bpm > 0 && result.confidence !== 'low') { setState('done'); onResult(result.bpm, result.confidence, result); }
    else { setState('error'); setError('The camera captured frames, but VEEDA could not verify a stable pulse pattern. Keep the fingertip covering the rear lens, keep still, and use steady light. VEEDA will not report an unverified heart rate.'); }
  }

  function reset() { stop(); setState('idle'); setCountdown(HR_WINDOW_SECONDS); setProgress(0); setWaveform([]); setError(''); }
  return { state, countdown, progress, waveform, error, start, stop, reset };
}

export type BRState = 'idle' | 'requesting' | 'measuring' | 'done' | 'error';

function calcBreathRate(samples: { t: number; v: number }[]): number {
  if (samples.length < 60) return 0;
  const duration = Math.max(0.001, (samples[samples.length - 1].t - samples[0].t) / 1000);
  const sampleRate = samples.length / duration;
  if (sampleRate < 10) return 0;
  const values = samples.map(s => s.v);
  const filtered = detrend(values);
  const sd = std(filtered);
  if (sd < 1e-6) return 0;
  const normalized = filtered.map(v => v / sd);
  const minHz = 0.10, maxHz = 0.67;
  let bestF = 0, bestP = -Infinity;
  for (let f = minHz; f <= maxHz; f += 0.01) {
    let re = 0, im = 0;
    for (let i = 0; i < normalized.length; i++) { const ph = 2 * Math.PI * f * i / sampleRate; re += normalized[i] * Math.cos(ph); im -= normalized[i] * Math.sin(ph); }
    const p = re * re + im * im;
    if (p > bestP) { bestP = p; bestF = f; }
  }
  const bpm = Math.round(bestF * 60);
  return bpm >= 6 && bpm <= 40 ? bpm : 0;
}

export function useBreathRate(onResult: (bpm: number) => void) {
  const [state, setState] = useState<BRState>('idle');
  const [countdown, setCountdown] = useState(30);
  const [progress, setProgress] = useState(0);
  const [waveform, setWaveform] = useState<number[]>([]);
  const [error, setError] = useState('');
  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const samplesRef = useRef<{ t: number; v: number }[]>([]);
  const frameRef = useRef(0);
  const startRef = useRef(0);

  const stop = useCallback(() => { if (frameRef.current) cancelAnimationFrame(frameRef.current); streamRef.current?.getTracks().forEach(t => t.stop()); audioCtxRef.current?.close().catch(() => {}); streamRef.current = null; audioCtxRef.current = null; analyserRef.current = null; }, []);
  const start = useCallback(async () => {
    setState('requesting'); setError(''); samplesRef.current = []; setWaveform([]); setCountdown(30); setProgress(0);
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('MEDIA_UNAVAILABLE');
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
      streamRef.current = stream; const ctx = new AudioContext(); audioCtxRef.current = ctx; await ctx.resume().catch(() => {});
      const src = ctx.createMediaStreamSource(stream), analyser = ctx.createAnalyser(); analyser.fftSize = 2048; analyser.smoothingTimeConstant = 0.2; src.connect(analyser); analyserRef.current = analyser; startRef.current = performance.now(); setState('measuring');
      const capture = () => { if (!analyserRef.current) return; const elapsed = (performance.now() - startRef.current) / 1000; if (elapsed >= 30) { finish(); return; } setProgress(elapsed / 30 * 100); setCountdown(Math.max(0, Math.ceil(30 - elapsed))); const buf = new Uint8Array(analyserRef.current.fftSize); analyserRef.current.getByteTimeDomainData(buf); let sum = 0; for (const q of buf) { const v = (q - 128) / 128; sum += v * v; } const rms = Math.sqrt(sum / buf.length); samplesRef.current.push({ t: performance.now() - startRef.current, v: rms }); setWaveform(prev => [...prev.slice(-100), rms * 300]); frameRef.current = requestAnimationFrame(capture); }; frameRef.current = requestAnimationFrame(capture);
    } catch (e: any) { stop(); setState('error'); setError(e?.name === 'NotAllowedError' ? 'Microphone permission denied. Please allow microphone access.' : e?.message === 'MEDIA_UNAVAILABLE' ? 'This browser does not support microphone access.' : 'Microphone could not be started. Check browser permissions.'); }
  }, [stop]);
  function finish() { stop(); const bpm = calcBreathRate(samplesRef.current); if (bpm > 0) { setState('done'); onResult(bpm); } else { setState('error'); setError('Microphone is working, but VEEDA could not verify a stable breathing pattern. Keep the phone near your face in a quiet environment and breathe naturally.'); } }
  function reset() { stop(); setState('idle'); setCountdown(30); setProgress(0); setWaveform([]); setError(''); }
  return { state, countdown, progress, waveform, error, start, stop, reset };
}

export type StepStatus = 'idle' | 'requesting' | 'listening' | 'permission_required' | 'unsupported' | 'denied';
export function useStepCounter(onStep: (total: number) => void, initialTotal = 0) {
  const [status, setStatus] = useState<StepStatus>('idle');
  const stepsRef = useRef(initialTotal), listeningRef = useRef(false), lastMagnitudeRef = useRef(0), lastStepTimeRef = useRef(0);
  const handlerRef = useRef<((e: DeviceMotionEvent) => void) | null>(null);
  const start = useCallback(async () => {
    if (listeningRef.current) return;
    if (typeof window === 'undefined' || !('DeviceMotionEvent' in window)) { setStatus('unsupported'); return; }
    try {
      const DME = DeviceMotionEvent as typeof DeviceMotionEvent & { requestPermission?: () => Promise<string> };
      if (DME.requestPermission) { setStatus('requesting'); const p = await DME.requestPermission(); if (p !== 'granted') { setStatus('denied'); return; } }
      handlerRef.current = (e: DeviceMotionEvent) => {
        if (!listeningRef.current) return;
        const a = e.accelerationIncludingGravity; if (!a) return;
        const mag = Math.sqrt((a.x || 0) ** 2 + (a.y || 0) ** 2 + (a.z || 0) ** 2);
        const delta = Math.abs(mag - lastMagnitudeRef.current); lastMagnitudeRef.current = mag;
        const now = Date.now(); if (delta > 1.15 && now - lastStepTimeRef.current > 350) { lastStepTimeRef.current = now; stepsRef.current += 1; onStep(stepsRef.current); }
      };
      listeningRef.current = true; window.addEventListener('devicemotion', handlerRef.current, { passive: true }); setStatus('listening');
    } catch { setStatus('permission_required'); }
  }, [onStep]);
  const stop = useCallback(() => { listeningRef.current = false; if (handlerRef.current) { window.removeEventListener('devicemotion', handlerRef.current); handlerRef.current = null; } setStatus('idle'); }, []);
  const reset = useCallback(() => { stepsRef.current = 0; lastMagnitudeRef.current = 0; lastStepTimeRef.current = 0; }, []);
  return { start, stop, reset, status };
}
