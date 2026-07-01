import { useState, useEffect, useCallback, useRef } from 'react';
import { apiFetch } from './api';
import { getActor, canCreateVitals } from './api';
import { useStepCounter } from './sensors';

export interface Vitals {
  heartRate: number | null;
  respiratory: number | null;
  oxygen: number | null;
  stamina: number | null;
  hydration: number | null;
  skinTemp: number | null;
  systolicBp: number | null;
  supplementalOxygen: boolean;
  consciousness: 'alert' | 'new_confusion' | 'voice' | 'pain' | 'unresponsive';
}

export interface VitalSources {
  heartRate: string;
  respiratory: string;
  oxygen: string;
  stamina: string;
  hydration: string;
  skinTemp: string;
  systolicBp: string;
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
  clinicalScores?: {
    news2?: {
      total: number;
      components: Record<string, number>;
      missing: string[];
      urgency?: { level: string; action: string; timelineMinutes: number | null };
    };
    qsofa?: {
      total: number;
      sepsisRiskFlag: boolean;
      components: Record<string, number>;
      missing: string[];
      urgency?: { level: string; action: string; timelineMinutes: number | null };
    };
  };
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
  const [vitals, setVitals] = useState<Vitals>({
    heartRate: null,
    respiratory: null,
    oxygen: null,
    stamina: null,
    hydration: null,
    skinTemp: null,
    systolicBp: null,
    supplementalOxygen: false,
    consciousness: 'alert',
  });
  const [sources, setSources] = useState<VitalSources>({ heartRate: 'none', respiratory: 'none', oxygen: 'none', stamina: 'none', hydration: 'none', skinTemp: 'none', systolicBp: 'none' });
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
  const actor = getActor();

  const telemetryRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const locationRef = useRef<Location>({ lat: null, lng: null, accuracy: null });

  // Step counter — always running
  const { start: startSteps, status: stepStatus } = useStepCounter(useCallback((total: number) => {
    setStepsState(total);
    localStorage.setItem('veda_steps', String(total));
    localStorage.setItem('veda_steps_date', new Date().toDateString());
  }, []), steps);

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
      setEnv(e => ({ ...e, gps: 'Active' }));
      fetchWeatherCoords(loc.lat, loc.lng);
    };
    const fail = () => {
      const loc = { lat: 6.5244, lng: 3.3792, accuracy: null };
      setLocation(loc);
      locationRef.current = loc;
      setEnv(e => ({ ...e, gps: 'Unknown' }));
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
    const feelsLike = w.apparentTemperature !== null ? Math.round(w.apparentTemperature) : null;
    const precip = Number(w.precipitation || 0);
    const wind = Number(w.windSpeed || 0);
    const humidity = Number(w.humidity || 0);

    // Use actual description from Geoapify if available, else derive from data
    let weatherLabel = w.description || '';
    if (!weatherLabel) {
      if (precip >= 5) weatherLabel = 'Heavy Rain';
      else if (precip >= 0.5) weatherLabel = 'Rain';
      else if (precip > 0) weatherLabel = 'Light Rain';
      else if (wind >= 50) weatherLabel = 'Storm';
      else if (wind >= 30) weatherLabel = 'Windy';
      else if (temp !== null && temp >= 38) weatherLabel = 'Very Hot';
      else if (temp !== null && temp >= 32) weatherLabel = 'Hot';
      else if (temp !== null && temp <= 5) weatherLabel = 'Very Cold';
      else if (temp !== null && temp <= 13) weatherLabel = 'Cold';
      else if (humidity >= 85) weatherLabel = 'Humid';
      else weatherLabel = 'Clear';
    }

    // Air quality from humidity as rough proxy when AQ API unavailable
    let airLabel = 'Good';
    if (humidity >= 90) airLabel = 'Humid';
    else if (wind >= 40) airLabel = 'Dusty';
    else if (precip > 2) airLabel = 'Fresh';

    setEnv(e => ({
      ...e,
      temp: temp !== null ? `${temp}°C${feelsLike !== null && feelsLike !== temp ? ` / ${feelsLike}°` : ''}` : '--',
      air: airLabel,
      weather: weatherLabel || 'Clear',
      outsideTemp: temp,
    }));
  }

  // Telemetry
  const sendTelemetry = useCallback(async () => {
    if (backendStatus !== 'online') return;
    const d = await apiFetch<Analysis>('/api/analyze', {
      method: 'POST',
      body: JSON.stringify({
        vitals: {
          ...vitals,
          respiratoryRate: vitals.respiratory,
          oxygenSaturation: vitals.oxygen,
          temperature: vitals.skinTemp,
          systolicBp: vitals.systolicBp,
          consciousness: vitals.consciousness,
          supplementalOxygen: vitals.supplementalOxygen,
        },
        symptoms: vitals.consciousness === 'new_confusion' ? ['confusion'] : [],
        environment: { outsideTemp: env.outsideTemp, weather: env.weather },
      }),
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

  const setVital = useCallback((key: keyof Vitals, value: number | boolean | Vitals['consciousness'], source: string) => {
    setVitals(v => ({ ...v, [key]: value }));
    if (key in sources) setSources(s => ({ ...s, [key]: source }));
  }, []);

  const ingestRawBiometric = useCallback(async (metricType: 'HEART_RATE' | 'SPO2' | 'RESP_RATE' | 'RR_INTERVAL', value: number, unit: string, metadata: Record<string, unknown> = {}) => {
    await apiFetch('/api/raw-biometrics', {
      method: 'POST',
      body: JSON.stringify({
        patient_id: actor.patientId,
        timestamp: new Date().toISOString(),
        metric_type: metricType,
        value,
        unit,
        metadata,
      }),
    });
  }, [actor.patientId]);

  const logWater = useCallback((ml: number) => {
    setHydrationMl(prev => {
      const next = prev + ml;
      localStorage.setItem('veda_hydration_ml', String(next));
      localStorage.setItem('veda_hydration_date', new Date().toDateString());
      const wt = profile?.waterTarget || 2500;
      setVital('hydration', Math.min(100, Math.round((next / wt) * 100)), 'Water log');
      saveBiometric('hydration', next / 1000, 'L');
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
    actor, canCreateVitals: canCreateVitals(actor.role),
    wellnessScore, profile, steps, setStepsState, sleepHours, setSleepHours,
    stepStatus, enableStepTracking: startSteps,
    hydrationMl, logWater, setVital, ingestRawBiometric, saveBiometric, fetchHistory, saveProfile, sendTelemetry,
  };
}

export type VedaApp = ReturnType<typeof useVedaApp>;
