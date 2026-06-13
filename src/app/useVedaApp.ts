import { useState, useEffect, useCallback, useRef } from 'react';
import { apiFetch } from './api';
import { useStepCounter } from './sensors';

export interface Vitals {
  heartRate: number | null;
  respiratory: number | null;
  oxygen: number | null;
  stamina: number | null;
  hydration: number | null;
  skinTemp: number | null;
}

export interface VitalSources {
  heartRate: string;
  respiratory: string;
  oxygen: string;
  stamina: string;
  hydration: string;
  skinTemp: string;
}

export interface EnvData {
  temp: string;
  air: string;
  weather: string;
  gps: string;
  outsideTemp: number | null;
}

export interface Location {
  lat: number | null;
  lng: number | null;
  accuracy: number | null;
}

export interface Analysis {
  riskLevel: string;
  headline: string;
  nurseGreeting: string;
  supportCheck: string;
  emergencyMode: boolean;
  stabilizationSteps: string[];
  warningSigns: string[];
  nextAction: string;
}

export interface BiometricEvent {
  type: string;
  value: number;
  unit: string;
  timestamp: string;
}

export interface Profile {
  name: string;
  age: number;
  weight: number;
  height: number;
  sex: string;
  waterTarget: number;
  stepGoal: number;
  tempUnit: 'C' | 'F';
}

export function isFirstLaunch(): boolean {
  return !localStorage.getItem('veda_profile');
}

function loadProfile(): Profile | null {
  try {
    const s = localStorage.getItem('veda_profile');
    if (s) return JSON.parse(s);
  } catch {}
  return null;
}

