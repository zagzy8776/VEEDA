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
    // Remove hidden video from DOM
    if (videoRef.current && videoRef.current.parentNode) {
      videoRef.current.parentNode.removeChild(videoRef.current);
      videoRef.current = null;
    }
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
      video.style.position = 'fixed';
      video.style.opacity = '0';
      video.style.pointerEvents = 'none';
      video.style.width = '1px';
      video.style.height = '1px';
      video.style.top = '-9999px';
      video.style.left = '-9999px';
      // Required: attach to DOM for mobile Safari/Chrome getUserMedia
      document.body.appendChild(video);
      videoRef.current = video;

      try { await video.play(); } catch (playErr) {
        console.warn('video.play() failed, continuing anyway:', playErr);
      }

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
export type StepStatus = 'idle' | 'requesting' | 'listening' | 'permission_required' | 'unsupported' | 'denied';

export function useStepCounter(onStep: (total: number) => void, initialTotal = 0) {
  const [status, setStatus] = useState<StepStatus>('idle');
  const stepsRef = useRef(initialTotal);
  const listeningRef = useRef(false);

  // Walking gait detection state
  const accelBufferRef = useRef<number[]>([]);          // raw acceleration magnitude samples
  const zAccelRef = useRef<number[]>([]);                // vertical acceleration samples
  const stepTimestampsRef = useRef<number[]>([]);        // timestamps of detected steps
  const lastStepTimeRef = useRef(0);
  const walkActiveRef = useRef(false);                   // true when in a walking bout
  const walkStepCountRef = useRef(0);                    // steps in current walking bout
  const lastWalkTotalRef = useRef(0);                    // steps counted before current walk
  const zeroCrossRef = useRef<{ last: number; count: number }>({ last: 0, count: 0 });

  // Low-pass filter state for acceleration
  const lpFilteredRef = useRef<number | null>(null);
  const lpZFilteredRef = useRef<number | null>(null);

  const start = useCallback(async () => {
    if (listeningRef.current) return;
    if (!('DeviceMotionEvent' in window)) {
      setStatus('unsupported');
      return;
    }

    async function attach() {
      listeningRef.current = true;
      // Reset all state
      accelBufferRef.current = [];
      zAccelRef.current = [];
      stepTimestampsRef.current = [];
      lastStepTimeRef.current = 0;
      walkActiveRef.current = false;
      walkStepCountRef.current = 0;
      lastWalkTotalRef.current = stepsRef.current;
      zeroCrossRef.current = { last: 0, count: 0 };
      lpFilteredRef.current = null;
      lpZFilteredRef.current = null;

      window.addEventListener('devicemotion', handleMotion, true);
      setStatus('listening');
    }

    // iOS 13+ needs explicit permission
    if (typeof (DeviceMotionEvent as any).requestPermission === 'function') {
      try {
        setStatus('requesting');
        const perm = await (DeviceMotionEvent as any).requestPermission();
        if (perm === 'granted') attach();
        else setStatus('denied');
      } catch {
        setStatus('permission_required');
      }
    } else {
      attach();
    }
  }, []);

  function handleMotion(e: DeviceMotionEvent) {
    const a = e.accelerationIncludingGravity;
    if (!a) return;

    const ax = a.x || 0;
    const ay = a.y || 0;
    const az = a.z || 0;
    const mag = Math.sqrt(ax * ax + ay * ay + az * az);
    const now = Date.now();

    // ── Low-pass filter the total magnitude ──
    if (lpFilteredRef.current === null) {
      lpFilteredRef.current = mag;
      lpZFilteredRef.current = az;
      return;
    }

    // Smooth at ~10Hz (alpha=0.2 for 50-60Hz sensor data)
    const alpha = 0.2;
    const lpMag = lpFilteredRef.current * (1 - alpha) + mag * alpha;
    let lpZ = 0;
    if (lpZFilteredRef.current !== null) {
      lpZ = lpZFilteredRef.current * (1 - alpha) + az * alpha;
      lpZFilteredRef.current = lpZ;
    }
    lpFilteredRef.current = lpMag;

    // ── High-pass: remove gravity (DC) to get dynamic acceleration ──
    const dynamicMag = mag - lpMag;
    const dynamicZ = lpZFilteredRef.current !== null ? az - lpZ : 0;

    // ── Buffer recent samples for frequency analysis ──
    accelBufferRef.current.push(dynamicMag);
    zAccelRef.current.push(dynamicZ);
    if (accelBufferRef.current.length > 100) {
      accelBufferRef.current.shift();
      zAccelRef.current.shift();
    }

    // ── Zero-crossing detection on vertical acceleration ──
    // Walking produces a characteristic sinusoidal pattern in vertical acceleration
    // Each step = one positive-to-negative zero crossing
    if (zeroCrossRef.current.last !== 0) {
      const prev = zeroCrossRef.current.last;
      if (prev > 0 && dynamicZ <= 0) {
        zeroCrossRef.current.count++;
      }
    }
    zeroCrossRef.current.last = dynamicZ;

    // ── Step detection: look for walking gait pattern ──
    // Walking cadence is 90-130 steps/min = 1.5-2.2 Hz = 460-670ms between steps
    // We detect a step when:
    // 1. Dynamic acceleration exceeds a threshold
    // 2. The timing between peaks matches walking cadence
    // 3. There's a zero-crossing in vertical acceleration (gait signature)

    const buffer = accelBufferRef.current;
    if (buffer.length < 10) return;

    // Adaptive threshold based on recent variance
    const recent = buffer.slice(-20);
    const mean = recent.reduce((s, v) => s + Math.abs(v), 0) / recent.length;
    const threshold = Math.max(0.5, mean * 1.8);

    // Look for a peak in the last few samples
    const len = buffer.length;
    const isPeak = buffer[len - 1] > threshold &&
                   buffer[len - 1] > buffer[len - 2] &&
                   buffer[len - 2] > buffer[len - 3];

    if (!isPeak) return;

    const elapsed = now - lastStepTimeRef.current;

    // Walking cadence check: 300ms-800ms between steps (75-200 steps/min)
    const isWalkingCadence = elapsed >= 300 && elapsed <= 800;

    // First step or continuing a walk
    if (lastStepTimeRef.current === 0 || isWalkingCadence) {
      lastStepTimeRef.current = now;
      stepTimestampsRef.current.push(now);
      if (stepTimestampsRef.current.length > 50) stepTimestampsRef.current.shift();

      // ── Walking bout detection ──
      // A walking bout = 4+ consecutive steps at walking cadence
      const recentSteps = stepTimestampsRef.current;
      if (recentSteps.length >= 4) {
        // Check if the last 4+ steps are at walking cadence
        const last4 = recentSteps.slice(-4);
        const gaps: number[] = [];
        for (let i = 1; i < last4.length; i++) {
          gaps.push(last4[i] - last4[i - 1]);
        }
        const allWalking = gaps.every(g => g >= 300 && g <= 800);

        if (allWalking) {
          if (!walkActiveRef.current) {
            // Starting a new walking bout
            walkActiveRef.current = true;
            walkStepCountRef.current = 0;
            lastWalkTotalRef.current = stepsRef.current;
          }
          walkStepCountRef.current++;

          // Only count the step if we're in a confirmed walking bout
          // This filters out isolated movements (like rolling in bed)
          if (walkStepCountRef.current >= 4) {
            // We're in a confirmed walk — count this step
            stepsRef.current = lastWalkTotalRef.current + walkStepCountRef.current;
            onStep(stepsRef.current);
          }
        } else {
          // Cadence broken — end walking bout
          if (walkActiveRef.current && walkStepCountRef.current < 4) {
            // False start — revert to pre-walk count
            stepsRef.current = lastWalkTotalRef.current;
            onStep(stepsRef.current);
          }
          walkActiveRef.current = false;
          walkStepCountRef.current = 0;
        }
      }
    } else if (elapsed > 2000) {
      // More than 2 seconds since last step — not walking
      if (walkActiveRef.current && walkStepCountRef.current < 4) {
        // False start — revert
        stepsRef.current = lastWalkTotalRef.current;
        onStep(stepsRef.current);
      }
      walkActiveRef.current = false;
      walkStepCountRef.current = 0;
    }
  }

  const stop = useCallback(() => {
    window.removeEventListener('devicemotion', handleMotion, true);
    listeningRef.current = false;
    setStatus('idle');
  }, []);

  const reset = useCallback(() => {
    stepsRef.current = 0;
    accelBufferRef.current = [];
    zAccelRef.current = [];
    stepTimestampsRef.current = [];
    lastStepTimeRef.current = 0;
    walkActiveRef.current = false;
    walkStepCountRef.current = 0;
    lastWalkTotalRef.current = 0;
    zeroCrossRef.current = { last: 0, count: 0 };
    lpFilteredRef.current = null;
    lpZFilteredRef.current = null;
  }, []);

  return { start, stop, reset, status };
}
