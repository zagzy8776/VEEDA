import { useRef, useState, useCallback } from 'react';

// ─── Heart Rate via Camera rPPG ───────────────────────────────────────────────
export type HRState = 'idle' | 'requesting' | 'measuring' | 'done' | 'error';
export type HRConfidence = 'low' | 'moderate' | 'high';
export interface HRResult { bpm: number; confidence: HRConfidence; signalQuality: number; snrDb: number; sampleRateHz: number; samples: number; }

const HR_WINDOW_SECONDS = 30;
const HR_MIN_BPM = 40;
const HR_MAX_BPM = 200;

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
const std = (xs: number[]) => { const m = mean(xs); return Math.sqrt(mean(xs.map(x => (x - m) ** 2))); };
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

function movingAverage(values: number[], radius: number) {
  const out = new Array(values.length).fill(0);
  let sum = 0; const q: number[] = [];
  for (let i = 0; i < values.length; i++) {
    q.push(values[i]); sum += values[i];
    if (q.length > radius * 2 + 1) sum -= q.shift()!;
    out[i] = sum / q.length;
  }
  return out;
}

function bandpass(values: number[], sampleRate: number, lowHz: number, highHz: number) {
  const fast = Math.max(1, Math.round(sampleRate / (2 * highHz)));
  const slow = Math.max(1, Math.round(sampleRate / (2 * lowHz)));
  const smoothed = movingAverage(values, fast);
  const baseline = movingAverage(smoothed, slow);
  return smoothed.map((v, i) => v - baseline[i]);
}

function spectralEstimate(signal: number[], sampleRate: number) {
  const minHz = HR_MIN_BPM / 60, maxHz = HR_MAX_BPM / 60;
  const stepHz = Math.max(0.025, sampleRate / Math.max(1024, signal.length));
  let bestHz = 0, bestPower = -Infinity, totalPower = 0;
  for (let f = minHz; f <= maxHz; f += stepHz) {
    let re = 0, im = 0;
    for (let i = 0; i < signal.length; i++) {
      const phase = 2 * Math.PI * f * i / sampleRate;
      re += signal[i] * Math.cos(phase); im -= signal[i] * Math.sin(phase);
    }
    const power = (re * re + im * im) / Math.max(1, signal.length);
    totalPower += power;
    if (power > bestPower) { bestPower = power; bestHz = f; }
  }
  const noisePower = Math.max(1e-9, totalPower - bestPower);
  return { bpm: Math.round(clamp(bestHz * 60, HR_MIN_BPM, HR_MAX_BPM)), snrDb: 10 * Math.log10(Math.max(1e-9, bestPower / noisePower)) };
}

