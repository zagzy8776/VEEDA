import { useMemo, useState } from 'react';
import { motion } from 'motion/react';
import {
  CHECK_VALUE_MESSAGE,
  addReading,
  bpTrend,
  buildReadingsCsv,
  glucoseTrend,
  loadReadings,
  parseReading,
  readingsFilename,
  type GlucoseUnit,
  type Reading,
} from '../bpGlucose';
import { CONSENT_ITEMS, CONSENT_VERSION, hasConsent, recordConsent, type ConsentFeature } from '../consent';
import { syncConsentRecord } from '../api';

const C = { teal: '#2DD4A4', text: '#E2F4F0', muted: '#5A7A72', card: 'rgba(13,21,37,0.96)', border: 'rgba(255,255,255,0.1)', amber: '#EF9F27' };
const CONSENT_FEATURE: ConsentFeature = 'bp_glucose_logging';
const inp = { width: '100%', padding: '10px 12px', background: '#0A1220', border: `0.5px solid ${C.border}`, borderRadius: 10, color: C.text, fontSize: 13, outline: 'none', boxSizing: 'border-box' as const };

interface BpGlucosePageProps {
  open: boolean;
  onClose: () => void;
  userId: string;
}

export function BpGlucosePage({ open, onClose, userId }: BpGlucosePageProps) {
  const [kind, setKind] = useState<'blood_pressure' | 'blood_glucose'>('blood_pressure');
  const [systolic, setSystolic] = useState('');
  const [diastolic, setDiastolic] = useState('');
  const [value, setValue] = useState('');
  const [unit, setUnit] = useState<GlucoseUnit>('mmol/L');
  const [context, setContext] = useState<'fasting' | 'after_meal' | ''>('');
  const [source, setSource] = useState<'typed_in' | 'device'>('typed_in');
  const [error, setError] = useState('');
  const [consented, setConsented] = useState(false);
  const [refresh, setRefresh] = useState(0);

  const consentItem = CONSENT_ITEMS.find(item => item.feature === CONSENT_FEATURE);
  const consentedNow = consented || hasConsent(window.localStorage, userId, CONSENT_FEATURE);
  const readings = useMemo<Reading[]>(() => loadReadings(window.localStorage, userId), [userId, refresh]);
  const bp = useMemo(() => bpTrend(readings), [readings]);
  const glucoseMgdl = useMemo(() => glucoseTrend(readings, 'mg/dL'), [readings]);
  const glucoseMmol = useMemo(() => glucoseTrend(readings, 'mmol/L'), [readings]);

  if (!open) return null;

  function grantConsent() {
    recordConsent(window.localStorage, userId, CONSENT_FEATURE);
    void syncConsentRecord(CONSENT_FEATURE, CONSENT_VERSION, true);
    setConsented(true);
  }

  function save() {
    setError('');
    const recordedAt = new Date().toISOString();
    const outcome = kind === 'blood_pressure'
      ? parseReading({ kind, systolic: Number(systolic), diastolic: Number(diastolic), source, recordedAt })
      : parseReading({ kind, value: Number(value), unit, context: context || undefined, source, recordedAt });
    if (outcome.ok === false || !outcome.reading) {
      setError(outcome.message ?? CHECK_VALUE_MESSAGE);
      return;
    }
    const stored = addReading(window.localStorage, userId, outcome.reading);
    if (stored.ok === false) { setError(stored.message ?? ''); return; }
    setSystolic(''); setDiastolic(''); setValue('');
    setRefresh(n => n + 1);
  }

  function exportCsv() {
    const generatedAt = new Date().toISOString();
    const blob = new Blob([buildReadingsCsv(readings)], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = readingsFilename(generatedAt);
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 2000, background: 'rgba(0,0,0,0.72)', display: 'grid', placeItems: 'center', padding: 20 }}>
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
        style={{ width: '100%', maxWidth: 360, maxHeight: '88vh', overflowY: 'auto', background: C.card, border: `1px solid ${C.border}`, borderRadius: 20, padding: 20, color: C.text }}>
        <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 4 }}>Blood pressure &amp; glucose</div>
        <div style={{ fontSize: 11, color: C.muted, lineHeight: 1.5, marginBottom: 14 }}>
          These are your own readings. VEEDA stores the number and the unit you choose and does not label any value as high or low.
        </div>

        {!consentedNow ? (
          <>
            <div style={{ fontSize: 13, lineHeight: 1.5, marginBottom: 14 }}>{consentItem?.body}</div>
            <button onClick={grantConsent} style={{ width: '100%', padding: 12, borderRadius: 12, border: 0, background: C.teal, color: '#04342C', fontWeight: 800, cursor: 'pointer' }}>
              I understand, continue
            </button>
          </>
        ) : (
          <>
            <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
              {(['blood_pressure', 'blood_glucose'] as const).map(k => (
                <button key={k} onClick={() => setKind(k)}
                  style={{ flex: 1, padding: '8px 6px', borderRadius: 10, border: 'none', background: kind === k ? C.teal : 'rgba(255,255,255,0.07)', color: kind === k ? '#04342C' : C.muted, fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
                  {k === 'blood_pressure' ? 'Blood pressure' : 'Glucose'}
                </button>
              ))}
            </div>

            {kind === 'blood_pressure' ? (
              <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
                <input value={systolic} onChange={e => setSystolic(e.target.value)} inputMode="numeric" placeholder="Systolic" style={inp} />
                <input value={diastolic} onChange={e => setDiastolic(e.target.value)} inputMode="numeric" placeholder="Diastolic" style={inp} />
              </div>
            ) : (
              <>
                <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                  <input value={value} onChange={e => setValue(e.target.value)} inputMode="decimal" placeholder="Value" style={inp} />
                  <div style={{ display: 'flex', gap: 4 }}>
                    {(['mg/dL', 'mmol/L'] as const).map(u => (
                      <button key={u} onClick={() => setUnit(u)}
                        style={{ padding: '8px 10px', borderRadius: 10, border: 'none', background: unit === u ? C.teal : 'rgba(255,255,255,0.07)', color: unit === u ? '#04342C' : C.muted, fontSize: 11, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                        {u}
                      </button>
                    ))}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
                  {([['', 'No tag'], ['fasting', 'Fasting'], ['after_meal', 'After meal']] as const).map(([id, label]) => (
                    <button key={label} onClick={() => setContext(id)}
                      style={{ flex: 1, padding: '7px 6px', borderRadius: 10, border: 'none', background: context === id ? 'rgba(45,212,164,0.2)' : 'rgba(255,255,255,0.07)', color: context === id ? C.teal : C.muted, fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
                      {label}
                    </button>
                  ))}
                </div>
              </>
            )}

            <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
              {([['typed_in', 'Typed in'], ['device', 'From a device']] as const).map(([id, label]) => (
                <button key={id} onClick={() => setSource(id)}
                  style={{ flex: 1, padding: '7px 6px', borderRadius: 10, border: 'none', background: source === id ? 'rgba(45,212,164,0.2)' : 'rgba(255,255,255,0.07)', color: source === id ? C.teal : C.muted, fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
                  {label}
                </button>
              ))}
            </div>

            {error && <div style={{ color: C.amber, fontSize: 11, marginBottom: 10 }}>{error}</div>}

            <button onClick={save} style={{ width: '100%', padding: 12, borderRadius: 12, border: 0, background: C.teal, color: '#04342C', fontWeight: 800, cursor: 'pointer', marginBottom: 16 }}>
              Save reading
            </button>

            <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: C.muted, marginBottom: 8 }}>
              Your trends ({readings.length})
            </div>
            <div style={{ fontSize: 12, color: C.text, lineHeight: 1.7, marginBottom: 12 }}>
              {bp.count > 0 && <div>Blood pressure: average {bp.averageSystolic}/{bp.averageDiastolic} mmHg over {bp.count} readings</div>}
              {glucoseMgdl.count > 0 && <div>Glucose: average {glucoseMgdl.average} mg/dL over {glucoseMgdl.count} readings</div>}
              {glucoseMmol.count > 0 && <div>Glucose: average {glucoseMmol.average} mmol/L over {glucoseMmol.count} readings</div>}
              {readings.length === 0 && <span style={{ color: C.muted }}>No readings saved yet.</span>}
            </div>

            <button onClick={exportCsv} disabled={readings.length === 0}
              style={{ width: '100%', padding: 11, borderRadius: 12, border: `1px solid ${C.border}`, background: 'transparent', color: readings.length ? C.text : C.muted, cursor: readings.length ? 'pointer' : 'not-allowed', marginBottom: 8 }}>
              Export CSV
            </button>
          </>
        )}

        <button onClick={onClose} style={{ width: '100%', padding: 12, borderRadius: 12, border: `1px solid ${C.border}`, background: 'transparent', color: C.text, cursor: 'pointer' }}>
          Close
        </button>
      </motion.div>
    </div>
  );
}
