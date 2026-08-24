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

type RGB = { r: number; g: number; b: number };

const mean = (xs: number[]) => xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
const std = (xs: number[]) => {
  if (!xs.length) return 0;
  const m = mean(xs);
  return Math.sqrt(mean(xs.map(x => (x - m) ** 2)));
};
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

function movingAverage(values: number[], radius: number) {
  const out = new Array(values.length).fill(0);
  const queue: number[] = [];
  let sum = 0;
  const window = Math.max(1, radius * 2 + 1);
  for (let i = 0; i < values.length; i++) {
    queue.push(values[i]);
    sum += values[i];
    while (queue.length > window) sum -= queue.shift()!;
    out[i] = sum / queue.length;
  }
  return out;
}

function bandpass(values: number[], sampleRate: number, lowHz: number, highHz: number) {
  // Simple causal high/low-pass approximation. This is deliberately conservative;
  // clinical validation must happen against a reference device.
  const fast = Math.max(1, Math.round(sampleRate / (2 * highHz)));
  const slow = Math.max(fast + 1, Math.round(sampleRate / (2 * lowHz)));
  const smoothed = movingAverage(values, fast);
  const baseline = movingAverage(smoothed, slow);
  return smoothed.map((v, i) => v - baseline[i]);
}

function periodogram(signal: number[], sampleRate: number) {
  const minHz = HR_MIN_BPM / 60;
  const maxHz = HR_MAX_BPM / 60;
  const stepHz = Math.max(0.01, sampleRate / Math.max(4096, signal.length));
  const powers: { f: number; p: number }[] = [];

  for (let f = minHz; f <= maxHz; f += stepHz) {
    let re = 0;
    let im = 0;
    for (let i = 0; i < signal.length; i++) {
      const phase = 2 * Math.PI * f * i / sampleRate;
      re += signal[i] * Math.cos(phase);
      im -= signal[i] * Math.sin(phase);
    }
    powers.push({ f, p: (re * re + im * im) / Math.max(1, signal.length) });
  }

  if (!powers.length) return { bpm: 0, snrDb: -Infinity, peakHz: 0, peakPower: 0 };
  powers.sort((a, b) => b.p - a.p);
  const peak = powers[0];
  // Use the median spectral floor rather than total spectral energy. The old
  // total-power denominator made a clean pulse look like a low-SNR signal.
  const floorValues = powers.slice(Math.floor(powers.length * 0.25)).map(x => x.p);
  const floor = Math.max(1e-12, floorValues.sort((a, b) => a - b)[Math.floor(floorValues.length / 2)] || 1e-12);
  return {
    bpm: Math.round(clamp(peak.f * 60, HR_MIN_BPM, HR_MAX_BPM)),
    snrDb: 10 * Math.log10(Math.max(1e-12, peak.p / floor)),
    peakHz: peak.f,
    peakPower: peak.p,
  };
}

function autocorrelationAtPeriod(signal: number[], sampleRate: number, bpm: number) {
  const period = sampleRate * 60 / bpm;
  const lag = Math.round(period);
  if (lag < 2 || lag >= signal.length - 2) return 0;
  let dot = 0;
  let aa = 0;
  let bb = 0;
  for (let i = lag; i < signal.length; i++) {
    const a = signal[i];
    const b = signal[i - lag];
    dot += a * b;
    aa += a * a;
    bb += b * b;
  }
  return dot / Math.max(1e-9, Math.sqrt(aa * bb));
}

function estimateCandidate(signal: number[], sampleRate: number): HRResult {
  const filtered = bandpass(signal.map(v => v - mean(signal)), sampleRate, 0.67, 3.33);
  const sd = std(filtered);
  if (!Number.isFinite(sd) || sd < 1e-7) {
    return { bpm: 0, confidence: 'low', signalQuality: 0, snrDb: -Infinity, sampleRateHz: sampleRate, samples: signal.length };
  }
  const normalized = filtered.map(v => v / sd);
  const spectral = periodogram(normalized, sampleRate);
  if (!spectral.bpm) return { bpm: 0, confidence: 'low', signalQuality: 0, snrDb: -Infinity, sampleRateHz: sampleRate, samples: signal.length };

  const ac = autocorrelationAtPeriod(normalized, sampleRate, spectral.bpm);
  const snrScore = clamp((spectral.snrDb - 2) / 10, 0, 1);
  const acScore = clamp((ac + 0.05) / 0.85, 0, 1);
  const amplitudeScore = clamp(sd * 35, 0, 1);
  const quality = clamp(0.60 * snrScore + 0.30 * acScore + 0.10 * amplitudeScore, 0, 1);
  const confidence: HRConfidence = quality >= 0.72 ? 'high' : quality >= 0.38 ? 'moderate' : 'low';

  return {
    bpm: spectral.bpm,
    confidence,
    signalQuality: quality,
    snrDb: spectral.snrDb,
    sampleRateHz: sampleRate,
    samples: signal.length,
  };
}

