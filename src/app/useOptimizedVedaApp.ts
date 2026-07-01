/**
 * Optimized VEDA App Hook with Performance Enhancements
 * - Memoization for expensive calculations
 * - Debounced API calls
 * - Lazy loading
 * - Better caching
 */

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { apiFetch } from './api';
import { useStepCounter } from './sensors';
import type { Vitals, VitalSources, EnvData, Location, Analysis, BiometricEvent, Profile } from './useVedaApp';
import { QuantumWellnessOptimizer } from './quantum/quantumEngine';

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

// Debounce helper
function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value);
  
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  
  return debouncedValue;
}

export function useOptimizedVedaApp() {
  const [vitals, setVitals] = useState<Vitals>({ 
    heartRate: null, respiratory: null, oxygen: null, 
    stamina: null, hydration: null, skinTemp: null 
  });
  const [sources, setSources] = useState<VitalSources>({ 
    heartRate: 'none', respiratory: 'none', oxygen: 'none', 
    stamina: 'none', hydration: 'none', skinTemp: 'none' 
  });
  const [env, setEnv] = useState<EnvData>({ 
    temp: '--', air: '--', weather: '--', gps: '--', outsideTemp: null 
  });
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

  // Debounce vitals for API calls (reduce server load)
  const debouncedVitals = useDebounce(vitals, 2000);

  // Step counter with memoized callback
  const handleStepUpdate = useCallback((total: number) => {
    setStepsState(total);
    localStorage.setItem('veda_steps', String(total));
    localStorage.setItem('veda_steps_date', new Date().toDateString());
  }, []);

  const { start: startSteps } = useStepCounter(handleStepUpdate);

  useEffect(() => { startSteps(); }, [startSteps]);

  // Memoized wellness score calculation
  const wellnessScore = useMemo(() => {
    if (!Object.values(vitals).some(v => v !== null)) return null;
    
    let score = 70;
    if (vitals.heartRate !== null) score += vitals.heartRate < 50 || vitals.heartRate > 120 ? -18 : vitals.heartRate > 100 ? -8 : 8;
    if (vitals.oxygen !== null) score += Math.min(10, Math.max(-25, (vitals.oxygen - 94) * 3));
    if (vitals.respiratory !== null) score += vitals.respiratory < 10 || vitals.respiratory > 24 ? -12 : 6;
    if (vitals.hydration !== null) score += vitals.hydration < 45 ? -15 : vitals.hydration > 70 ? 8 : 0;
    if (vitals.skinTemp !== null) score += vitals.skinTemp > 37.8 || vitals.skinTemp < 35.5 ? -15 : 6;
    
    return Math.max(0, Math.min(100, Math.round(score)));
  }, [vitals]);

  // Quantum-optimized recommendations (memoized)
  const quantumRecommendations = useMemo(() => {
    if (!profile) return null;
    
    return QuantumWellnessOptimizer.optimizeRecommendations(
      vitals,
      { age: profile.age, weight: profile.weight }
    );
  }, [vitals, profile]);

  // Backend health check (once on mount)
  useEffect(() => {
    apiFetch<{ status: string }>('/api/health').then(d => {
      setBackendStatus(d?.status === 'online' ? 'online' : 'failed');
    });
  }, []);

  // GPS location (optimized to run once)

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
  }, []);

  const fetchWeatherCoords = useCallback(async (lat: number, lng: number) => {
    const d = await apiFetch<any>(`/api/map/context?lat=${lat}&lng=${lng}`);
    if (!d?.weather || d.weather.status !== 'available') return;
    
    const w = d.weather;
    const temp = w.temperature !== null ? Math.round(w.temperature) : null;
    const feelsLike = w.apparentTemperature !== null ? Math.round(w.apparentTemperature) : null;
    
    let weatherLabel = w.description || 'Clear';
    let airLabel = 'Good';
    
    if (w.humidity >= 90) airLabel = 'Humid';
    else if (w.windSpeed >= 40) airLabel = 'Dusty';
    else if (w.precipitation > 2) airLabel = 'Fresh';
    
    setEnv(e => ({
      ...e,
      temp: temp !== null ? `${temp}°C${feelsLike !== null && feelsLike !== temp ? ` / ${feelsLike}°` : ''}` : '--',
      air: airLabel,
      weather: weatherLabel,
      outsideTemp: temp,
    }));
  }, []);

  // Telemetry with debounced vitals
  const sendTelemetry = useCallback(async () => {
    if (backendStatus !== 'online') return;
    const d = await apiFetch<Analysis>('/api/analyze', {
      method: 'POST',
      body: JSON.stringify({ 
        vitals: debouncedVitals, 
        symptoms: [], 
        environment: { outsideTemp: env.outsideTemp, weather: env.weather },
        profile: { name: profile?.name, age: profile?.age, weight: profile?.weight }
      }),
    });
    if (d) setAnalysis(d);
  }, [debouncedVitals, env, backendStatus, profile]);

  useEffect(() => {
    if (backendStatus !== 'online') return;
    sendTelemetry();
    telemetryRef.current = setInterval(sendTelemetry, 30000);
    return () => { if (telemetryRef.current) clearInterval(telemetryRef.current); };
  }, [backendStatus, sendTelemetry]);

  // History from Neon (cached)
  const fetchHistory = useCallback(async () => {
    const cacheKey = 'veda_history_cache';
    const cacheTimeKey = 'veda_history_cache_time';
    const now = Date.now();
    const lastFetch = parseInt(localStorage.getItem(cacheTimeKey) || '0', 10);
    
    // Use cache if less than 5 minutes old
    if (now - lastFetch < 5 * 60 * 1000) {
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        try {
          setHistory(JSON.parse(cached));
          return;
        } catch {}
      }
    }
    
    const d = await apiFetch<BiometricEvent[]>('/api/wellness-history?days=7');
    if (d) {
      setHistory(d);
      localStorage.setItem(cacheKey, JSON.stringify(d));
      localStorage.setItem(cacheTimeKey, String(now));
    }
  }, []);

  useEffect(() => { fetchHistory(); }, [fetchHistory]);

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

  const saveProfile = useCallback((p: Partial<Profile>) => {
    setProfileState(prev => {
      const base: Profile = prev ?? { 
        name: '', age: 25, weight: 70, height: 170, sex: 'male', 
        waterTarget: 2500, stepGoal: 10000, tempUnit: 'C' 
      };
      const next = { ...base, ...p };
      if (p.weight && p.weight > 20) next.waterTarget = Math.round(p.weight * 35);
      localStorage.setItem('veda_profile', JSON.stringify(next));
      return next;
    });
  }, []);

  return {
    vitals, sources, env, location, analysis, history, backendStatus,
    wellnessScore, profile, steps, setStepsState, sleepHours, setSleepHours,
    hydrationMl, logWater, setVital, saveBiometric, fetchHistory, saveProfile, sendTelemetry,
    quantumRecommendations
  };
}

export type VedaApp = ReturnType<typeof useOptimizedVedaApp>;
