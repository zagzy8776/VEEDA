import { useMemo, useState } from 'react';
import { ArrowDownWideNarrow, Bed, ShieldAlert } from 'lucide-react';
import type { BiometricEvent } from '../useVedaApp';

const C = { green: '#22C55E', yellow: '#FACC15', orange: '#F97316', red: '#E24B4A', text: '#E2F4F0', muted: '#5A7A72', card: 'rgba(13,21,37,0.9)', border: 'rgba(255,255,255,0.09)' };

interface PatientRow {
  id: string;
  ward: string;
  bed: string;
  latest: Record<string, BiometricEvent>;
  news2: number;
  singleThree: boolean;
}

function scoreEvent(e?: BiometricEvent) {
  if (!e) return null;
  const v = Number(e.value);
  if (e.type === 'heart_rate') {
    if (v <= 40 || v >= 131) return 3;
    if (v >= 111) return 2;
    if (v <= 50 || v >= 91) return 1;
    return 0;
  }
  if (e.type === 'breath_rate') {
    if (v <= 8 || v >= 25) return 3;
    if (v >= 21) return 2;
    if (v <= 11) return 1;
    return 0;
  }
  if (e.type === 'oxygen') {
    if (v <= 91) return 3;
    if (v <= 93) return 2;
    if (v <= 95) return 1;
    return 0;
  }
  if (e.type === 'temperature') {
    if (v <= 35) return 3;
    if (v >= 39.1) return 2;
    if (v <= 36 || v >= 38.1) return 1;
    return 0;
  }
  if (e.type === 'systolic_bp') {
    if (v <= 90 || v >= 220) return 3;
    if (v <= 100) return 2;
    if (v <= 110) return 1;
    return 0;
  }
  return null;
}

function riskColor(score: number, singleThree: boolean) {
  if (score >= 7) return C.red;
  if (score >= 5 || singleThree) return C.orange;
  if (score >= 1) return C.yellow;
  return C.green;
}

function riskLabel(score: number, singleThree: boolean) {
  if (score >= 7) return 'High / Emergency';
  if (score >= 5 || singleThree) return 'Medium / Urgent';
  if (score >= 1) return 'Low threshold';
  return 'Low / Stable';
}

export function ClinicianDashboard({ history }: { history: BiometricEvent[] }) {
  const [prioritySort, setPrioritySort] = useState(true);
  const roster = useMemo<PatientRow[]>(() => {
    const patients = new Map<string, PatientRow>();
    history.forEach((event: any) => {
      const id = event.patient_id || event.patientId || 'patient-001';
      if (!patients.has(id)) patients.set(id, { id, ward: event.ward_id || 'ward-a', bed: event.bed || '-', latest: {}, news2: 0, singleThree: false });
      const row = patients.get(id)!;
      if (!row.latest[event.type] || new Date(event.timestamp) > new Date(row.latest[event.type].timestamp)) row.latest[event.type] = event;
    });
    const rows = Array.from(patients.values()).map(row => {
      const scores = Object.values(row.latest).map(scoreEvent).filter((v): v is number => v !== null);
      return { ...row, news2: scores.reduce((a, b) => a + b, 0), singleThree: scores.some(s => s === 3) };
    });
    return rows.sort((a, b) => prioritySort ? b.news2 - a.news2 : a.id.localeCompare(b.id));
  }, [history, prioritySort]);

  return (
    <div style={{ overflowY: 'auto', height: '100%', padding: '20px 18px 100px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 16 }}>
        <div>
          <h2 style={{ margin: 0, color: C.text, fontSize: 20 }}>Clinician Dashboard</h2>
          <div style={{ color: C.muted, fontSize: 12, marginTop: 4 }}>Patient roster and NEWS2 risk matrix</div>
        </div>
        <button onClick={() => setPrioritySort(v => !v)} style={{ width: 40, height: 40, borderRadius: 12, border: `1px solid ${C.border}`, background: prioritySort ? 'rgba(45,212,164,0.12)' : '#0A1220', color: C.text, display: 'grid', placeItems: 'center', cursor: 'pointer' }} title="Toggle priority sorting">
          <ArrowDownWideNarrow size={17} />
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8, marginBottom: 14 }}>
        {[
          ['0', 'Stable', C.green],
          ['1-4', 'Low', C.yellow],
          ['5-6', 'Urgent', C.orange],
          ['7+', 'Emergency', C.red],
        ].map(([score, label, color]) => (
          <div key={score} style={{ background: C.card, border: `1px solid ${color}`, borderRadius: 10, padding: '9px 6px', textAlign: 'center' }}>
            <div style={{ color, fontWeight: 900, fontSize: 15 }}>{score}</div>
            <div style={{ color: C.muted, fontSize: 9, marginTop: 2 }}>{label}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gap: 8 }}>
        {roster.length === 0 && (
          <div style={{ color: C.muted, fontSize: 13, textAlign: 'center', padding: 32 }}>No patient observations in scope.</div>
        )}
        {roster.map(row => {
          const color = riskColor(row.news2, row.singleThree);
          return (
            <div key={row.id} style={{ background: C.card, border: `1px solid ${color}`, borderRadius: 14, padding: 13 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 40, height: 40, borderRadius: 12, background: `${color}22`, color, display: 'grid', placeItems: 'center' }}>
                  {row.news2 >= 5 ? <ShieldAlert size={18} /> : <Bed size={18} />}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ color: C.text, fontSize: 14, fontWeight: 800 }}>{row.id}</div>
                  <div style={{ color: C.muted, fontSize: 11, marginTop: 2 }}>{row.ward} · Bed {row.bed}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ color, fontSize: 26, fontWeight: 900, fontFamily: "'Geist Mono',monospace" }}>{row.news2}</div>
                  <div style={{ color, fontSize: 10, fontWeight: 800 }}>{riskLabel(row.news2, row.singleThree)}</div>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 6, marginTop: 12 }}>
                {[
                  ['HR', row.latest.heart_rate, 'beats/min'],
                  ['RR', row.latest.breath_rate, '/min'],
                  ['SpO2', row.latest.oxygen, '%'],
                  ['SBP', row.latest.systolic_bp, 'mmHg'],
                  ['Temp', row.latest.temperature, 'C'],
                ].map(([label, event, unit]) => (
                  <div key={label as string} style={{ background: '#0A1220', borderRadius: 9, padding: '7px 4px', textAlign: 'center' }}>
                    <div style={{ color: C.muted, fontSize: 9 }}>{label as string}</div>
                    <div style={{ color: C.text, fontSize: 12, fontWeight: 800, marginTop: 2 }}>{event ? Number((event as BiometricEvent).value).toFixed(0) : '--'}</div>
                    <div style={{ color: C.muted, fontSize: 8 }}>{unit as string}</div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
