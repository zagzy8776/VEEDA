import { useMemo, useState } from 'react';
import { HeartPulse, ListChecks, Pill, Siren } from 'lucide-react';
import { getProfile, loadProfilePack, type ConditionId, type ProfileLoadResult } from '../conditionProfiles.ts';
import type { ProfileLogEntry } from '../profileLog.ts';

// Condition-profiles surface (Phase 3).
//
// It renders ONLY what a validated pack provides. With no approved pack it shows
// a plain "not available" state. Warning signs, log fields, reminders, medicine
// warnings and the emergency card all come from the pack; this component writes
// none of that text.

const C = {
  teal: '#2DD4A4', blue: '#378ADD', amber: '#EF9F27', red: '#E24B4A',
  text: '#E2F4F0', muted: '#5A7A72', card: 'rgba(13,21,37,0.88)', border: 'rgba(255,255,255,0.08)',
};

const CONDITIONS: { id: ConditionId; label: string }[] = [
  { id: 'sickle_cell', label: 'Sickle cell' },
  { id: 'kidney_disease', label: 'Kidney disease' },
  { id: 'epilepsy', label: 'Epilepsy' },
  { id: 'hypertension', label: 'Hypertension' },
  { id: 'diabetes', label: 'Diabetes' },
];

export interface ConditionsPageProps {
  pack: unknown;
  production: boolean;
  /** Prior log entries for the selected condition (from the device store). */
  entriesFor?: (condition: ConditionId) => ProfileLogEntry[];
  onClose?: () => void;
}

export function ConditionsPage({ pack, production, entriesFor, onClose }: ConditionsPageProps) {
  const loaded = useMemo<ProfileLoadResult>(() => loadProfilePack(pack, { production }), [pack, production]);
  const [selected, setSelected] = useState<ConditionId>('sickle_cell');

  if (loaded.ok === false) {
    return (
      <Shell onClose={onClose}>
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 16 }}>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>Condition profiles are not available right now</div>
          <div style={{ color: C.muted, fontSize: 12, lineHeight: 1.5 }}>
            No approved condition pack is loaded, so nothing is shown. If you feel unwell, get medical help.
          </div>
        </div>
      </Shell>
    );
  }

  const profile = getProfile(loaded, selected);
  const entries = entriesFor ? entriesFor(selected) : [];

  return (
    <Shell onClose={onClose}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
        {CONDITIONS.map(c => (
          <button
            key={c.id}
            onClick={() => setSelected(c.id)}
            style={{
              padding: '7px 12px', borderRadius: 999, cursor: 'pointer', fontSize: 12, fontWeight: 600,
              border: `1px solid ${selected === c.id ? C.teal : C.border}`,
              background: selected === c.id ? 'rgba(45,212,164,0.14)' : 'transparent',
              color: selected === c.id ? C.teal : C.text,
            }}
          >
            {c.label}
          </button>
        ))}
      </div>

      {!profile ? (
        <div style={{ color: C.muted, fontSize: 12 }}>
          This condition is not in the approved pack. Nothing is shown.
        </div>
      ) : (
        <>
          <Section icon={Siren} title="Warning signs">
            {profile.warningSigns.length === 0 ? <Empty /> : profile.warningSigns.map(w => (
              <div key={w.id} style={{ marginBottom: 8 }}>
                <div style={{ fontWeight: 600, fontSize: 13 }}>{w.label}</div>
                <div style={{ color: C.muted, fontSize: 12 }}>{w.action}</div>
              </div>
            ))}
          </Section>

          <Section icon={ListChecks} title="My log">
            {profile.logFields.length === 0 ? <Empty /> : (
              <div style={{ color: C.muted, fontSize: 12, marginBottom: 8 }}>
                Fields: {profile.logFields.map(f => `${f.label}${f.unit ? ` (${f.unit})` : ''}`).join(', ')}
              </div>
            )}
            <div style={{ color: C.muted, fontSize: 11 }}>{entries.length} saved on this device</div>
          </Section>

          <Section icon={HeartPulse} title="Test reminders">
            {profile.testReminders.length === 0 ? <Empty /> : profile.testReminders.map(r => (
              <div key={r.id} style={{ marginBottom: 6, fontSize: 12 }}>
                <span style={{ fontWeight: 600 }}>{r.label}</span> <span style={{ color: C.muted }}>— {r.schedule}</span>
              </div>
            ))}
          </Section>

          <Section icon={Pill} title="Medicine warnings">
            {profile.medicineWarnings.length === 0 ? <Empty /> : profile.medicineWarnings.map(m => (
              <div key={m.id} style={{ marginBottom: 6, fontSize: 12, color: C.amber }}>{m.warning}</div>
            ))}
            <div style={{ color: C.muted, fontSize: 10, marginTop: 6 }}>
              Warnings come from the reviewed pack. VEEDA does not prescribe and lists no drugs of its own.
            </div>
          </Section>

          <Section icon={Siren} title={profile.emergencyCard.title}>
            {profile.emergencyCard.lines.map((line, i) => (
              <div key={i} style={{ fontSize: 12, marginBottom: 4 }}>{line}</div>
            ))}
          </Section>
        </>
      )}
    </Shell>
  );
}

function Shell({ children, onClose }: { children: React.ReactNode; onClose?: () => void }) {
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1500, background: '#0A1120', overflowY: 'auto', padding: 18, color: C.text }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <div style={{ fontSize: 18, fontWeight: 800 }}>Condition profiles</div>
        {onClose && (
          <button onClick={onClose} style={{ background: 'transparent', border: `1px solid ${C.border}`, color: C.text, borderRadius: 8, padding: '6px 10px', cursor: 'pointer' }}>
            Close
          </button>
        )}
      </div>
      {children}
    </div>
  );
}

function Section({ icon: Icon, title, children }: { icon: typeof Siren; title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 14, marginBottom: 10 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', fontWeight: 700, fontSize: 14, marginBottom: 8 }}>
        <Icon size={16} color={C.teal} /> {title}
      </div>
      {children}
    </div>
  );
}

function Empty() {
  return <div style={{ color: C.muted, fontSize: 12 }}>None in the approved pack.</div>;
}
