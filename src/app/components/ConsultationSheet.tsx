import { motion } from 'motion/react';
import { X, Printer } from 'lucide-react';
import type { ConsultationRecord } from '../symptomIntake';

// Printable consultation summary. The "PDF" is the browser's own print dialog
// (Save as PDF) driven by window.print() — no library, works on phones. The
// print CSS isolates this sheet and forces black-on-white so the printed page
// is clean regardless of the dark app theme.

const C = { teal: '#2DD4A4', text: '#111827', muted: '#6B7280', border: '#E5E7EB' };

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
}

export function ConsultationSheet({ record, onClose }: { record: ConsultationRecord; onClose: () => void }) {
  const who = record.subjectLabel || 'The app user';
  return <>
    <style>{`@media print {
      body * { visibility: hidden !important; }
      .veda-print-sheet, .veda-print-sheet * { visibility: visible !important; }
      .veda-print-sheet {
        position: fixed; inset: 0; max-height: none; height: auto;
        overflow: visible; border-radius: 0; box-shadow: none;
        background: #fff !important; color: #000 !important;
      }
      .veda-no-print { display: none !important; }
    }`}</style>
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} className="veda-no-print" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 700 }} />
    <motion.div initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'tween', duration: 0.25 }} className="veda-print-sheet" style={{ position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 710, maxHeight: '92dvh', overflowY: 'auto', background: '#FFFFFF', borderRadius: '20px 20px 0 0', padding: '24px 20px calc(28px + env(safe-area-inset-bottom))', color: C.text }}>
      <div className="veda-no-print" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div style={{ fontSize: 15, fontWeight: 800 }}>Symptom summary</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => window.print()} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 10, border: 'none', background: C.teal, color: '#04342C', fontWeight: 700, fontSize: 13 }}><Printer size={15} /> Print / Save PDF</button>
          <button onClick={onClose} style={{ width: 34, height: 34, borderRadius: 10, background: '#F3F4F6', border: 'none', color: C.text }}><X size={16} /></button>
        </div>
      </div>

      <div style={{ borderBottom: `2px solid ${C.text}`, paddingBottom: 10, marginBottom: 14 }}>
        <div style={{ fontSize: 17, fontWeight: 800 }}>Symptom summary for a clinical visit</div>
        <div style={{ fontSize: 12, color: C.muted, marginTop: 4 }}>{who} · {formatDateTime(record.createdAt)} · prepared by the VEEDA app</div>
      </div>

      {record.redFlag && (
        <div style={{ border: '2px solid #B91C1C', borderRadius: 10, padding: '10px 12px', marginBottom: 14, color: '#B91C1C', fontSize: 13, fontWeight: 700 }}>
          Urgent: {record.redFlag}. The app advised seeking medical care now.
        </div>
      )}

      <Section title="What was reported">
        <Row label="Main problem" value={record.answers.chief} />
        <Row label="When it started" value={record.answers.started} />
        <Row label="Getting better or worse" value={record.answers.course} />
        <Row label="Severity now (1–10)" value={record.answers.severity} />
        <Row label="Other symptoms noticed" value={record.answers.associated} />
        <Row label="Medicines being taken" value={record.answers.medications} />
        <Row label="Allergies" value={record.answers.allergies} />
        <Row label="What they want checked" value={record.answers.goal} />
      </Section>

      <Section title="Readings in the app at the time">
        {record.readings.map(r => (
          <div key={r.label} style={{ marginBottom: 8 }}>
            <div style={{ fontSize: 13, fontWeight: 700 }}>{r.label}: {r.value}</div>
            <div style={{ fontSize: 11, color: C.muted }}>{r.provenance}</div>
          </div>
        ))}
      </Section>

      {record.scores.length > 0 && (
        <Section title="Clinical scores calculated in the app">
          {record.scores.map(s => (
            <div key={s.label} style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>{s.label}: {s.value}</div>
          ))}
        </Section>
      )}
      {record.pediatricNote && (
        <div style={{ background: '#F3F4F6', borderRadius: 10, padding: '10px 12px', fontSize: 12, color: C.text, marginBottom: 14 }}>{record.pediatricNote}</div>
      )}

      <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 10, fontSize: 11, color: C.muted, lineHeight: 1.5 }}>{record.disclaimer}</div>
    </motion.div>
  </>;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.6, color: C.muted, marginBottom: 8 }}>{title}</div>
      {children}
    </div>
  );
}

function Row({ label, value }: { label: string; value?: string }) {
  if (!value) return null;
  return (
    <div style={{ display: 'flex', gap: 8, marginBottom: 6, fontSize: 13, lineHeight: 1.45 }}>
      <div style={{ flexShrink: 0, width: 140, fontWeight: 700 }}>{label}</div>
      <div>{value}</div>
    </div>
  );
}
