const BASE = import.meta.env.VITE_API_URL || 'https://veeda.onrender.com';
const KEY = import.meta.env.VITE_VEDA_API_KEY || '';

export type VedaRole = 'system_admin' | 'attending' | 'nurse' | 'patient';

export function getActor() {
  return {
    userId: localStorage.getItem('veda_user_id') || import.meta.env.VITE_VEDA_USER_ID || 'local-user',
    role: (localStorage.getItem('veda_role') || import.meta.env.VITE_VEDA_ROLE || 'patient') as VedaRole,
    patientId: localStorage.getItem('veda_patient_id') || import.meta.env.VITE_VEDA_PATIENT_ID || 'local-user',
    wardId: localStorage.getItem('veda_ward_id') || import.meta.env.VITE_VEDA_WARD_ID || '',
    tenantId: localStorage.getItem('veda_tenant_id') || import.meta.env.VITE_VEDA_TENANT_ID || 'default',
  };
}

export function canCreateVitals(role: VedaRole) {
  return role === 'nurse' || role === 'attending' || role === 'system_admin';
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
