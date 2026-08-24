import { useEffect, useState } from 'react';
import { Activity, Camera, Mic, ShieldCheck, ShieldAlert } from 'lucide-react';
import type { VedaApp } from '../useVedaApp';
import { useAutomaticHealthScan } from '../automaticHealthScan';
import { CameraSensorCheck } from './CameraSensorCheck';

const C = { teal: '#2DD4A4', amber: '#EF9F27', red: '#E24B4A', text: '#E2F4F0', muted: '#5A7A72', card: 'rgba(13,21,37,0.96)', border: 'rgba(255,255,255,0.08)' };

export function AutoHealthControl({ app }: { app: VedaApp }) {
  const [enabled, setEnabled] = useState(() => localStorage.getItem('veda_auto_scan') === 'true');
  const [cameraCheck, setCameraCheck] = useState(false);
  const scan = useAutomaticHealthScan({
    enabled,
    onHeartRate: (bpm, confidence, quality) => {
      app.setVital('heartRate', bpm, 'Automatic camera rPPG');
      app.saveBiometric('heart_rate', bpm, 'beats/min', { source: 'camera_rppg', acquisition: 'automatic', confidence, signalQuality: quality.signalQuality, snrDb: quality.snrDb, sampleRateHz: quality.sampleRateHz });
      app.ingestRawBiometric('HEART_RATE', bpm, 'beats/min', { source: 'camera_rppg', acquisition: 'automatic', confidence, signalQuality: quality.signalQuality, snrDb: quality.snrDb });
    },
    onBreathRate: (bpm) => {
      app.setVital('respiratory', bpm, 'Automatic microphone analysis');
      app.saveBiometric('breath_rate', bpm, 'breaths/min', { source: 'microphone', acquisition: 'automatic' });
      app.ingestRawBiometric('RESP_RATE', bpm, 'breaths/min', { source: 'microphone', acquisition: 'automatic' });
    },
  });

  useEffect(() => {
    localStorage.setItem('veda_auto_scan', String(enabled));
    if (enabled) scan.start(); else scan.stop();
  }, [enabled]);

  const statusText = !enabled ? 'Automatic scan is off' : scan.state === 'measuring-heart' ? 'Checking heart rate…' : scan.state === 'measuring-breath' ? 'Checking breathing…' : scan.state === 'cooldown' ? 'Sensors checked · watching' : scan.state === 'error' ? 'Sensor check needs attention' : 'Sensors ready · automatic checks enabled';

  return (
    <>
      <div style={{ position: 'fixed', left: '50%', bottom: 78, transform: 'translateX(-50%)', width: 'min(350px, calc(100vw - 32px))', zIndex: 700, pointerEvents: 'none' }}>
        <div style={{ pointerEvents: 'auto', background: C.card, border: `1px solid ${enabled ? 'rgba(45,212,164,0.28)' : C.border}`, borderRadius: 18, padding: '10px 12px', boxShadow: '0 12px 36px rgba(0,0,0,0.35)', backdropFilter: 'blur(16px)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 34, height: 34, borderRadius: 11, background: enabled ? 'rgba(45,212,164,0.12)' : 'rgba(255,255,255,0.05)', display: 'grid', placeItems: 'center', color: enabled ? C.teal : C.muted, flexShrink: 0 }}>{enabled ? <Activity size={17} /> : <ShieldAlert size={17} />}</div>
            <div style={{ minWidth: 0, flex: 1 }}><div style={{ color: C.text, fontSize: 12, fontWeight: 700 }}>VEEDA automatic health check</div><div style={{ color: C.muted, fontSize: 10, lineHeight: 1.35 }}>{statusText}</div></div>
            <button type="button" onClick={() => setEnabled(v => !v)} aria-pressed={enabled} style={{ minWidth: 74, minHeight: 42, border: 0, borderRadius: 12, cursor: 'pointer', background: enabled ? C.teal : 'rgba(255,255,255,0.08)', color: enabled ? '#04342C' : C.text, fontWeight: 800, fontSize: 11 }}>{enabled ? 'ON' : 'OFF'}</button>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 8, paddingLeft: 44 }}>
            <button type="button" onClick={() => setCameraCheck(true)} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, border: 0, borderRadius: 9, padding: '7px 9px', background: 'rgba(255,255,255,.06)', color: C.text, fontSize: 9, fontWeight: 700 }}><Camera size={11} /> Test camera</button>
            {enabled && <><span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: C.muted, fontSize: 9 }}><Mic size={11} /> breathing</span><span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: C.muted, fontSize: 9 }}><ShieldCheck size={11} /> quality gated</span></>}
          </div>
          {scan.error && <div style={{ marginTop: 7, paddingLeft: 44, color: C.red, fontSize: 9 }}>{scan.error}</div>}
        </div>
      </div>
      <CameraSensorCheck open={cameraCheck} onClose={() => setCameraCheck(false)} />
    </>
  );
}
