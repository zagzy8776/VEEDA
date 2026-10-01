import { useState } from 'react';
import { Camera, Mic, PhoneCall, Video } from 'lucide-react';
import {
  startSession, setCamera, setMic, setRecording, endSession,
  inUseIndicator, loadStrokeScreen, type SessionKind, type SessionState,
} from '../liveSession.ts';

// Live camera & voice consult surface (Phase 6).
//
// Consent is per session, the "camera is on" indicator is derived from the session
// state, and recording is off until explicitly switched on. The stroke-screen steps
// come from a reviewed pack; with none loaded the screen says so.

const C = {
  teal: '#2DD4A4', blue: '#378ADD', amber: '#EF9F27', red: '#E24B4A',
  text: '#E2F4F0', muted: '#5A7A72', card: 'rgba(13,21,37,0.88)', border: 'rgba(255,255,255,0.08)',
};

const KINDS: { id: SessionKind; label: string }[] = [
  { id: 'self_check', label: 'Self check' },
  { id: 'caregiver_remote', label: 'Caregiver-started remote check' },
  { id: 'emergency', label: 'Emergency mode' },
  { id: 'label_reading', label: 'Read a label aloud' },
  { id: 'stroke_screen', label: 'Stroke screen' },
];

export interface ConsultPageProps {
  strokePack: unknown;
  production: boolean;
  onClose?: () => void;
}

export function ConsultPage({ strokePack, production, onClose }: ConsultPageProps) {
  const [kind, setKind] = useState<SessionKind>('self_check');
  const [state, setState] = useState<SessionState>(() => startSession('self_check', false));
  const indicator = inUseIndicator(state);
  const stroke = loadStrokeScreen(strokePack, { production });

  const begin = (withConsent: boolean) => setState(startSession(kind, withConsent));

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1500, background: '#0A1120', overflowY: 'auto', padding: 18, color: C.text }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div style={{ fontSize: 18, fontWeight: 800 }}>Live consult</div>
        {onClose && (
          <button onClick={onClose} style={{ background: 'transparent', border: `1px solid ${C.border}`, color: C.text, borderRadius: 8, padding: '6px 10px', cursor: 'pointer' }}>
            Close
          </button>
        )}
      </div>

      {indicator && (
        <div style={{ position: 'sticky', top: 0, zIndex: 2, background: C.red, color: '#fff', fontWeight: 800, fontSize: 12, padding: '6px 10px', borderRadius: 8, marginBottom: 10 }}>
          {indicator}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
        {KINDS.map(k => (
          <button
            key={k.id}
            onClick={() => setKind(k.id)}
            style={{
              padding: '7px 12px', borderRadius: 999, cursor: 'pointer', fontSize: 12, fontWeight: 600,
              border: `1px solid ${kind === k.id ? C.teal : C.border}`,
              background: kind === k.id ? 'rgba(45,212,164,0.14)' : 'transparent',
              color: kind === k.id ? C.teal : C.text,
            }}
          >
            {k.label}
          </button>
        ))}
      </div>

      <Card icon={Video} title="Session">
        <div style={{ color: C.muted, fontSize: 12, marginBottom: 10, lineHeight: 1.5 }}>
          Consent is asked every session. Recording is off unless you switch it on, and nothing is
          stored by default. Processing happens on your device first.
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Btn onClick={() => begin(true)}>Start with consent</Btn>
          <Btn onClick={() => setState(setCamera(state, !state.cameraOn))} icon={Camera} muted={!state.cameraOn}>{state.cameraOn ? 'Camera off' : 'Camera on'}</Btn>
          <Btn onClick={() => setState(setMic(state, !state.micOn))} icon={Mic} muted={!state.micOn}>{state.micOn ? 'Mic off' : 'Mic on'}</Btn>
          <Btn onClick={() => setState(setRecording(state, !state.recording))} muted={!state.recording}>{state.recording ? 'Stop recording' : 'Record (off)'}</Btn>
          <Btn onClick={() => setState(endSession(state))} muted>End</Btn>
        </div>
        {!state.consented && state.active && (
          <div style={{ color: C.amber, fontSize: 11, marginTop: 8 }}>No consent yet — the camera and mic stay off.</div>
        )}
      </Card>

      {kind === 'stroke_screen' && (
        <Card icon={PhoneCall} title="Stroke screen">
          {stroke.ok === false ? (
            <div style={{ color: C.muted, fontSize: 12 }}>
              The stroke screen is not available: no approved pack is loaded. If you feel unwell or think
              someone is having a stroke, get emergency help now.
            </div>
          ) : (
            stroke.screen.steps.map((s, i) => (
              <div key={s.id} style={{ fontSize: 12, marginBottom: 8 }}>
                <span style={{ fontWeight: 600 }}>{i + 1}. {s.prompt}</span>
                <div style={{ color: C.muted }}>{s.instruction}</div>
              </div>
            ))
          )}
        </Card>
      )}

      <div style={{ color: C.muted, fontSize: 10, marginTop: 4, lineHeight: 1.5 }}>
        Labels read aloud, visual-check results and local-language voice are not yet validated in this
        build. Early warning / screening, not a diagnosis.
      </div>
    </div>
  );
}

function Card({ icon: Icon, title, children }: { icon: typeof Video; title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 14, marginBottom: 10 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', fontWeight: 700, fontSize: 14, marginBottom: 8 }}>
        <Icon size={16} color={C.teal} /> {title}
      </div>
      {children}
    </div>
  );
}

function Btn({ children, onClick, icon: Icon, muted }: { children: React.ReactNode; onClick: () => void; icon?: typeof Camera; muted?: boolean }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 6, padding: '9px 12px', borderRadius: 8, cursor: 'pointer',
        border: `1px solid ${C.border}`, background: muted ? 'transparent' : 'rgba(45,212,164,0.14)',
        color: muted ? C.text : C.teal, fontWeight: 700, fontSize: 12,
      }}
    >
      {Icon && <Icon size={14} />} {children}
    </button>
  );
}
