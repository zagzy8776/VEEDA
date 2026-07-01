import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { Chart as ChartJS } from 'chart.js/auto';

marked.setOptions({ breaks: true, gfm: true });

const API_BASE = import.meta.env?.VITE_API_URL || 
  (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' || window.location.hostname === 'veeds-three.vercel.app'
    ? 'https://veda-backend-h1lj.onrender.com' : 'https://veda-backend-h1lj.onrender.com');
const API_KEY = import.meta.env?.VITE_VEDA_API_KEY || '';
const TELEMETRY_INTERVAL = 8000;

const DEFAULT_VITALS = { heartRate: null, respiratoryEffort: null, stamina: null, hydration: null, oxygen: null, hrv: null, skinTemp: null };
const VITAL_SOURCE = {
  none: 'Not measured', camera: 'Camera estimate', manual: 'Manual entry', fitbit: 'Fitbit',
  hydration: 'Water log', phone: 'Phone estimate', unavailable: 'Needs wearable',
  mic: 'Microphone estimate', weather_ref: 'Weather reference'
};

// ─── State ──────────────────────────────────────────────────────────
const state = {
  backendStatus: 'unchecked', currentRoute: 'home',
  vitals: { ...DEFAULT_VITALS },
  vitalSources: { heartRate: 'none', respiratoryEffort: 'none', stamina: 'unavailable', hydration: 'none', oxygen: 'unavailable', hrv: 'unavailable', skinTemp: 'none' },
  symptoms: [],
  environment: { outsideTemp: null, airQuality: 'Unavailable', weather: 'Unavailable', humidity: null, apparentTemperature: null, windSpeed: null, precipitation: null, observedAt: null, dataAgeMinutes: null },
  location: { lat: null, lng: null, accuracy: null, source: 'waiting', updatedAt: null }, gpsGranted: false, telemetryTimer: null,
  lastAnalysis: null, chatHistory: [], chatOpen: false, mapReady: false, mapProvider: null, mapInstance: null,
  fitbit: { configured: false, connected: false, lastSyncedAt: null, message: '', metrics: {} },
  streetAddress: null, lastReverseGeocodeTime: 0,
};

// Biometric state
const bio = {
  heartRate: null, breathRate: null, steps: 0, stepsTarget: 10000,
  hydration: 0, hydrationTarget: 2500, sleepHours: null, sleepStart: null, sleepSource: 'phone',
  temperature: null, tempUnit: 'C', stressEnabled: false,
  lastStepTime: 0, stepThreshold: 1.45, stepsCalibrated: false, prevMotionMagnitude: null, lastMotionPeak: 0,
  sleepCheckStart: null, lastMovementTime: Date.now(),
  weight: null, // kg, set from profile
};

// Permissions
const perms = { camera: false, microphone: false, motion: false, notifications: false, location: false };
const permAsked = { camera: false, microphone: false, motion: false, notifications: false };

// ─── Utilities ──────────────────────────────────────────────────────
const $ = s => document.querySelector(s);
const $$ = s => document.querySelectorAll(s);
const esc = s => { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; };
function showView(viewId) {
  $$('.view').forEach(v => {
    const isActive = v.id === viewId;
    v.classList.toggle('active', isActive);
    v.hidden = !isActive;
    if (v.hasAttribute('role') && v.getAttribute('role') === 'tabpanel') {
      v.setAttribute('aria-hidden', String(!isActive));
    }
  });
}
function updateRiskBadge(level) { const el = $('#risk-level'); if (el) el.textContent = level; }
function showLoadingBar() { $('#loading-bar')?.classList.add('active'); }
function hideLoadingBar() { setTimeout(() => $('#loading-bar')?.classList.remove('active'), 600); }
function metricMeasured(key) { return !['none', 'unavailable'].includes(state.vitalSources[key]); }
function anyMeasuredVitals() { return Object.keys(state.vitalSources).some(metricMeasured); }
function setMetric(key, value, source) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return;
  state.vitals[key] = Number.isInteger(value) ? value : Number(value);
  state.vitalSources[key] = source;
}
function formatUpdatedTime(iso) { return iso ? new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Waiting'; }

function showToast(msg, type = 'info') {
  const c = $('#toast-container'); if (!c) return;
  const t = document.createElement('div'); t.className = `toast ${type}`;
  t.innerHTML = `<p>${esc(msg)}</p>`; c.appendChild(t);
  setTimeout(() => t.classList.add('show'), 10); setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 400); }, 4000);
}

// ─── Router ─────────────────────────────────────────────────────────
const ROUTE_MAP = { '#/': 'home', '#/vitals': 'vitals', '#/map': 'map', '#/history': 'history', '#/profile': 'profile', '#/symptoms': 'symptoms' };
function onRouteChange() {
  const raw = location.hash || '#/';
  const route = ROUTE_MAP[raw] ? raw : '#/';
  const view = ROUTE_MAP[route];
  if (raw !== route) {
    history.replaceState(null, '', route);
  }
  state.currentRoute = view; showView(`page-${view}`);
  $$('#bottomnav .nav-item').forEach(item => {
    const active = item.dataset.route === route;
    item.classList.toggle('active', active);
    item.setAttribute('aria-selected', String(active));
    item.tabIndex = active ? 0 : -1;
  });
  if (view === 'vitals') { updateVitalsPage(); updateMeasurementHub(); updateVitalsChart(); }
  if (view === 'home') { updateHomeVitals(); updateGreeting(); updateGuardianRing(); updateEnvRow(); renderNotices(); }
  if (view === 'map') initMapPage();
  if (view === 'profile') renderProfile();
  if (view === 'history') renderHistory();
  if (view === 'symptoms') { renderSymptomGrid(); }
}

function setupTabKeyboardNavigation() {
  const tabs = Array.from($$('#bottomnav .nav-item'));
  if (!tabs.length) return;

  tabs.forEach((tab, index) => {
    tab.addEventListener('keydown', e => {
      const isHorizontal = e.key === 'ArrowRight' || e.key === 'ArrowLeft';
      const isHomeEnd = e.key === 'Home' || e.key === 'End';
      if (!isHorizontal && !isHomeEnd) return;

      e.preventDefault();
      let nextIndex = index;
      if (e.key === 'ArrowRight') nextIndex = (index + 1) % tabs.length;
      if (e.key === 'ArrowLeft') nextIndex = (index - 1 + tabs.length) % tabs.length;
      if (e.key === 'Home') nextIndex = 0;
      if (e.key === 'End') nextIndex = tabs.length - 1;

      const nextTab = tabs[nextIndex];
      const nextRoute = nextTab.dataset.route || '#/';
      if (location.hash === nextRoute) onRouteChange();
      else location.hash = nextRoute;
      nextTab.focus();
    });
  });
}

// ─── API ────────────────────────────────────────────────────────────
async function apiFetch(path, opts = {}) {
  const url = `${API_BASE}${path}`;
  const headers = { 'Content-Type': 'application/json', ...opts.headers };
  if (API_KEY) headers['x-veda-api-key'] = API_KEY;
  try {
    const r = await fetch(url, { ...opts, headers });
    if (!r.ok) throw new Error(`HTTP ${r.status}`); return await r.json();
  } catch (e) { console.error(`API ${path}:`, e); return null; }
}

function checkBackend() {
  const pill = $('#status-pill'); if (!pill) return;
  pill.className = 'status-pill checking'; pill.innerHTML = '<span class="status-dot"></span><span>Starting VEDA...</span>';
  apiFetch('/api/health').then(d => {
    if (d && d.status === 'online') {
      state.backendStatus = 'online'; pill.className = 'status-pill online'; pill.innerHTML = '<span class="status-dot"></span><span>VEDA active</span>';
      startTelemetry();
      sendTelemetry();
    } else throw new Error();
  }).catch(() => { state.backendStatus = 'failed'; pill.className = 'status-pill failed'; pill.innerHTML = '<span class="status-dot"></span><span>Reconnect</span>'; });
}

// ─── Telemetry ──────────────────────────────────────────────────────
function startTelemetry() { stopTelemetry(); state.telemetryTimer = setInterval(sendTelemetry, TELEMETRY_INTERVAL); }
function stopTelemetry() { if (state.telemetryTimer) { clearInterval(state.telemetryTimer); state.telemetryTimer = null; } }
async function sendTelemetry() {
  if (state.backendStatus !== 'online') return;
  const payload = { vitals: state.vitals, symptoms: state.symptoms, environment: state.environment, location: state.location };
  const d = await apiFetch('/api/analyze', { method: 'POST', body: JSON.stringify(payload) });
  if (d) { state.lastAnalysis = d; updateRiskBadge(d.riskLevel); updateAnalysisUI(d); }
}

// ─── GPS ────────────────────────────────────────────────────────────
function requestGPS() {
  if (!navigator.geolocation) { setFallbackLocation(); return; }
  navigator.geolocation.getCurrentPosition(pos => {
    state.gpsGranted = true; perms.location = true;
    updateLocationFromPosition(pos, 'gps');
    initStepCounter(); initSleepTracking();
    fetchWeather(); sendTelemetry(); updateEnvRow(); updateLocationPanel();
    
    // Auto-open map on first GPS fix
    if (!localStorage.getItem('veda_gps_first_fix')) {
      localStorage.setItem('veda_gps_first_fix', '1');
      setTimeout(() => { location.hash = '#/map'; }, 500);
      reverseGeocodePosition(state.location.lat, state.location.lng).then(addr => {
        if (addr) showToast(`📍 You are near ${addr.street || addr.displayName}`, 'success');
      });
    }
    
    if (state.currentRoute === 'map') initMapPage();
  }, () => { setFallbackLocation(); }, { enableHighAccuracy: true, timeout: 10000 });
  navigator.geolocation.watchPosition(pos => {
    updateLocationFromPosition(pos, 'gps');
    updateEnvRow(); updateLocationPanel();
    if (state.currentRoute === 'map') refreshMapPosition();
    // Reverse geocode every 30 seconds while moving
    debouncedReverseGeocode();
  }, () => {}, { enableHighAccuracy: true, maximumAge: 30000 });
}

let lastReverseGeocodeTime = 0;
function debouncedReverseGeocode() {
  const now = Date.now();
  if (now - lastReverseGeocodeTime < 30000) return;
  lastReverseGeocodeTime = now;
  if (state.location.lat) reverseGeocodePosition(state.location.lat, state.location.lng);
}

async function reverseGeocodePosition(lat, lng) {
  const d = await apiFetch(`/api/map/reverse-geocode?lat=${lat}&lng=${lng}`);
  if (!d || d.status !== 'available') return null;
  state.streetAddress = d;
  updateStreetAddressDisplay();
  return d;
}

function updateStreetAddressDisplay() {
  const textEl = $('#street-address-text');
  const accEl = $('#street-accuracy');
  if (!textEl) return;
  if (state.streetAddress && state.streetAddress.status === 'available') {
    const display = state.streetAddress.street || state.streetAddress.displayName;
    const city = state.streetAddress.city ? `, ${state.streetAddress.city}` : '';
    textEl.textContent = `${display}${city}`;
    if (accEl && state.location.accuracy) accEl.textContent = `±${state.location.accuracy}m`;
  } else {
    textEl.textContent = state.location.lat ? `GPS active (${state.location.lat.toFixed(4)}, ${state.location.lng.toFixed(4)})` : 'Acquiring location...';
  }
}

