import { motion } from 'motion/react';
import { User, Bell, Camera, Mic, MapPin, Shield, Save } from 'lucide-react';
import { useState } from 'react';
import type { Profile } from '../useVedaApp';

const C = { teal: '#2DD4A4', blue: '#378ADD', amber: '#EF9F27', text: '#E2F4F0', muted: '#5A7A72', card: 'rgba(13,21,37,0.88)', border: 'rgba(255,255,255,0.08)' };

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button onClick={() => onChange(!on)} style={{ width: 44, height: 24, borderRadius: 12, background: on ? C.teal : 'rgba(255,255,255,0.1)', border: 'none', cursor: 'pointer', position: 'relative', transition: 'background 0.25s', flexShrink: 0 }}>
      <div style={{ position: 'absolute', top: 3, left: on ? 23 : 3, width: 18, height: 18, borderRadius: '50%', background: on ? '#04342C' : '#5A7A72', transition: 'left 0.25s, background 0.25s' }} />
    </button>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: C.muted, marginBottom: 8 }}>{title}</div>
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 18, padding: '0 16px', backdropFilter: 'blur(12px)' }}>
        <div style={{ paddingBottom: 4 }}>{children}</div>
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 0', borderBottom: `0.5px solid ${C.border}` }}>
      <span style={{ fontSize: 13, color: C.muted }}>{label}</span>
      {children}
    </div>
  );
}

const inp = { padding: '5px 10px', background: '#0A1220', border: `0.5px solid rgba(255,255,255,0.08)`, borderRadius: 8, color: '#E2F4F0', fontSize: 13, textAlign: 'right' as const, outline: 'none', width: 90 };

export function ProfilePage({ profile, saveProfile }: { profile: Profile; saveProfile: (p: Partial<Profile>) => void }) {
  const [form, setForm] = useState(profile);
  const [perms, setPerms] = useState({ camera: false, mic: false, location: false, notifications: false });
  const [saved, setSaved] = useState(false);

  function set(k: keyof Profile, v: any) { setForm(f => ({ ...f, [k]: v })); }

  function handleSave() {
    saveProfile(form);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  async function requestPerm(key: keyof typeof perms) {
    try {
      if (key === 'camera') await navigator.mediaDevices.getUserMedia({ video: true });
      if (key === 'mic') await navigator.mediaDevices.getUserMedia({ audio: true });
      if (key === 'location') navigator.geolocation.getCurrentPosition(() => {});
      if (key === 'notifications') await Notification.requestPermission();
      setPerms(p => ({ ...p, [key]: true }));
    } catch { setPerms(p => ({ ...p, [key]: false })); }
  }

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.24 }}
      style={{ overflowY: 'auto', height: '100%', scrollbarWidth: 'none' }}>
      <div style={{ padding: '0 20px 100px' }}>

        <div style={{ paddingTop: 22, paddingBottom: 20 }}>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: C.text, lineHeight: 1 }}>Profile</h2>
          <p style={{ fontSize: 12, color: C.muted, marginTop: 4 }}>Settings & preferences</p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24 }}>
          <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'linear-gradient(135deg,rgba(45,212,164,0.25),rgba(55,138,221,0.2))', border: '2px solid rgba(45,212,164,0.3)', display: 'grid', placeItems: 'center', color: C.teal }}>
            <User size={28} strokeWidth={1.8} />
          </div>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700, color: C.text }}>{form.name}</div>
            <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>VEDA Wellness User</div>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, marginTop: 6, padding: '3px 10px', background: 'rgba(45,212,164,0.1)', borderRadius: 8, border: '0.5px solid rgba(45,212,164,0.2)' }}>
              <Shield size={10} style={{ color: C.teal }} />
              <span style={{ fontSize: 10, color: C.teal, fontWeight: 700 }}>Wellness Estimate Mode</span>
            </div>
          </div>
        </div>

        <Section title="Personal">
          <Row label="Name"><input style={inp} value={form.name} onChange={e => set('name', e.target.value)} /></Row>
          <Row label="Age"><input style={{ ...inp, width: 70 }} type="number" value={form.age} onChange={e => set('age', +e.target.value)} /></Row>
          <Row label="Biological sex">
            <select style={{ ...inp, width: 100 }} value={form.sex} onChange={e => set('sex', e.target.value)}>
              <option value="male">Male</option>
              <option value="female">Female</option>
              <option value="other">Other</option>
            </select>
          </Row>
        </Section>

        <Section title="Body Metrics">
          <Row label="Weight">
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <input style={{ ...inp, width: 65 }} type="number" value={form.weight} onChange={e => set('weight', +e.target.value)} />
              <span style={{ fontSize: 12, color: C.muted }}>kg</span>
            </div>
          </Row>
          <Row label="Height">
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <input style={{ ...inp, width: 65 }} type="number" value={form.height} onChange={e => set('height', +e.target.value)} />
              <span style={{ fontSize: 12, color: C.muted }}>cm</span>
            </div>
          </Row>
          <Row label="Daily water target">
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <input style={{ ...inp, width: 70 }} type="number" value={form.waterTarget} onChange={e => set('waterTarget', +e.target.value)} />
              <span style={{ fontSize: 12, color: C.muted }}>ml</span>
            </div>
          </Row>
          <Row label="Step goal">
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <input style={{ ...inp, width: 78 }} type="number" value={form.stepGoal} onChange={e => set('stepGoal', +e.target.value)} />
              <span style={{ fontSize: 12, color: C.muted }}>steps</span>
            </div>
          </Row>
          <Row label="Temp unit">
            <div style={{ display: 'flex', gap: 4 }}>
              {(['C', 'F'] as const).map(u => (
                <button key={u} onClick={() => set('tempUnit', u)} style={{ padding: '5px 12px', borderRadius: 8, border: 'none', background: form.tempUnit === u ? C.teal : 'rgba(255,255,255,0.07)', color: form.tempUnit === u ? '#04342C' : C.muted, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>°{u}</button>
              ))}
            </div>
          </Row>
        </Section>

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
              <Toggle on={perms[key]} onChange={() => requestPerm(key)} />
            </div>
          ))}
        </Section>

        <motion.button whileTap={{ scale: 0.97 }} onClick={handleSave}
          style={{ width: '100%', padding: '14px', background: saved ? 'rgba(45,212,164,0.2)' : `linear-gradient(135deg,${C.teal},#1fb391)`, color: saved ? C.teal : '#04342C', borderRadius: 16, border: saved ? `1px solid ${C.teal}` : 'none', fontSize: 15, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, transition: 'all 0.3s' }}>
          <Save size={16} strokeWidth={2.2} />
          {saved ? 'Saved ✓' : 'Save Profile'}
        </motion.button>

        <div style={{ marginTop: 16, padding: '14px 16px', background: 'rgba(239,159,39,0.06)', border: '0.5px solid rgba(239,159,39,0.18)', borderRadius: 14, fontSize: 11, color: C.muted, lineHeight: 1.55, textAlign: 'center' }}>
          VEEDA clinical monitoring configuration.
          <br /><span style={{ color: C.teal, marginTop: 6, display: 'inline-block' }}>v1.0.0 - Clinical Build</span>
        </div>
      </div>
    </motion.div>
  );
}
