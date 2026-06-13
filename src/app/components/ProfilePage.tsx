import { motion } from 'motion/react';
import { User, Weight, Ruler, Droplets, Bell, Camera, Mic, MapPin, Shield, ChevronRight, ExternalLink } from 'lucide-react';
import { useState } from 'react';

const C = {
  teal: '#2DD4A4',
  blue: '#378ADD',
  amber: '#EF9F27',
  red: '#E24B4A',
  text: '#E2F4F0',
  muted: '#5A7A72',
  card: 'rgba(13,21,37,0.88)',
  border: 'rgba(255,255,255,0.08)',
};

function ToggleSwitch({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!on)}
      style={{
        width: 44,
        height: 24,
        borderRadius: 12,
        background: on ? C.teal : 'rgba(255,255,255,0.1)',
        border: 'none',
        cursor: 'pointer',
        position: 'relative',
        transition: 'background 0.25s ease',
        flexShrink: 0,
      }}
    >
      <div style={{
        position: 'absolute',
        top: 3,
        left: on ? 23 : 3,
        width: 18,
        height: 18,
        borderRadius: '50%',
        background: on ? '#04342C' : '#5A7A72',
        transition: 'left 0.25s ease, background 0.25s ease',
      }} />
    </button>
  );
}

function ProfileField({ label, value, children }: { label: string; value?: string; children?: React.ReactNode }) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '12px 0',
      borderBottom: `0.5px solid ${C.border}`,
    }}>
      <span style={{ fontSize: 13, color: C.muted }}>{label}</span>
      {children ?? <span style={{ fontSize: 13, color: C.text, fontWeight: 600 }}>{value}</span>}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: C.muted, marginBottom: 8 }}>{title}</div>
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 18, padding: '0 16px', backdropFilter: 'blur(12px)' }}>
        <div style={{ paddingBottom: 4 }}>
          {children}
        </div>
      </div>
    </div>
  );
}

