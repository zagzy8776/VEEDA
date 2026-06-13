import { useState, useEffect, useCallback, useRef } from 'react';
import { apiFetch } from './api';

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

function loadProfile(): Profile {
  try {
    const s = localStorage.getItem('veda_profile');
    if (s) return { ...defaultProfile(), ...JSON.parse(s) };
  } catch {}
  return defaultProfile();
}

function defaultProfile(): Profile {
  return { name: 'Zagzy', age: 28, weight: 75, height: 178, sex: 'male', waterTarget: 2500, stepGoal: 10000, tempUnit: 'C' };
}

export function useVedaApp() {
  const [vitals, setVitals] = useState<Vitals>({ heartRate: null, respiratory: null, oxygen: null, stamina: null, hydration: null, skinTemp: null });
  const [sources, setSources] = useState<VitalSources>({ heartRate: 'none', respiratory: 'none', oxygen: 'none', stamina: 'none', hydration: 'none', skinTemp: 'none' });
  const [env, setEnv] = useState<EnvData>({ temp: '--', air: '--', weather: '--', gps: '--', outsideTemp: null });
  const [location, setLocation] = useState<Location>({ lat: null, lng: null, accuracy: null });
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [history, setHistory] = useState<BiometricEvent[]>([]);
  const [backendStatus, setBackendStatus] = useState<'checking' | 'online' | 'failed'>('checking');
  const [profile, setProfileState] = useState<Profile>(loadProfile);
  const [steps, setSteps] = useState(0);
  const [sleepHours, setSleepHours] = useState<number | null>(null);
  const [hydrationMl, setHydrationMl] = useState(() => {
    const d = localStorage.getItem('veda_hydration_date');
    const today = new Date().toDateString();
    if (d === today) return parseInt(localStorage.getItem('veda_hydration_ml') || '0', 10);
    return 0;
  });

  const telemetryRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Check backend health
  useEffect(() => {
    apiFetch<{ status: string }>('/api/health').then(d => {
      setBackendStatus(d?.status === 'online' ? 'online' : 'failed');
    });
  }, []);

  // GPS
  useEffect(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(pos => {
      const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: Math.round(pos.coords.accuracy) };
      setLocation(loc);
      fetchWeather(loc.lat, loc.lng);
      setEnv(e => ({ ...e, gps: `±${Math.round(pos.coords.accuracy)}m` }));
    }, () => {
      // fallback Lagos
      const loc = { lat: 6.5244, lng: 3.3792, accuracy: null };
      setLocation(loc);
      fetchWeather(loc.lat, loc.lng);
      setEnv(e => ({ ...e, gps: 'Approx' }));
    }, { enableHighAccuracy: true, timeout: 10000 });
  }, []);

  // Fetch weather from backend
  const fetchWeather = useCallback(async (lat: number, lng: number) => {
    const d = await apiFetch<any>(`/api/map/context?lat=${lat}&lng=${lng}`);
    if (!d?.weather || d.weather.status !== 'available') return;
    const w = d.weather;
    const temp = w.temperature !== null ? Math.round(w.temperature) : null;
    const precip = Number(w.precipitation || 0);
    const wind = Number(w.windSpeed || 0);
    const weather = precip >= 0.2 ? 'Rain' : temp !== null && temp >= 32 ? 'Hot' : temp !== null && temp <= 13 ? 'Cold' : wind >= 30 ? 'Windy' : 'Clear';
    const air = 'Good';
    setEnv({ temp: temp !== null ? `${temp}°C` : '--', air, weather, gps: location.accuracy ? `±${location.accuracy}m` : 'Active', outsideTemp: temp });
  }, [location.accuracy]);

  // Send telemetry and get analysis
  const sendTelemetry = useCallback(async () => {
    if (backendStatus !== 'online') return;
    const d = await apiFetch<Analysis>('/api/analyze', {
      method: 'POST',
      body: JSON.stringify({ vitals, symptoms: [], environment: { outsideTemp: env.outsideTemp, weather: env.weather } }),
    });
    if (d) setAnalysis(d);
  }, [vitals, env, backendStatus]);

  // Telemetry loop
  useEffect(() => {
    if (backendStatus !== 'online') return;
    sendTelemetry();
    telemetryRef.current = setInterval(sendTelemetry, 30000);
    return () => { if (telemetryRef.current) clearInterval(telemetryRef.current); };
  }, [backendStatus, sendTelemetry]);

  // Load history from Neon
  const fetchHistory = useCallback(async () => {
    const d = await apiFetch<BiometricEvent[]>('/api/wellness-history?days=7');
    if (d) setHistory(d);
  }, []);

  useEffect(() => { fetchHistory(); }, [fetchHistory]);

  // Save biometric to Neon + local
  const saveBiometric = useCallback(async (type: string, value: number, unit: string, metadata: Record<string, unknown> = {}) => {
    await apiFetch('/api/biometric-event', {
      method: 'POST',
      body: JSON.stringify({ type, value, unit, timestamp: new Date().toISOString(), metadata }),
    });
    fetchHistory();
  }, [fetchHistory]);

  // Set a vital reading
  const setVital = useCallback((key: keyof Vitals, value: number, source: string) => {
    setVitals(v => ({ ...v, [key]: value }));
    setSources(s => ({ ...s, [key]: source }));
  }, []);

  // Log water
  const logWater = useCallback((ml: number) => {
    setHydrationMl(prev => {
      const next = prev + ml;
      localStorage.setItem('veda_hydration_ml', String(next));
      localStorage.setItem('veda_hydration_date', new Date().toDateString());
      const pct = Math.min(100, Math.round((next / (profile.waterTarget || 2500)) * 100));
      setVital('hydration', pct, 'log');
      saveBiometric('hydration', next / 1000, 'litres');
      return next;
    });
  }, [profile.waterTarget, setVital, saveBiometric]);

  // Wellness score calculated from real vitals
  const wellnessScore = (() => {
    const measured = Object.values(vitals).filter(v => v !== null);
    if (measured.length === 0) return null;
    let score = 70;
    if (vitals.heartRate !== null) score += vitals.heartRate < 50 || vitals.heartRate > 120 ? -18 : vitals.heartRate > 100 ? -8 : 8;
    if (vitals.oxygen !== null) score += Math.min(10, Math.max(-25, (vitals.oxygen - 94) * 3));
    if (vitals.respiratory !== null) score += vitals.respiratory < 10 || vitals.respiratory > 24 ? -12 : 6;
    if (vitals.hydration !== null) score += vitals.hydration < 45 ? -15 : vitals.hydration > 70 ? 8 : 0;
    if (vitals.skinTemp !== null) score += vitals.skinTemp > 37.8 || vitals.skinTemp < 35.5 ? -15 : 6;
    return Math.max(0, Math.min(100, Math.round(score)));
  })();

  // Save profile
  const saveProfile = useCallback((p: Partial<Profile>) => {
    setProfileState(prev => {
      const next = { ...prev, ...p };
      localStorage.setItem('veda_profile', JSON.stringify(next));
      return next;
    });
  }, []);

  return {
    vitals, sources, env, location, analysis, history, backendStatus,
    wellnessScore, profile, steps, setSteps, sleepHours, setSleepHours,
    hydrationMl, logWater, setVital, saveBiometric, fetchHistory, saveProfile, sendTelemetry,
  };
}

export type VedaApp = ReturnType<typeof useVedaApp>;