function updateLocationFromPosition(pos, source) {
  state.location = {
    lat: pos.coords.latitude,
    lng: pos.coords.longitude,
    accuracy: pos.coords.accuracy ? Math.round(pos.coords.accuracy) : null,
    source,
    updatedAt: new Date().toISOString(),
  };
}
function setFallbackLocation() {
  state.location = { lat: 6.5244, lng: 3.3792, accuracy: null, source: 'fallback', updatedAt: new Date().toISOString() };
  updateEnvRow(); updateLocationPanel(); fetchWeather();
}

// ─── Weather ────────────────────────────────────────────────────────
async function fetchWeather() {
  if (!state.location.lat) return;
  const d = await apiFetch(`/api/map/context?lat=${state.location.lat}&lng=${state.location.lng}`);
  if (!d) return;
  applyMapContextEnvironment(d);
  updateEnvRow(); updateLocationPanel(); displayWeather(d.weather); renderNotices();
  updateWeatherTempRef();
}
function startWeatherLoop() { fetchWeather(); setInterval(fetchWeather, 300000); }

function applyMapContextEnvironment(d) {
  const w = d.weather || {};
  const aq = d.airQuality || {};
  if (w.status === 'available' && w.temperature !== null && w.temperature !== undefined) {
    state.environment.outsideTemp = Math.round(w.temperature);
    state.environment.apparentTemperature = w.apparentTemperature ?? null;
    state.environment.humidity = w.humidity ?? null;
    state.environment.windSpeed = w.windSpeed ?? null;
    state.environment.precipitation = w.precipitation ?? null;
    state.environment.observedAt = w.observedAt || null;
    state.environment.dataAgeMinutes = w.dataAgeMinutes ?? null;
    state.environment.weather = classifyWeather(w);
  } else {
    state.environment.weather = 'Unavailable';
  }
  state.environment.airQuality = classifyAirQuality(aq);
}

function updateWeatherTempRef() {
  const el = $('#weather-temp-value');
  if (el && state.environment.outsideTemp !== null) {
    el.textContent = state.environment.outsideTemp;
  }
}

function classifyWeather(w = {}) {
  const temp = Number(w.temperature);
  const precip = Number(w.precipitation || 0);
  const wind = Number(w.windSpeed || 0);
  if (precip >= 0.2) return 'Rain';
  if (temp >= 32) return 'Hot';
  if (temp <= 13) return 'Cold';
  if (wind >= 30) return 'Windy';
  return w.status === 'available' ? 'Current' : 'Unavailable';
}

function classifyAirQuality(aq = {}) {
  if (aq.status !== 'available') return 'Unavailable';
  const pm25 = Number(aq.pm25 ?? 0);
  const pm10 = Number(aq.pm10 ?? 0);
  if (pm25 > 35 || pm10 > 100) return 'Poor';
  if (pm25 > 12 || pm10 > 45) return 'Moderate';
  return 'Good';
}

// ─── Vitals source handling ─────────────────────────────────────────
function estimatedHydrationPercent() {
  if (!bio.hydration) return null;
  return Math.min(100, Math.round((bio.hydration / bio.hydrationTarget) * 100));
}

// ─── Home Vitals ────────────────────────────────────────────────────
function updateHomeVitals() {
  setVitalCard('hr', 'heartRate', 'bpm');
  setVitalCard('resp', 'respiratoryEffort', 'breaths/min');
  setVitalCard('spo2', 'oxygen', '%');
  setVitalCard('stamina', 'stamina', '%');
  setVitalCard('hyd', 'hydration', '%');
  setVitalCard('skin', 'skinTemp', '°C');
}
function setVitalCard(id, key, unit) {
  const source = state.vitalSources[key];
  const measured = metricMeasured(key);
  const value = measured ? state.vitals[key] : null;
  const el = $(`#${id}-value`); if (el) el.textContent = value !== null && value !== undefined ? value : '--';
  const u = $(`#${id}-unit`); if (u) u.textContent = unit;
  const s = $(`#${id}-source`); if (s) s.textContent = VITAL_SOURCE[source] || source || 'Not measured';
  const card = el?.closest('.vital-card'); if (card) card.classList.toggle('unmeasured', !measured);
  // If no vitals measured, show "--" on ring score
  if (!anyMeasuredVitals()) { const r = $('#ring-score'); if (r) r.textContent = '--'; }
}

// ─── Step Card on Home ─────────────────────────────────────────────
function updateStepCard() {
  const sv = $('#steps-value'); if (sv) sv.textContent = bio.steps;
  const su = $('#steps-unit'); if (su) su.textContent = 'steps today';
  const pct = Math.min(100, Math.round((bio.steps / bio.stepsTarget) * 100));
  const bar = $('#steps-progress-fill'); if (bar) bar.style.width = `${pct}%`;
}

// ─── Step Counter (DeviceMotion) ────────────────────────────────────
function initStepCounter() {
  if (bio.stepsCalibrated) return;
  if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
    DeviceMotionEvent.requestPermission().then(s => { if (s === 'granted') startMotionListener(); }).catch(() => {});
  } else { startMotionListener(); }
}
function startMotionListener() {
  perms.motion = true;
  window.addEventListener('devicemotion', onDeviceMotion, true);
}
function onDeviceMotion(e) {
  const a = e.accelerationIncludingGravity; if (!a) return;
  const mag = Math.sqrt((a.x||0)**2 + (a.y||0)**2 + (a.z||0)**2);
  const now = Date.now();
  const delta = bio.prevMotionMagnitude === null ? 0 : Math.abs(mag - bio.prevMotionMagnitude);
  bio.prevMotionMagnitude = mag;
  const elapsed = now - bio.lastStepTime;
  const plausibleCadence = elapsed > 450 && elapsed < 2200;
  const firstStep = bio.lastStepTime === 0 && delta > bio.stepThreshold * 1.25;
  if ((firstStep || (delta > bio.stepThreshold && plausibleCadence)) && (now - bio.lastMotionPeak) > 250) {
    bio.steps++; bio.lastStepTime = now; bio.lastMotionPeak = now; bio.lastMovementTime = now;
    if (state.currentRoute === 'home' || state.currentRoute === 'vitals') updateStepCard();
    if (bio.steps % 50 === 0) saveBiometric('steps', bio.steps, 'count');
  }
}

// ─── Sleep Tracking ─────────────────────────────────────────────────
function initSleepTracking() {
  setInterval(checkSleepState, 60000);
}
function checkSleepState() {
  // Skip phone auto-detection if manual sleep is active
  if (bio.sleepSource === 'manual') return;
  const now = new Date(); const h = now.getHours();
  const isNight = h >= 21 || h < 8;
  const inactive = (Date.now() - bio.lastMovementTime) > 1800000; // 30 min
  if (isNight && inactive && !bio.sleepStart) {
    bio.sleepStart = new Date(now.getTime() - 1800000).toISOString();
    bio.sleepSource = 'phone';
  } else if (bio.sleepStart && (!isNight || !inactive)) {
    const start = new Date(bio.sleepStart); const hours = (now - start) / 3600000;
    if (hours >= 0.5) {
      bio.sleepHours = parseFloat(hours.toFixed(1));
      saveBiometric('sleep', bio.sleepHours, 'hours', { start: bio.sleepStart, end: now.toISOString(), source: bio.sleepSource });
      if (state.currentRoute === 'vitals') updateVitalsPage();
    }
    bio.sleepStart = null;
  }
}

function sleepNow() {
  bio.sleepStart = new Date().toISOString();
  bio.sleepSource = 'manual';
  showToast('Sleep timer started. Tap Wake when you wake up.', 'success');
  updateSleepUI();
}

function wakeNow() {
  if (!bio.sleepStart) { showToast('Tap Sleep first to start tracking.', 'info'); return; }
  const now = new Date();
  const start = new Date(bio.sleepStart);
  const hours = (now - start) / 3600000;
  if (hours >= 0.5) {
    bio.sleepHours = parseFloat(hours.toFixed(1));
    saveBiometric('sleep', bio.sleepHours, 'hours', { start: bio.sleepStart, end: now.toISOString(), source: 'manual' });
    showToast(`Sleep logged: ${bio.sleepHours} hours`, 'success');
  } else {
    showToast('Sleep was too short to log (< 30 min).', 'info');
  }
  bio.sleepStart = null;
  if (state.currentRoute === 'vitals') updateVitalsPage();
  updateSleepUI();
}

function updateSleepUI() {
  const el = $('#bio-sleep-val');
  if (el) el.textContent = bio.sleepHours !== null ? bio.sleepHours : '--';
  const src = $('#sleep-source-label');
  if (src) {
    if (state.fitbit.connected && state.fitbit.metrics?.sleep) src.textContent = 'Fitbit';
    else src.textContent = bio.sleepSource === 'manual' ? 'Manual log' : 'Phone estimate';
  }
}

// ─── Hydration Tracking ────────────────────────────────────────────
function initHydration() {
  const stored = localStorage.getItem('veda_hydration_today');
  const storedDate = localStorage.getItem('veda_hydration_date');
  const today = new Date().toDateString();
  if (storedDate === today && stored) {
    bio.hydration = parseInt(stored, 10);
    const pct = estimatedHydrationPercent();
    if (pct !== null) setMetric('hydration', pct, 'hydration');
  }
  // Load weight from localStorage
  const storedWeight = localStorage.getItem('veda_weight');
  if (storedWeight) bio.weight = parseFloat(storedWeight);
  updateHydrationTarget();
}
function updateHydrationTarget() {
  // If weight is known, use 35ml/kg as recommendation
  if (bio.weight && bio.weight > 20) {
    bio.hydrationTarget = Math.round(bio.weight * 35);
  }
}
function logWater(ml) {
  bio.hydration += ml;
  localStorage.setItem('veda_hydration_today', bio.hydration);
  localStorage.setItem('veda_hydration_date', new Date().toDateString());
  const pct = estimatedHydrationPercent();
  if (pct !== null) setMetric('hydration', pct, 'hydration');
  saveBiometric('hydration', bio.hydration / 1000, 'litres');
  updateHydrationDisplay(); updateHomeVitals(); updateGuardianRing(); sendTelemetry(); renderNotices();
}
function updateHydrationDisplay() {
  const el = $('#hydration-value'); if (el) el.textContent = (bio.hydration / 1000).toFixed(2);
  const pct = Math.min(100, Math.round((bio.hydration / bio.hydrationTarget) * 100));
  const bar = $('#hydration-progress-fill'); if (bar) bar.style.width = `${pct}%`;
  const info = $('#hyd-target-info');
  if (info) {
    const remaining = Math.max(0, bio.hydrationTarget - bio.hydration);
    info.textContent = `${(bio.hydration/1000).toFixed(2)}L / ${(bio.hydrationTarget/1000).toFixed(1)}L (${remaining}ml remaining)`;
  }
}
function initHydrationReminders() {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  setInterval(() => {
    if (bio.hydration < bio.hydrationTarget) {
      new Notification('VEDA hydration reminder', { body: `You've had ${(bio.hydration/1000).toFixed(2)}L today. Drink a glass of water now.`, icon: '/favicon.ico' });
    }
  }, 5400000); // 90 min
}
function requestNotificationPermission() {
  if (!('Notification' in window)) return;
  if (Notification.permission === 'default') { Notification.requestPermission().then(p => { perms.notifications = p === 'granted'; }); }
}

