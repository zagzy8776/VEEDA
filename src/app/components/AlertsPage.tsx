import { useEffect, useState } from 'react';
import { AlertTriangle, Info, MapPin, Radio } from 'lucide-react';
import { buildAlertPanel, type PanelState, type SessionAlert, type AlertSource } from '../alerts.ts';

// Alerts surface for the Phase 1 environment/safety alerts.
//
// It renders ONLY what the alert engine returns. When no approved pack is loaded
// it shows a plain "not available" line (never a blank screen and never a
// reassuring all-clear). Wording, severity and next-steps all come from the
// reviewed pack; nothing is written in this component.

const C = {
  teal: '#2DD4A4', blue: '#378ADD', amber: '#EF9F27', red: '#E24B4A',
  text: '#E2F4F0', muted: '#5A7A72', card: 'rgba(13,21,37,0.88)', border: 'rgba(255,255,255,0.08)',
};

const SEVERITY_COLOR: Record<SessionAlert['severity'], string> = {
  info: C.blue, advisory: C.amber, warning: C.amber, danger: C.red,
};

export interface AlertsPageProps {
  /** Raw alert pack, or null when the deployment has none configured. */
  pack: unknown;
  /** Which rules have been triggered this session, and from which source. */
  triggered: { ruleId: string; source: AlertSource }[];
  production: boolean;
  /** Verified emergency number (config only); null shows plain wording. */
  emergencyNumber?: string | null;
  onClose?: () => void;
}

function AlertCard({ alert }: { alert: SessionAlert }) {
  const color = SEVERITY_COLOR[alert.severity];
  const Icon = alert.severity === 'info' || alert.severity === 'advisory' ? Info : AlertTriangle;
  return (
    <div style={{ background: C.card, border: `1px solid ${color}44`, borderRadius: 14, padding: 14, marginBottom: 10 }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
        <Icon size={18} color={color} style={{ marginTop: 2, flexShrink: 0 }} />
        <div style={{ flex: 1 }}>
          <div style={{ color: C.text, fontWeight: 700, fontSize: 14 }}>{alert.message}</div>
          {alert.advice && <div style={{ color: C.muted, fontSize: 12, marginTop: 6, lineHeight: 1.5 }}>{alert.advice}</div>}
          <div style={{ color: C.muted, fontSize: 10, marginTop: 8 }}>
            {alert.kind.replace(/_/g, ' ')} · source: {alert.source.replace(/_/g, ' ')} ·{' '}
            {alert.reviewedBy.clinicallyReviewed
              ? `reviewed by ${alert.reviewedBy.reviewer} on ${alert.reviewedBy.reviewDate}`
              : 'EXAMPLE / not clinically reviewed'}
          </div>
        </div>
      </div>
    </div>
  );
}

export function AlertsPage({ pack, triggered, production, emergencyNumber, onClose }: AlertsPageProps) {
  const [state, setState] = useState<PanelState>({ status: 'unavailable', reason: 'loading' });

  useEffect(() => {
    setState(buildAlertPanel(pack, triggered, { production }));
  }, [pack, triggered, production]);

  const helpLine = emergencyNumber
    ? `If you feel unwell, get medical help now or call ${emergencyNumber}.`
    : 'If you feel unwell, get medical help now or call your local emergency number.';

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1500, background: '#0A1120', overflowY: 'auto', padding: 18, color: C.text }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div style={{ fontSize: 18, fontWeight: 800 }}>Alerts</div>
        {onClose && (
          <button onClick={onClose} style={{ background: 'transparent', border: `1px solid ${C.border}`, color: C.text, borderRadius: 8, padding: '6px 10px', cursor: 'pointer' }}>
            Close
          </button>
        )}
      </div>

      <div style={{ color: C.muted, fontSize: 11, marginBottom: 12, display: 'flex', gap: 6, alignItems: 'center' }}>
        <Radio size={12} /> Early warning only — this is not a diagnosis.
      </div>

      {state.status === 'unavailable' ? (
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 16 }}>
          <div style={{ color: C.text, fontWeight: 700, marginBottom: 6 }}>Alerts are not available right now</div>
          <div style={{ color: C.muted, fontSize: 12, lineHeight: 1.5 }}>{state.reason}</div>
          <div style={{ color: C.muted, fontSize: 12, lineHeight: 1.5, marginTop: 8 }}>{helpLine}</div>
        </div>
      ) : state.alerts.length === 0 ? (
        <div style={{ color: C.muted, fontSize: 12, lineHeight: 1.5 }}>
          No alerts from your trusted sources right now. {helpLine}
        </div>
      ) : (
        state.alerts.map(a => <AlertCard key={`${a.id}-${a.raisedAt}`} alert={a} />)
      )}

      <div style={{ color: C.muted, fontSize: 10, marginTop: 16, display: 'flex', gap: 6, alignItems: 'center' }}>
        <MapPin size={11} /> Fire, smoke and CO alerts come only from trusted feeds or real alarms — never a phone guess.
      </div>
    </div>
  );
}
