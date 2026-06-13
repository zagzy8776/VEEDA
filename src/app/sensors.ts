import { useRef, useState, useCallback } from 'react';

// ─── Heart Rate via Camera rPPG ───────────────────────────────────────────────
export type HRState = 'idle' | 'requesting' | 'measuring' | 'done' | 'error';

export function useHeartRate(onResult: (bpm: number, confidence: string) => void) {
  const [state, setState] = useState<HRState>('idle');
  const [countdown, setCountdown] = useState(30);
  const [progress, setProgress] = useState(0);
  const [waveform, setWaveform] = useState<number[]>([]);
  const [error, setError] = useState('');

  const streamRef = useRef<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const samplesRef = useRef<{ t: number; v: number }[]>([]);
  const frameRef = useRef<number>(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<number>(0);

  const stop = useCallback(() => {
    if (frameRef.current) cancelAnimationFrame(frameRef.current);
    if (timerRef.current) clearInterval(timerRef.current);
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
  }, []);

  const start = useCallback(async () => {
    setState('requesting');
    setError('');
    samplesRef.current = [];
    setWaveform([]);
    setCountdown(30);
    setProgress(0);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 320 }, height: { ideal: 240 }, frameRate: { ideal: 30 } },
      });
      streamRef.current = stream;

      const video = document.createElement('video');
      video.srcObject = stream;
      video.setAttribute('playsinline', 'true');
      video.muted = true;
      await video.play();
      videoRef.current = video;

      const canvas = document.createElement('canvas');
      canvas.width = 320; canvas.height = 240;
      canvasRef.current = canvas;

      startTimeRef.current = Date.now();
      setState('measuring');

      function captureFrame() {
        if (!videoRef.current || !canvasRef.current) return;
        const elapsed = (Date.now() - startTimeRef.current) / 1000;
        if (elapsed >= 30) { finish(); return; }

        const pct = (elapsed / 30) * 100;
        setProgress(pct);
        setCountdown(Math.max(0, Math.ceil(30 - elapsed)));

        const ctx = canvasRef.current.getContext('2d')!;
        ctx.drawImage(videoRef.current, 0, 0, 320, 240);
        const cx = 130, cy = 90, sz = 60;
        const data = ctx.getImageData(cx, cy, sz, sz).data;
        let g = 0;
        for (let i = 0; i < data.length; i += 4) g += data[i + 1];
        const avg = g / (sz * sz);
        samplesRef.current.push({ t: elapsed * 1000, v: avg });
        setWaveform(prev => [...prev.slice(-80), avg]);
        frameRef.current = requestAnimationFrame(captureFrame);
      }

      frameRef.current = requestAnimationFrame(captureFrame);
    } catch (e: any) {
      stop();
      setState('error');
      setError(e?.name === 'NotAllowedError' ? 'Camera permission denied. Please allow camera access.' : 'Camera not available on this device.');
    }
  }, [stop]);

  function finish() {
    stop();
    const { bpm, confidence } = calcBPM(samplesRef.current);
    setState('done');
    if (bpm > 0) onResult(bpm, confidence);
    else { setState('error'); setError('Could not detect a clear signal. Ensure good lighting and hold still.'); }
  }

  function reset() { setState('idle'); setCountdown(30); setProgress(0); setWaveform([]); setError(''); }

  return { state, countdown, progress, waveform, error, start, stop, reset };
}

function calcBPM(samples: { t: number; v: number }[]): { bpm: number; confidence: string } {
  if (samples.length < 60) return { bpm: 0, confidence: 'low' };
  const vals = samples.map(s => s.v);
  const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
  const centered = vals.map(v => v - mean);
  const sr = samples.length / 30;

  // Low-pass smooth
  const lp: number[] = [];
  const w = 5;
  for (let i = 0; i < centered.length; i++) {
    let s = 0, c = 0;
    for (let j = Math.max(0, i - w); j <= Math.min(centered.length - 1, i + w); j++) { s += centered[j]; c++; }
    lp.push(s / c);
  }

  // High-pass (remove DC)
  const hw = Math.max(2, Math.round(sr / 3));
  const filtered: number[] = [];
  for (let i = 0; i < lp.length; i++) {
    let s = 0, c = 0;
    for (let j = Math.max(0, i - hw); j <= Math.min(lp.length - 1, i + hw); j++) { s += lp[j]; c++; }
    filtered.push(lp[i] - s / c);
  }

  // Peak detection
  const minDist = Math.round(0.4 * sr);
  const peaks: number[] = [];
  for (let i = 1; i < filtered.length - 1; i++) {
    if (filtered[i] > filtered[i - 1] && filtered[i] > filtered[i + 1] && filtered[i] > 0) {
      if (!peaks.length || i - peaks[peaks.length - 1] >= minDist) peaks.push(i);
    }
  }

  if (peaks.length < 2) return { bpm: 0, confidence: 'low' };
  const dur = (samples[samples.length - 1].t - samples[0].t) / 1000;
  const avgInterval = (peaks[peaks.length - 1] - peaks[0]) / (peaks.length - 1) / sr;
  const bpm = Math.max(40, Math.min(200, Math.round(60 / avgInterval)));

  const snr = filtered.reduce((a, b) => a + b * b, 0) / filtered.length;
  const confidence = snr > 0.5 ? 'High signal quality' : snr > 0.2 ? 'Moderate signal quality' : 'Low signal quality — hold still next time';

  return { bpm, confidence };
}