// ─── Stress Detection (Microphone) ─────────────────────────────────
let stressAudioCtx = null, stressAnalyser = null, stressStream = null, stressAnimFrame = null;
function startStressMonitor() {
  if (!navigator.mediaDevices?.getUserMedia) { showToast('Microphone not available', 'error'); return; }
  navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => {
    stressStream = stream; perms.microphone = true;
    stressAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const src = stressAudioCtx.createMediaStreamSource(stream);
    stressAnalyser = stressAudioCtx.createAnalyser();
    stressAnalyser.fftSize = 512;
    src.connect(stressAnalyser);
    monitorBreathing();
  }).catch(() => showToast('Microphone permission needed for breathing analysis', 'error'));
}
function monitorBreathing() {
  if (!bio.stressEnabled || !stressAnalyser) return;
  const buf = new Uint8Array(stressAnalyser.frequencyBinCount);
  stressAnalyser.getByteTimeDomainData(buf);
  let sum = 0; for (let i = 0; i < buf.length; i++) { const v = (buf[i] - 128) / 128; sum += v * v; }
  const rms = Math.sqrt(sum / buf.length);
  const now = Date.now();
  stressBreathingSamples.push({ rms, t: now });
  while (stressBreathingSamples.length > 300) stressBreathingSamples.shift();
  if (stressBreathingSamples.length > 60) detectBreathRate();
  stressAnimFrame = requestAnimationFrame(monitorBreathing);
}
const stressBreathingSamples = [];
function detectBreathRate() {
  const rmsValues = stressBreathingSamples.map(s => s.rms);
  const avg = rmsValues.reduce((a, b) => a + b, 0) / rmsValues.length;
  let peaks = 0;
  for (let i = 1; i < rmsValues.length - 1; i++) {
    if (rmsValues[i] > rmsValues[i-1] && rmsValues[i] > rmsValues[i+1] && rmsValues[i] > avg * 1.1) peaks++;
  }
  const duration = (stressBreathingSamples[stressBreathingSamples.length-1].t - stressBreathingSamples[0].t) / 1000;
  const breathsPerMin = Math.round((peaks / duration) * 60);
  if (breathsPerMin > 20) {
    showToast('VEDA detected rapid breathing. Try 4 slow deep breaths now.', 'warning');
  }
}
function stopStressMonitor() {
  if (stressAnimFrame) cancelAnimationFrame(stressAnimFrame);
  if (stressStream) stressStream.getTracks().forEach(t => t.stop());
  if (stressAudioCtx) stressAudioCtx.close();
  stressStream = null; stressAudioCtx = null; stressAnalyser = null;
}

// ─── Heart Rate Measurement (rPPG) ─────────────────────────────────
let hrCameraStream = null, hrCanvas = null, hrCtx = null, hrSamples = [], hrStartTime = 0;
let hrAnimFrame = null, hrWaveformCanvas = null, hrWaveformCtx = null;

function startHeartRateMeasurement() {
  if (!navigator.mediaDevices?.getUserMedia) { showToast('Camera not available', 'error'); return; }
  showView('page-hr-measurement');
  $('#hr-result-view')?.style && ($('#hr-result-view').style.display = 'none');
  $('#hr-measurement-panel')?.style && ($('#hr-measurement-panel').style.display = 'block');
  const timeText = $('#hr-time-text'); if (timeText) timeText.textContent = '30s';
  const confEl = $('#hr-confidence'); if (confEl) confEl.textContent = '';
  navigator.mediaDevices.getUserMedia({
    video: { facingMode: 'environment', width: { ideal: 320 }, height: { ideal: 240 }, frameRate: { ideal: 30 } }
  }).then(stream => {
    hrCameraStream = stream; perms.camera = true;
    showHeartRateUI();
    const video = $('#hr-video');
    if (!video) throw new Error('Heart rate video element missing');
    video.srcObject = stream;
    video.play().catch(() => showToast('Tap measure again if camera preview did not start.', 'warning'));
    hrCanvas = $('#hr-canvas'); hrCtx = hrCanvas?.getContext('2d');
    if (!hrCanvas || !hrCtx) throw new Error('Heart rate canvas missing');
    hrWaveformCanvas = $('#hr-waveform'); hrWaveformCtx = hrWaveformCanvas?.getContext('2d');
    hrSamples = []; hrStartTime = Date.now();
    hrAnimFrame = requestAnimationFrame(captureHRFrame);
  }).catch(() => {
    stopHRStream();
    showToast('Camera permission needed for heart rate measurement', 'error');
    showView('page-vitals');
  });
}

function captureHRFrame() {
  const video = $('#hr-video'); if (!video || video.paused) return;
  const elapsed = Date.now() - hrStartTime;
  const remaining = Math.max(0, 30 - elapsed / 1000);
  updateHRCountdown(remaining, elapsed / 30000 * 100);
  if (elapsed >= 30000) { finishHeartRateMeasurement(); return; }
  hrCanvas.width = 320; hrCanvas.height = 240;
  hrCtx.drawImage(video, 0, 0, 320, 240);
  const cx = 135, cy = 95, size = 50;
  const data = hrCtx.getImageData(cx, cy, size, size).data;
  // Use green channel (index 1) for better rPPG signal
  let gSum = 0; for (let i = 0; i < data.length; i += 4) gSum += data[i + 1]; // Green channel
  const avgGreen = gSum / (size * size);
  hrSamples.push({ t: elapsed, v: avgGreen });
  drawHRWaveform(avgGreen);
  hrAnimFrame = requestAnimationFrame(captureHRFrame);
}

function drawHRWaveform(v) {
  if (!hrWaveformCtx) return;
  const c = hrWaveformCanvas; const ctx = hrWaveformCtx;
  ctx.fillStyle = '#080f1a'; ctx.fillRect(0, 0, c.width, c.height);
  const hist = hrSamples.slice(-100);
  if (hist.length < 2) return;
  const min = Math.min(...hist.map(h => h.v)); const max = Math.max(...hist.map(h => h.v));
  const range = max - min || 1;
  ctx.beginPath(); ctx.strokeStyle = '#2DD4A4'; ctx.lineWidth = 2;
  hist.forEach((h, i) => { const x = (i / (hist.length - 1)) * c.width; const y = c.height - ((h.v - min) / range) * c.height * 0.8 - c.height * 0.1; i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); });
  ctx.stroke();
}

function updateHRCountdown(remaining, pct) {
  const ring = $('#hr-ring-progress'); if (ring) ring.setAttribute('stroke-dashoffset', 283 * (1 - pct / 100));
  const txt = $('#hr-time-text'); if (txt) txt.textContent = `${Math.ceil(remaining)}s`;
}

function finishHeartRateMeasurement() {
  stopHRStream();
  const { bpm, snr } = calculateBPM(hrSamples);
  bio.heartRate = bpm;
  if (bpm) setMetric('heartRate', bpm, 'camera');
  
  // Show confidence based on SNR
  const confEl = $('#hr-confidence');
  if (confEl) {
    if (snr > 0.3) confEl.textContent = 'Confidence: high signal quality';
    else if (snr > 0.15) confEl.textContent = 'Confidence: moderate signal quality';
    else confEl.textContent = 'Confidence: low signal quality — keep still and improve lighting';
  }
  
  const badge = bpm > 100 ? 'elevated' : bpm < 60 ? 'low' : 'normal';
  const el = $('#hr-result'); if (el) { el.textContent = `${bpm} BPM`; el.className = `vital-big-text ${badge}`; }
  const b = $('#hr-badge'); if (b) { b.textContent = badge.charAt(0).toUpperCase() + badge.slice(1); b.className = `vital-badge ${badge}`; }
  const panel = $('#hr-measurement-panel'); if (panel) panel.style.display = 'none';
  const result = $('#hr-result-view'); if (result) result.style.display = 'block';
  saveBiometric('heart_rate', bpm, 'bpm');
  updateHomeVitals(); updateGuardianRing(); sendTelemetry(); renderNotices();
  if (state.currentRoute === 'vitals') updateVitalsPage();
}

function calculateBPM(samples) {
  if (samples.length < 30) return { bpm: 0, snr: 0 };
  const v = samples.map(s => s.v);
  const mean = v.reduce((a, b) => a + b, 0) / v.length;
  const centered = v.map(x => x - mean);
  
  // Bandpass filter: 0.8Hz - 3Hz (48-180 BPM)
  const sampleRate = samples.length / 30; // samples per second
  const filtered = bandpassFilter(centered, sampleRate, 0.8, 3.0);
  
  // Peak detection
  let peaks = []; const minDist = Math.round(0.4 * sampleRate); // min 0.4s between peaks (150 BPM max)
  for (let i = 1; i < filtered.length - 1; i++) {
    if (filtered[i] > filtered[i-1] && filtered[i] > filtered[i+1] && filtered[i] > 0) {
      if (!peaks.length || (i - peaks[peaks.length-1]) >= minDist) peaks.push(i);
    }
  }
  
  // Calculate SNR
  const signalPower = peaks.length > 1 ? filtered.reduce((a, b) => a + b * b, 0) / filtered.length : 0;
  const noisePower = signalPower * 0.1; // estimate
  const snr = signalPower / (noisePower + 0.001);
  
  if (peaks.length < 2) return { bpm: 0, snr };
  const durationSec = (samples[samples.length-1].t - samples[0].t) / 1000;
  const avgInterval = (peaks[peaks.length-1] - peaks[0]) / (peaks.length - 1);
  const intervalSec = avgInterval / sampleRate;
  const bpm = Math.max(30, Math.min(220, Math.round(60 / intervalSec)));
  return { bpm, snr: Math.min(1, snr) };
}

// Simple bandpass filter (moving average difference approximation)
function bandpassFilter(data, sampleRate, lowCut, highCut) {
  const nyquist = sampleRate / 2;
  const lowNorm = lowCut / nyquist;
  const highNorm = highCut / nyquist;
  if (lowNorm >= 1 || highNorm >= 1) return data;
  
  // Apply simple low-pass then high-pass
  const lpSmooth = 5; // smoothing window
  const lowPassed = [];
  for (let i = 0; i < data.length; i++) {
    let sum = 0, count = 0;
    for (let j = Math.max(0, i - lpSmooth); j <= Math.min(data.length - 1, i + lpSmooth); j++) {
      sum += data[j]; count++;
    }
    lowPassed.push(sum / count);
  }
  
  // High-pass: subtract smoothed (removes DC drift)
  const hpSmooth = Math.max(2, Math.round(sampleRate / highCut));
  const result = [];
  for (let i = 0; i < lowPassed.length; i++) {
    let sum = 0, count = 0;
    for (let j = Math.max(0, i - hpSmooth); j <= Math.min(lowPassed.length - 1, i + hpSmooth); j++) {
      sum += lowPassed[j]; count++;
    }
    result.push(lowPassed[i] - sum / count);
  }
  return result;
}

function stopHRStream() {
  if (hrAnimFrame) cancelAnimationFrame(hrAnimFrame);
  if (hrCameraStream) hrCameraStream.getTracks().forEach(t => t.stop());
  hrCameraStream = null;
}

function showHeartRateUI() {
  const panel = $('#hr-measurement-panel'); if (panel) panel.style.display = 'block';
}

// ─── Breath Rate (Microphone-based) ────────────────────────────────
let brAudioCtx = null, brAnalyser = null, brStream = null, brAnimFrame = null;
let brStartTime = 0, brSamples = [], brTimer = null;

