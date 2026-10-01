import { useState, useEffect, useCallback, useRef } from 'react';
import { apiFetch, markPendingHealthReading, resolvePendingHealthReading } from './api';
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
  evaluated?: boolean;
  headline: string;
  nurseGreeting: string;
  supportCheck: string;
  safetyNotice?: string | null;
  emergencyNumber?: string | null;
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

const EMPTY_VITALS: Vitals = {
  heartRate: null,
  respiratory: null,
  oxygen: null,
  stamina: null,
  hydration: null,
  skinTemp: null,
  systolicBp: null,
  supplementalOxygen: false,
  consciousness: 'alert',
};

const EMPTY_SOURCES: VitalSources = {
  heartRate: 'none',
  respiratory: 'none',
  oxygen: 'unavailable',
  stamina: 'unavailable',
  hydration: 'none',
  skinTemp: 'manual entry only',
  systolicBp: 'manual entry',
};

/** Restore last phone measurements so refresh does not wipe them. */
function loadCachedVitals(): { vitals: Vitals; sources: VitalSources } {
  try {
    const raw = localStorage.getItem('veda_latest_vitals');
    if (!raw) return { vitals: { ...EMPTY_VITALS }, sources: { ...EMPTY_SOURCES } };
    const parsed = JSON.parse(raw);
    // Expire after 24h so stale readings do not stick forever
    if (parsed.savedAt && Date.now() - parsed.savedAt > 24 * 60 * 60 * 1000) {
      return { vitals: { ...EMPTY_VITALS }, sources: { ...EMPTY_SOURCES } };
    }
    return {
      vitals: { ...EMPTY_VITALS, ...(parsed.vitals || {}) },
      sources: { ...EMPTY_SOURCES, ...(parsed.sources || {}) },
    };
  } catch {
    return { vitals: { ...EMPTY_VITALS }, sources: { ...EMPTY_SOURCES } };
  }
}

function persistVitals(vitals: Vitals, sources: VitalSources) {
  try {
    localStorage.setItem(
      'veda_latest_vitals',
      JSON.stringify({ vitals, sources, savedAt: Date.now() }),
    );
  } catch {}
}