export function useVedaApp() {
  const [vitals, setVitals] = useState<Vitals>({ heartRate: null, respiratory: null, oxygen: null, stamina: null, hydration: null, skinTemp: null });
  const [sources, setSources] = useState<VitalSources>({ heartRate: 'none', respiratory: 'none', oxygen: 'none', stamina: 'none', hydration: 'none', skinTemp: 'none' });
  const [env, setEnv] = useState<EnvData>({ temp: '--', air: '--', weather: '--', gps: '--', outsideTemp: null });
  const [location, setLocation] = useState<Location>({ lat: null, lng: null, accuracy: null });
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [history, setHistory] = useState<BiometricEvent[]>([]);
  const [backendStatus, setBackendStatus] = useState<'checking' | 'online' | 'failed'>('checking');
  const [profile, setProfileState] = useState<Profile | null>(loadProfile);
  const [steps, setStepsState] = useState(() => {
    const d = localStorage.getItem('veda_steps_date');
    if (d === new Date().toDateString()) return parseInt(localStorage.getItem('veda_steps') || '0', 10);
    return 0;
  });
  const [sleepHours, setSleepHours] = useState<number | null>(null);
  const [hydrationMl, setHydrationMl] = useState(() => {
    const d = localStorage.getItem('veda_hydration_date');
    if (d === new Date().toDateString()) return parseInt(localStorage.getItem('veda_hydration_ml') || '0', 10);
    return 0;
  });

  const telemetryRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const locationRef = useRef<Location>({ lat: null, lng: null, accuracy: null });

  // Step counter — always running
  const { start: startSteps } = useStepCounter(useCallback((total: number) => {
    setStepsState(total);
    localStorage.setItem('veda_steps', String(total));
    localStorage.setItem('veda_steps_date', new Date().toDateString());
  }, []));

  useEffect(() => { startSteps(); }, [startSteps]);

  // Backend health
  useEffect(() => {
    apiFetch<{ status: string }>('/api/health').then(d => {
      setBackendStatus(d?.status === 'online' ? 'online' : 'failed');
    });
  }, []);

  // GPS
  useEffect(() => {
    if (!navigator.geolocation) return;
    const success = (pos: GeolocationPosition) => {
      const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: Math.round(pos.coords.accuracy) };
      setLocation(loc);
      locationRef.current = loc;
      setEnv(e => ({ ...e, gps: `±${Math.round(pos.coords.accuracy)}m` }));
      fetchWeatherCoords(loc.lat, loc.lng);
    };
    const fail = () => {
      const loc = { lat: 6.5244, lng: 3.3792, accuracy: null };
      setLocation(loc);
      locationRef.current = loc;
      setEnv(e => ({ ...e, gps: 'Approx' }));
      fetchWeatherCoords(loc.lat, loc.lng);
    };
    navigator.geolocation.getCurrentPosition(success, fail, { enableHighAccuracy: true, timeout: 10000 });
    navigator.geolocation.watchPosition(success, fail, { enableHighAccuracy: true, maximumAge: 30000 });
  }, []);

  async function fetchWeatherCoords(lat: number, lng: number) {
    const d = await apiFetch<any>(`/api/map/context?lat=${lat}&lng=${lng}`);
    if (!d?.weather || d.weather.status !== 'available') return;
    const w = d.weather;
    const temp = w.temperature !== null ? Math.round(w.temperature) : null;
    const precip = Number(w.precipitation || 0);
    const wind = Number(w.windSpeed || 0);
    const weather = precip >= 0.2 ? 'Rain' : temp !== null && temp >= 32 ? 'Hot' : temp !== null && temp <= 13 ? 'Cold' : wind >= 30 ? 'Windy' : 'Clear';
    setEnv(e => ({ ...e, temp: temp !== null ? `${temp}°C` : '--', air: 'Good', weather, outsideTemp: temp }));
  }

  // Telemetry
  const sendTelemetry = useCallback(async () => {
    if (backendStatus !== 'online') return;
    const d = await apiFetch<Analysis>('/api/analyze', {
      method: 'POST',
      body: JSON.stringify({ vitals, symptoms: [], environment: { outsideTemp: env.outsideTemp, weather: env.weather } }),
    });
    if (d) setAnalysis(d);
  }, [vitals, env, backendStatus]);

  useEffect(() => {
    if (backendStatus !== 'online') return;
    sendTelemetry();
    telemetryRef.current = setInterval(sendTelemetry, 30000);
    return () => { if (telemetryRef.current) clearInterval(telemetryRef.current); };
  }, [backendStatus, sendTelemetry]);

  // History from Neon
  const fetchHistory = useCallback(async () => {
    const d = await apiFetch<BiometricEvent[]>('/api/wellness-history?days=7');
    if (d) setHistory(d);
  }, []);

  useEffect(() => { fetchHistory(); }, [fetchHistory]);

  // Save biometric
  const saveBiometric = useCallback(async (type: string, value: number, unit: string, metadata: Record<string, unknown> = {}) => {
    await apiFetch('/api/biometric-event', {
      method: 'POST',
      body: JSON.stringify({ type, value, unit, timestamp: new Date().toISOString(), metadata }),
    });
    fetchHistory();
  }, [fetchHistory]);

  const setVital = useCallback((key: keyof Vitals, value: number, source: string) => {
    setVitals(v => ({ ...v, [key]: value }));
    setSources(s => ({ ...s, [key]: source }));
  }, []);

  const logWater = useCallback((ml: number) => {
    setHydrationMl(prev => {
      const next = prev + ml;
      localStorage.setItem('veda_hydration_ml', String(next));
      localStorage.setItem('veda_hydration_date', new Date().toDateString());
      const wt = profile?.waterTarget || 2500;
      setVital('hydration', Math.min(100, Math.round((next / wt) * 100)), 'Water log');
      saveBiometric('hydration', next / 1000, 'litres');
      return next;
    });
  }, [profile?.waterTarget, setVital, saveBiometric]);

  // Wellness score from real vitals only
  const wellnessScore = (() => {
    if (!Object.values(vitals).some(v => v !== null)) return null;
    let score = 70;
    if (vitals.heartRate !== null) score += vitals.heartRate < 50 || vitals.heartRate > 120 ? -18 : vitals.heartRate > 100 ? -8 : 8;
    if (vitals.oxygen !== null) score += Math.min(10, Math.max(-25, (vitals.oxygen - 94) * 3));
    if (vitals.respiratory !== null) score += vitals.respiratory < 10 || vitals.respiratory > 24 ? -12 : 6;
    if (vitals.hydration !== null) score += vitals.hydration < 45 ? -15 : vitals.hydration > 70 ? 8 : 0;
    if (vitals.skinTemp !== null) score += vitals.skinTemp > 37.8 || vitals.skinTemp < 35.5 ? -15 : 6;
    return Math.max(0, Math.min(100, Math.round(score)));
  })();

  const saveProfile = useCallback((p: Partial<Profile>) => {
    setProfileState(prev => {
      const base: Profile = prev ?? { name: '', age: 25, weight: 70, height: 170, sex: 'male', waterTarget: 2500, stepGoal: 10000, tempUnit: 'C' };
      const next = { ...base, ...p };
      // Recalculate water target from weight if weight changed
      if (p.weight && p.weight > 20) next.waterTarget = Math.round(p.weight * 35);
      localStorage.setItem('veda_profile', JSON.stringify(next));
      return next;
    });
  }, []);

  return {
    vitals, sources, env, location, analysis, history, backendStatus,
    wellnessScore, profile, steps, setStepsState, sleepHours, setSleepHours,
    hydrationMl, logWater, setVital, saveBiometric, fetchHistory, saveProfile, sendTelemetry,
  };
}

export type VedaApp = ReturnType<typeof useVedaApp>;
