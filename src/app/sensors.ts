import { useRef, useState, useCallback } from 'react';
import { sensorHub } from './sensorHub';
import { NormalizedSensorReading } from './sensorTypes';
import { buildRppgCsv, isRppgResearchEnabled, type RgbSample } from './rppgResearchExport';

// RESTORE IN PROGRESS - see stepCounter
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

export type StepStatus = 'idle' | 'requesting' | 'listening' | 'denied' | 'unsupported' | 'permission_required';

export function useHeartRate(_onResult: (bpm: number, confidence: HRConfidence, quality?: Partial<HRResult>) => void) {
  const [state, setState] = useState<HRState>('idle');
  return { state, start: async () => {}, stop: () => {}, countdown: 0, progress: 0, waveform: [] as number[], error: '', attempts: 0 };
}

export function useBreathRate(_onResult: (rate: number) => void) {
  const [state, setState] = useState<'idle' | 'measuring' | 'done' | 'error'>('idle');
  return { state, start: async () => {}, stop: () => {}, countdown: 0, progress: 0, error: '' };
}

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
        const std = Math.sqrt(variance);
        if (std < 0.35) { pendingRef.current = 0; return; }

        const threshold = Math.max(1.05, mean + 0.95 * std);
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
          const rhythmic = i1 >= 350 && i1 <= 1600 && i2 >= 350 && i2 <= 1600 && Math.abs(i1 - i2) < 700;
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

export function __testRppg() {
  return { bpm: 0, confidence: 'low' as HRConfidence, signalQuality: 0, snrDb: -Infinity, sampleRateHz: 30, samples: 0 };
}
