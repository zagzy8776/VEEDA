import { useState } from 'react';
import { motion } from 'motion/react';
import {
  CALENDAR_DEPENDENCY_NOTE,
  DEVICE_ONLY_NOTE,
  buildReminderIcs,
  reminderFilename,
  type Frequency,
} from '../medicationIcs';
import { CONSENT_ITEMS, CONSENT_VERSION, hasConsent, recordConsent, type ConsentFeature } from '../consent';
import { syncConsentRecord } from '../api';

const C = { teal: '#2DD4A4', text: '#E2F4F0', muted: '#5A7A72', card: 'rgba(13,21,37,0.96)', border: 'rgba(255,255,255,0.1)' };

const FREQUENCIES: { id: Frequency; label: string }[] = [
  { id: 'daily', label: 'Every day' },
  { id: 'twice_daily', label: 'Twice a day' },
  { id: 'weekly', label: 'Every week' },
];

interface RemindersPageProps {
  open: boolean;
  onClose: () => void;
  userId: string;
}

const CONSENT_FEATURE: ConsentFeature = 'medication_reminders';

export function RemindersPage({ open, onClose, userId }: RemindersPageProps) {
  const [name, setName] = useState('');
  const [time, setTime] = useState('08:00');
  const [frequency, setFrequency] = useState<Frequency>('daily');
  const [error, setError] = useState('');
  const [consented, setConsented] = useState(false);

  const consentItem = CONSENT_ITEMS.find(item => item.feature === CONSENT_FEATURE);
  const consentedNow = consented || hasConsent(window.localStorage, userId, CONSENT_FEATURE);

  if (!open) return null;

  function grantConsent() {
    recordConsent(window.localStorage, userId, CONSENT_FEATURE);
    void syncConsentRecord(CONSENT_FEATURE, CONSENT_VERSION, true);
    setConsented(true);
  }

  function createIcs() {
    setError('');
    try {
      const generatedAt = new Date().toISOString();
      const ics = buildReminderIcs({
        medicationName: name,
        time,
        frequency,
        generatedAt,
        uid: `rem-${generatedAt}`,
      });
      const blob = new Blob([ics], { type: 'text/calendar' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = reminderFilename(generatedAt);
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create the reminder.');
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 2000, background: 'rgba(0,0,0,0.72)', display: 'grid', placeItems: 'center', padding: 20 }}>
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
        style={{ width: '100%', maxWidth: 360, maxHeight: '86vh', overflowY: 'auto', background: C.card, border: `1px solid ${C.border}`, borderRadius: 20, padding: 20, color: C.text }}>
        <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 4 }}>Medication reminder</div>
        <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.5, marginBottom: 6 }}>
          {CALENDAR_DEPENDENCY_NOTE}
        </div>
        <div style={{ fontSize: 11, color: '#EF9F27', marginBottom: 14 }}>{DEVICE_ONLY_NOTE}</div>

        <label style={{ display: 'block', fontSize: 12, color: C.muted, marginBottom: 4 }}>Name (optional — you can use a label like “Morning tablet”)</label>
        <input value={name} onChange={e => setName(e.target.value)} placeholder="Morning tablet" disabled={!consentedNow}
          style={{ width: '100%', padding: '10px 12px', background: '#0A1220', border: `0.5px solid ${C.border}`, borderRadius: 10, color: C.text, fontSize: 13, outline: 'none', marginBottom: 14, boxSizing: 'border-box', opacity: consentedNow ? 1 : 0.5 }} />

        <label style={{ display: 'block', fontSize: 12, color: C.muted, marginBottom: 4 }}>Time</label>
        <input type="time" value={time} onChange={e => setTime(e.target.value)}
          style={{ width: '100%', padding: '10px 12px', background: '#0A1220', border: `0.5px solid ${C.border}`, borderRadius: 10, color: C.text, fontSize: 13, outline: 'none', marginBottom: 14, boxSizing: 'border-box' }} />

        <label style={{ display: 'block', fontSize: 12, color: C.muted, marginBottom: 6 }}>Repeat</label>
        <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
          {FREQUENCIES.map(f => (
            <button key={f.id} onClick={() => setFrequency(f.id)}
              style={{ flex: 1, padding: '8px 6px', borderRadius: 10, border: 'none', background: frequency === f.id ? C.teal : 'rgba(255,255,255,0.07)', color: frequency === f.id ? '#04342C' : C.muted, fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
              {f.label}
            </button>
          ))}
        </div>

        {error && <div style={{ color: '#EF9F27', fontSize: 11, marginBottom: 10 }}>{error}</div>}

        {!consentedNow && (
          <div style={{ fontSize: 12, lineHeight: 1.5, marginBottom: 12 }}>
            {consentItem?.body}
          </div>
        )}

        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={onClose} style={{ flex: 1, padding: 12, borderRadius: 12, border: `1px solid ${C.border}`, background: 'transparent', color: C.text, cursor: 'pointer' }}>
            Close
          </button>
          {consentedNow ? (
            <button onClick={createIcs} style={{ flex: 1, padding: 12, borderRadius: 12, border: 0, background: C.teal, color: '#04342C', fontWeight: 800, cursor: 'pointer' }}>
              Add to calendar
            </button>
          ) : (
            <button onClick={grantConsent} style={{ flex: 1, padding: 12, borderRadius: 12, border: 0, background: C.teal, color: '#04342C', fontWeight: 800, cursor: 'pointer' }}>
              I understand, continue
            </button>
          )}
        </div>

        <div style={{ fontSize: 11, color: C.muted, marginTop: 12, lineHeight: 1.5 }}>
          This creates a calendar file on your device. VEEDA does not send the reminder itself and does not give dosing advice.
        </div>
      </motion.div>
    </div>
  );
}