export function ProfilePage() {
  const [perms, setPerms] = useState({ camera: true, mic: false, location: true, notifications: true });
  const [unit, setUnit] = useState<'metric' | 'imperial'>('metric');

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.24 }}
      style={{ overflowY: 'auto', height: '100%', scrollbarWidth: 'none' }}
    >
      <div style={{ padding: '0 20px 100px' }}>

        {/* Header */}
        <div style={{ paddingTop: 22, paddingBottom: 20 }}>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: C.text, lineHeight: 1 }}>Profile</h2>
          <p style={{ fontSize: 12, color: C.muted, marginTop: 4 }}>Settings & preferences</p>
        </div>

        {/* Avatar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24 }}>
          <div style={{
            width: 64,
            height: 64,
            borderRadius: '50%',
            background: 'linear-gradient(135deg, rgba(45,212,164,0.25), rgba(55,138,221,0.2))',
            border: '2px solid rgba(45,212,164,0.3)',
            display: 'grid',
            placeItems: 'center',
            color: C.teal,
          }}>
            <User size={28} strokeWidth={1.8} />
          </div>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700, color: C.text }}>Zagzy</div>
            <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>Since June 2025</div>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, marginTop: 6, padding: '3px 10px', background: 'rgba(45,212,164,0.1)', borderRadius: 8, border: '0.5px solid rgba(45,212,164,0.2)' }}>
              <Shield size={10} style={{ color: C.teal }} />
              <span style={{ fontSize: 10, color: C.teal, fontWeight: 700 }}>Free plan</span>
            </div>
          </div>
        </div>

        {/* Personal info */}
        <Section title="Personal">
          <ProfileField label="Name">
            <input
              defaultValue="Zagzy"
              style={{
                width: 120,
                padding: '5px 10px',
                background: '#0A1220',
                border: `0.5px solid ${C.border}`,
                borderRadius: 8,
                color: C.text,
                fontSize: 13,
                textAlign: 'right',
                outline: 'none',
              }}
            />
          </ProfileField>
          <ProfileField label="Age">
            <input
              type="number"
              defaultValue="28"
              style={{
                width: 70,
                padding: '5px 10px',
                background: '#0A1220',
                border: `0.5px solid ${C.border}`,
                borderRadius: 8,
                color: C.text,
                fontSize: 13,
                textAlign: 'right',
                outline: 'none',
              }}
            />
          </ProfileField>
          <ProfileField label="Biological sex">
            <select
              defaultValue="male"
              style={{
                padding: '5px 10px',
                background: '#0A1220',
                border: `0.5px solid ${C.border}`,
                borderRadius: 8,
                color: C.text,
                fontSize: 13,
                outline: 'none',
                cursor: 'pointer',
              }}
            >
              <option value="male">Male</option>
              <option value="female">Female</option>
              <option value="other">Other</option>
            </select>
          </ProfileField>
        </Section>

        {/* Body metrics */}
        <Section title="Body Metrics">
          <ProfileField label="Weight">
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <input type="number" defaultValue="75" style={{ width: 60, padding: '5px 10px', background: '#0A1220', border: `0.5px solid ${C.border}`, borderRadius: 8, color: C.text, fontSize: 13, textAlign: 'right', outline: 'none' }} />
              <span style={{ fontSize: 12, color: C.muted }}>kg</span>
            </div>
          </ProfileField>
          <ProfileField label="Height">
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <input type="number" defaultValue="178" style={{ width: 60, padding: '5px 10px', background: '#0A1220', border: `0.5px solid ${C.border}`, borderRadius: 8, color: C.text, fontSize: 13, textAlign: 'right', outline: 'none' }} />
              <span style={{ fontSize: 12, color: C.muted }}>cm</span>
            </div>
          </ProfileField>
          <ProfileField label="Daily water target">
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <input type="number" defaultValue="2500" style={{ width: 70, padding: '5px 10px', background: '#0A1220', border: `0.5px solid ${C.border}`, borderRadius: 8, color: C.text, fontSize: 13, textAlign: 'right', outline: 'none' }} />
              <span style={{ fontSize: 12, color: C.muted }}>ml</span>
            </div>
          </ProfileField>
          <ProfileField label="Step goal">
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <input type="number" defaultValue="10000" style={{ width: 75, padding: '5px 10px', background: '#0A1220', border: `0.5px solid ${C.border}`, borderRadius: 8, color: C.text, fontSize: 13, textAlign: 'right', outline: 'none' }} />
              <span style={{ fontSize: 12, color: C.muted }}>steps</span>
            </div>
          </ProfileField>
        </Section>

        {/* Permissions */}
        <Section title="Permissions">
          {[
            { key: 'camera' as const, icon: Camera, label: 'Camera', desc: 'Heart rate measurement' },
            { key: 'mic' as const, icon: Mic, label: 'Microphone', desc: 'Breathing analysis' },
            { key: 'location' as const, icon: MapPin, label: 'Location', desc: 'Nearby care & weather' },
            { key: 'notifications' as const, icon: Bell, label: 'Notifications', desc: 'Hydration reminders' },
          ].map(({ key, icon: Icon, label, desc }) => (
            <div key={key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 0', borderBottom: `0.5px solid ${C.border}` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Icon size={16} style={{ color: perms[key] ? C.teal : C.muted }} />
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{label}</div>
                  <div style={{ fontSize: 11, color: C.muted }}>{desc}</div>
                </div>
              </div>
              <ToggleSwitch on={perms[key]} onChange={v => setPerms(p => ({ ...p, [key]: v }))} />
            </div>
          ))}
        </Section>

        {/* Units */}
        <Section title="Units">
          <ProfileField label="Measurement system">
            <div style={{ display: 'flex', gap: 4 }}>
              {(['metric', 'imperial'] as const).map(u => (
                <button
                  key={u}
                  onClick={() => setUnit(u)}
                  style={{
                    padding: '5px 12px',
                    borderRadius: 8,
                    border: 'none',
                    background: unit === u ? C.teal : 'rgba(255,255,255,0.07)',
                    color: unit === u ? '#04342C' : C.muted,
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: 'pointer',
                    textTransform: 'capitalize',
                    transition: 'all 0.2s',
                  }}
                >
                  {u}
                </button>
              ))}
            </div>
          </ProfileField>
        </Section>

        {/* Disclaimer */}
        <div style={{
          marginTop: 8,
          padding: '14px 16px',
          background: 'rgba(239,159,39,0.06)',
          border: '0.5px solid rgba(239,159,39,0.18)',
          borderRadius: 14,
          fontSize: 11,
          color: C.muted,
          lineHeight: 1.55,
          textAlign: 'center',
        }}>
          VEDA provides wellness estimates only. Not a medical device. Consult a healthcare professional for medical advice.
          <br /><span style={{ color: C.teal, marginTop: 6, display: 'inline-block' }}>v1.0.0</span>
        </div>

      </div>
    </motion.div>
  );
}
