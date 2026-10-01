import { useMemo, useState } from 'react';
import { Apple, CalendarClock, HeartPulse, ScanLine, ShieldCheck } from 'lucide-react';
import { evaluateTriage, dueReminders, loadPreventionPack, type PreventionLoadResult } from '../prevention.ts';
import { computeDailyHealthScore, type ScoreInput } from '../healthScore.ts';
import { lookupProduct, CROWD_REPORT_LABEL, type ProductLookup } from '../foodSafety.ts';

// Prevention surface (Phase 4): triage, daily summary, reminders, food safety.
//
// Everything clinical is pack-driven; when no approved pack is loaded each
// section shows a plain "not available" line. The daily score is explicitly
// non-clinical and prints its own formula.

const C = {
  teal: '#2DD4A4', blue: '#378ADD', amber: '#EF9F27', red: '#E24B4A',
  text: '#E2F4F0', muted: '#5A7A72', card: 'rgba(13,21,37,0.88)', border: 'rgba(255,255,255,0.08)',
};

export interface PreventionPageProps {
  pack: unknown;
  production: boolean;
  inputs?: Record<string, number | string | boolean | null | undefined>;
  scoreInputs?: ScoreInput[];
  lastDone?: Record<string, string | undefined>;
  emergencyNumber?: string | null;
  /** Configured product-data endpoint (empty => lookups stay "unknown"). */
  productEndpoint?: string;
  onClose?: () => void;
}

export function PreventionPage({
  pack, production, inputs = {}, scoreInputs = [], lastDone = {},
  emergencyNumber, productEndpoint = '', onClose,
}: PreventionPageProps) {
  const loaded = useMemo<PreventionLoadResult>(() => loadPreventionPack(pack, { production }), [pack, production]);
  const triage = evaluateTriage(loaded, inputs, emergencyNumber);
  const due = dueReminders(loaded, lastDone);
  const score = computeDailyHealthScore(scoreInputs);
  const [lookup, setLookup] = useState<ProductLookup | null>(null);
  const [code, setCode] = useState('');

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1500, background: '#0A1120', overflowY: 'auto', padding: 18, color: C.text }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <div style={{ fontSize: 18, fontWeight: 800 }}>Prevention</div>
        {onClose && (
          <button onClick={onClose} style={{ background: 'transparent', border: `1px solid ${C.border}`, color: C.text, borderRadius: 8, padding: '6px 10px', cursor: 'pointer' }}>
            Close
          </button>
        )}
      </div>

      <Card icon={HeartPulse} title="Triage">
        {triage.state === 'unavailable' ? (
          <Muted>{triage.reason}</Muted>
        ) : (
          <>
            <div style={{ color: triage.redFlag ? C.red : C.text, fontWeight: 700, fontSize: 13 }}>{triage.message}</div>
            {triage.advice && <Muted>{triage.advice}</Muted>}
            <Tiny>From {triage.reviewedBy}. Early warning / screening, not a diagnosis.</Tiny>
          </>
        )}
      </Card>

      <Card icon={ShieldCheck} title="Daily summary">
        {score.score === null ? (
          <Muted>Nothing recorded yet to summarise.</Muted>
        ) : (
          <>
            <div style={{ fontSize: 26, fontWeight: 800 }}>{score.score}<span style={{ fontSize: 13, color: C.muted }}>/100</span></div>
            <Muted>{score.label}</Muted>
            <Tiny>{score.formula}</Tiny>
            {score.components.map(c => (
              <Tiny key={c.id}>{c.label} — {c.detail} (source: {c.source.replace(/_/g, ' ')})</Tiny>
            ))}
          </>
        )}
      </Card>

      <Card icon={CalendarClock} title="Reminders">
        {due.length === 0 ? <Muted>No reminders are due from the approved pack.</Muted> : due.map(r => (
          <div key={r.id} style={{ fontSize: 12, marginBottom: 6 }}>
            <span style={{ fontWeight: 600 }}>{r.label}</span>
            <span style={{ color: C.muted }}> — {r.dueOn ? `due ${r.dueOn}` : 'standing'}</span>
            {r.note && <div style={{ color: C.muted, fontSize: 11 }}>{r.note}</div>}
          </div>
        ))}
      </Card>

      <Card icon={Apple} title="Food safety">
        <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
          <input
            value={code}
            onChange={e => setCode(e.target.value)}
            placeholder="Barcode / NAFDAC number"
            style={{ flex: 1, padding: 9, borderRadius: 8, border: `1px solid ${C.border}`, background: 'transparent', color: C.text }}
          />
          <button
            onClick={async () => setLookup(await lookupProduct(code, { endpoint: productEndpoint, fetchImpl: productEndpoint ? fetch : undefined }))}
            style={{ padding: '9px 14px', borderRadius: 8, border: 0, background: C.teal, color: '#04342C', fontWeight: 800, cursor: 'pointer' }}
          >
            Look up
          </button>
        </div>
        {lookup && (
          <div style={{ fontSize: 12 }}>
            <span style={{ fontWeight: 700 }}>{lookup.verdict}</span> — <Muted>{lookup.note}</Muted>
          </div>
        )}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 10 }}>
          <ScanLine size={14} color={C.muted} />
          <Tiny>Label reading (OCR) and spoilage detection are not available yet — no validated model is configured.</Tiny>
        </div>
        <Tiny>{CROWD_REPORT_LABEL}</Tiny>
      </Card>
    </div>
  );
}

function Card({ icon: Icon, title, children }: { icon: typeof Apple; title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 14, marginBottom: 10 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', fontWeight: 700, fontSize: 14, marginBottom: 8 }}>
        <Icon size={16} color={C.teal} /> {title}
      </div>
      {children}
    </div>
  );
}

function Muted({ children }: { children: React.ReactNode }) {
  return <div style={{ color: C.muted, fontSize: 12, lineHeight: 1.5 }}>{children}</div>;
}

function Tiny({ children }: { children: React.ReactNode }) {
  return <div style={{ color: C.muted, fontSize: 10, lineHeight: 1.5, marginTop: 4 }}>{children}</div>;
}