function startBreathRate() {
  if (!navigator.mediaDevices?.getUserMedia) { showToast('Microphone not available', 'error'); return; }
  showView('page-br-measurement');
  $('#br-result-view').style.display = 'none';
  $('#br-panel').style.display = 'block';
  $('#br-time-text').textContent = '30s';
  $('#br-tap-count').style.display = 'none';
  brSamples = [];
  
  navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => {
    brStream = stream; perms.microphone = true;
    brAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const src = brAudioCtx.createMediaStreamSource(stream);
    brAnalyser = brAudioCtx.createAnalyser();
    brAnalyser.fftSize = 1024;
    brAnalyser.smoothingTimeConstant = 0.8;
    src.connect(brAnalyser);
    brStartTime = Date.now();
    
    if (brTimer) clearInterval(brTimer);
    brTimer = setInterval(() => {
      const elapsed = (Date.now() - brStartTime) / 1000;
      const remaining = Math.max(0, 30 - elapsed);
      const ring = $('#br-ring-progress'); if (ring) ring.setAttribute('stroke-dashoffset', 283 * (1 - elapsed / 30));
      const txt = $('#br-time-text'); if (txt) txt.textContent = `${Math.ceil(remaining)}s`;
      if (elapsed >= 30) finishBreathRate();
    }, 100);
    
    brAnimFrame = requestAnimationFrame(captureBRFrame);
  }).catch(() => {
    showToast('Microphone permission needed for breathing analysis', 'error');
    showView('page-vitals');
  });
}

function captureBRFrame() {
  if (!brAnalyser) return;
  const buf = new Uint8Array(brAnalyser.frequencyBinCount);
  brAnalyser.getByteTimeDomainData(buf);
  
  // Use low-frequency energy (bass range) to detect inhalation/exhalation
  let sum = 0;
  for (let i = 0; i < 50; i++) { const v = (buf[i] - 128) / 128; sum += v * v; }
  const rms = Math.sqrt(sum / 50);
  
  const now = Date.now() - brStartTime;
  brSamples.push({ t: now, v: rms });
  drawBRWaveform();
  brAnimFrame = requestAnimationFrame(captureBRFrame);
}

function drawBRWaveform() {
  const canvas = $('#br-waveform'); if (!canvas) return;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#080f1a'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  const hist = brSamples.slice(-100);
  if (hist.length < 2) return;
  const min = Math.min(...hist.map(h => h.v)); const max = Math.max(...hist.map(h => h.v));
  const range = max - min || 1;
  ctx.beginPath(); ctx.strokeStyle = '#378ADD'; ctx.lineWidth = 2;
  hist.forEach((h, i) => {
    const x = (i / (hist.length - 1)) * canvas.width;
    const y = canvas.height - ((h.v - min) / range) * canvas.height * 0.8 - canvas.height * 0.1;
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  });
  ctx.stroke();
}

function finishBreathRate() {
  clearInterval(brTimer);
  if (brAnimFrame) cancelAnimationFrame(brAnimFrame);
  if (brStream) brStream.getTracks().forEach(t => t.stop());
  if (brAudioCtx) brAudioCtx.close();
  brStream = null; brAudioCtx = null; brAnalyser = null;
  
  // Detect peaks in breath samples
  const rmsValues = brSamples.map(s => s.v);
  const avg = rmsValues.reduce((a, b) => a + b, 0) / rmsValues.length;
  let peaks = 0;
  for (let i = 1; i < rmsValues.length - 1; i++) {
    if (rmsValues[i] > rmsValues[i-1] && rmsValues[i] >= rmsValues[i+1] && rmsValues[i] > avg * 1.15) peaks++;
  }
  const duration = brSamples.length > 0 ? (brSamples[brSamples.length-1].t - brSamples[0].t) / 1000 : 30;
  const bpm = Math.max(4, Math.min(40, Math.round((peaks / duration) * 60)));
  
  bio.breathRate = bpm;
  if (bpm) setMetric('respiratoryEffort', bpm, 'mic');
  const el = $('#br-result'); if (el) el.textContent = `${bpm} breaths/min`;
  const result = $('#br-result-view'); if (result) result.style.display = 'block';
  saveBiometric('breath_rate', bpm, 'breaths/min');
  updateHomeVitals(); updateGuardianRing(); sendTelemetry(); renderNotices();
  if (state.currentRoute === 'vitals') updateVitalsPage();
}

function stopBRStream() {
  if (brAnimFrame) cancelAnimationFrame(brAnimFrame);
  if (brStream) brStream.getTracks().forEach(t => t.stop());
  if (brAudioCtx) brAudioCtx.close();
  brStream = null; brAudioCtx = null; brAnalyser = null;
  if (brTimer) clearInterval(brTimer);
}

// ─── Temperature ───────────────────────────────────────────────────
function saveTemperature() {
  const input = $('#temp-input'); if (!input) return;
  let val = parseFloat(input.value); if (isNaN(val)) return;
  if (bio.tempUnit === 'F') val = (val - 32) * 5 / 9;
  bio.temperature = val;
  setMetric('skinTemp', parseFloat(val.toFixed(1)), 'manual');
  saveBiometric('temperature', val, 'celsius', { unit: bio.tempUnit });
  updateVitalsPage(); updateHomeVitals(); updateGuardianRing(); sendTelemetry(); renderNotices();
}
function toggleTempUnit() {
  bio.tempUnit = bio.tempUnit === 'C' ? 'F' : 'C';
  const label = $('#temp-unit-label'); if (label) label.textContent = bio.tempUnit;
  const input = $('#temp-input'); if (input && bio.temperature !== null) {
    input.value = bio.tempUnit === 'F' ? ((bio.temperature * 9/5) + 32).toFixed(1) : bio.temperature.toFixed(1);
  }
}

// ─── Save Biometric ────────────────────────────────────────────────
async function saveBiometric(type, value, unit, metadata = {}) {
  saveLocalVitalsHistory(type, value, unit);
  await apiFetch('/api/biometric-event', { method: 'POST', body: JSON.stringify({ type, value, unit, timestamp: new Date().toISOString(), metadata }) });
}

// ─── Permissions Onboarding ────────────────────────────────────────
function showPermissionsOnboarding() {
  if (localStorage.getItem('veda_perms_done')) { requestNotificationPermission(); return; }
  const overlay = $('#permissions-overlay'); if (overlay) overlay.style.display = 'flex';
}
function skipPermissions() { localStorage.setItem('veda_perms_done', '1'); hidePermissions(); requestNotificationPermission(); }
function hidePermissions() { const o = $('#permissions-overlay'); if (o) o.style.display = 'none'; }

async function allowPermission(perm) {
  if (perm === 'camera') { try { await navigator.mediaDevices.getUserMedia({ video: true }); perms.camera = true; } catch {} permAsked.camera = true; }
  if (perm === 'microphone') { try { await navigator.mediaDevices.getUserMedia({ audio: true }); perms.microphone = true; } catch {} permAsked.microphone = true; }
  if (perm === 'motion') { initStepCounter(); permAsked.motion = true; }
  if (perm === 'notifications') { await Notification.requestPermission().then(p => perms.notifications = p === 'granted'); }
  if (perm === 'location') { requestGPS(); }
  const btn = $(`#perm-${perm}`); if (btn) { btn.textContent = '✓ Allowed'; btn.classList.add('allowed'); }
}

// ─── Analysis UI ───────────────────────────────────────────────────
function updateAnalysisUI(d) {
  setAnalysisText('headline', d.headline);
  setAnalysisText('nurse-greeting', d.nurseGreeting);
  setAnalysisText('nature-context', d.natureContext);
  setAnalysisText('support-check', d.supportCheck);
  setAnalysisText('safety-notice', d.safetyNotice);
  renderList('stabilization-list', d.stabilizationSteps);
  renderList('nutrition-list', d.nutritionDetails);
  renderList('education-list', d.homeCareEducation);
  renderList('warning-list', d.warningSigns);
  setAnalysisText('next-action', d.nextAction);
  setAnalysisText('care-target', d.nearestCare?.name);
  if (d.emergencyMode) showEmergencyMode(d);
}
function setAnalysisText(id, text) { const el = $(`#${id}`); if (el) el.textContent = text || ''; }
function renderList(id, items) { const el = $(`#${id}`); if (el && items) el.innerHTML = items.map(i => `<li>${esc(i)}</li>`).join(''); }
function showEmergencyMode(d) {
  const btn = $('#emergency-btn'); if (btn) btn.style.display = 'flex';
  if (d.nearestCare) { setAnalysisText('emergency-facility', d.nearestCare.name); setAnalysisText('emergency-address', d.nearestCare.address); }
}

// ─── Page Renderers ────────────────────────────────────────────────
function updateVitalsPage() {
  setBiometricCard('bio-hr', bio.heartRate, 'bpm', 'Heart rate');
  setBiometricCard('bio-br', bio.breathRate, 'breaths/min', 'Breath rate');
  setBiometricCard('bio-steps', bio.steps, 'steps', 'Steps');
  setBiometricCard('bio-sleep', bio.sleepHours, 'hours', 'Sleep');
  setBiometricCard('bio-hyd', bio.hydration ? (bio.hydration/1000).toFixed(2) : null, 'L', 'Hydration');
  setBiometricCard('bio-temp', bio.temperature, '°C', 'Temperature');
  updateHydrationDisplay();
  updateStepCard();
  updateSleepUI();
  updateWeatherTempRef();
}
function setVitalPage(id, val, unit, label) {
  const v = $(`#${id}-val`); if (v) v.textContent = val;
  const u = $(`#${id}-unit`); if (u) u.textContent = unit;
  const l = $(`#${id}-label`); if (l) l.textContent = label;
}
function setBiometricCard(id, val, unit, label) {
  const v = $(`#${id}-val`); if (v) v.textContent = val !== null && val !== undefined ? val : '--';
  const u = $(`#${id}-unit`); if (u) u.textContent = unit;
  const l = $(`#${id}-label`); if (l) l.textContent = label;
}

function updateMeasurementHub() {
  const hub = $('#measurement-hub'); if (!hub) return;
  hub.innerHTML = `
    <h3 class="section-title">Measure now</h3>
    <div class="measure-grid">
      <button class="measure-btn" onclick="window.vedaApp.startHR()"><i class="ti-pulse"></i><span>Heart rate</span><small>30s camera</small></button>
      <button class="measure-btn" onclick="window.vedaApp.startBR()"><i class="ti-wind"></i><span>Breath rate</span><small>30s microphone</small></button>
      <button class="measure-btn" onclick="window.vedaApp.calibrateSteps()"><i class="ti-footprint"></i><span>Calibrate steps</span></button>
    </div>
    <div class="disclaimer"><i class="ti-alert-triangle"></i> Camera-based estimate. Improved green-channel algorithm. Not a medical device.</div>`;
}

