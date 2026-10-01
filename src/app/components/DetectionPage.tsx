import { useState } from 'react';
import { Activity, HeartPulse, ShieldAlert, UserRound, Waves } from 'lucide-react';
import { EARLY_WARNING_LABEL } from '../packText.ts';
import { evaluateDetector, type DetectorConfig, type DetectorId, type Baseline } from '../detectors.ts';
import { startLadder, advance, acknowledge, isSos, caregiverAlertDue, type LadderState } from '../escalation.ts';

// Automatic-detection surface (Phase 2).
//
// It renders ONLY the framework states. Every detector is disabled by default
// and shows why; nothing here invents a detection. The escalation ladder is a
// manual control so the flow can be exercised without a real model.

const C = {
  teal: '#2DD4A4', blue: '#378ADD', amber: '#EF9F27', red: '#E24B4A',
  text: '#E2F4F0', muted: '#5A7A72', card: 'rgba(13,21,37,0.88)', border: 'rgba(255,255,255,0.08)',
};

const DETECTORS: { id: DetectorId; label: string; icon: typeof Activity }[] = [
  { id: 'illness_drift', label: 'Illness drift', icon: Activity },
  { id: 'seizure_detection', label: 'Seizure detection', icon: Waves },
  { id: 'fall_detection', label: 'Fall / collapse', icon: ShieldAlert },
  { id: 'sickle_cell_crisis', label: 'Sickle cell crisis', icon: HeartPulse },
  { id: 'breathing_trouble', label: 'Breathing trouble', icon: Activity },
];

export interface DetectionPageProps {
  /** Per-detector configuration. Absent => disabled. Thresholds are operator-set. */
  configs: Partial<Record<DetectorId, DetectorConfig>>;
  baseline?: Baseline | null;
  onClose?: () => void;
}

function stateLabel(outcome: ReturnType<typeof evaluateDetector>): { text: string; color: string } {
  if (outcome.state === 'disabled') return { text: 'Not enabled', color: C.muted };
  if (outcome.state === 'learning') return { text: 'Learning your normal range', color: C.blue };
  if (outcome.state === 'unavailable') return { text: 'Not available', color: C.muted };
  return { text: outcome.triggered ? 'Change noticed' : 'Within your range', color: outcome.triggered ? C.amber : C.teal };
}

export function DetectionPage({ configs, baseline = null, onClose }: DetectionPageProps) {
  const [ladder, setLadder] = useState<LadderState>(() => startLadder());

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1500, background: '#0A1120', overflowY: 'auto', padding: 18, color: C.text }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <div style={{ fontSize: 18, fontWeight: 800 }}>Automatic detection</div>
        {onClose && (
          <button onClick={onClose} style={{ background: 'transparent', border: `1px solid ${C.border}`, color: C.text, borderRadius: 8, padding: '6px 10px', cursor: 'pointer' }}>
            Close
          </button>
        )}
      </div>
      <div style={{ color: C.muted, fontSize: 11, marginBottom: 14, lineHeight: 1.5 }}>{EARLY_WARNING_LABEL}</div>

      {DETECTORS.map(({ id, label, icon: Icon }) => {
        const outcome = evaluateDetector(id, configs[id], baseline);
        const { text, color } = stateLabel(outcome);
        return (
          <div key={id} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 14, marginBottom: 10 }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <Icon size={18} color={C.teal} />
              <div style={{ flex: 1 }}>
                <div style={{ color: C.text, fontWeight: 700, fontSize: 14 }}>{label}</div>
                <div style={{ color: C.muted, fontSize: 11, marginTop: 2 }}>{outcome.reason}</div>
              </div>
              <div style={{ color, fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap' }}>{text}</div>
            </div>
          </div>
        );
      })}

      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 14, marginTop: 6 }}>
        <div style={{ color: C.text, fontWeight: 700, fontSize: 14, marginBottom: 8, display: 'flex', gap: 8, alignItems: 'center' }}>
          <UserRound size={16} color={C.teal} /> Check-in ladder
        </div>
        <div style={{ color: C.muted, fontSize: 12, marginBottom: 10 }}>
          Current rung: <strong style={{ color: isSos(ladder) ? C.red : C.text }}>{ladder.rung.replace(/_/g, ' ')}</strong>
          {caregiverAlertDue(ladder) && <span style={{ color: C.amber }}> · caregiver alert due</span>}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={() => setLadder(startLadder())}
            style={{ flex: 1, padding: 10, borderRadius: 10, border: `1px solid ${C.border}`, background: 'transparent', color: C.text, cursor: 'pointer' }}
          >
            Start
          </button>
          <button
            onClick={() => setLadder(acknowledge(ladder))}
            style={{ flex: 1, padding: 10, borderRadius: 10, border: 0, background: C.teal, color: '#04342C', fontWeight: 800, cursor: 'pointer' }}
          >
            I am OK
          </button>
          <button
            onClick={() => setLadder(advance(ladder))}
            style={{ flex: 1, padding: 10, borderRadius: 10, border: 0, background: C.amber, color: '#3A2A05', fontWeight: 800, cursor: 'pointer' }}
          >
            No answer
          </button>
        </div>
        <div style={{ color: C.muted, fontSize: 10, marginTop: 10, lineHeight: 1.5 }}>
          The ladder only offers the next step. VEEDA never dials or messages on its own — you send any message yourself.
        </div>
      </div>
    </div>
  );
}