function robustRppgEstimate(rgb: RGB[], timestampsMs: number[]): HRResult {
  if (rgb.length < 300 || timestampsMs.length !== rgb.length) {
    return { bpm: 0, confidence: 'low', signalQuality: 0, snrDb: -Infinity, sampleRateHz: 0, samples: rgb.length };
  }

  const duration = Math.max(0.001, (timestampsMs[timestampsMs.length - 1] - timestampsMs[0]) / 1000);
  const sampleRateHz = rgb.length / duration;
  if (!Number.isFinite(sampleRateHz) || sampleRateHz < 12 || sampleRateHz > 120) {
    return { bpm: 0, confidence: 'low', signalQuality: 0, snrDb: -Infinity, sampleRateHz, samples: rgb.length };
  }

  const rMean = mean(rgb.map(x => x.r));
  const gMean = mean(rgb.map(x => x.g));
  const bMean = mean(rgb.map(x => x.b));
  if (rMean < 10 || gMean < 10 || bMean < 10) {
    return { bpm: 0, confidence: 'low', signalQuality: 0, snrDb: -Infinity, sampleRateHz, samples: rgb.length };
  }

  const r = rgb.map(x => x.r / Math.max(1, rMean) - 1);
  const g = rgb.map(x => x.g / Math.max(1, gMean) - 1);
  const b = rgb.map(x => x.b / Math.max(1, bMean) - 1);

  // Evaluate two independent camera channels. Green is often more stable on
  // phones; CHROM provides a second motion/illumination-resistant estimate.
  const green = g;
  const xs = r.map((v, i) => 3 * v - 2 * g[i]);
  const ys = r.map((v, i) => 1.5 * v + g[i] - 1.5 * b[i]);
  const sx = std(xs) || 1;
  const sy = std(ys) || 1;
  const chrom = xs.map((x, i) => x / sx - ys[i] / sy);

  const candidates = [estimateCandidate(green, sampleRateHz), estimateCandidate(chrom, sampleRateHz)]
    .filter(x => x.bpm > 0)
    .sort((a, b) => b.signalQuality - a.signalQuality);

  if (!candidates.length || candidates[0].signalQuality < 0.38) {
    return candidates[0] || { bpm: 0, confidence: 'low', signalQuality: 0, snrDb: -Infinity, sampleRateHz, samples: rgb.length };
  }
  return candidates[0];
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

  const stop = useCallback(() => {
    if (frameRef.current) cancelAnimationFrame(frameRef.current);
    const stream = streamRef.current;
    if (stream) {
      const track = stream.getVideoTracks()[0];
      try {
        const caps = track?.getCapabilities?.() as any;
        if (caps?.torch) track.applyConstraints({ advanced: [{ torch: false }] } as any).catch(() => {});
      } catch {}
      stream.getTracks().forEach(t => t.stop());
    }
    streamRef.current = null;
    if (videoRef.current?.parentNode) videoRef.current.parentNode.removeChild(videoRef.current);
    videoRef.current = null;
  }, []);

  const start = useCallback(async () => {
    setState('requesting');
    setError('');
    setCountdown(HR_WINDOW_SECONDS);
    setProgress(0);
    setWaveform([]);
    rgbRef.current = [];
    tsRef.current = [];

    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('MEDIA_UNAVAILABLE');

      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 30 } },
          audio: false,
        });
      } catch {
        stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      }

      streamRef.current = stream;
      const track = stream.getVideoTracks()[0];
      try {
        const caps = track?.getCapabilities?.() as any;
        if (caps?.torch) await track.applyConstraints({ advanced: [{ torch: true }] } as any);
      } catch {}

      const video = document.createElement('video');
      video.srcObject = stream;
      video.setAttribute('playsinline', 'true');
      video.muted = true;
      video.autoplay = true;
      video.style.position = 'fixed';
      video.style.opacity = '0';
      video.style.pointerEvents = 'none';
      video.style.width = '1px';
      video.style.height = '1px';
      video.style.top = '-9999px';
      video.style.left = '-9999px';
      document.body.appendChild(video);
      videoRef.current = video;
      await video.play();

      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth || 640;
      canvas.height = video.videoHeight || 480;
      canvasRef.current = canvas;
      startTimeRef.current = performance.now();
      setState('measuring');

      const captureFrame = () => {
        const currentVideo = videoRef.current;
        const canvasEl = canvasRef.current;
        if (!currentVideo || !canvasEl) return;
        const elapsed = (performance.now() - startTimeRef.current) / 1000;
        if (elapsed >= HR_WINDOW_SECONDS) {
          finish();
          return;
        }
        setProgress(elapsed / HR_WINDOW_SECONDS * 100);
        setCountdown(Math.max(0, Math.ceil(HR_WINDOW_SECONDS - elapsed)));

        const ctx = canvasEl.getContext('2d', { willReadFrequently: true });
        if (!ctx) return;
        const w = currentVideo.videoWidth || 640;
        const h = currentVideo.videoHeight || 480;
        if (canvasEl.width !== w) canvasEl.width = w;
        if (canvasEl.height !== h) canvasEl.height = h;
        ctx.drawImage(currentVideo, 0, 0, w, h);

        // Sample several overlapping regions. This is much more tolerant of a
        // fingertip being slightly off-centre than a single fixed ROI.
        const side = Math.max(56, Math.round(Math.min(w, h) * 0.24));
        const centers = [
          [0.50, 0.50], [0.36, 0.50], [0.64, 0.50], [0.50, 0.36], [0.50, 0.64],
        ];
        const candidates: RGB[] = [];
        for (const [cx, cy] of centers) {
          const x = clamp(Math.round(w * cx - side / 2), 0, Math.max(0, w - side));
          const y = clamp(Math.round(h * cy - side / 2), 0, Math.max(0, h - side));
          const data = ctx.getImageData(x, y, side, side).data;
          let r = 0, g = 0, b = 0;
          for (let i = 0; i < data.length; i += 4) {
            r += data[i];
            g += data[i + 1];
            b += data[i + 2];
          }
          const n = data.length / 4;
          candidates.push({ r: r / n, g: g / n, b: b / n });
        }

        // Select the most skin-like/bright candidate for this frame. If the
        // fingertip covers the lens, all regions are similar; if it is slightly
        // displaced, this prevents a dark background from poisoning the signal.
        const chosen = candidates
          .map(c => ({ c, score: c.r + c.g + c.b + (c.r > c.g ? 80 : 0) }))
          .sort((a, b) => b.score - a.score)[0]?.c || candidates[0];
        if (chosen) {
          rgbRef.current.push(chosen);
          tsRef.current.push(performance.now());
          setWaveform(prev => [...prev.slice(-100), chosen.g]);
        }
        frameRef.current = requestAnimationFrame(captureFrame);
      };

      frameRef.current = requestAnimationFrame(captureFrame);
    } catch (e: any) {
      stop();
      setState('error');
      setError(
        e?.name === 'NotAllowedError'
          ? 'Camera permission denied. Allow camera access for VEEDA and try again.'
          : e?.name === 'NotReadableError'
            ? 'The camera is busy or unavailable. Close other camera apps and try again.'
            : e?.message === 'MEDIA_UNAVAILABLE'
              ? 'This browser does not support camera access.'
              : 'Camera could not be started. Check browser permissions and try again.'
      );
    }
  }, [stop]);

  function finish() {
    stop();
    const result = robustRppgEstimate(rgbRef.current, tsRef.current);
    if (result.bpm > 0 && result.confidence !== 'low') {
      setState('done');
      onResult(result.bpm, result.confidence, result);
    } else {
      setState('error');
      setError('The camera captured frames, but the pulse signal was not stable enough to report a heart rate. Cover the rear lens completely with your fingertip, keep still, and use steady light.');
    }
  }

  function reset() {
    stop();
    setState('idle');
    setCountdown(HR_WINDOW_SECONDS);
    setProgress(0);
    setWaveform([]);
    setError('');
  }

  return { state, countdown, progress, waveform, error, start, stop, reset };
}