function updateVitalsChart() {
  const canvas = $('#vitals-trend-chart'); if (!canvas) return;
  if (window._vitalsChart) window._vitalsChart.destroy();
  const history = getLocalVitalsHistory();
  const labels = history.length ? history.map(e => new Date(e.timestamp).toLocaleDateString([], { weekday: 'short' })) : ['No measured history'];
  const measuredData = type => history.map(e => e.type === type ? e.value : null);
  window._vitalsChart = new ChartJS(canvas, {
    type: 'line', data: {
      labels,
      datasets: [
        { label: 'Heart Rate', data: history.length ? measuredData('heart_rate') : [null], borderColor: '#2DD4A4', tension: 0.3, pointRadius: 3 },
        { label: 'Breath Rate', data: history.length ? measuredData('breath_rate') : [null], borderColor: '#378ADD', tension: 0.3, pointRadius: 3 },
        { label: 'Hydration L', data: history.length ? measuredData('hydration') : [null], borderColor: '#EF9F27', tension: 0.3, pointRadius: 3 },
      ]
    }, options: { responsive: true, plugins: { legend: { labels: { color: '#94a3b8', font: { size: 11 } } } }, scales: { x: { ticks: { color: '#64748b' }, grid: { color: '#1e293b' } }, y: { ticks: { color: '#64748b' }, grid: { color: '#1e293b' } } } }
  });
}

function getLocalVitalsHistory() {
  try { return JSON.parse(localStorage.getItem('veda_vitals_history') || '[]').slice(-14); }
  catch { return []; }
}

function saveLocalVitalsHistory(type, value, unit) {
  const history = getLocalVitalsHistory();
  history.push({ type, value, unit, timestamp: new Date().toISOString() });
  localStorage.setItem('veda_vitals_history', JSON.stringify(history.slice(-50)));
}

function renderSymptomGrid() {
  const grid = $('#symptom-grid'); if (!grid) return;
  const symptoms = ['headache','fever','dehydration','dizziness','breathing','lowSugar'];
  grid.innerHTML = symptoms.map(s => `
    <button class="symptom-btn ${state.symptoms.includes(s) ? 'active' : ''}" onclick="window.vedaApp.toggleSymptom('${s}')">
      <i class="ti-${s === 'headache' ? 'brain' : s === 'fever' ? 'thermometer' : s === 'dehydration' ? 'droplet' : s === 'dizziness' ? 'rotate-cw' : s === 'breathing' ? 'wind' : 'cake'}"></i>
      <span>${s}</span>
    </button>`).join('');
}

function toggleSymptom(s) { const i = state.symptoms.indexOf(s); i >= 0 ? state.symptoms.splice(i, 1) : state.symptoms.push(s); renderSymptomGrid(); sendTelemetry(); }

// ─── Map (Mapbox with Leaflet/OSM fallback) ────────────────────────
let mapInstance = null, mapMarkers = [], mapUserMarker = null, mapRouteLayer = null, mapRouteSource = 'route-line';

function initMapPage() {
  if (mapInstance) { refreshMapPosition(); loadMapContext(); return; }
  setMapStatus(state.location.lat ? 'Loading map...' : 'Waiting for GPS. Using approximate location if needed.');
  // Try cached token first
  const cachedToken = localStorage.getItem('veda_mapbox_token');
  if (cachedToken && window.mapboxgl) { initMapboxMap(cachedToken); return; }
  apiFetch('/api/map/tiles-token').then(d => {
    const token = d?.token;
    if (token) { localStorage.setItem('veda_mapbox_token', token); if (window.mapboxgl) return initMapboxMap(token); }
    if (window.L) return initLeafletMap();
    setMapStatus('Map library unavailable. GPS and nearby care still sync in the background.', 'error');
  });
}

function mapCenter() { return { lat: state.location.lat || 6.5244, lng: state.location.lng || 3.3792 }; }
function distanceBetween(lat1, lng1, lat2, lng2) {
  const toRad = x => x * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(6371000 * c);
}
function enrichPlaceDistances(place) {
  if (place.distanceMeters != null) return place;
  if (!state.location.lat || !state.location.lng || !place.lat || !place.lng) return { ...place, distanceMeters: null };
  return { ...place, distanceMeters: distanceBetween(state.location.lat, state.location.lng, place.lat, place.lng) };
}
function setMapStatus(text, type = 'info') {
  const el = $('#map-status');
  if (!el) return;
  el.textContent = text;
  el.className = `map-status ${type}`;
  el.classList.remove('fade-out');
  // Auto-hide after 4 seconds
  clearTimeout(el._fadeTimer);
  el._fadeTimer = setTimeout(() => { el.classList.add('fade-out'); }, 4000);
}

function initMapboxMap(token) {
  const c = mapCenter();
  mapboxgl.accessToken = token;
  state.mapProvider = 'mapbox';
  mapInstance = new mapboxgl.Map({
    container: 'map-container',
    style: LAYER_STYLES.street,
    center: [c.lng, c.lat],
    zoom: 15,
    pitch: 60,
    bearing: -17.6,
    antialias: true,
  });
  mapInstance.addControl(new mapboxgl.NavigationControl({ visualizePitch: true }), 'top-right');
  // Remove loading skeleton
  const skeleton = $('#map-skeleton'); if (skeleton) skeleton.remove();
  mapInstance.on('load', () => {
    // ── 3D Terrain DEM ──────────────────────────────────────
    mapInstance.addSource('mapbox-dem', {
      type: 'raster-dem',
      url: 'mapbox://mapbox.terrain-dem-v1',
      tileSize: 512,
      maxzoom: 14,
    });
    mapInstance.setTerrain({ source: 'mapbox-dem', exaggeration: 1.2 });
    
    // ── Atmosphere / Fog for 3D depth ───────────────────────
    mapInstance.setFog({
      color: 'rgb(12, 18, 32)',
      'high-color': 'rgb(30, 50, 80)',
      'horizon-blend': 0.1,
      'space-color': 'rgb(8, 12, 20)',
      'star-intensity': 0.6,
    });
    
    // ── Ensure fill-extrusion buildings are visible ──────────
    const layers = mapInstance.getStyle().layers;
    let labelLayerId;
    for (let i = 0; i < layers.length; i++) {
      if (layers[i].type === 'symbol' && layers[i].layout['text-field']) {
        labelLayerId = layers[i].id;
        break;
      }
    }
    
    // Add 3D buildings layer if not already present
    if (!mapInstance.getLayer('3d-buildings')) {
      mapInstance.addLayer({
        id: '3d-buildings',
        source: 'composite',
        'source-layer': 'building',
        type: 'fill-extrusion',
        minzoom: 14,
        paint: {
          'fill-extrusion-color': [
            'interpolate', ['linear'], ['get', 'height'],
            0, 'rgba(20,35,55,0.85)',
            50, 'rgba(30,60,90,0.9)',
            100, 'rgba(45,80,120,0.95)',
          ],
          'fill-extrusion-height': ['get', 'height'],
          'fill-extrusion-base': ['get', 'min_height'],
          'fill-extrusion-opacity': 0.75,
        },
      }, labelLayerId);
    }
    
    // ── Route source ────────────────────────────────────────
    mapInstance.addSource(mapRouteSource, { type: 'geojson', data: { type: 'Feature', geometry: { type: 'LineString', coordinates: [] } } });
    mapInstance.addLayer({ id: 'route-line-layer', type: 'line', source: mapRouteSource, paint: { 'line-color': '#2DD4A4', 'line-width': 4, 'line-opacity': 0.85 } });
    
    const layerControl = $('#map-layers'); if (layerControl) layerControl.style.display = 'flex';
    setMapStatus('Map ready with 3D terrain, buildings, and live GPS.');
    addUserMarker(); loadMapContext();
  });
}

function initLeafletMap() {
  const c = mapCenter();
  state.mapProvider = 'leaflet';
  mapInstance = L.map('map-container', {
    zoomControl: true,
    // Allow user to zoom freely — no max/min zoom restrictions
  }).setView([c.lat, c.lng], 15);
  L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
  }).addTo(mapInstance);
  const layerControl = $('#map-layers'); if (layerControl) layerControl.style.display = 'none';
  setMapStatus('Using OpenStreetMap. Nearby care and GPS active.');
  // Remove loading skeleton
  const skeleton = $('#map-skeleton'); if (skeleton) skeleton.remove();
  setTimeout(() => mapInstance.invalidateSize(), 200);
  addUserMarker(); loadMapContext();
}

function addUserMarker() {
  if (!state.location.lat) return;
  if (mapUserMarker?.remove) mapUserMarker.remove();
  const html = `<strong>Your location</strong><br>${locationAccuracyText()}`;
  if (state.mapProvider === 'mapbox') {
    const el = document.createElement('div'); el.className = 'user-marker-pulse';
    mapUserMarker = new mapboxgl.Marker({ element: el }).setLngLat([state.location.lng, state.location.lat]).setPopup(new mapboxgl.Popup().setHTML(html)).addTo(mapInstance);
  } else if (state.mapProvider === 'leaflet') {
    const icon = L.divIcon({ className: 'user-marker-pulse leaflet-user-marker', iconSize: [22, 22] });
    mapUserMarker = L.marker([state.location.lat, state.location.lng], { icon }).bindPopup(html).addTo(mapInstance);
  }
}

async function fetchGlobalHospitals(bbox) {
  if (!bbox) return;
  const overpassQuery = `[out:json];(node[amenity=hospital](${bbox.south},${bbox.west},${bbox.north},${bbox.east});way[amenity=hospital](${bbox.south},${bbox.west},${bbox.north},${bbox.east}););out center 50;`;
  try {
    const r = await fetch(`https://overpass-api.de/api/interpreter?data=${encodeURIComponent(overpassQuery)}`);
    if (!r.ok) return [];
    const d = await r.json();
    return (d.elements || []).filter(e => e.lat || e.center).map(e => ({
      name: e.tags?.name || 'Unnamed facility',
      type: 'hospital',
      lat: e.lat || e.center.lat,
      lng: e.lon || e.center.lon,
    })).filter(p => p.lat && p.lng);
  } catch { return []; }
}

async function loadMapContext() {
  if (!state.location.lat) { setMapStatus('Location permission needed for nearby care and route context.', 'warning'); return; }
  showLoadingBar();
  // Fetch from backend + global OpenStreetMap
  const [backendResult, globalHospitals] = await Promise.all([
    apiFetch('/api/map/context', { method: 'POST', body: JSON.stringify({ lat: state.location.lat, lng: state.location.lng, symptoms: state.symptoms }) }),
    fetchGlobalHospitals({ south: state.location.lat - 0.1, north: state.location.lat + 0.1, west: state.location.lng - 0.1, east: state.location.lng + 0.1 })
  ]);
  hideLoadingBar();
  
  let allPlaces = globalHospitals || [];
  if (backendResult?.nearbyCare) allPlaces = [...backendResult.nearbyCare, ...globalHospitals.filter(g => !backendResult.nearbyCare.some(b => Math.abs(b.lat - g.lat) < 0.001))];
  allPlaces = allPlaces.map(enrichPlaceDistances).sort((a, b) => (a.distanceMeters || Infinity) - (b.distanceMeters || Infinity));
  
  applyMapContextEnvironment(backendResult);
  addPlaceMarkers(allPlaces);
  renderNearbyCareList(allPlaces);
  if (backendResult) displayWeather(backendResult.weather);
  updateEnvRow(); updateLocationPanel(); renderNotices();
  updateStreetAddressDisplay();
  
  // Listen for map moves to fetch hospitals in viewport
  if (mapInstance && !window._mapMoveListener) {
    window._mapMoveListener = true;
    let moveTimer;
    mapInstance.on('moveend', async () => {
      clearTimeout(moveTimer);
      moveTimer = setTimeout(async () => {
        const bounds = state.mapProvider === 'mapbox' ? mapInstance.getBounds() : mapInstance.getBounds();
        if (!bounds) return;
        const bbox = { south: bounds.getSouth(), north: bounds.getNorth(), west: bounds.getWest(), east: bounds.getEast() };
        const hospitals = await fetchGlobalHospitals(bbox);
        if (hospitals.length) {
          addPlaceMarkers(hospitals);
          // Update carousel only if we're not too zoomed out
          if (mapInstance.getZoom() > 10) renderNearbyCareList(hospitals.slice(0, 8));
        }
      }, 500);
    });
  }
}

