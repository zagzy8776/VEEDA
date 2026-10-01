import { motion } from 'motion/react';
import { User, Bell, Camera, Mic, MapPin, Shield, Save, AlertTriangle, Activity } from 'lucide-react';
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

export function ProfilePage({ profile, saveProfile, userEmail, onLogout, onOpenSummary, onOpenReminders, onOpenBpGlucose, onOpenContacts, onOpenAlerts, onOpenDetection, onExportData, onDeleteAccount }: { profile: Profile; saveProfile: (p: Partial<Profile>) => void; userEmail?: string; onLogout?: () => Promise<void>; onOpenSummary?: () => void; onOpenReminders?: () => void; onOpenBpGlucose?: () => void; onOpenContacts?: () => void; onOpenAlerts?: () => void; onOpenDetection?: () => void; onExportData?: () => Promise<string | null>; onDeleteAccount?: (password: string, confirm: string) => Promise<{ ok: boolean; error?: string }> }) {
  const [form, setForm] = useState(profile);
  const [perms, setPerms] = useState({ camera: false, mic: false, location: false, notifications: false });
  const [saved, setSaved] = useState(false);
  const [exportState, setExportState] = useState<'idle' | 'busy' | 'done' | 'empty'>('idle');
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState('');
  const [deleteError, setDeleteError] = useState('');
  const [deleting, setDeleting] = useState(false);

  function set(k: keyof Profile, v: any) { setForm(f => ({ ...f, [k]: v })); }

  function handleSave() {
    saveProfile(form);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  async function handleExport() {
    if (!onExportData) return;
    setExportState('busy');
    const filename = await onExportData();
    setExportState(filename ? 'done' : 'empty');
    setTimeout(() => setExportState('idle'), 2500);
  }

  async function handleDelete() {
    if (!onDeleteAccount) return;
    setDeleteError('');
    if (deleteConfirm !== 'DELETE') { setDeleteError('Type DELETE to confirm.'); return; }
    setDeleting(true);
    const result = await onDeleteAccount(deletePassword, deleteConfirm);
    setDeleting(false);
    if (!result.ok) { setDeleteError(result.error || 'The account could not be deleted.'); return; }
    setDeleteOpen(false);
    setDeletePassword(''); setDeleteConfirm('');
    await onLogout?.();
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
            <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>{userEmail || 'Local wellness user'}</div>
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

        <Section title="Data">
          <div onClick={onOpenSummary} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 0', cursor: onOpenSummary ? 'pointer' : 'default' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Shield size={16} style={{ color: C.teal }} />
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>Shareable health summary</div>
                <div style={{ fontSize: 11, color: C.muted }}>Create a PDF on this device</div>
              </div>
            </div>
            <span style={{ color: C.muted, fontSize: 16 }}>›</span>
          </div>
          <div onClick={onOpenReminders} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 0', cursor: onOpenReminders ? 'pointer' : 'default' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Bell size={16} style={{ color: C.teal }} />
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>Medication reminders</div>
                <div style={{ fontSize: 11, color: C.muted }}>Add to your phone calendar</div>
              </div>
            </div>
            <span style={{ color: C.muted, fontSize: 16 }}>›</span>
          </div>
          <div onClick={onOpenBpGlucose} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 0', cursor: onOpenBpGlucose ? 'pointer' : 'default' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Shield size={16} style={{ color: C.teal }} />
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>Blood pressure &amp; glucose</div>
                <div style={{ fontSize: 11, color: C.muted }}>Log readings and see trends</div>
              </div>
            </div>
            <span style={{ color: C.muted, fontSize: 16 }}>›</span>
          </div>
          <div onClick={onOpenContacts} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 0', cursor: onOpenContacts ? 'pointer' : 'default' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Shield size={16} style={{ color: C.teal }} />
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>Emergency contacts</div>
                <div style={{ fontSize: 11, color: C.muted }}>People to reach in an emergency</div>
              </div>
            </div>
            <span style={{ color: C.muted, fontSize: 16 }}>›</span>
          </div>
          <div onClick={onOpenAlerts} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 0', cursor: onOpenAlerts ? 'pointer' : 'default' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <AlertTriangle size={16} style={{ color: C.teal }} />
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>Environment &amp; safety alerts</div>
                <div style={{ fontSize: 11, color: C.muted }}>Weather, air, fire and home-safety warnings</div>
              </div>
            </div>
            <span style={{ color: C.muted, fontSize: 16 }}>›</span>
          </div>
          <div onClick={onOpenDetection} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 0', cursor: onOpenDetection ? 'pointer' : 'default' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Activity size={16} style={{ color: C.teal }} />
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>Automatic detection</div>
                <div style={{ fontSize: 11, color: C.muted }}>Baseline learning and check-in ladder</div>
              </div>
            </div>
            <span style={{ color: C.muted, fontSize: 16 }}>›</span>
          </div>
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

        <Section title="Data & account">
          <div style={{ padding: '12px 0', borderBottom: `0.5px solid ${C.border}` }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>Export my data</div>
                <div style={{ fontSize: 11, color: C.muted }}>Download your readings and account data</div>
              </div>
              {onExportData && <button onClick={() => void handleExport()} disabled={exportState === 'busy'} style={{ padding: '8px 14px', borderRadius: 10, border: `1px solid ${C.border}`, background: 'transparent', color: C.text, fontSize: 12, fontWeight: 700, cursor: exportState === 'busy' ? 'wait' : 'pointer' }}>{exportState === 'busy' ? 'Preparing…' : exportState === 'done' ? 'Exported ✓' : exportState === 'empty' ? 'Nothing to export' : 'Export'}</button>}
            </div>
          </div>
          <div style={{ padding: '12px 0' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#E24B4A' }}>Delete my account</div>
                <div style={{ fontSize: 11, color: C.muted }}>Permanently erase your account and its data</div>
              </div>
              {onDeleteAccount && <button onClick={() => setDeleteOpen(o => !o)} style={{ padding: '8px 14px', borderRadius: 10, border: '1px solid rgba(226,75,74,0.35)', background: 'transparent', color: '#E24B4A', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>{deleteOpen ? 'Cancel' : 'Delete…'}</button>}
            </div>
            {deleteOpen && (
              <div style={{ marginTop: 12, padding: 12, border: '0.5px solid rgba(226,75,74,0.3)', borderRadius: 12 }}>
                <div style={{ fontSize: 11, color: C.muted, lineHeight: 1.5, marginBottom: 10 }}>
                  This permanently deletes your account and all your readings. Export your data first if you want a copy. This cannot be undone.
                </div>
                <input type="password" value={deletePassword} onChange={e => setDeletePassword(e.target.value)} placeholder="Your password" autoComplete="current-password" style={{ width: '100%', padding: '10px 12px', background: '#0A1220', border: `0.5px solid ${C.border}`, borderRadius: 10, color: C.text, fontSize: 13, outline: 'none', boxSizing: 'border-box', marginBottom: 8 }} />
                <input value={deleteConfirm} onChange={e => setDeleteConfirm(e.target.value)} placeholder="Type DELETE to confirm" style={{ width: '100%', padding: '10px 12px', background: '#0A1220', border: `0.5px solid ${C.border}`, borderRadius: 10, color: C.text, fontSize: 13, outline: 'none', boxSizing: 'border-box', marginBottom: 8 }} />
                {deleteError && <div style={{ color: '#EF9F27', fontSize: 11, marginBottom: 8 }}>{deleteError}</div>}
                <button onClick={() => void handleDelete()} disabled={deleting || deleteConfirm !== 'DELETE' || !deletePassword} style={{ width: '100%', padding: 11, borderRadius: 12, border: 0, background: (deleting || deleteConfirm !== 'DELETE' || !deletePassword) ? 'rgba(255,255,255,0.06)' : '#E24B4A', color: (deleting || deleteConfirm !== 'DELETE' || !deletePassword) ? C.muted : '#fff', fontWeight: 800, cursor: (deleting || deleteConfirm !== 'DELETE' || !deletePassword) ? 'not-allowed' : 'pointer' }}>{deleting ? 'Deleting…' : 'Permanently delete my account'}</button>
              </div>
            )}
          </div>
        </Section>

        <motion.button whileTap={{ scale: 0.97 }} onClick={handleSave}
          style={{ width: '100%', padding: '14px', background: saved ? 'rgba(45,212,164,0.2)' : `linear-gradient(135deg,${C.teal},#1fb391)`, color: saved ? C.teal : '#04342C', borderRadius: 16, border: saved ? `1px solid ${C.teal}` : 'none', fontSize: 15, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, transition: 'all 0.3s' }}>
          <Save size={16} strokeWidth={2.2} />
          {saved ? 'Saved ✓' : 'Save Profile'}
        </motion.button>

        {onLogout && <button onClick={() => void onLogout()} style={{ width: '100%', marginTop: 10, padding: 12, background: 'transparent', color: '#E24B4A', border: '1px solid rgba(226,75,74,0.35)', borderRadius: 14, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>Sign out</button>}

        <div style={{ marginTop: 16, padding: '14px 16px', background: 'rgba(239,159,39,0.06)', border: '0.5px solid rgba(239,159,39,0.18)', borderRadius: 14, fontSize: 11, color: C.muted, lineHeight: 1.55, textAlign: 'center' }}>
          VEEDA clinical monitoring configuration.
          <br /><span style={{ color: C.teal, marginTop: 6, display: 'inline-block' }}>v1.0.0 - Clinical Build</span>
        </div>
      </div>
    </motion.div>
  );
}