// ─── Breath Rate via Microphone ───────────────────────────────────────────────
export type BRState = 'idle' | 'requesting' | 'measuring' | 'done' | 'error';

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
  const frameRef = useRef<number>(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startRef = useRef<number>(0);

  const stop = useCallback(() => {
    if (frameRef.current) cancelAnimationFrame(frameRef.current);
    if (timerRef.current) clearInterval(timerRef.current);
    streamRef.current?.getTracks().forEach(t => t.stop());
    audioCtxRef.current?.close();
    streamRef.current = null; audioCtxRef.current = null; analyserRef.current = null;
  }, []);

  const start = useCallback(async () => {
    setState('requesting');
    setError('');
    samplesRef.current = [];
    setWaveform([]);
    setCountdown(30);
    setProgress(0);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const ctx = new AudioContext();
      audioCtxRef.current = ctx;
      const src = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      analyser.smoothingTimeConstant = 0.8;
      src.connect(analyser);
      analyserRef.current = analyser;

      startRef.current = Date.now();
      setState('measuring');

      function capture() {
        if (!analyserRef.current) return;
        const elapsed = (Date.now() - startRef.current) / 1000;
        if (elapsed >= 30) { finish(); return; }

        setProgress((elapsed / 30) * 100);
        setCountdown(Math.max(0, Math.ceil(30 - elapsed)));

        const buf = new Uint8Array(analyserRef.current.fftSize);
        analyserRef.current.getByteTimeDomainData(buf);
        let sum = 0;
        for (let i = 0; i < 128; i++) { const v = (buf[i] - 128) / 128; sum += v * v; }
        const rms = Math.sqrt(sum / 128);
        samplesRef.current.push({ t: elapsed * 1000, v: rms });
        setWaveform(prev => [...prev.slice(-80), rms * 300]);
        frameRef.current = requestAnimationFrame(capture);
      }

      frameRef.current = requestAnimationFrame(capture);
    } catch (e: any) {
      stop();
      setState('error');
      setError(e?.name === 'NotAllowedError' ? 'Microphone permission denied. Please allow microphone access.' : 'Microphone not available on this device.');
    }
  }, [stop]);

  function finish() {
    stop();
    const bpm = calcBreathRate(samplesRef.current);
    setState('done');
    if (bpm > 0) onResult(bpm);
    else { setState('error'); setError('Could not detect breathing pattern. Breathe slowly and naturally near the mic.'); }
  }

  function reset() { setState('idle'); setCountdown(30); setProgress(0); setWaveform([]); setError(''); }

  return { state, countdown, progress, waveform, error, start, stop, reset };
}

function calcBreathRate(samples: { t: number; v: number }[]): number {
  if (samples.length < 60) return 0;
  const vals = samples.map(s => s.v);
  const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
  const peaks: number[] = [];
  const minDist = Math.round(samples.length / 40); // min ~0.75s between peaks
  for (let i = 1; i < vals.length - 1; i++) {
    if (vals[i] > vals[i - 1] && vals[i] >= vals[i + 1] && vals[i] > avg * 1.2) {
      if (!peaks.length || i - peaks[peaks.length - 1] >= minDist) peaks.push(i);
    }
  }
  const dur = (samples[samples.length - 1].t - samples[0].t) / 1000;
  if (dur < 1) return 0;
  return Math.max(4, Math.min(40, Math.round((peaks.length / dur) * 60)));
}

// ─── Step Counter via DeviceMotion ───────────────────────────────────────────
export function useStepCounter(onStep: (total: number) => void) {
  const stepsRef = useRef(0);
  const prevMagRef = useRef<number | null>(null);
  const lastStepRef = useRef(0);
  const lastPeakRef = useRef(0);
  const thresholdRef = useRef(1.4);
  const listeningRef = useRef(false);

  const start = useCallback(async () => {
    if (listeningRef.current) return;

    async function attach() {
      listeningRef.current = true;
      window.addEventListener('devicemotion', handleMotion, true);
    }

    // iOS 13+ needs explicit permission
    if (typeof (DeviceMotionEvent as any).requestPermission === 'function') {
      try {
        const perm = await (DeviceMotionEvent as any).requestPermission();
        if (perm === 'granted') attach();
      } catch { /* user denied */ }
    } else {
      attach();
    }
  }, []);

  function handleMotion(e: DeviceMotionEvent) {
    const a = e.accelerationIncludingGravity;
    if (!a) return;
    const mag = Math.sqrt((a.x || 0) ** 2 + (a.y || 0) ** 2 + (a.z || 0) ** 2);
    const now = Date.now();
    const prev = prevMagRef.current;
    prevMagRef.current = mag;
    if (prev === null) return;

    const delta = Math.abs(mag - prev);
    const elapsed = now - lastStepRef.current;
    const plausible = elapsed > 350 && elapsed < 2000;
    const firstStep = lastStepRef.current === 0 && delta > thresholdRef.current * 1.3;

    if ((firstStep || (delta > thresholdRef.current && plausible)) && now - lastPeakRef.current > 250) {
      stepsRef.current++;
      lastStepRef.current = now;
      lastPeakRef.current = now;
      onStep(stepsRef.current);
    }
  }

  const stop = useCallback(() => {
    window.removeEventListener('devicemotion', handleMotion, true);
    listeningRef.current = false;
  }, []);

  const reset = useCallback(() => {
    stepsRef.current = 0;
    prevMagRef.current = null;
    lastStepRef.current = 0;
  }, []);

  return { start, stop, reset };
}
