const BASE = '';
const REQUESTED_WITH = 'XMLHttpRequest';
const PENDING_HEALTH_KEY = 'veda_pending_health_readings';
const LOCAL_HEALTH_KEYS = [
  'veda_latest_vitals',
  'veda_steps',
  'veda_steps_date',
  'veda_hydration_ml',
  'veda_hydration_date',
  PENDING_HEALTH_KEY,
];

export type VedaRole = 'system_admin' | 'attending' | 'nurse' | 'patient' | 'admin' | 'clinician' | 'caregiver';

export interface AuthUser {
  id: string;
  email: string;
  role: VedaRole;
}

interface AuthResponse {
  accessToken: string;
  expiresIn: number;
  user: AuthUser;
}

let accessToken: string | null = null;
let currentUser: AuthUser | null = null;
let refreshInFlight: Promise<AuthUser | null> | null = null;

export function setSession(session: AuthResponse): AuthUser {
  accessToken = session.accessToken;
  currentUser = session.user;
  return session.user;
}

export function clearSession() {
  accessToken = null;
  currentUser = null;
}

type PendingHealthReading = { id: string; type: string; createdAt: string };

function readPendingHealthReadings(): PendingHealthReading[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(PENDING_HEALTH_KEY) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writePendingHealthReadings(readings: PendingHealthReading[]) {
  try {
    if (readings.length) localStorage.setItem(PENDING_HEALTH_KEY, JSON.stringify(readings));
    else localStorage.removeItem(PENDING_HEALTH_KEY);
  } catch {}
}

export function markPendingHealthReading(type: string): string {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  writePendingHealthReadings([...readPendingHealthReadings(), { id, type, createdAt: new Date().toISOString() }]);
  return id;
}

export function resolvePendingHealthReading(id: string) {
  writePendingHealthReadings(readPendingHealthReadings().filter(reading => reading.id !== id));
}

export function hasPendingLocalReadings(): boolean {
  if (readPendingHealthReadings().length > 0) return true;
  try {
    return LOCAL_HEALTH_KEYS
      .filter(key => key !== PENDING_HEALTH_KEY)
      .some(key => Boolean(localStorage.getItem(key)));
  } catch {
    return false;
  }
}

export function clearLocalHealthState() {
  try {
    for (const key of LOCAL_HEALTH_KEYS) localStorage.removeItem(key);
  } catch {}
}

export function getCurrentUser(): AuthUser | null {
  return currentUser;
}

const CONSENT_SERVER_FEATURE: Record<string, string> = {
  health_data_processing: 'health_data',
  shareable_summary: 'sharing',
  medication_reminders: 'reminders',
  bp_glucose_logging: 'health_data',
};

// Mirror a local consent decision to the server-of-record (the durable record).
// Returns true when the server accepted it; false when offline or signed out —
// the local cache still stands, so callers should not block the UI on this.
export async function syncConsentRecord(feature: string, version: string, granted: boolean): Promise<boolean> {
  const serverFeature = CONSENT_SERVER_FEATURE[feature] || feature;
  const data = await apiFetch<{ consent?: unknown }>('/api/consent', {
    method: 'POST',
    body: JSON.stringify({ feature: serverFeature, version, granted }),
  });
  return Boolean(data?.consent);
}

function jsonHeaders(opts: RequestInit): Headers {
  const headers = new Headers(opts.headers || {});
  if (!headers.has('Content-Type') && opts.body !== undefined) headers.set('Content-Type', 'application/json');
  if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`);
  return headers;
}

async function readJson<T>(response: Response): Promise<T | null> {
  try {
    return await response.json() as T;
  } catch {
    return null;
  }
}

async function performRefresh(): Promise<AuthUser | null> {
  const hadSession = Boolean(accessToken || currentUser);
  try {
    const response = await fetch(`${BASE}/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        'X-Requested-With': REQUESTED_WITH,
      },
      body: '{}',
    });
    if (!response.ok) {
      clearSession();
      if (hadSession) window.dispatchEvent(new CustomEvent('veda:session-expired'));
      return null;
    }
    const session = await readJson<AuthResponse>(response);
    if (!session?.accessToken || !session.user) {
      clearSession();
      if (hadSession) window.dispatchEvent(new CustomEvent('veda:session-expired'));
      return null;
    }
    return setSession(session);
  } catch {
    clearSession();
    if (hadSession) window.dispatchEvent(new CustomEvent('veda:session-expired'));
    return null;
  }
}

function refreshSession(): Promise<AuthUser | null> {
  if (!refreshInFlight) {
    refreshInFlight = performRefresh().finally(() => {
      refreshInFlight = null;
    });
  }
  return refreshInFlight;
}

export function restoreSession(): Promise<AuthUser | null> {
  return refreshSession();
}

export async function login(email: string, password: string): Promise<AuthUser> {
  const response = await fetch(`${BASE}/auth/login`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const payload = await readJson<AuthResponse & { error?: string }>(response);
  if (!response.ok || !payload?.accessToken || !payload.user) throw new Error(payload?.error || 'Unable to log in');
  return setSession(payload);
}

export async function register(email: string, password: string): Promise<AuthUser> {
  const response = await fetch(`${BASE}/auth/register`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const payload = await readJson<{ error?: string }>(response);
  if (!response.ok) throw new Error(payload?.error || 'Unable to register');
  return login(email, password);
}

export async function logout(): Promise<void> {
  try {
    await fetch(`${BASE}/auth/logout`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        'X-Requested-With': REQUESTED_WITH,
      },
      body: '{}',
    });
  } finally {
    clearSession();
    clearLocalHealthState();
  }
}

async function request<T>(path: string, opts: RequestInit): Promise<{ response: Response; data: T | null }> {
  const response = await fetch(`${BASE}${path}`, {
    ...opts,
    credentials: 'include',
    headers: jsonHeaders(opts),
  });
  return { response, data: await readJson<T>(response) };
}

export async function apiFetch<T>(path: string, opts: RequestInit = {}, allowRefresh = true): Promise<T | null> {
  try {
    const result = await request<T>(path, opts);
    if (result.response.status === 401 && allowRefresh && !path.startsWith('/auth/')) {
      const refreshed = await refreshSession();
      if (refreshed) return apiFetch<T>(path, opts, false);
    }
    if (!result.response.ok) return null;
    return result.data;
  } catch {
    return null;
  }
}

/** UI context only; authorization is always derived from the JWT server-side. */
export function getActor() {
  if (!currentUser) return { userId: 'local-user', role: 'patient' as VedaRole, patientId: 'local-user', wardId: '', tenantId: 'default' };
  return { userId: currentUser.id, role: currentUser.role, patientId: currentUser.id, wardId: '', tenantId: 'default' };
}

export function canCreateVitals(role: VedaRole) {
  return ['patient', 'nurse', 'attending', 'system_admin', 'admin', 'clinician', 'caregiver'].includes(role);
}

export function getLegacyPatientId(): string | null {
  try {
    const existing = localStorage.getItem('veda_legacy_patient_id') || localStorage.getItem('veda_patient_id');
    if (existing) localStorage.setItem('veda_legacy_patient_id', existing);
    return existing;
  } catch {
    return null;
  }
}

export function clearLocalIdentity() {
  for (const key of ['veda_user_id', 'veda_patient_id', 'veda_role', 'veda_tenant_id', 'veda_ward_id']) localStorage.removeItem(key);
}