export type BRState = 'idle' | 'requesting' | 'measuring' | 'done' | 'error';

function calcBreathRate(samples: { t: number; v: number }[]): number {
  if (samples.length < 60) return 0;
  const duration = Math.max(0.001, (samples[samples.length - 1].t - samples[0].t) / 1000);
  const sampleRate = samples.length / duration;
  if (sampleRate < 10) return 0;
  const values = samples.map(s => s.v);
  const filtered = bandpass(values.map(v => v - mean(values)), sampleRate, 0.08, 0.67);
  const sd = std(filtered);
  if (sd < 1e-6) return 0;
  const threshold = sd * 0.45;
  const minDistance = Math.max(1, Math.floor(sampleRate * 1.2));
  const peaks: number[] = [];
  for (let i = 1; i < filtered.length - 1; i++) {
    if (filtered[i] > threshold && filtered[i] > filtered[i - 1] && filtered[i] >= filtered[i + 1] && (!peaks.length || i - peaks[peaks.length - 1] >= minDistance)) {
      peaks.push(i);
    }
  }
  if (peaks.length < 2) return 0;
  const intervals: number[] = [];
  for (let i = 1; i < peaks.length; i++) intervals.push((peaks[i] - peaks[i - 1]) / sampleRate);
  intervals.sort((a, b) => a - b);
  const median = intervals[Math.floor(intervals.length / 2)];
  const bpm = 60 / median;
  return bpm >= 6 && bpm <= 40 ? Math.round(bpm) : 0;
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

  const stop = useCallback(() => {
    if (frameRef.current) cancelAnimationFrame(frameRef.current);
    streamRef.current?.getTracks().forEach(t => t.stop());
    audioCtxRef.current?.close().catch(() => {});
    streamRef.current = null;
    audioCtxRef.current = null;
    analyserRef.current = null;
  }, []);

  const start = useCallback(async () => {
    setState('requesting');
    setError('');
    samplesRef.current = [];
    setWaveform([]);
    setCountdown(30);
    setProgress(0);
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('MEDIA_UNAVAILABLE');
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
      streamRef.current = stream;
      const ctx = new AudioContext();
      audioCtxRef.current = ctx;
      await ctx.resume().catch(() => {});
      const src = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = 0.15;
      src.connect(analyser);
      analyserRef.current = analyser;
      startRef.current = performance.now();
      setState('measuring');

      const capture = () => {
        if (!analyserRef.current) return;
        const elapsed = (performance.now() - startRef.current) / 1000;
        if (elapsed >= 30) {
          finish();
          return;
        }
        setProgress(elapsed / 30 * 100);
        setCountdown(Math.max(0, Math.ceil(30 - elapsed)));
        const buf = new Uint8Array(analyserRef.current.fftSize);
        analyserRef.current.getByteTimeDomainData(buf);
        let sum = 0;
        for (const q of buf) {
          const v = (q - 128) / 128;
          sum += v * v;
        }
        const rms = Math.sqrt(sum / buf.length);
        samplesRef.current.push({ t: performance.now() - startRef.current, v: rms });
        setWaveform(prev => [...prev.slice(-100), rms * 300]);
        frameRef.current = requestAnimationFrame(capture);
      };
      frameRef.current = requestAnimationFrame(capture);
    } catch (e: any) {
      stop();
      setState('error');
      setError(e?.name === 'NotAllowedError' ? 'Microphone permission denied. Please allow microphone access.' : e?.message === 'MEDIA_UNAVAILABLE' ? 'This browser does not support microphone access.' : 'Microphone could not be started. Check browser permissions.');
    }
  }, [stop]);

  function finish() {
    stop();
    const bpm = calcBreathRate(samplesRef.current);
    if (bpm > 0) {
      setState('done');
      onResult(bpm);
    } else {
      setState('error');
      setError('The microphone is working, but a stable breathing pattern was not detected. Hold the phone 6–10 cm from your face and breathe naturally in a quiet room.');
    }
  }

  function reset() {
    stop();
    setState('idle');
    setCountdown(30);
    setProgress(0);
    setWaveform([]);
    setError('');
  }

  return { state, countdown, progress, waveform, error, start, stop, reset };
}

