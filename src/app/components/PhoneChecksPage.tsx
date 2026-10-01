import { useState } from 'react';
import { Camera, ScanLine } from 'lucide-react';
import { PHONE_CHECKS, runPhoneCheck, type PhoneCheckOutcome } from '../phoneChecks.ts';
import { buildRegistry } from '../modelRegistry.ts';
import { checkQuality, DEFAULT_REQUIREMENT, type CaptureStats } from '../captureQuality.ts';

// Phone-checks surface (Phase 5).
//
// Guided capture and the photo quality gate WORK NOW. Every check reports "not
// yet validated" until a validated model is registered, and never shows a result.
// No model is registered in this build, so the registry is intentionally empty.

const C = {
  teal: '#2DD4A4', blue: '#378ADD', amber: '#EF9F27', red: '#E24B4A',
  text: '#E2F4F0', muted: '#5A7A72', card: 'rgba(13,21,37,0.88)', border: 'rgba(255,255,255,0.08)',
};

export interface PhoneChecksPageProps {
  hasConsent?: boolean;
  onClose?: () => void;
}

export function PhoneChecksPage({ hasConsent = false, onClose }: PhoneChecksPageProps) {
  const [selected, setSelected] = useState(PHONE_CHECKS[0].id);
  // A real capture would supply these from a canvas; the UI exposes a demo probe
  // so the working quality gate can be exercised without a camera in this build.
  const [stats, setStats] = useState<CaptureStats | null>(null);

  const check = PHONE_CHECKS.find(c => c.id === selected)!;
  const registry = buildRegistry([]);
  const outcome: PhoneCheckOutcome = runPhoneCheck(check, stats, hasConsent, registry);
  const quality = stats ? checkQuality(stats, DEFAULT_REQUIREMENT) : null;

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1500, background: '#0A1120', overflowY: 'auto', padding: 18, color: C.text }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div style={{ fontSize: 18, fontWeight: 800 }}>Phone checks</div>
        {onClose && (
          <button onClick={onClose} style={{ background: 'transparent', border: `1px solid ${C.border}`, color: C.text, borderRadius: 8, padding: '6px 10px', cursor: 'pointer' }}>
            Close
          </button>
        )}
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
        {PHONE_CHECKS.map(c => (
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
            {c.title}{c.needsLens ? ' · lens' : ''}
          </button>
        ))}
      </div>

      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 14, marginBottom: 10 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', fontWeight: 700, fontSize: 14, marginBottom: 8 }}>
          <Camera size={16} color={C.teal} /> {check.title}
        </div>
        <div style={{ color: C.muted, fontSize: 12, lineHeight: 1.5 }}>
          Guided capture keeps the area in the frame and checks the photo (focus, light, framing)
          before anything is used. No photo is recorded by default.
        </div>
        <button
          onClick={() => setStats({ width: 1000, height: 1000, sharpness: 0.8, brightness: 0.5, coverage: 0.5 })}
          style={{ marginTop: 10, padding: '9px 14px', borderRadius: 8, border: 0, background: C.teal, color: '#04342C', fontWeight: 800, cursor: 'pointer' }}
        >
          Simulate a good capture
        </button>
        {quality && (
          <div style={{ fontSize: 12, marginTop: 8, color: quality.ok ? C.teal : C.amber }}>
            Quality gate: {quality.ok ? 'photo looks usable' : `retake needed — ${quality.ok === false ? quality.guidance : ''}`}
          </div>
        )}
      </div>

      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 14 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', fontWeight: 700, fontSize: 14, marginBottom: 8 }}>
          <ScanLine size={16} color={C.amber} /> Result
        </div>
        <div style={{ color: outcome.state === 'not_validated' ? C.amber : C.text, fontSize: 12, lineHeight: 1.5 }}>
          {outcome.state === 'no_consent' && outcome.message}
          {outcome.state === 'retake' && `Retake needed — ${outcome.guidance}`}
          {outcome.state === 'not_validated' && outcome.message}
          {outcome.state === 'unavailable' && outcome.message}
        </div>
        <div style={{ color: C.muted, fontSize: 10, marginTop: 8, lineHeight: 1.5 }}>
          Early warning / screening, not a diagnosis. No result is produced until a validated model
          and acceptance thresholds are configured.
        </div>
      </div>
    </div>
  );
}