export function useVedaApp() {
  const cached = loadCachedVitals();
  const [vitals, setVitals] = useState<Vitals>(cached.vitals);
  const [sources, setSources] = useState<VitalSources>(cached.sources);
  const [env, setEnv] = useState<EnvData>({ temp: '--', air: '--', weather: '--', gps: 'Acquiring GPS', outsideTemp: null });
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
  const locationWatchRef = useRef<number | null>(null);

  const { start: startSteps, status: stepStatus } = useStepCounter(useCallback((total: number) => {
    setStepsState(total);
    localStorage.setItem('veda_steps', String(total));
    localStorage.setItem('veda_steps_date', new Date().toDateString());
  }, []), steps);

  useEffect(() => { startSteps(); }, [startSteps]);

  useEffect(() => {
    apiFetch<{ status: string }>('/api/health').then(d => {
      setBackendStatus(d?.status === 'online' ? 'online' : 'failed');
    }).catch(() => setBackendStatus('failed'));
  }, []);

  useEffect(() => {
    if (!navigator.geolocation) {
      setEnv(e => ({ ...e, gps: 'Unavailable' }));
      return;
    }

    const success = (pos: GeolocationPosition) => {
      const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: Math.round(pos.coords.accuracy) };
      setLocation(loc);
      setEnv(e => ({ ...e, gps: `Active${loc.accuracy ? ` ±${loc.accuracy}m` : ''}` }));
      fetchWeatherCoords(loc.lat, loc.lng);
    };
    const fail = () => {
      setLocation({ lat: null, lng: null, accuracy: null });
      setEnv(e => ({ ...e, gps: 'Location permission required' }));
    };

    navigator.geolocation.getCurrentPosition(success, fail, { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 });
    locationWatchRef.current = navigator.geolocation.watchPosition(success, fail, { enableHighAccuracy: true, maximumAge: 30000, timeout: 15000 });

    return () => {
      if (locationWatchRef.current !== null) navigator.geolocation.clearWatch(locationWatchRef.current);
    };
  }, []);

  async function fetchWeatherCoords(lat: number, lng: number) {
    // Prefer backend (keyed). If it fails or temp is missing, fall back to Open-Meteo from the phone.
    let w: any = null;
    let aq: any = null;

    const d = await apiFetch<any>(`/api/map/context?lat=${lat}&lng=${lng}`);
    if (d) {
      w = d.weather;
      aq = d.airQuality;
    }

    let temp =
      w?.temperature != null && Number.isFinite(Number(w.temperature))
        ? Math.round(Number(w.temperature))
        : null;
    let feelsLike =
      w?.apparentTemperature != null && Number.isFinite(Number(w.apparentTemperature))
        ? Math.round(Number(w.apparentTemperature))
        : null;
    let precip = Number(w?.precipitation || 0);
    let wind = Number(w?.windSpeed || 0);
    let weatherLabel = (w?.description || '').trim();

    // Phone-side fallback so environment still works if API key/backend is misconfigured
    if (temp == null || w?.status === 'unavailable' || !d) {
      try {
        const r = await fetch(
          `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}` +
          `&current=temperature_2m,apparent_temperature,precipitation,wind_speed_10m,relative_humidity_2m,weather_code&timezone=auto`
        );
        if (r.ok) {
          const om = await r.json();
          const c = om.current || {};
          if (c.temperature_2m != null) temp = Math.round(Number(c.temperature_2m));
          if (c.apparent_temperature != null) feelsLike = Math.round(Number(c.apparent_temperature));
          precip = Number(c.precipitation || precip || 0);
          wind = Number(c.wind_speed_10m || wind || 0);
          if (!weatherLabel && c.weather_code != null) {
            const code = Number(c.weather_code);
            if (code === 0) weatherLabel = 'Clear';
            else if (code <= 3) weatherLabel = 'Partly cloudy';
            else if (code <= 48) weatherLabel = 'Fog';
            else if (code <= 57) weatherLabel = 'Drizzle';
            else if (code <= 67) weatherLabel = 'Rain';
            else if (code <= 77) weatherLabel = 'Snow';
            else if (code <= 82) weatherLabel = 'Showers';
            else if (code <= 99) weatherLabel = 'Thunderstorm';
          }
        }
      } catch {}
    }

    // Air quality fallback
    if (!aq || aq.status !== 'available') {
      try {
        const r = await fetch(
          `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lng}` +
          `&current=us_aqi,pm2_5,pm10&timezone=auto`
        );
        if (r.ok) {
          const om = await r.json();
          const c = om.current || {};
          if (c.us_aqi != null || c.pm2_5 != null) {
            const aqi = c.us_aqi ?? null;
            const label =
              aqi == null ? 'Unknown' :
              aqi <= 50 ? 'Good' :
              aqi <= 100 ? 'Moderate' :
              aqi <= 150 ? 'Unhealthy for sensitive' :
              aqi <= 200 ? 'Unhealthy' :
              aqi <= 300 ? 'Very unhealthy' : 'Hazardous';
            aq = { status: 'available', aqi, label, pm25: c.pm2_5 ?? null };
          }
        }
      } catch {}
    }

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
      else if (temp !== null) weatherLabel = 'Clear';
      else weatherLabel = '--';
    }

    const airLabel = aq?.status === 'available'
      ? `AQI ${aq.aqi ?? '--'} · ${aq.label || 'Unknown'}`
      : 'AQI unavailable';

    setEnv(e => ({
      ...e,
      temp: temp !== null ? `${temp}°C${feelsLike !== null && feelsLike !== temp ? ` / ${feelsLike}°` : ''}` : '--',
      air: airLabel,
      weather: weatherLabel,
      outsideTemp: temp,
    }));
  }

  const sendTelemetry = useCallback(async () => {
    if (backendStatus !== 'online') return;
    // Only analyze when at least one real vital exists — avoids fake "Stable / 70"
    const hasAnyVital =
      vitals.heartRate != null ||
      vitals.respiratory != null ||
      vitals.oxygen != null ||
      vitals.skinTemp != null ||
      vitals.systolicBp != null;
    if (!hasAnyVital) {
      setAnalysis(null);
      return;
    }
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
        environment: { outsideTemp: env.outsideTemp, weather: env.weather, airQuality: env.air },
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

  const fetchHistory = useCallback(async () => {
    const d = await apiFetch<BiometricEvent[]>('/api/wellness-history?days=30');
    if (!d || !Array.isArray(d)) return;
    setHistory(d);

    // Fill empty on-screen vitals from the latest server readings (today preferred)
    const today = new Date().toDateString();
    const latestOf = (type: string) => {
      const todayHit = d.find(e => e.type === type && new Date(e.timestamp).toDateString() === today);
      if (todayHit) return todayHit;
      return d.find(e => e.type === type) || null;
    };
    const hr = latestOf('heart_rate');
    const br = latestOf('breath_rate');
    const temp = latestOf('temperature');
    const bp = latestOf('systolic_bp');

    setVitals(v => {
      const next = { ...v };
      let changed = false;
      if (v.heartRate == null && hr) { next.heartRate = Number(hr.value); changed = true; }
      if (v.respiratory == null && br) { next.respiratory = Number(br.value); changed = true; }
      if (v.skinTemp == null && temp) { next.skinTemp = Number(temp.value); changed = true; }
      if (v.systolicBp == null && bp) { next.systolicBp = Number(bp.value); changed = true; }
      if (!changed) return v;
      setSources(s => {
        const ns = { ...s };
        if (v.heartRate == null && hr) ns.heartRate = 'Saved reading';
        if (v.respiratory == null && br) ns.respiratory = 'Saved reading';
        if (v.skinTemp == null && temp) ns.skinTemp = 'Saved reading';
        if (v.systolicBp == null && bp) ns.systolicBp = 'Saved reading';
        persistVitals(next, ns);
        return ns;
      });
      return next;
    });
  }, []);

  useEffect(() => { fetchHistory(); }, [fetchHistory]);

  const saveBiometric = useCallback(async (type: string, value: number, unit: string, metadata: Record<string, unknown> = {}) => {
    // Local UI already updated via setVital — backend save is best-effort
    const pendingId = markPendingHealthReading(type);
    const saved = await apiFetch('/api/biometric-event', {
      method: 'POST',
      body: JSON.stringify({ type, value, unit, timestamp: new Date().toISOString(), metadata }),
    });
    if (saved) {
      resolvePendingHealthReading(pendingId);
      fetchHistory();
    }
    return saved;
  }, [fetchHistory]);

  const setVital = useCallback((key: keyof Vitals, value: number | boolean | Vitals['consciousness'], source: string) => {
    setVitals(v => {
      const next = { ...v, [key]: value };
      setSources(s => {
        const nextSources = key in s ? { ...s, [key]: source } : s;
        persistVitals(next, nextSources as VitalSources);
        return nextSources;
      });
      return next;
    });
  }, []);

  const ingestRawBiometric = useCallback(async (metricType: 'HEART_RATE' | 'SPO2' | 'RESP_RATE' | 'RR_INTERVAL', value: number, unit: string, metadata: Record<string, unknown> = {}) => {
    await apiFetch('/api/raw-biometrics', {
      method: 'POST',
      body: JSON.stringify({ patient_id: actor.patientId, timestamp: new Date().toISOString(), metric_type: metricType, value, unit, metadata }),
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

  // Wellness score: only computed when we have at least one core vital.
  // Base is neutral (55) so incomplete data does not look "healthy by default".
  const wellnessScore = (() => {
    const coreKeys: (keyof Vitals)[] = ['heartRate', 'respiratory', 'oxygen', 'skinTemp'];
    const hasCore = coreKeys.some(k => vitals[k] !== null && vitals[k] !== undefined);
    if (!hasCore) return null; // show "—" until real measurements exist

    let score = 55; // neutral baseline (not 70)
    let contributors = 0;

    if (vitals.heartRate !== null) {
      contributors++;
      if (vitals.heartRate < 50 || vitals.heartRate > 120) score -= 18;
      else if (vitals.heartRate > 100) score -= 8;
      else score += 12;
    }
    if (vitals.oxygen !== null) {
      contributors++;
      score += Math.min(12, Math.max(-25, (vitals.oxygen - 94) * 3));
    }
    if (vitals.respiratory !== null) {
      contributors++;
      if (vitals.respiratory < 10 || vitals.respiratory > 24) score -= 12;
      else score += 8;
    }
    if (vitals.skinTemp !== null) {
      contributors++;
      if (vitals.skinTemp > 37.8 || vitals.skinTemp < 35.5) score -= 15;
      else score += 8;
    }
    if (vitals.hydration !== null) {
      if (vitals.hydration < 45) score -= 12;
      else if (vitals.hydration > 70) score += 6;
    }

    // Slight penalty when only one vital is available (incomplete picture)
    if (contributors < 2) score = Math.min(score, 62);

    return Math.max(0, Math.min(100, Math.round(score)));
  })();

  const saveProfile = useCallback((p: Partial<Profile>) => {
    setProfileState(prev => {
      const base: Profile = prev ?? { name: '', age: 25, weight: 70, height: 170, sex: 'male', waterTarget: 2500, stepGoal: 10000, tempUnit: 'C' };
      const next = { ...base, ...p };
      if (p.weight && p.weight > 20) next.waterTarget = Math.round(p.weight * 35);
      localStorage.setItem('veda_profile', JSON.stringify(next));
      return next;
    });
  }, []);

  return {
    vitals, sources, env, location, analysis, history, backendStatus,
    actor, canCreateVitals: canCreateVitals(actor.role), wellnessScore, profile,
    steps, setStepsState, sleepHours, setSleepHours, stepStatus, enableStepTracking: startSteps,
    hydrationMl, logWater, setVital, ingestRawBiometric, saveBiometric, fetchHistory, saveProfile, sendTelemetry,
  };
}

export type VedaApp = ReturnType<typeof useVedaApp>;