export type StepStatus = 'idle' | 'requesting' | 'listening' | 'permission_required' | 'unsupported' | 'denied';

export function useStepCounter(onStep: (total: number) => void, initialTotal = 0) {
  const [status, setStatus] = useState<StepStatus>('idle');
  const stepsRef = useRef(initialTotal);
  const listeningRef = useRef(false);
  const lastMagnitudeRef = useRef(0);
  const lastStepTimeRef = useRef(0);
  const handlerRef = useRef<((e: DeviceMotionEvent) => void) | null>(null);

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
        const permission = await DME.requestPermission();
        if (permission !== 'granted') {
          setStatus('denied');
          return;
        }
      }
      handlerRef.current = (event: DeviceMotionEvent) => {
        if (!listeningRef.current) return;
        const a = event.accelerationIncludingGravity;
        if (!a) return;
        const magnitude = Math.sqrt((a.x || 0) ** 2 + (a.y || 0) ** 2 + (a.z || 0) ** 2);
        const delta = Math.abs(magnitude - lastMagnitudeRef.current);
        lastMagnitudeRef.current = magnitude;
        const now = Date.now();
        if (delta > 1.15 && now - lastStepTimeRef.current > 350) {
          lastStepTimeRef.current = now;
          stepsRef.current += 1;
          onStep(stepsRef.current);
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
    lastMagnitudeRef.current = 0;
    lastStepTimeRef.current = 0;
    onStep(0);
  }, [onStep]);

  return { start, stop, reset, status };
}
