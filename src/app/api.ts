import { readingsStorageKey } from './bpGlucose';
import { hasConsent } from './consent';
import type { VedaRole } from './types';

export type AuthUser = {
  id: string;
  email: string;
  role: VedaRole;
};

type AuthResponse = {
  accessToken: string;
  user: AuthUser;
};

const BASE = '';
const REQUESTED_WITH = 'XMLHttpRequest';
const LOCAL_USER_ID = 'local';
const SESSION_STORAGE_KEY = 'veda_session_v1';
const PENDING_HEALTH_KEY = 'veda_pending_health_readings';
const LOCAL_HEALTH_KEYS = [
  'veda_latest_vitals',
  'veda_steps',
  'veda_steps_date',
  'veda_hydration_ml',
  'veda_hydration_date',
];

let accessToken: string | null = null;
let currentUser: AuthUser | null = null;
let refreshInFlight: Promise<AuthUser | null> | null = null;

function persistSession(session: AuthResponse | null) {
  try {
    if (session?.accessToken && session?.user) {
      sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify({
        accessToken: session.accessToken,
        user: session.user,
      }));
    } else {
      sessionStorage.removeItem(SESSION_STORAGE_KEY);
    }
  } catch {}
}

function readPersistedSession(): AuthResponse | null {
  try {
    const raw = sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AuthResponse;
    if (parsed?.accessToken && parsed?.user?.id) return parsed;
  } catch {}
  return null;
}

export function setSession(session: AuthResponse): AuthUser {
  accessToken = session.accessToken;
  currentUser = session.user;
  persistSession(session);
  return session.user;
}

export function clearSession() {
  accessToken = null;
  currentUser = null;
  persistSession(null);
}

export function getCurrentUser(): AuthUser | null {
  return currentUser;
}

function jsonHeaders(opts: RequestInit = {}): Headers {
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
      if (accessToken && currentUser) return currentUser;
      clearSession();
      if (hadSession) window.dispatchEvent(new CustomEvent('veda:session-expired'));
      return null;
    }
    const session = await readJson<AuthResponse>(response);
    if (!session?.accessToken || !session.user) {
      if (accessToken && currentUser) return currentUser;
      clearSession();
      if (hadSession) window.dispatchEvent(new CustomEvent('veda:session-expired'));
      return null;
    }
    return setSession(session);
  } catch {
    if (accessToken && currentUser) return currentUser;
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

export async function restoreSession(): Promise<AuthUser | null> {
  const cached = readPersistedSession();
  if (cached) {
    accessToken = cached.accessToken;
    currentUser = cached.user;
    refreshSession().catch(() => {});
    return cached.user;
  }
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
  } catch {}
  clearSession();
}

async function request<T>(path: string, opts: RequestInit = {}): Promise<{ response: Response; data: T | null }> {
  const response = await fetch(`${BASE}${path}`, {
    ...opts,
    credentials: 'include',
    headers: jsonHeaders(opts),
  });
  if (response.status === 401 && !path.startsWith('/auth/')) {
    const refreshed = await refreshSession();
    if (refreshed) {
      const retry = await fetch(`${BASE}${path}`, {
        ...opts,
        credentials: 'include',
        headers: jsonHeaders(opts),
      });
      return { response: retry, data: await readJson<T>(retry) };
    }
  }
  return { response, data: await readJson<T>(response) };
}

export async function apiFetch<T>(path: string, opts: RequestInit = {}): Promise<T | null> {
  try {
    const { response, data } = await request<T>(path, opts);
    if (!response.ok) return null;
    return data;
  } catch {
    return null;
  }
}

export async function apiFetchDetailed<T>(path: string, opts: RequestInit = {}): Promise<{ ok: boolean; status: number; data: T | null }> {
  try {
    const { response, data } = await request<T>(path, opts);
    return { ok: response.ok, status: response.status, data };
  } catch {
    return { ok: false, status: 0, data: null };
  }
}

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

export function clearLocalHealthState(userId: string = currentUser?.id ?? LOCAL_USER_ID) {
  try {
    for (const key of LOCAL_HEALTH_KEYS) localStorage.removeItem(key);
  } catch {}
}

export function hasPendingLocalReadings(): boolean {
  try {
    if (LOCAL_HEALTH_KEYS.some((key) => Boolean(localStorage.getItem(key)))) return true;
    if (localStorage.getItem(readingsStorageKey(currentUser?.id ?? LOCAL_USER_ID))) return true;
    return false;
  } catch {
    return false;
  }
}

export async function syncConsentedReadings(userId: string, consented: boolean): Promise<boolean> {
  return false;
}

export async function listDependents(): Promise<ServerDependent[]> {
  const data = await apiFetch<{ dependents?: ServerDependent[] }>('/api/dependents');
  return data?.dependents || [];
}

export type ServerDependent = { id: string; displayName?: string; name?: string };

export async function exportAccountData(): Promise<string | null> {
  return null;
}

export async function deleteAccount(password: string, confirm: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const { response, data } = await request<{ error?: string }>('/api/account', {
      method: 'DELETE',
      body: JSON.stringify({ password, confirm }),
    });
    if (response.ok) return { ok: true };
    return { ok: false, error: data?.error || 'The account could not be deleted.' };
  } catch {
    return { ok: false, error: 'Could not reach the server.' };
  }
}

export { LOCAL_USER_ID };
