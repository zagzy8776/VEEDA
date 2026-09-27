const BASE = import.meta.env.VITE_API_URL || 'https://veeda.onrender.com';
const KEY = import.meta.env.VITE_VEDA_API_KEY || '';

export type VedaRole = 'system_admin' | 'attending' | 'nurse' | 'patient';

/**
 * Every browser gets one private, unique user ID automatically.
 * No hospital ID, tenant, or patient number is required from the user.
 */
function ensureLocalUserId(): string {
  const existing = localStorage.getItem('veda_user_id');
  if (existing && !['local-user', 'patient-001', 'user-001'].includes(existing)) {
    if (!localStorage.getItem('veda_patient_id') || ['local-user', 'patient-001'].includes(localStorage.getItem('veda_patient_id')!)) {
      localStorage.setItem('veda_patient_id', existing);
    }
    return existing;
  }
  const id =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? `u-${crypto.randomUUID().slice(0, 12)}`
      : `u-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  localStorage.setItem('veda_user_id', id);
  localStorage.setItem('veda_patient_id', id);
  localStorage.setItem('veda_role', 'patient');
  return id;
}

export function getActor() {
  const userId = ensureLocalUserId();
  const role = (localStorage.getItem('veda_role') || 'patient') as VedaRole;
  return {
    userId,
    role,
    patientId: localStorage.getItem('veda_patient_id') || userId,
    wardId: '',
    tenantId: 'default',
  };
}

export function canCreateVitals(role: VedaRole) {
  return role === 'patient' || role === 'nurse' || role === 'attending' || role === 'system_admin';
}

export async function apiFetch<T>(path: string, opts: RequestInit = {}): Promise<T | null> {
  const actor = getActor();
  try {
    const res = await fetch(`${BASE}${path}`, {
      ...opts,
      headers: {
        'Content-Type': 'application/json',
        'x-veda-api-key': KEY,
        'x-veda-user-id': actor.userId,
        'x-veda-role': actor.role,
        'x-veda-patient-id': actor.patientId,
        'x-veda-ward-id': actor.wardId,
        'x-veda-tenant-id': actor.tenantId,
        ...opts.headers,
      },
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}
