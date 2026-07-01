import { Activity, Shield, UserRound, Stethoscope } from 'lucide-react';
import { useState } from 'react';
import type { VedaRole } from '../api';
import { getActor } from '../api';

const C = { teal: '#2DD4A4', blue: '#378ADD', amber: '#EF9F27', text: '#E2F4F0', muted: '#5A7A72', card: 'rgba(13,21,37,0.94)', border: 'rgba(255,255,255,0.1)' };

const roles: { role: VedaRole; label: string; desc: string; icon: typeof UserRound }[] = [
  { role: 'patient', label: 'Patient', desc: 'Own vitals and trends', icon: UserRound },
  { role: 'nurse', label: 'Nurse', desc: 'Assigned ward vitals entry', icon: Activity },
  { role: 'attending', label: 'Attending Physician', desc: 'Clinical roster oversight', icon: Stethoscope },
  { role: 'system_admin', label: 'System Admin', desc: 'Tenant operations', icon: Shield },
];

export function LoginGateway({ onContinue }: { onContinue: () => void }) {
  const actor = getActor();
  const [patientId, setPatientId] = useState(actor.patientId);
  const [wardId, setWardId] = useState(actor.wardId || 'ward-a');
  const [tenantId, setTenantId] = useState(actor.tenantId);

  // Only allow non-patient roles if explicitly set via query param or env var
  const showRoleSelector = new URLSearchParams(window.location.search).has('veda_role_override') || import.meta.env.VITE_ENABLE_CLINICIAN_ROLES === 'true';
  const [role, setRole] = useState<VedaRole>(showRoleSelector ? actor.role : 'patient');

  function enter() {
    localStorage.setItem('veda_role', role);
    localStorage.setItem('veda_patient_id', patientId || 'patient-001');
    localStorage.setItem('veda_user_id', role === 'patient' ? patientId || 'patient-001' : `${role}-001`);
    localStorage.setItem('veda_ward_id', wardId || 'ward-a');
    localStorage.setItem('veda_tenant_id', tenantId || 'hospital-001');
    onContinue();
  }

  function resetRole() {
    localStorage.removeItem('veda_role');
    localStorage.removeItem('veda_patient_id');
    localStorage.removeItem('veda_user_id');
    localStorage.removeItem('veda_ward_id');
    localStorage.removeItem('veda_tenant_id');
    setRole('patient');
    setPatientId('');
    setWardId('ward-a');
    setTenantId('');
  }

  return (
    <div style={{ minHeight: '100dvh', background: '#07101D', display: 'grid', placeItems: 'center', padding: 24 }}>
      <div style={{ width: '100%', maxWidth: 420 }}>
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 28, color: C.text, fontWeight: 800 }}><span style={{ color: C.teal }}>V</span>EEDA</div>
          <div style={{ fontSize: 13, color: C.muted, marginTop: 4 }}>Institutional access gateway</div>
        </div>
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 18, padding: 18 }}>
          {showRoleSelector ? (
            <>
              <div style={{ display: 'grid', gap: 8, marginBottom: 14 }}>
                {roles.map(({ role: r, label, desc, icon: Icon }) => {
                  const active = role === r;
                  return (
                    <button key={r} onClick={() => setRole(r)} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 12, borderRadius: 12, border: `1px solid ${active ? C.teal : C.border}`, background: active ? 'rgba(45,212,164,0.12)' : '#0A1220', color: C.text, cursor: 'pointer', textAlign: 'left' }}>
                      <Icon size={18} style={{ color: active ? C.teal : C.muted }} />
                      <span style={{ flex: 1 }}>
                        <span style={{ display: 'block', fontSize: 13, fontWeight: 800 }}>{label}</span>
                        <span style={{ display: 'block', fontSize: 11, color: C.muted, marginTop: 2 }}>{desc}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
              <button onClick={resetRole} style={{ width: '100%', marginTop: 8, marginBottom: 14, padding: 10, borderRadius: 12, border: 'none', background: 'transparent', color: C.muted, fontSize: 11, cursor: 'pointer' }}>Reset role to Patient</button>
            </>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 12, borderRadius: 12, border: `1px solid ${C.teal}`, background: 'rgba(45,212,164,0.12)', color: C.text, marginBottom: 14 }}>
              <UserRound size={18} style={{ color: C.teal }} />
              <span>
                <span style={{ display: 'block', fontSize: 13, fontWeight: 800 }}>Patient</span>
                <span style={{ display: 'block', fontSize: 11, color: C.muted, marginTop: 2 }}>Default access · Own vitals and trends</span>
              </span>
            </div>
          )}
          <div style={{ display: 'grid', gap: 10 }}>
            <input value={tenantId} onChange={e => setTenantId(e.target.value)} placeholder="Tenant / hospital ID" style={inputStyle} />
            <input value={patientId} onChange={e => setPatientId(e.target.value)} placeholder="Patient ID" style={inputStyle} />
            <input value={wardId} onChange={e => setWardId(e.target.value)} placeholder="Ward ID (if applicable)" style={inputStyle} />
          </div>
          <button onClick={enter} style={{ width: '100%', marginTop: 16, padding: 13, borderRadius: 12, border: 'none', background: C.teal, color: '#04342C', fontWeight: 900, cursor: 'pointer' }}>Enter VEEDA</button>
        </div>
      </div>
    </div>
  );
}

const inputStyle = {
  width: '100%',
  boxSizing: 'border-box' as const,
  padding: '10px 12px',
  background: '#0A1220',
  border: '0.5px solid rgba(255,255,255,0.1)',
  borderRadius: 10,
  color: C.text,
  fontSize: 14,
  outline: 'none',
};