function robustRppgEstimate(rgb: { r: number; g: number; b: number }[], timestampsMs: number[]): HRResult {
  if (rgb.length < 300 || timestampsMs.length !== rgb.length) return { bpm: 0, confidence: 'low', signalQuality: 0, snrDb: -Infinity, sampleRateHz: 0, samples: rgb.length };
  const duration = Math.max(1e-3, (timestampsMs[timestampsMs.length - 1] - timestampsMs[0]) / 1000);
  const sampleRateHz = rgb.length / duration;
  if (!Number.isFinite(sampleRateHz) || sampleRateHz < 10 || sampleRateHz > 60) return { bpm: 0, confidence: 'low', signalQuality: 0, snrDb: -Infinity, sampleRateHz, samples: rgb.length };

  const rMean = mean(rgb.map(x => x.r)), gMean = mean(rgb.map(x => x.g)), bMean = mean(rgb.map(x => x.b));
  const eps = 1e-6;
  const r = rgb.map(x => x.r / Math.max(eps, rMean) - 1);
  const g = rgb.map(x => x.g / Math.max(eps, gMean) - 1);
  const b = rgb.map(x => x.b / Math.max(eps, bMean) - 1);
  const xs = r.map((v, i) => 3 * v - 2 * g[i]);
  const ys = r.map((v, i) => 1.5 * v + g[i] - 1.5 * b[i]);
  const sx = std(xs) || 1, sy = std(ys) || 1;
  const pulse = bandpass(xs.map((x, i) => x / sx - ys[i] / sy), sampleRateHz, 0.67, 3.33);
  const signalStd = std(pulse);
  if (!Number.isFinite(signalStd) || signalStd < 1e-5) return { bpm: 0, confidence: 'low', signalQuality: 0, snrDb: -Infinity, sampleRateHz, samples: rgb.length };

  const normalized = pulse.map(v => v / signalStd);
  const { bpm, snrDb } = spectralEstimate(normalized, sampleRateHz);
  const half = Math.floor(normalized.length / 2);
  const first = normalized.slice(0, half), second = normalized.slice(normalized.length - half).reverse();
  let dot = 0, aa = 0, bb = 0;
  for (let i = 0; i < half; i++) { dot += first[i] * second[i]; aa += first[i] ** 2; bb += second[i] ** 2; }
  const stability = clamp(dot / Math.max(1e-9, Math.sqrt(aa * bb)), -1, 1);
  const stabilityScore = (stability + 1) / 2;
  const snrScore = clamp((snrDb + 3) / 12, 0, 1);
  const amplitudeScore = clamp(signalStd * 100, 0, 1);
  const signalQuality = clamp(0.55 * snrScore + 0.30 * stabilityScore + 0.15 * amplitudeScore, 0, 1);
  const confidence: HRConfidence = signalQuality >= 0.70 ? 'high' : signalQuality >= 0.45 ? 'moderate' : 'low';
  if (confidence === 'low' || snrDb < 0) return { bpm: 0, confidence, signalQuality, snrDb, sampleRateHz, samples: rgb.length };
  return { bpm, confidence, signalQuality, snrDb, sampleRateHz, samples: rgb.length };
}

// Exported for deterministic test fixtures. Passing tests is not clinical validation.
export function __testRppg(rgb: { r: number; g: number; b: number }[], timestampsMs: number[]) { return robustRppgEstimate(rgb, timestampsMs); }

