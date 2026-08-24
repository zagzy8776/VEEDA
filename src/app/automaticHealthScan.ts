import { useCallback, useEffect, useRef, useState } from 'react';
import { useBreathRate, useHeartRate, type HRConfidence, type HRResult } from './sensors';

export type AutoScanState = 'off' | 'ready' | 'measuring-heart' | 'measuring-breath' | 'cooldown' | 'error';

interface Options {
  enabled: boolean;
  onHeartRate: (bpm: number, confidence: HRConfidence, quality: Partial<HRResult>) => void;
  onBreathRate: (bpm: number) => void;
}

const SCAN_COOLDOWN_MS = 15 * 60 * 1000;
const MOTION_TRIGGER_MS = 1800;

export function useAutomaticHealthScan({ enabled, onHeartRate, onBreathRate }: Options) {
  const [state, setState] = useState<AutoScanState>(enabled ? 'ready' : 'off');
  const [lastScanAt, setLastScanAt] = useState<string | null>(null);
  const [error, setError] = useState('');
  const runningRef = useRef(false);
  const cooldownRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastMotionRef = useRef(0);

  const startBreathAfterHeart = useCallback(() => {
    setState('measuring-breath');
  }, []);

  const handleHeart = useCallback((bpm: number, confidence: HRConfidence, quality?: Partial<HRResult>) => {
    onHeartRate(bpm, confidence, quality || {});
    startBreathAfterHeart();
  }, [onHeartRate, startBreathAfterHeart]);

  const handleBreath = useCallback((bpm: number) => {
    onBreathRate(bpm);
    runningRef.current = false;
    const now = new Date().toISOString();
    setLastScanAt(now);
    setState('cooldown');
    cooldownRef.current = setTimeout(() => setState('ready'), SCAN_COOLDOWN_MS);
  }, [onBreathRate]);

  const heart = useHeartRate(handleHeart);
  const breath = useBreathRate(handleBreath);

  const stop = useCallback(() => {
    heart.stop();
    breath.stop();
    runningRef.current = false;
    setState(enabled ? 'ready' : 'off');
  }, [heart.stop, breath.stop, enabled]);

  const start = useCallback(async () => {
    if (!enabled || runningRef.current || state === 'cooldown') return;
    if (!navigator.mediaDevices?.getUserMedia) {
      setState('error');
      setError('Camera and microphone sensors are not available in this browser.');
      return;
    }
    runningRef.current = true;
    setError('');
    setState('measuring-heart');
    await heart.start();
  }, [enabled, state, heart.start]);

  useEffect(() => {
    if (!enabled) return;
    if (state === 'measuring-breath' && heart.state === 'done' && breath.state === 'idle') {
      breath.start();
    }
  }, [enabled, state, heart.state, breath.state, breath.start]);

  useEffect(() => {
    if (!enabled) {
      stop();
      if (cooldownRef.current) clearTimeout(cooldownRef.current);
      setState('off');
      return;
    }
    setState(s => s === 'off' ? 'ready' : s);
    return () => { if (cooldownRef.current) clearTimeout(cooldownRef.current); };
  }, [enabled, stop]);

  useEffect(() => {
    if (!enabled) return;
    const onMotion = (event: DeviceMotionEvent) => {
      const a = event.accelerationIncludingGravity;
      if (!a) return;
      const magnitude = Math.sqrt((a.x || 0) ** 2 + (a.y || 0) ** 2 + (a.z || 0) ** 2);
      if (magnitude < 11.5) return;
      const now = Date.now();
      if (now - lastMotionRef.current < MOTION_TRIGGER_MS) return;
      lastMotionRef.current = now;
      if (!runningRef.current && state === 'ready') start();
    };
    window.addEventListener('devicemotion', onMotion, { passive: true });
    return () => window.removeEventListener('devicemotion', onMotion);
  }, [enabled, state, start]);

  useEffect(() => {
    if (!enabled) return;
    const id = window.setInterval(() => {
      if (!runningRef.current && state === 'ready') start();
    }, SCAN_COOLDOWN_MS);
    return () => window.clearInterval(id);
  }, [enabled, state, start]);

  useEffect(() => {
    if (heart.state === 'error' || breath.state === 'error') {
      runningRef.current = false;
      setState('error');
      setError(heart.error || breath.error || 'Automatic sensor scan failed.');
    }
  }, [heart.state, heart.error, breath.state, breath.error]);

  return {
    state,
    error,
    lastScanAt,
    start,
    stop,
    heartState: heart.state,
    breathState: breath.state,
    heartQuality: heart.waveform.length,
  };
}