function addPlaceMarkers(places) {
  clearMapMarkers();
  if (!mapInstance) return;
  places.forEach(p => {
    const gmapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lng}`;
    const distText = p.distanceMeters ? `${Math.round(p.distanceMeters)}m away` : 'Distance unknown';
    const popup = `
      <div class="popup-name">${esc(p.name)}</div>
      <div class="popup-type">${esc(p.type)}</div>
      <div class="popup-dist">${esc(distText)}</div>
      <div class="popup-actions">
        <a href="${gmapsUrl}" target="_blank" class="popup-action-btn primary" style="text-decoration:none;"><i class="ti-brand-google-maps"></i> Maps</a>
        <button class="popup-action-btn secondary" onclick="window.vedaApp.getDirections(${p.lat},${p.lng},'${esc(p.name)}')"><i class="ti-route"></i> Route</button>
        ${p.type === 'hospital' || p.type === 'pharmacy' ? `<a href="tel:0800" class="popup-action-btn call" style="text-decoration:none;"><i class="ti-phone"></i> Call</a>` : ''}
      </div>`;
    if (state.mapProvider === 'mapbox') {
      const el = document.createElement('div');
      el.className = `place-marker ${p.type}`;
      mapMarkers.push(new mapboxgl.Marker({ element: el }).setLngLat([p.lng, p.lat]).setPopup(new mapboxgl.Popup({ maxWidth: '260px' }).setHTML(popup)).addTo(mapInstance));
    } else if (state.mapProvider === 'leaflet') {
      const icon = L.divIcon({ className: 'place-marker leaflet-place-marker', html: `<span style="background:${p.type === 'hospital' ? '#E24B4A' : p.type === 'pharmacy' ? '#378ADD' : '#EF9F27'}"></span>`, iconSize: [18, 18] });
      mapMarkers.push(L.marker([p.lat, p.lng], { icon }).bindPopup(popup, { maxWidth: '260px' }).addTo(mapInstance));
    }
  });
}
function clearMapMarkers() { mapMarkers.forEach(m => m.remove()); mapMarkers = []; }
function displayWeather(w) {
  const el = $('#map-weather'); if (!el) return;
  if (!w || w.temperature === null || w.temperature === undefined) { el.textContent = 'Weather unavailable'; return; }
  el.textContent = `${Math.round(w.temperature)}°C · ${classifyWeather(w)}`;
}

let _nearbyPlacesCache = [];
function renderNearbyCareList(places) {
  _nearbyPlacesCache = places;
  _nearbyPlaces = places;
  const list = $('#nearby-care-list'); if (!list) return;
  if (!places.length) { list.innerHTML = '<div class="nearby-empty">No nearby care returned for this location yet.</div>'; return; }
  list.innerHTML = places.slice(0, 8).map(p => {
    const distanceText = p.distanceMeters ? `${Math.round(p.distanceMeters)}m away` : 'Distance unknown';
    return `
      <button class="nearby-card" onclick="window.vedaApp.selectSearch(${p.lat},${p.lng})">
        <span class="nearby-type ${esc(p.type)}">${esc(p.type)}</span>
        <strong>${esc(p.name)}</strong>
        <small>${esc(distanceText)}</small>
      </button>`;
  }).join('');
  checkGeofence();
  updateWeatherOverlay();
  updateFavoritesFAB();
}

async function getDirections(lat, lng, name) {
  if (!state.location.lat) return; showLoadingBar();
  _routeDestination = { lat, lng, name };
  const d = await apiFetch(`/api/map/route?from_lat=${state.location.lat}&from_lng=${state.location.lng}&to_lat=${lat}&to_lng=${lng}`);
  hideLoadingBar(); if (!d || !d.geometry?.coordinates?.length) return;
  if (state.mapProvider === 'mapbox' && mapInstance.getSource(mapRouteSource)) {
    mapInstance.getSource(mapRouteSource).setData({ type: 'Feature', geometry: d.geometry });
  } else if (state.mapProvider === 'leaflet') {
    if (mapRouteLayer) mapRouteLayer.remove();
    mapRouteLayer = L.polyline(d.geometry.coordinates.map(([lngVal, latVal]) => [latVal, lngVal]), { color: '#2DD4A4', weight: 5 }).addTo(mapInstance);
    mapInstance.fitBounds(mapRouteLayer.getBounds(), { padding: [24, 24] });
  }
  showRouteSheet(`${d.distance_km} km · ${d.duration_minutes} min`, `Route to ${name}`);
}

function showRouteSheet(info, title) { const s = $('#route-sheet'); if (s) { s.querySelector('.sheet-info').textContent = info; s.classList.add('active'); } }
function closeRouteSheet() { $('#route-sheet')?.classList.remove('active'); }
function showSearchDropdown(results) {
  const dd = $('#search-results'); if (!dd) return;
  dd.innerHTML = results.map(r => `
    <div class="search-result-item" onclick="window.vedaApp.selectSearch(${r.lat},${r.lng})">
      <strong>${esc(r.name)}</strong>
      ${r.address ? `<div style="font-size:12px;color:#94a3b8;margin-top:4px;">${esc(r.address)}</div>` : ''}
    </div>`).join('');
  dd.style.display = results.length ? 'block' : 'none';
}
function selectSearch(lat, lng) {
  if (state.mapProvider === 'mapbox') mapInstance.flyTo({ center: [lng, lat], zoom: 16 });
  if (state.mapProvider === 'leaflet') mapInstance.setView([lat, lng], 16);
  const dd = $('#search-results'); if (dd) dd.style.display = 'none';
  const place = _nearbyPlacesCache.find(p => Math.abs(p.lat - lat) < 0.0001 && Math.abs(p.lng - lng) < 0.0001);
  if (place) showETACard(lat, lng); else hideETACard();
}
function closeEmergencySheet() { $('#emergency-sheet')?.classList.remove('active'); }
function toggleEmergencyExpand(e) {
  const s = $('#emergency-sheet'); if (!s) return;
  if (e && e.stopPropagation) e.stopPropagation();
  s.classList.toggle('expanded');
}
function toggleMapMenu() { const s=$('#map-menu-sheet');if(s)s.classList.toggle('active'); }

function refreshMapPosition() {
  if (!mapInstance || !state.location.lat) return;
  // Do NOT move the map — only update the marker position silently.
  // Users should freely pan/zoom without being pulled back.
  if (state.mapProvider === 'mapbox') mapInstance.resize();
  if (state.mapProvider === 'leaflet') mapInstance.invalidateSize();
  addUserMarker();
  updateStreetAddressDisplay();
}

function recenterMap() {
  if (!mapInstance || !state.location.lat) return;
  if (state.mapProvider === 'mapbox') {
    mapInstance.flyTo({ center: [state.location.lng, state.location.lat], zoom: 15, essential: true });
  }
  if (state.mapProvider === 'leaflet') {
    mapInstance.flyTo([state.location.lat, state.location.lng], 15);
  }
  addUserMarker();
  const btn = $('#my-location-btn');
  if (btn) { btn.classList.add('recentered'); setTimeout(() => btn.classList.remove('recentered'), 1500); }
}

// ─── Feature 1: Emergency SOS with Countdown ───────────────────────
let _sosTimer = null, _sosCountdown = 10;
function callEmergency() {
  _sosCountdown = 10;
  const sheet = $('#emergency-sheet');
  if (sheet) sheet.classList.add('active');
  updateSOSDisplay();
  _sosTimer = setInterval(() => {
    _sosCountdown--;
    updateSOSDisplay();
    if (_sosCountdown <= 0) { cancelSOS(); window.location.href = 'tel:112'; }
  }, 1000);
}
function updateSOSDisplay() {
  const cd = $('#sos-countdown'); if (cd) cd.textContent = _sosCountdown;
  const txt = $('#sos-timer-text'); if (txt) txt.textContent = _sosCountdown;
  const ring = $('#sos-ring-fill'); if (ring) ring.setAttribute('stroke-dashoffset', 283 * (1 - _sosCountdown / 10));
  const cdExp = $('#sos-countdown-expanded'); if (cdExp) cdExp.textContent = _sosCountdown;
  const txtExp = $('#sos-timer-text-expanded'); if (txtExp) txtExp.textContent = _sosCountdown;
  const ringExp = $('#sos-ring-fill-expanded'); if (ringExp) ringExp.setAttribute('stroke-dashoffset', 283 * (1 - _sosCountdown / 10));
}
function cancelSOS() {
  if (_sosTimer) { clearInterval(_sosTimer); _sosTimer = null; }
  const s = $('#emergency-sheet'); if (s) { s.classList.remove('active'); s.classList.remove('expanded'); }
}

// ─── Feature 3: Share My Location ──────────────────────────────────
function shareLocation() {
  if (!state.location.lat) { showToast('Location not available yet', 'warning'); return; }
  const url = `https://www.google.com/maps?q=${state.location.lat},${state.location.lng}`;
  const text = `📍 My current location: ${url}`;
  if (navigator.share) {
    navigator.share({ title: 'VEDA — My Location', text, url }).catch(() => {});
  } else if (navigator.clipboard) {
    navigator.clipboard.writeText(text).then(() => showToast('Location copied to clipboard', 'success'));
  } else { window.open(url, '_blank'); }
}

// ─── Feature 4: Map Layer Switcher ─────────────────────────────────
const LAYER_STYLES = {
  street: 'mapbox://styles/mapbox/streets-v12',
  dark: 'mapbox://styles/mapbox/dark-v11',
  satellite: 'mapbox://styles/mapbox/satellite-streets-v12',
};
function switchLayer(layerName) {
  if (!mapInstance || state.mapProvider !== 'mapbox') return;
  mapInstance.setStyle(LAYER_STYLES[layerName] || LAYER_STYLES.street);
  $$('.layer-btn').forEach(b => b.classList.toggle('active', b.dataset.layer === layerName));
}

// ─── Feature 5: Walking/Driving ETA ────────────────────────────────
let _selectedPlace = null;
function showETACard(lat, lng) {
  _selectedPlace = { lat, lng };
  const card = $('#eta-card'); if (card) card.style.display = 'flex';
  const walkEl = $('#eta-walk'); const driveEl = $('#eta-drive');
  if (walkEl) walkEl.textContent = '...';
  if (driveEl) driveEl.textContent = '...';
  if (state.location.lat) {
    fetch(`https://router.project-osrm.org/route/v1/foot/${state.location.lng},${state.location.lat};${lng},${lat}?overview=false`).then(r=>r.json()).then(d=>{const rt=d.routes?.[0];if(rt&&walkEl)walkEl.textContent=`Walk ${Math.round(rt.duration/60)} min`;}).catch(()=>{if(walkEl)walkEl.textContent='Walk --';});
    fetch(`https://router.project-osrm.org/route/v1/driving/${state.location.lng},${state.location.lat};${lng},${lat}?overview=false`).then(r=>r.json()).then(d=>{const rt=d.routes?.[0];if(rt&&driveEl)driveEl.textContent=`Drive ${Math.round(rt.duration/60)} min`;}).catch(()=>{if(driveEl)driveEl.textContent='Drive --';});
  }
}
function hideETACard() { const card=$('#eta-card');if(card)card.style.display='none';_selectedPlace=null; }

// ─── Feature 6: Geofence Alerts ────────────────────────────────────
let _lastGeofenceAlert = 0, _nearbyPlaces = [];
function checkGeofence() {
  if (!state.location.lat || !_nearbyPlaces.length) return;
  const now = Date.now();
  if (now - _lastGeofenceAlert < 120000) return;
  for (const place of _nearbyPlaces) {
    if (place.distanceMeters < 500 && (place.type === 'hospital' || place.type === 'pharmacy')) {
      _lastGeofenceAlert = now; showGeofenceAlert(place); break;
    }
  }
}
function showGeofenceAlert(place) {
  const existing = document.querySelector('.geofence-alert'); if (existing) existing.remove();
  const el = document.createElement('div'); el.className = 'geofence-alert';
  el.innerHTML = `<i class="ti-map-pin"></i><div><div class="geo-text">Near ${esc(place.name)}</div><div class="geo-sub">${place.distanceMeters}m · ${esc(place.type)}</div></div><button class="geo-action" onclick="window.vedaApp.selectSearch(${place.lat},${place.lng})">Go</button>`;
  document.body.appendChild(el);
  // Auto-play voice alert
  if ('speechSynthesis' in window) {
    speechSynthesis.cancel();
    const msg = new SpeechSynthesisUtterance(`Heads up. You are near ${place.name}. Tap to get directions.`);
    msg.rate = 0.85; speechSynthesis.speak(msg);
  }
  setTimeout(() => el.remove(), 8000);
  if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
}

// ─── Feature 7: Weather Overlay Badge ──────────────────────────────
function updateWeatherOverlay() {
  const el = $('#map-weather');
  if (!el || !state.environment.outsideTemp) { if(el)el.style.display='none'; return; }
  el.style.display = 'block';
  el.textContent = `${state.environment.outsideTemp}°C · ${state.environment.weather || 'Clear'}`;
}

// ─── Feature 8: Vital Overlay Mode ─────────────────────────────────
let _vitalOverlayActive = false, _vitalOverlayMarkers = [];
function toggleVitalOverlay(active) {
  _vitalOverlayActive = active;
  if (!active) { _vitalOverlayMarkers.forEach(m=>m.remove()); _vitalOverlayMarkers=[]; return; }
  if (!state.location.lat || !mapInstance) return;
  const color = anyMeasuredVitals() ? (state.lastAnalysis?.riskLevel==='Urgent'?'red':state.lastAnalysis?.riskLevel==='Watch'?'yellow':'green') : 'yellow';
  if (state.mapProvider === 'mapbox') {
    const el = document.createElement('div'); el.className = `vital-overlay-marker ${color}`;
    const m = new mapboxgl.Marker({element:el}).setLngLat([state.location.lng,state.location.lat]).setPopup(new mapboxgl.Popup().setHTML(`<strong>Your vitals</strong><br>Risk: ${state.lastAnalysis?.riskLevel||'Unknown'}`)).addTo(mapInstance);
    _vitalOverlayMarkers.push(m);
  }
}

// ─── Feature 9: Voice-Guided Navigation ────────────────────────────
function startVoiceNav() {
  if (!_routeDestination) return;
  if (!('speechSynthesis' in window)) { showToast('Voice not supported','warning'); return; }
  const msg = new SpeechSynthesisUtterance(`Starting navigation to ${_routeDestination.name}. Follow the green route line. Opening Google Maps.`);
  msg.rate = 0.9; speechSynthesis.speak(msg);
  openRouteInGoogleMaps();
}

// ─── Feature 10: Favorite Places ───────────────────────────────────
function getFavorites() { try { return JSON.parse(localStorage.getItem('veda_favorites')||'[]'); } catch { return []; } }
function saveFavorites(favs) { localStorage.setItem('veda_favorites',JSON.stringify(favs)); }
function toggleFavorite(place) {
  const favs=getFavorites(); const idx=favs.findIndex(f=>f.lat===place.lat&&f.lng===place.lng);
  if(idx>=0){favs.splice(idx,1);showToast('Removed from favorites','info');}
  else{favs.push({name:place.name,type:place.type,lat:place.lat,lng:place.lng});showToast('Saved to favorites','success');}
  saveFavorites(favs); renderFavoritesList(); updateFavoritesFAB();
}
function toggleFavoritesPanel() { const p=$('#favorites-panel');if(!p)return;p.style.display=p.style.display==='none'?'block':'none';if(p.style.display==='block')renderFavoritesList(); }
function toggleNearbyPanel() { const l=$('#nearby-care-list');if(!l)return;l.style.display=l.style.display==='none'?'flex':'none'; }
function renderFavoritesList() {
  const list=$('#favorites-list');const empty=$('#favorites-empty');const favs=getFavorites();
  if(!list)return; if(!favs.length){if(empty)empty.style.display='block';list.innerHTML='';return;}
  if(empty)empty.style.display='none';
  list.innerHTML=favs.map((f,i)=>`<div class="fav-item" onclick="window.vedaApp.selectSearch(${f.lat},${f.lng})"><i class="ti-star-filled"></i><span class="fav-name">${esc(f.name)}</span><span class="fav-type">${esc(f.type)}</span><button class="fav-remove" onclick="event.stopPropagation();window.vedaApp.removeFavorite(${i})"><i class="ti-trash"></i></button></div>`).join('');
}
function removeFavorite(idx){const favs=getFavorites();favs.splice(idx,1);saveFavorites(favs);renderFavoritesList();updateFavoritesFAB();}
function updateFavoritesFAB(){const btn=$('#favorites-fab');if(btn)btn.classList.toggle('has-favorites',getFavorites().length>0);}

let _routeDestination = null;
function openRouteInGoogleMaps() {
  if (!_routeDestination) return;
  window.open(`https://www.google.com/maps/dir/?api=1&destination=${_routeDestination.lat},${_routeDestination.lng}`, '_blank');
}

let searchDebounce = null;
function onSearchInput(q) { clearTimeout(searchDebounce); if (q.length < 2) { showSearchDropdown([]); return; } searchDebounce = setTimeout(async () => { const d = await apiFetch(`/api/map/search?q=${encodeURIComponent(q)}&lat=${state.location.lat}&lng=${state.location.lng}`); if (d) showSearchDropdown(d); }, 350); }

function closeChat() { state.chatOpen = false; $('#chat-panel')?.classList.remove('open'); }
function openChat() { state.chatOpen = true; $('#chat-panel')?.classList.add('open'); }

// ─── Fitbit Connected Device ───────────────────────────────────────
async function checkFitbitStatus() {
  const d = await apiFetch('/api/integrations/fitbit/status');
  if (!d) return;
  state.fitbit = { ...state.fitbit, ...d };
  renderFitbitCard();
}

function connectFitbit() {
  window.location.href = `${API_BASE}/api/integrations/fitbit/connect`;
}

async function syncFitbit() {
  showLoadingBar();
  const d = await apiFetch('/api/integrations/fitbit/sync', { method: 'POST' });
  hideLoadingBar();
  if (!d) { showToast('Fitbit sync failed. Reconnect Fitbit or try again.', 'error'); return; }
  state.fitbit.connected = true;
  state.fitbit.lastSyncedAt = d.syncedAt;
  state.fitbit.metrics = d.metrics || {};
  applyFitbitMetrics(state.fitbit.metrics);
  updateVitalsPage();
  updateHomeVitals();
  renderFitbitCard();
  showToast('Fitbit synced with VEDA', 'success');
}

function applyFitbitMetrics(metrics = {}) {
  const get = key => metrics[key]?.value;
  if (get('heart_rate') !== undefined) { bio.heartRate = Math.round(get('heart_rate')); setMetric('heartRate', bio.heartRate, 'fitbit'); }
  if (get('breath_rate') !== undefined) { bio.breathRate = Math.round(get('breath_rate')); setMetric('respiratoryEffort', bio.breathRate, 'fitbit'); }
  if (get('steps') !== undefined) { bio.steps = Math.max(0, Math.round(get('steps'))); }
  if (get('sleep') !== undefined) { bio.sleepHours = Number(get('sleep')); bio.sleepSource = 'fitbit'; }
  if (get('oxygen') !== undefined) { setMetric('oxygen', Math.round(get('oxygen')), 'fitbit'); }
  if (get('hrv') !== undefined) { setMetric('hrv', Math.round(get('hrv')), 'fitbit'); }
  if (get('skin_temperature_variation') !== undefined) { bio.temperature = Number(get('skin_temperature_variation')); setMetric('skinTemp', bio.temperature, 'fitbit'); }
  updateStepCard(); updateGuardianRing(); sendTelemetry(); renderNotices();
}

function renderFitbitCard() {
  const card = $('#fitbit-card'); if (!card) return;
  const f = state.fitbit;
  const statusText = f.connected ? 'Connected' : f.configured ? 'Ready to connect' : 'Not configured';
  const statusClass = f.connected ? 'success' : f.configured ? 'info' : 'warning';
  const lastSync = f.lastSyncedAt ? new Date(f.lastSyncedAt).toLocaleString() : 'Never synced';
  const metricNames = Object.values(f.metrics || {}).map(m => m?.label).filter(Boolean).slice(0, 5).join(', ');
  card.innerHTML = `
    <div class="integration-card-head">
      <div><strong>Fitbit</strong><small>Connected wearable source for HR, steps, sleep, HRV, SpO₂ when available</small></div>
      <span class="integration-status ${statusClass}">${statusText}</span>
    </div>
    <p class="integration-copy">${esc(f.message || 'Connect Fitbit to replace phone estimates with supported wearable readings.')}</p>
    <div class="integration-meta"><span>Last sync</span><strong>${esc(lastSync)}</strong></div>
    ${metricNames ? `<div class="integration-meta"><span>Synced</span><strong>${esc(metricNames)}</strong></div>` : ''}
    <div class="integration-actions">
      <button class="btn-sm" onclick="window.vedaApp.connectFitbit()" ${f.configured ? '' : 'disabled'}>Connect Fitbit</button>
      <button class="btn-sm" onclick="window.vedaApp.syncFitbit()" ${f.connected ? '' : 'disabled'}>Sync now</button>
    </div>`;
}

function handleFitbitReturnParams() {
  const params = new URLSearchParams(window.location.search);
  const fitbitStatus = params.get('fitbit');
  if (!fitbitStatus) return;
  const msg = params.get('message') || (fitbitStatus === 'connected' ? 'Fitbit connected' : 'Fitbit connection failed');
  showToast(msg.replaceAll('_', ' '), fitbitStatus === 'connected' ? 'success' : 'error');
  history.replaceState(null, '', `${location.origin}${location.pathname}${location.hash || '#/profile'}`);
}

// ─── Chat ──────────────────────────────────────────────────────────
function addChatMsg(role, text) {
  const list = $('#chat-messages'); if (!list) return;
  const d = document.createElement('div'); d.className = `chat-msg ${role}`;
  if (role === 'assistant') { d.innerHTML = DOMPurify.sanitize(marked.parse(text)); } else { d.innerHTML = `<p>${esc(text)}</p>`; }
  list.appendChild(d); list.scrollTop = list.scrollHeight;
}

async function sendChat() {
  const inp = $('#chat-input'); const txt = inp?.value.trim(); if (!txt) return; if (inp) inp.value = '';
  addChatMsg('user', esc(txt)); addChatMsg('assistant', 'Generating response...');
  const d = await apiFetch('/api/wellness-event', { method: 'POST', body: JSON.stringify({ eventType: 'chat', message: txt, vitals: state.vitals, environment: state.environment, symptoms: state.symptoms }) });
  const list = $('#chat-messages'); const last = list?.querySelector('.chat-msg.assistant:last-child');
  if (last && d) { last.innerHTML = DOMPurify.sanitize(marked.parse(d.conversationReply || d.reply || 'I hear you.')); }
}

// ─── Profile ───────────────────────────────────────────────────────
function renderProfile() {
  const p = $('#profile-form'); if (!p) return;
  const weight = localStorage.getItem('veda_weight') || '';
  p.innerHTML = `
    <div class="form-group"><label>Name</label><input type="text" id="pf-name" value="Zagzy" class="form-input" /></div>
    <div class="form-group"><label>Weight (kg)</label><input type="number" id="pf-weight" value="${weight}" class="form-input" placeholder="e.g. 70" step="0.1" min="20" max="300" /></div>
    <div class="form-group"><label>Preferred tone</label><select id="pf-tone" class="form-input"><option value="calm_nurse" selected>Calm nurse</option><option value="friend">Friend</option></select></div>
    <div id="fitbit-card" class="integration-card"></div>
    <div class="form-group"><label>Stress breathing monitor</label><label class="toggle"><input type="checkbox" id="pf-stress" ${bio.stressEnabled ? 'checked' : ''} /><span class="toggle-slider"></span></label></div>
    <div class="form-group"><label>Temperature unit</label><select id="pf-temp-unit" class="form-input"><option value="C" ${bio.tempUnit==='C'?'selected':''}>Celsius</option><option value="F" ${bio.tempUnit==='F'?'selected':''}>Fahrenheit</option></select></div>
    <button class="btn primary" onclick="window.vedaApp.saveProfile()">Save</button>`;
  renderFitbitCard();
}
function saveProfile() {
  bio.stressEnabled = $('#pf-stress')?.checked || false;
  bio.tempUnit = $('#pf-temp-unit')?.value || 'C';
  // Save weight
  const weightVal = parseFloat($('#pf-weight')?.value);
  if (weightVal && weightVal > 20) {
    bio.weight = weightVal;
    localStorage.setItem('veda_weight', weightVal.toString());
    updateHydrationTarget();
    updateHydrationDisplay();
  }
  if (bio.stressEnabled) startStressMonitor(); else stopStressMonitor();
  showToast('Profile saved', 'success');
}

function renderHistory() {
  const el = $('#history-content'); if (!el) return;
  apiFetch('/api/wellness-history?days=7').then(d => {
    if (!d || !d.length) { el.innerHTML = '<p class="empty-state">No biometric data yet.</p>'; return; }
    el.innerHTML = d.map(e => `<div class="history-item"><span class="history-type">${e.type}</span><span class="history-value">${e.value} ${e.unit}</span><span class="history-time">${new Date(e.timestamp).toLocaleString()}</span></div>`).join('');
  });
}

// ─── Home Page Helpers ─────────────────────────────────────────────
function updateGreeting() {
  const now = new Date();
  const h = now.getHours();
  const time = h < 12 ? 'morning' : h < 17 ? 'afternoon' : 'evening';
  const el = $('#greeting-time'); if (el) el.textContent = time;
  const date = $('#greeting-date'); if (date) date.textContent = now.toLocaleDateString('en-NG', { weekday: 'long', month: 'long', day: 'numeric' });
}

function updateGuardianRing() {
  const ring = $('#guardian-ring-fill'); if (!ring) return;
  if (!anyMeasuredVitals()) {
    ring.setAttribute('stroke-dashoffset', 364.4);
    const scoreEl = $('#ring-score'); if (scoreEl) scoreEl.textContent = '--';
    return;
  }
  const v = state.vitals;
  let score = 70;
  if (metricMeasured('oxygen')) score += Math.min(10, Math.max(-25, (v.oxygen - 94) * 3));
  if (metricMeasured('heartRate')) score += v.heartRate < 50 || v.heartRate > 120 ? -18 : v.heartRate > 100 ? -8 : 8;
  if (metricMeasured('respiratoryEffort')) score += v.respiratoryEffort < 10 || v.respiratoryEffort > 24 ? -12 : 6;
  if (metricMeasured('hydration')) score += v.hydration < 45 ? -15 : v.hydration > 70 ? 8 : 0;
  if (metricMeasured('skinTemp')) score += v.skinTemp > 37.8 || v.skinTemp < 35.5 ? -15 : 6;
  score = Math.round(score);
  const clamped = Math.max(0, Math.min(100, score));
  const offset = 364.4 * (1 - clamped / 100);
  ring.setAttribute('stroke-dashoffset', offset);
  const scoreEl = $('#ring-score'); if (scoreEl) scoreEl.textContent = clamped;
}

function updateEnvRow() {
  const e = state.environment;
  setEnv('env-temp', e.outsideTemp === null || e.outsideTemp === undefined ? '--' : `${e.outsideTemp}°`);
  setEnv('env-aqi', e.airQuality);
  setEnv('env-weather', e.weather);
  setEnv('env-gps', locationAccuracyText(true));
}
function setEnv(id, val) { const el = $(`#${id}`); if (el) el.textContent = val; }

function locationAccuracyText(short = false) {
  if (!state.location.lat) return '--';
  if (state.location.source === 'fallback') return short ? 'Approx' : 'Approximate location';
  return state.location.accuracy ? (short ? `±${state.location.accuracy}m` : `GPS accuracy ±${state.location.accuracy}m`) : 'GPS active';
}

function updateLocationPanel() {
  const loc = state.location;
  const coords = loc.lat ? `${loc.lat.toFixed(5)}, ${loc.lng.toFixed(5)}` : 'Acquiring GPS...';
  setEnv('location-text', loc.source === 'fallback' ? `Approximate: ${coords}` : `Patient GPS: ${coords}`);
  const e = state.environment;
  const tempText = e.outsideTemp === null || e.outsideTemp === undefined ? 'Weather syncing...' : `${e.outsideTemp}°C outside · ${e.weather}`;
  setEnv('location-temp', tempText);
  setEnv('location-accuracy', locationAccuracyText(false));
  setEnv('location-updated', `Updated ${formatUpdatedTime(loc.updatedAt)}`);
}

function renderNotices() {
  const d = state.lastAnalysis;
  const container = $('#notices-container'); if (!container) return;
  let html = '';
  if (!anyMeasuredVitals()) {
    html += `<div class="notice-card info"><i class="ti-info-circle" style="color:#378ADD"></i><div><div class="notice-title">Measurements needed</div><div class="notice-desc">Home vitals are no longer guessed. Measure heart/breath rate, log water, enter temperature, or connect Fitbit for stronger analysis.</div></div></div>`;
  }
  if (state.environment.outsideTemp !== null) {
    html += `<div class="notice-card info"><i class="ti-cloud" style="color:#2DD4A4"></i><div><div class="notice-title">Environment synced</div><div class="notice-desc">${esc(state.environment.weather)} · ${state.environment.outsideTemp}°C outside · Air ${esc(state.environment.airQuality)}.</div></div></div>`;
  }
  if (!d) {
    html += `<div class="notices-empty">Monitoring active — no urgent pattern detected yet.</div>`;
    container.innerHTML = html;
    return;
  }
  if (d.emergencyMode) {
    html += `<div class="notice-card warning"><i class="ti-alert-triangle" style="color:#E24B4A"></i><div><div class="notice-title">Emergency detected</div><div class="notice-desc">${esc(d.headline || 'Urgent care needed')}</div></div></div>`;
  }
  if (d.supportCheck && !d.emergencyMode) {
    html += `<div class="notice-card info"><i class="ti-info-circle" style="color:#2DD4A4"></i><div><div class="notice-title">VEDA check</div><div class="notice-desc">${esc(d.supportCheck)}</div></div></div>`;
  }
  if (d.natureContext && !d.emergencyMode) {
    html += `<div class="notice-card info"><i class="ti-cloud" style="color:#378ADD"></i><div><div class="notice-title">Environment</div><div class="notice-desc">${esc(d.natureContext)}</div></div></div>`;
  }
  if (!html) {
    html = `<div class="notices-empty">All vitals within normal range. VEDA is watching quietly.</div>`;
  }
  container.innerHTML = html;
}

function init() {
  checkBackend(); startWeatherLoop(); initHydration(); showPermissionsOnboarding(); checkFitbitStatus(); handleFitbitReturnParams();
  window.addEventListener('hashchange', onRouteChange); onRouteChange();
  setupTabKeyboardNavigation();
  $('#status-pill')?.addEventListener('click', () => { if (state.backendStatus === 'failed') checkBackend(); });
  $('#chat-close')?.addEventListener('click', closeChat);
  $('#chat-send')?.addEventListener('click', sendChat);
  $('#chat-input')?.addEventListener('keydown', e => { if (e.key === 'Enter') sendChat(); });
  requestGPS();
  updateHomeVitals(); updateGuardianRing(); updateEnvRow(); updateLocationPanel(); renderNotices();
  window.addEventListener('click', e => {
    const dd = $('#search-results');
    if (!dd || dd.style.display !== 'block') return;
    if (!e.target.closest('#map-search-input') && !e.target.closest('#search-results')) {
      dd.style.display = 'none';
    }
  });
  const mapSearchInput = $('#map-search-input');
  if (mapSearchInput) {
    mapSearchInput.addEventListener('keydown', e => {
      if (e.key === 'Escape') {
        const sr = $('#search-results'); if (sr) sr.style.display = 'none';
      }
    });
  }
  // Init reverse geocode on page load if location already available
  if (state.location.lat) reverseGeocodePosition(state.location.lat, state.location.lng);
}

// ─── Public API ────────────────────────────────────────────────────
window.vedaApp = {
  startHR: startHeartRateMeasurement, stopHR: stopHRStream,
  startBR: startBreathRate, stopBR: stopBRStream,
  logWater, toggleTempUnit, saveTemperature,
  toggleSymptom, openChat, sendChat,
  getDirections, selectSearch, onSearchInput,
  closeRouteSheet, closeEmergencySheet, closeChat,
  recenterMap, callEmergency, openRouteInGoogleMaps, cancelSOS,
  shareLocation, switchLayer, showETACard, hideETACard,
  toggleVitalOverlay, startVoiceNav,
  toggleFavorite, toggleFavoritesPanel, removeFavorite,
  toggleNearbyPanel, toggleMapMenu,
  toggleEmergencyExpand: toggleEmergencyExpand,
  saveProfile, skipPermissions, allowPermission,
  connectFitbit, syncFitbit, sleepNow, wakeNow,
  calibrateSteps: () => { bio.prevMotionMagnitude = null; bio.stepThreshold = 1.8; showToast('Step counter calibrated. Phone steps remain an estimate.', 'success'); },
};

init();