export function useHeartRate(onResult: (bpm: number, confidence: HRConfidence, quality?: Partial<HRResult>) => void) {
  const [state, setState] = useState<HRState>('idle');
  const [countdown, setCountdown] = useState(HR_WINDOW_SECONDS);
  const [progress, setProgress] = useState(0);
  const [waveform, setWaveform] = useState<number[]>([]);
  const [error, setError] = useState('');
  const streamRef = useRef<MediaStream | null>(null), videoRef = useRef<HTMLVideoElement | null>(null), canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rgbRef = useRef<{ r: number; g: number; b: number }[]>([]), tsRef = useRef<number[]>([]), frameRef = useRef<number>(0), startTimeRef = useRef<number>(0);

  const stop = useCallback(() => {
    if (frameRef.current) cancelAnimationFrame(frameRef.current);
    streamRef.current?.getTracks().forEach(t => t.stop()); streamRef.current = null;
    if (videoRef.current?.parentNode) videoRef.current.parentNode.removeChild(videoRef.current);
    videoRef.current = null;
  }, []);

  const start = useCallback(async () => {
    setState('requesting'); setError(''); setCountdown(HR_WINDOW_SECONDS); setProgress(0); setWaveform([]); rgbRef.current = []; tsRef.current = [];
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 30 } } });
      streamRef.current = stream;
      const video = document.createElement('video'); video.srcObject = stream; video.setAttribute('playsinline', 'true'); video.muted = true;
      video.style.position = 'fixed'; video.style.opacity = '0'; video.style.pointerEvents = 'none'; video.style.width = '1px'; video.style.height = '1px'; video.style.top = '-9999px'; video.style.left = '-9999px';
      document.body.appendChild(video); videoRef.current = video; await video.play();
      const canvas = document.createElement('canvas'); canvas.width = 640; canvas.height = 480; canvasRef.current = canvas;
      startTimeRef.current = performance.now(); setState('measuring');
      const captureFrame = () => {
        if (!videoRef.current || !canvasRef.current) return;
        const elapsed = (performance.now() - startTimeRef.current) / 1000;
        if (elapsed >= HR_WINDOW_SECONDS) { finish(); return; }
        setProgress((elapsed / HR_WINDOW_SECONDS) * 100); setCountdown(Math.max(0, Math.ceil(HR_WINDOW_SECONDS - elapsed)));
        const ctx = canvasRef.current.getContext('2d', { willReadFrequently: true }); if (!ctx) return;
        ctx.drawImage(videoRef.current, 0, 0, 640, 480);
        const data = ctx.getImageData(250, 170, 140, 140).data;
        let r = 0, g = 0, b = 0;
        for (let i = 0; i < data.length; i += 4) { r += data[i]; g += data[i + 1]; b += data[i + 2]; }
        const n = data.length / 4; rgbRef.current.push({ r: r / n, g: g / n, b: b / n }); tsRef.current.push(performance.now());
        setWaveform(prev => [...prev.slice(-100), g / n]); frameRef.current = requestAnimationFrame(captureFrame);
      };
      frameRef.current = requestAnimationFrame(captureFrame);
    } catch (e: any) { stop(); setState('error'); setError(e?.name === 'NotAllowedError' ? 'Camera permission denied. Please allow camera access.' : 'Camera not available on this device.'); }
  }, [stop]);

  function finish() {
    stop();
    const result = robustRppgEstimate(rgbRef.current, tsRef.current);
    if (result.bpm > 0) { setState('done'); onResult(result.bpm, result.confidence, result); }
    else { setState('error'); setError('Signal quality was insufficient for a reliable heart-rate estimate. Improve lighting, keep the fingertip still, and try again.'); }
  }
  function reset() { setState('idle'); setCountdown(HR_WINDOW_SECONDS); setProgress(0); setWaveform([]); setError(''); }
  return { state, countdown, progress, waveform, error, start, stop, reset };
}

// ─── Breath Rate via Microphone ───────────────────────────────────────────────
export type BRState = 'idle' | 'requesting' | 'measuring' | 'done' | 'error';
export function useBreathRate(onResult: (bpm: number) => void) {
  const [state, setState] = useState<BRState>('idle'), [countdown, setCountdown] = useState(30), [progress, setProgress] = useState(0), [waveform, setWaveform] = useState<number[]>([]), [error, setError] = useState('');
  const streamRef = useRef<MediaStream | null>(null), audioCtxRef = useRef<AudioContext | null>(null), analyserRef = useRef<AnalyserNode | null>(null), samplesRef = useRef<{ t: number; v: number }[]>([]), frameRef = useRef<number>(0), timerRef = useRef<ReturnType<typeof setInterval> | null>(null), startRef = useRef<number>(0);
  const stop = useCallback(() => { if (frameRef.current) cancelAnimationFrame(frameRef.current); if (timerRef.current) clearInterval(timerRef.current); streamRef.current?.getTracks().forEach(t => t.stop()); audioCtxRef.current?.close(); streamRef.current = null; audioCtxRef.current = null; analyserRef.current = null; }, []);
  const start = useCallback(async () => {
    setState('requesting'); setError(''); samplesRef.current = []; setWaveform([]); setCountdown(30); setProgress(0);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true }); streamRef.current = stream; const ctx = new AudioContext(); audioCtxRef.current = ctx; const src = ctx.createMediaStreamSource(stream); const analyser = ctx.createAnalyser(); analyser.fftSize = 1024; analyser.smoothingTimeConstant = 0.8; src.connect(analyser); analyserRef.current = analyser; startRef.current = Date.now(); setState('measuring');
      function capture() { if (!analyserRef.current) return; const elapsed = (Date.now() - startRef.current) / 1000; if (elapsed >= 30) { finish(); return; } setProgress((elapsed / 30) * 100); setCountdown(Math.max(0, Math.ceil(30 - elapsed))); const buf = new Uint8Array(analyserRef.current.fftSize); analyserRef.current.getByteTimeDomainData(buf); let sum = 0; for (let i = 0; i < 128; i++) { const v = (buf[i] - 128) / 128; sum += v * v; } const rms = Math.sqrt(sum / 128); samplesRef.current.push({ t: elapsed * 1000, v: rms }); setWaveform(prev => [...prev.slice(-80), rms * 300]); frameRef.current = requestAnimationFrame(capture); }
      frameRef.current = requestAnimationFrame(capture);
    } catch (e: any) { stop(); setState('error'); setError(e?.name === 'NotAllowedError' ? 'Microphone permission denied. Please allow microphone access.' : 'Microphone not available on this device.'); }
  }, [stop]);
  function finish() { stop(); const bpm = calcBreathRate(samplesRef.current); setState('done'); if (bpm > 0) onResult(bpm); else { setState('error'); setError('Could not detect breathing pattern. Breathe slowly and naturally near the mic.'); } }
  function reset() { setState('idle'); setCountdown(30); setProgress(0); setWaveform([]); setError(''); }
  return { state, countdown, progress, waveform, error, start, stop, reset };
}
function calcBreathRate(samples: { t: number; v: number }[]): number { if (samples.length < 60) return 0; const vals = samples.map(s => s.v); const avg = vals.reduce((a, b) => a + b, 0) / vals.length; const peaks: number[] = []; const minDist = Math.round(samples.length / 40); for (let i = 1; i < vals.length - 1; i++) { if (vals[i] > vals[i - 1] && vals[i] >= vals[i + 1] && vals[i] > avg * 1.2) { if (!peaks.length || i - peaks[peaks.length - 1] >= minDist) peaks.push(i); } } const dur = (samples[samples.length - 1].t - samples[0].t) / 1000; if (dur < 1) return 0; return Math.max(4, Math.min(40, Math.round((peaks.length / dur) * 60))); }

// ─── Step Counter via DeviceMotion ───────────────────────────────────────────
export type StepStatus = 'idle' | 'requesting' | 'listening' | 'permission_required' | 'unsupported' | 'denied';
export function useStepCounter(onStep: (total: number) => void, initialTotal = 0) {
  const [status, setStatus] = useState<StepStatus>('idle'); const stepsRef = useRef(initialTotal); const listeningRef = useRef(false); const accelBufferRef = useRef<number[]>([]); const zAccelRef = useRef<number[]>([]); const stepTimestampsRef = useRef<number[]>([]); const lastStepTimeRef = useRef(0); const walkActiveRef = useRef(false); const walkStepCountRef = useRef(0); const lastWalkTotalRef = useRef(0); const zeroCrossRef = useRef<{ last: number; count: number }>({ last: 0, count: 0 }); const lpFilteredRef = useRef<number | null>(null); const lpZFilteredRef = useRef<number | null>(null);
  const start = useCallback(async () => {
    if (listeningRef.current) return; if (!('DeviceMotionEvent' in window)) { setStatus('unsupported'); return; }
    async function attach() { listeningRef.current = true; accelBufferRef.current = []; zAccelRef.current = []; stepTimestampsRef.current = []; lastStepTimeRef.current = 0; walkActiveRef.current = false; walkStepCountRef.current = 0; lastWalkTotalRef.current = stepsRef.current; zeroCrossRef.current = { last: 0, count: 0 }; lpFilteredRef.current = null; lpZFilteredRef.current = null; window.addEventListener('devicemotion', handleMotion, true); setStatus('listening'); }
    if (typeof (DeviceMotionEvent as any).requestPermission === 'function') { try { setStatus('requesting'); const perm = await (DeviceMotionEvent as any).requestPermission(); if (perm === 'granted') attach(); else setStatus('denied'); } catch { setStatus('permission_required'); } } else attach();
  }, []);
  function handleMotion(e: DeviceMotionEvent) { const a = e.accelerationIncludingGravity; if (!a) return; const ax = a.x || 0, ay = a.y || 0, az = a.z || 0, mag = Math.sqrt(ax * ax + ay * ay + az * az), now = Date.now(); if (lpFilteredRef.current === null) { lpFilteredRef.current = mag; lpZFilteredRef.current = az; return; } const alpha = 0.2; const lpMag = lpFilteredRef.current * (1 - alpha) + mag * alpha; let lpZ = 0; if (lpZFilteredRef.current !== null) { lpZ = lpZFilteredRef.current * (1 - alpha) + az * alpha; lpZFilteredRef.current = lpZ; } lpFilteredRef.current = lpMag; const dynamicMag = mag - lpMag, dynamicZ = lpZFilteredRef.current !== null ? az - lpZ : 0; accelBufferRef.current.push(dynamicMag); zAccelRef.current.push(dynamicZ); if (accelBufferRef.current.length > 100) { accelBufferRef.current.shift(); zAccelRef.current.shift(); } if (zeroCrossRef.current.last !== 0 && zeroCrossRef.current.last > 0 && dynamicZ <= 0) zeroCrossRef.current.count++; zeroCrossRef.current.last = dynamicZ; const buffer = accelBufferRef.current; if (buffer.length < 10) return; const recent = buffer.slice(-20); const recentMean = recent.reduce((s, v) => s + Math.abs(v), 0) / recent.length; const threshold = Math.max(0.5, recentMean * 1.8); const len = buffer.length; const isPeak = buffer[len - 1] > threshold && buffer[len - 1] > buffer[len - 2] && buffer[len - 2] > buffer[len - 3]; if (!isPeak) return; const elapsed = now - lastStepTimeRef.current, isWalkingCadence = elapsed >= 300 && elapsed <= 800; if (lastStepTimeRef.current === 0 || isWalkingCadence) { lastStepTimeRef.current = now; stepTimestampsRef.current.push(now); if (stepTimestampsRef.current.length > 50) stepTimestampsRef.current.shift(); const recentSteps = stepTimestampsRef.current; if (recentSteps.length >= 4) { const last4 = recentSteps.slice(-4); const gaps: number[] = []; for (let i = 1; i < last4.length; i++) gaps.push(last4[i] - last4[i - 1]); const allWalking = gaps.every(g => g >= 300 && g <= 800); if (allWalking) { if (!walkActiveRef.current) { walkActiveRef.current = true; walkStepCountRef.current = 0; lastWalkTotalRef.current = stepsRef.current; } walkStepCountRef.current++; if (walkStepCountRef.current >= 4) { stepsRef.current = lastWalkTotalRef.current + walkStepCountRef.current; onStep(stepsRef.current); } } else { walkActiveRef.current = false; walkStepCountRef.current = 0; } } } else if (elapsed > 2000) { walkActiveRef.current = false; walkStepCountRef.current = 0; } }
  const stop = useCallback(() => { window.removeEventListener('devicemotion', handleMotion, true); listeningRef.current = false; setStatus('idle'); }, []);
  const reset = useCallback(() => { stepsRef.current = 0; accelBufferRef.current = []; zAccelRef.current = []; stepTimestampsRef.current = []; lastStepTimeRef.current = 0; walkActiveRef.current = false; walkStepCountRef.current = 0; lastWalkTotalRef.current = 0; zeroCrossRef.current = { last: 0, count: 0 }; lpFilteredRef.current = null; lpZFilteredRef.current = null; }, []);
  return { start, stop, reset, status };
}
