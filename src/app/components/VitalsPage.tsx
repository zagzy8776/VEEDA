import { motion, AnimatePresence } from 'motion/react';
import { Heart, Wind, Droplet, Moon, Footprints, Thermometer, Camera, Mic, AlertTriangle, X, CheckCircle } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { useState, useMemo, useRef, useEffect } from 'react';
import type { VedaApp } from '../useVedaApp';
import { useHeartRate, useBreathRate } from '../sensors';

const C = { teal: '#2DD4A4', blue: '#378ADD', amber: '#EF9F27', red: '#E24B4A', text: '#E2F4F0', muted: '#5A7A72', card: 'rgba(13,21,37,0.88)', border: 'rgba(255,255,255,0.08)' };

const Tip = ({ msg }: { msg: string }) => (
  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 5, marginTop: 8, fontSize: 10, color: C.muted, lineHeight: 1.4 }}>
    <AlertTriangle size={11} style={{ color: C.amber, flexShrink: 0, marginTop: 1 }} /><span>{msg}</span>
  </div>
);

const ChartTip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: '#111827', border: '0.5px solid rgba(255,255,255,0.1)', borderRadius: 10, padding: '8px 12px', fontSize: 11, color: C.text }}>
      <div style={{ color: C.muted, marginBottom: 4 }}>{label}</div>
      {payload.map((p: any) => <div key={p.dataKey} style={{ color: p.color }}>{p.name}: <strong>{p.value ?? '--'}</strong></div>)}
    </div>
  );
};

// Mini waveform renderer
function Waveform({ data, color }: { data: number[]; color: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = canvasRef.current; if (!c) return;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#080f1a'; ctx.fillRect(0, 0, c.width, c.height);
    if (data.length < 2) return;
    const min = Math.min(...data), max = Math.max(...data), range = max - min || 1;
    ctx.beginPath(); ctx.strokeStyle = color; ctx.lineWidth = 2;
    data.forEach((v, i) => {
      const x = (i / (data.length - 1)) * c.width;
      const y = c.height - ((v - min) / range) * c.height * 0.8 - c.height * 0.1;
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    });
    ctx.stroke();
  }, [data, color]);
  return <canvas ref={canvasRef} width={300} height={70} style={{ width: '100%', borderRadius: 10, display: 'block' }} />;
}

// Countdown ring
function CountdownRing({ progress, countdown, color, label }: { progress: number; countdown: number; color: string; label: string }) {
  const r = 44, circ = 2 * Math.PI * r;
  return (
    <div style={{ position: 'relative', width: 110, height: 110, margin: '0 auto' }}>
      <svg width="110" height="110" viewBox="0 0 100 100" style={{ transform: 'rotate(-90deg)' }}>
        <circle cx="50" cy="50" r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="7" />
        <circle cx="50" cy="50" r={r} fill="none" stroke={color} strokeWidth="7"
          strokeDasharray={circ} strokeDashoffset={circ * (1 - progress / 100)}
          strokeLinecap="round" style={{ transition: 'stroke-dashoffset 0.2s linear' }} />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ fontSize: 22, fontWeight: 700, color, fontFamily: "'Geist Mono',monospace" }}>{countdown}s</div>
        <div style={{ fontSize: 9, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</div>
      </div>
    </div>
  );
}

// Heart Rate Measurement Modal
function HRModal({ onClose, onResult }: { onClose: () => void; onResult: (bpm: number, conf: string) => void }) {
  const { state, countdown, progress, waveform, error, start, stop, reset } = useHeartRate(onResult);

  useEffect(() => { start(); return stop; }, [start, stop]);

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)', zIndex: 800, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
      <motion.div initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'spring', damping: 28, stiffness: 300 }}
        style={{ width: '100%', maxWidth: 390, background: '#0a0f1c', borderRadius: '24px 24px 0 0', padding: 24, paddingBottom: 36, border: '0.5px solid rgba(255,255,255,0.1)' }}>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700, color: C.text }}>Heart Rate</div>
            <div style={{ fontSize: 12, color: C.muted }}>Camera rPPG · 30 seconds</div>
          </div>
          <button onClick={onClose} style={{ width: 34, height: 34, borderRadius: 10, background: 'rgba(255,255,255,0.07)', border: 'none', cursor: 'pointer', display: 'grid', placeItems: 'center', color: C.muted }}>
            <X size={16} />
          </button>
        </div>

        {state === 'requesting' && (
          <div style={{ textAlign: 'center', padding: '30px 0', color: C.muted, fontSize: 13 }}>Requesting camera access...</div>
        )}

        {state === 'measuring' && (
          <>
            <p style={{ fontSize: 13, color: C.muted, textAlign: 'center', marginBottom: 20, lineHeight: 1.6 }}>
              Place your <strong style={{ color: C.text }}>fingertip firmly</strong> over the <strong style={{ color: C.text }}>rear camera lens</strong>. Hold completely still. Ensure good lighting.
            </p>
            <CountdownRing progress={progress} countdown={countdown} color={C.red} label="measuring" />
            <div style={{ marginTop: 16 }}>
              <Waveform data={waveform} color={C.red} />
            </div>
            <Tip msg="Camera-based rPPG estimate. Accuracy varies by lighting, motion, and device. Not a medical device." />
          </>
        )}

        {state === 'done' && (
          <div style={{ textAlign: 'center', padding: '16px 0' }}>
            <CheckCircle size={40} style={{ color: C.teal, margin: '0 auto 12px', display: 'block' }} />
            <div style={{ fontSize: 13, color: C.teal, fontWeight: 600 }}>Measurement complete</div>
            <div style={{ fontSize: 11, color: C.muted, marginTop: 4 }}>Result saved to your vitals</div>
            <button onClick={onClose} style={{ marginTop: 20, width: '100%', padding: '12px', background: C.teal, color: '#04342C', borderRadius: 12, border: 'none', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>Done</button>
          </div>
        )}

        {state === 'error' && (
          <div style={{ textAlign: 'center', padding: '16px 0' }}>
            <div style={{ fontSize: 13, color: C.red, marginBottom: 16, lineHeight: 1.5 }}>{error}</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => { reset(); start(); }} style={{ flex: 1, padding: '12px', background: C.teal, color: '#04342C', borderRadius: 12, border: 'none', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>Try Again</button>
              <button onClick={onClose} style={{ flex: 1, padding: '12px', background: 'rgba(255,255,255,0.07)', color: C.text, borderRadius: 12, border: 'none', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>Cancel</button>
            </div>
          </div>
        )}
      </motion.div>
    </div>
  );
}

// Breath Rate Measurement Modal
function BRModal({ onClose, onResult }: { onClose: () => void; onResult: (bpm: number) => void }) {
  const { state, countdown, progress, waveform, error, start, stop, reset } = useBreathRate(onResult);

  useEffect(() => { start(); return stop; }, [start, stop]);

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)', zIndex: 800, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
      <motion.div initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'spring', damping: 28, stiffness: 300 }}
        style={{ width: '100%', maxWidth: 390, background: '#0a0f1c', borderRadius: '24px 24px 0 0', padding: 24, paddingBottom: 36, border: '0.5px solid rgba(255,255,255,0.1)' }}>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700, color: C.text }}>Breath Rate</div>
            <div style={{ fontSize: 12, color: C.muted }}>Microphone analysis · 30 seconds</div>
          </div>
          <button onClick={onClose} style={{ width: 34, height: 34, borderRadius: 10, background: 'rgba(255,255,255,0.07)', border: 'none', cursor: 'pointer', display: 'grid', placeItems: 'center', color: C.muted }}>
            <X size={16} />
          </button>
        </div>

        {state === 'requesting' && (
          <div style={{ textAlign: 'center', padding: '30px 0', color: C.muted, fontSize: 13 }}>Requesting microphone access...</div>
        )}

        {state === 'measuring' && (
          <>
            <p style={{ fontSize: 13, color: C.muted, textAlign: 'center', marginBottom: 20, lineHeight: 1.6 }}>
              Hold phone <strong style={{ color: C.text }}>6–10cm from your face</strong>. Breathe <strong style={{ color: C.text }}>slowly and naturally</strong>. Stay in a quiet environment.
            </p>
            <CountdownRing progress={progress} countdown={countdown} color={C.blue} label="listening" />
            <div style={{ marginTop: 16 }}>
              <Waveform data={waveform} color={C.blue} />
            </div>
            <Tip msg="Microphone-based breathing pattern estimate. Not a medical device." />
          </>
        )}

        {state === 'done' && (
          <div style={{ textAlign: 'center', padding: '16px 0' }}>
            <CheckCircle size={40} style={{ color: C.teal, margin: '0 auto 12px', display: 'block' }} />
            <div style={{ fontSize: 13, color: C.teal, fontWeight: 600 }}>Measurement complete</div>
            <div style={{ fontSize: 11, color: C.muted, marginTop: 4 }}>Result saved to your vitals</div>
            <button onClick={onClose} style={{ marginTop: 20, width: '100%', padding: '12px', background: C.teal, color: '#04342C', borderRadius: 12, border: 'none', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>Done</button>
          </div>
        )}

        {state === 'error' && (
          <div style={{ textAlign: 'center', padding: '16px 0' }}>
            <div style={{ fontSize: 13, color: C.red, marginBottom: 16, lineHeight: 1.5 }}>{error}</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => { reset(); start(); }} style={{ flex: 1, padding: '12px', background: C.teal, color: '#04342C', borderRadius: 12, border: 'none', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>Try Again</button>
              <button onClick={onClose} style={{ flex: 1, padding: '12px', background: 'rgba(255,255,255,0.07)', color: C.text, borderRadius: 12, border: 'none', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>Cancel</button>
            </div>
          </div>
        )}
      </motion.div>
    </div>
  );
}

export function VitalsPage({ app }: { app: VedaApp }) {
  const { vitals, hydrationMl, logWater, setVital, ingestRawBiometric, saveBiometric, history, sleepHours, setSleepHours, steps, stepStatus, enableStepTracking, profile } = app;
  const canWriteVitals = app.canCreateVitals;
  const [tempInput, setTempInput] = useState('');
  const [bpInput, setBpInput] = useState('');
  const [tempUnit, setTempUnit] = useState<'C' | 'F'>(profile?.tempUnit ?? 'C');
  const [sleepStart, setSleepStart] = useState<string | null>(null);
  const [showHR, setShowHR] = useState(false);
  const [showBR, setShowBR] = useState(false);

  const wt = profile?.waterTarget || 2500;
  const sg = profile?.stepGoal || 10000;
  const hydPct = Math.min(100, Math.round((hydrationMl / wt) * 100));

  const trendData = useMemo(() => {
    const days: Record<string, { hr: number | null; br: number | null; day: string }> = {};
    for (let i = 6; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i);
      days[d.toDateString()] = { hr: null, br: null, day: d.toLocaleDateString('en-US', { weekday: 'short' }) };
    }
    history.forEach(e => {
      const key = new Date(e.timestamp).toDateString();
      if (!days[key]) return;
      if (e.type === 'heart_rate') days[key].hr = e.value;
      if (e.type === 'breath_rate') days[key].br = e.value;
    });
    return Object.values(days);
  }, [history]);

  function handleHRResult(bpm: number, confidence: string) {
    setVital('heartRate', bpm, 'Camera (rPPG)');
    saveBiometric('heart_rate', bpm, 'beats/min', { confidence });
    ingestRawBiometric('HEART_RATE', bpm, 'beats/min', { source: 'camera_rppg', confidence });
    setShowHR(false);
  }

  function handleBRResult(bpm: number) {
    setVital('respiratory', bpm, 'Microphone');
    saveBiometric('breath_rate', bpm, '/min');
    ingestRawBiometric('RESP_RATE', bpm, '/min', { source: 'microphone' });
    setShowBR(false);
  }

  function saveTemp() {
    let val = parseFloat(tempInput);
    if (isNaN(val)) return;
    if (tempUnit === 'F') val = (val - 32) * 5 / 9;
    const c = parseFloat(val.toFixed(1));
    setVital('skinTemp', c, 'Manual entry');
    saveBiometric('temperature', c, 'Cel');
    setTempInput('');
  }

  const bpValue = bpInput ? Number(bpInput) : null;
  const bpInvalid = bpValue !== null && (!Number.isFinite(bpValue) || bpValue < 40 || bpValue > 260);

  function saveSystolicBp() {
    if (bpValue === null || bpInvalid) return;
    setVital('systolicBp', bpValue, 'Manual entry');
    saveBiometric('systolic_bp', bpValue, 'mm[Hg]');
    setBpInput('');
  }

  function sleepNow() { setSleepStart(new Date().toISOString()); }
  function wakeNow() {
    if (!sleepStart) return;
    const hrs = parseFloat(((Date.now() - new Date(sleepStart).getTime()) / 3600000).toFixed(1));
    if (hrs >= 0.5) { setSleepHours(hrs); saveBiometric('sleep', hrs, 'h'); }
    setSleepStart(null);
  }

  return (
    <>
      <AnimatePresence>
        {showHR && <HRModal onClose={() => setShowHR(false)} onResult={handleHRResult} />}
        {showBR && <BRModal onClose={() => setShowBR(false)} onResult={handleBRResult} />}
      </AnimatePresence>

      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.24 }}
        style={{ overflowY: 'auto', height: '100%', scrollbarWidth: 'none' }}>
        <div style={{ padding: '0 20px 100px' }}>

          <div style={{ paddingTop: 22, paddingBottom: 4 }}>
            <h2 style={{ fontSize: 20, fontWeight: 700, color: C.text, lineHeight: 1 }}>Vitals</h2>
            <p style={{ fontSize: 12, color: C.muted, marginTop: 4 }}>Biometric tracking — phone sensors</p>
          </div>

          {/* Measure Hub */}
          <div style={{ margin: '16px 0', background: C.card, border: `1px solid ${C.border}`, borderRadius: 18, padding: '14px 16px' }}>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: C.muted, marginBottom: 12 }}>Measure Now</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8 }}>
              <button onClick={() => canWriteVitals && setShowHR(true)} disabled={!canWriteVitals} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, padding: '14px 8px', background: vitals.heartRate ? 'rgba(226,75,74,0.1)' : '#0A1220', border: `0.5px solid ${vitals.heartRate ? C.red : C.border}`, borderRadius: 14, color: C.text, cursor: canWriteVitals ? 'pointer' : 'default', opacity: canWriteVitals ? 1 : 0.55 }}>
                <Camera size={22} style={{ color: C.red }} strokeWidth={1.8} />
                <span style={{ fontSize: 11, fontWeight: 600 }}>Heart Rate</span>
                <span style={{ fontSize: 10, color: vitals.heartRate ? C.red : C.muted }}>{vitals.heartRate ? `${vitals.heartRate} bpm` : '30s camera'}</span>
              </button>
              <button onClick={() => canWriteVitals && setShowBR(true)} disabled={!canWriteVitals} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, padding: '14px 8px', background: vitals.respiratory ? 'rgba(55,138,221,0.1)' : '#0A1220', border: `0.5px solid ${vitals.respiratory ? C.blue : C.border}`, borderRadius: 14, color: C.text, cursor: canWriteVitals ? 'pointer' : 'default', opacity: canWriteVitals ? 1 : 0.55 }}>
                <Mic size={22} style={{ color: C.blue }} strokeWidth={1.8} />
                <span style={{ fontSize: 11, fontWeight: 600 }}>Breath Rate</span>
                <span style={{ fontSize: 10, color: vitals.respiratory ? C.blue : C.muted }}>{vitals.respiratory ? `${vitals.respiratory} br/min` : '30s mic'}</span>
              </button>
              <button onClick={enableStepTracking} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, padding: '14px 8px', background: stepStatus === 'listening' ? 'rgba(45,212,164,0.1)' : '#0A1220', border: `0.5px solid ${stepStatus === 'listening' ? C.teal : C.border}`, borderRadius: 14, color: C.text, cursor: 'pointer' }}>
                <Footprints size={22} style={{ color: C.teal }} strokeWidth={1.8} />
                <span style={{ fontSize: 11, fontWeight: 600 }}>Steps</span>
                <span style={{ fontSize: 10, color: stepStatus === 'denied' || stepStatus === 'unsupported' ? C.red : C.teal }}>
                  {stepStatus === 'listening' ? `${steps.toLocaleString()} today` : stepStatus === 'requesting' ? 'requesting...' : 'tap to enable'}
                </span>
              </button>
            </div>
            <Tip msg="Heart rate uses rear camera rPPG. Breath rate uses microphone. Steps use motion sensors and may require a tap to enable on iPhone." />
          </div>

          {/* Bio cards */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>

            <div style={{ background: C.card, border: `1px solid ${vitals.heartRate ? C.red + '40' : C.border}`, borderRadius: 18, padding: '16px 14px', cursor: canWriteVitals ? 'pointer' : 'default' }} onClick={() => canWriteVitals && setShowHR(true)}>
              <div style={{ color: C.red, marginBottom: 8 }}><Heart size={18} strokeWidth={2} /></div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginBottom: 3 }}>
                <span style={{ fontSize: 26, fontWeight: 700, color: vitals.heartRate ? C.text : C.muted, fontFamily: "'Geist Mono',monospace" }}>{vitals.heartRate ?? '--'}</span>
                <span style={{ fontSize: 10, color: C.muted }}>bpm</span>
              </div>
              <div style={{ fontSize: 11, fontWeight: 600, color: C.muted }}>Heart Rate</div>
              <div style={{ fontSize: 10, color: vitals.heartRate ? C.teal : C.muted, marginTop: 4 }}>{vitals.heartRate ? (canWriteVitals ? 'Camera (rPPG) · Tap to remeasure' : 'Camera (rPPG)') : (canWriteVitals ? 'Tap to measure' : 'No reading')}</div>
            </div>

            <div style={{ background: C.card, border: `1px solid ${vitals.respiratory ? C.blue + '40' : C.border}`, borderRadius: 18, padding: '16px 14px', cursor: canWriteVitals ? 'pointer' : 'default' }} onClick={() => canWriteVitals && setShowBR(true)}>
              <div style={{ color: C.blue, marginBottom: 8 }}><Wind size={18} strokeWidth={2} /></div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginBottom: 3 }}>
                <span style={{ fontSize: 26, fontWeight: 700, color: vitals.respiratory ? C.text : C.muted, fontFamily: "'Geist Mono',monospace" }}>{vitals.respiratory ?? '--'}</span>
                <span style={{ fontSize: 10, color: C.muted }}>br/min</span>
              </div>
              <div style={{ fontSize: 11, fontWeight: 600, color: C.muted }}>Breath Rate</div>
              <div style={{ fontSize: 10, color: vitals.respiratory ? C.teal : C.muted, marginTop: 4 }}>{vitals.respiratory ? (canWriteVitals ? 'Microphone · Tap to remeasure' : 'Microphone') : (canWriteVitals ? 'Tap to measure' : 'No reading')}</div>
            </div>

            {/* Hydration */}
            <div style={{ gridColumn: 'span 2', background: C.card, border: `1px solid ${C.border}`, borderRadius: 18, padding: '16px 14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <div>
                  <div style={{ color: C.blue, marginBottom: 6 }}><Droplet size={18} strokeWidth={2} /></div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                    <span style={{ fontSize: 26, fontWeight: 700, color: C.text, fontFamily: "'Geist Mono',monospace" }}>{(hydrationMl / 1000).toFixed(2)}</span>
                    <span style={{ fontSize: 10, color: C.muted }}>L</span>
                  </div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: C.muted, marginTop: 2 }}>Hydration</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 20, fontWeight: 700, color: C.blue, fontFamily: "'Geist Mono',monospace" }}>{hydPct}%</div>
                  <div style={{ fontSize: 10, color: C.muted }}>of {(wt / 1000).toFixed(1)}L target</div>
                  <div style={{ fontSize: 10, color: C.muted, marginTop: 2 }}>{Math.max(0, wt - hydrationMl)}ml left</div>
                </div>
              </div>
              <div style={{ width: '100%', height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.06)', overflow: 'hidden', marginBottom: 12 }}>
                <motion.div initial={{ width: 0 }} animate={{ width: `${hydPct}%` }} transition={{ duration: 0.8 }} style={{ height: '100%', borderRadius: 2, background: hydPct >= 80 ? C.teal : hydPct >= 50 ? C.blue : C.amber }} />
              </div>
              {canWriteVitals && <div style={{ display: 'flex', gap: 8 }}>
                {[150, 250, 500].map(ml => (
                  <button key={ml} onClick={() => logWater(ml)} style={{ flex: 1, padding: '7px 4px', background: 'rgba(55,138,221,0.14)', border: '0.5px solid rgba(55,138,221,0.25)', borderRadius: 8, color: C.blue, fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>+{ml}ml</button>
                ))}
              </div>}
            </div>

            {/* Sleep */}
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 18, padding: '16px 14px' }}>
              <div style={{ color: C.amber, marginBottom: 8 }}><Moon size={18} strokeWidth={2} /></div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginBottom: 3 }}>
                <span style={{ fontSize: 26, fontWeight: 700, color: sleepHours ? C.text : C.muted, fontFamily: "'Geist Mono',monospace" }}>{sleepHours ?? '--'}</span>
                <span style={{ fontSize: 10, color: C.muted }}>hrs</span>
              </div>
              <div style={{ fontSize: 11, fontWeight: 600, color: C.muted, marginBottom: 8 }}>Sleep</div>
              {canWriteVitals && <div style={{ display: 'flex', gap: 6 }}>
                <button onClick={sleepNow} disabled={!!sleepStart} style={{ flex: 1, padding: '6px 4px', background: 'rgba(239,159,39,0.12)', border: '0.5px solid rgba(239,159,39,0.2)', borderRadius: 8, color: sleepStart ? C.teal : C.amber, fontSize: 10, fontWeight: 600, cursor: 'pointer' }}>
                  {sleepStart ? '😴 Active' : '😴 Sleep'}
                </button>
                <button onClick={wakeNow} disabled={!sleepStart} style={{ flex: 1, padding: '6px 4px', background: 'rgba(239,159,39,0.12)', border: '0.5px solid rgba(239,159,39,0.2)', borderRadius: 8, color: !sleepStart ? C.muted : C.amber, fontSize: 10, fontWeight: 600, cursor: 'pointer' }}>☀️ Wake</button>
              </div>}
            </div>

            {/* Steps */}
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 18, padding: '16px 14px' }}>
              <div style={{ color: C.teal, marginBottom: 8 }}><Footprints size={18} strokeWidth={2} /></div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginBottom: 3 }}>
                <span style={{ fontSize: 26, fontWeight: 700, color: C.text, fontFamily: "'Geist Mono',monospace" }}>{steps.toLocaleString()}</span>
                <span style={{ fontSize: 10, color: C.muted }}>steps</span>
              </div>
              <div style={{ fontSize: 11, fontWeight: 600, color: C.muted, marginBottom: 8 }}>Steps Today</div>
              <div style={{ width: '100%', height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
                <div style={{ height: '100%', borderRadius: 2, background: C.teal, width: `${Math.min(100, (steps / sg) * 100)}%`, transition: 'width 0.3s' }} />
              </div>
              <div style={{ fontSize: 10, color: C.muted, marginTop: 6 }}>{sg - steps > 0 ? `${(sg - steps).toLocaleString()} steps to goal` : '🎉 Goal reached!'}</div>
              {stepStatus !== 'listening' && (
                <button onClick={enableStepTracking} style={{ width: '100%', marginTop: 8, padding: '7px 8px', background: 'rgba(45,212,164,0.12)', border: '0.5px solid rgba(45,212,164,0.24)', borderRadius: 8, color: C.teal, fontSize: 10, fontWeight: 700, cursor: 'pointer' }}>
                  {stepStatus === 'unsupported' ? 'Motion unavailable' : stepStatus === 'denied' ? 'Motion denied' : 'Enable motion'}
                </button>
              )}
            </div>

            {/* Temperature */}
            <div style={{ gridColumn: 'span 2', background: C.card, border: `1px solid ${vitals.skinTemp ? C.red + '40' : C.border}`, borderRadius: 18, padding: '16px 14px' }}>
              <div style={{ color: C.red, marginBottom: 8 }}><Thermometer size={18} strokeWidth={2} /></div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginBottom: 3 }}>
                <span style={{ fontSize: 26, fontWeight: 700, color: vitals.skinTemp ? C.text : C.muted, fontFamily: "'Geist Mono',monospace" }}>{vitals.skinTemp ?? '--'}</span>
                <span style={{ fontSize: 10, color: C.muted }}>°C</span>
                {vitals.skinTemp && vitals.skinTemp > 37.5 && <span style={{ fontSize: 10, color: C.amber, marginLeft: 4, fontWeight: 700 }}>⚠ Elevated</span>}
              </div>
              <div style={{ fontSize: 11, fontWeight: 600, color: C.muted, marginBottom: 12 }}>Body Temperature</div>
              {canWriteVitals && <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input type="number" value={tempInput} onChange={e => setTempInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && saveTemp()}
                  placeholder={`Enter in °${tempUnit}...`} step="0.1"
                  style={{ flex: 1, padding: '8px 12px', background: '#0A1220', border: '0.5px solid rgba(255,255,255,0.1)', borderRadius: 10, color: C.text, fontSize: 13, outline: 'none' }} />
                <button onClick={() => setTempUnit(u => u === 'C' ? 'F' : 'C')} style={{ padding: '8px 10px', background: 'rgba(255,255,255,0.07)', border: 'none', borderRadius: 10, color: C.muted, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>°{tempUnit}</button>
                <button onClick={saveTemp} style={{ padding: '8px 14px', background: C.teal, color: '#04342C', borderRadius: 10, border: 'none', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>Save</button>
              </div>}
            </div>
          </div>

          {/* Clinical NEWS2 inputs */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', color: C.muted, marginBottom: 10 }}>Clinical NEWS2 Inputs</div>
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 18, padding: '16px 14px', display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 8 }}>
                  <label style={{ fontSize: 12, fontWeight: 700, color: C.text }}>Systolic BP <span style={{ color: C.muted, fontWeight: 500 }}>(mmHg)</span></label>
                  <span style={{ fontSize: 12, color: vitals.systolicBp ? C.teal : C.muted, fontFamily: "'Geist Mono',monospace" }}>{vitals.systolicBp ?? '--'} mmHg</span>
                </div>
                {canWriteVitals && (
                  <>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <input
                        type="number"
                        value={bpInput}
                        onChange={e => setBpInput(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && saveSystolicBp()}
                        placeholder="40-260"
                        min={40}
                        max={260}
                        style={{ flex: 1, padding: '9px 12px', background: '#0A1220', border: `0.5px solid ${bpInvalid ? C.red : 'rgba(255,255,255,0.1)'}`, borderRadius: 10, color: C.text, fontSize: 13, outline: 'none' }}
                      />
                      <button onClick={saveSystolicBp} disabled={bpInvalid || bpValue === null} style={{ padding: '9px 14px', background: bpInvalid || bpValue === null ? 'rgba(255,255,255,0.08)' : C.teal, color: bpInvalid || bpValue === null ? C.muted : '#04342C', borderRadius: 10, border: 'none', fontSize: 12, fontWeight: 700, cursor: bpInvalid || bpValue === null ? 'default' : 'pointer' }}>Save</button>
                    </div>
                    {bpInvalid && <div style={{ fontSize: 10, color: C.red, marginTop: 6 }}>Valid systolic BP range is 40-260 mmHg.</div>}
                  </>
                )}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: C.text }}>Supplemental Oxygen</div>
                  <div style={{ fontSize: 10, color: C.muted, marginTop: 2 }}>Oxygen therapy adds 2 NEWS2 points.</div>
                </div>
                <button onClick={() => canWriteVitals && setVital('supplementalOxygen', !vitals.supplementalOxygen, 'Clinical input')} disabled={!canWriteVitals} style={{ width: 54, height: 28, borderRadius: 14, border: 'none', background: vitals.supplementalOxygen ? C.teal : 'rgba(255,255,255,0.12)', position: 'relative', cursor: canWriteVitals ? 'pointer' : 'default', flexShrink: 0 }}>
                  <span style={{ position: 'absolute', top: 4, left: vitals.supplementalOxygen ? 30 : 4, width: 20, height: 20, borderRadius: '50%', background: vitals.supplementalOxygen ? '#04342C' : C.muted, transition: 'left 0.2s' }} />
                </button>
              </div>

              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: C.text, display: 'block', marginBottom: 8 }}>Neurological Status (ACVPU)</label>
                <select
                  value={vitals.consciousness}
                  onChange={e => setVital('consciousness', e.target.value as any, 'Clinical input')}
                  disabled={!canWriteVitals}
                  style={{ width: '100%', padding: '10px 12px', background: '#0A1220', border: '0.5px solid rgba(255,255,255,0.1)', borderRadius: 10, color: C.text, fontSize: 13, outline: 'none', opacity: canWriteVitals ? 1 : 0.65 }}
                >
                  <option value="alert">A - Alert (0 points)</option>
                  <option value="new_confusion">C - New-onset Confusion (3 points)</option>
                  <option value="voice">V - Responds to Voice (3 points)</option>
                  <option value="pain">P - Responds to Pain (3 points)</option>
                  <option value="unresponsive">U - Unresponsive (3 points)</option>
                </select>
              </div>

              {app.analysis?.clinicalScores?.news2 && (
                <div style={{ padding: '12px 14px', borderRadius: 12, background: 'rgba(45,212,164,0.08)', border: '0.5px solid rgba(45,212,164,0.18)' }}>
                  <div style={{ fontSize: 11, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 4 }}>Latest NEWS2</div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                    <span style={{ fontSize: 28, color: C.text, fontWeight: 800, fontFamily: "'Geist Mono',monospace" }}>{app.analysis.clinicalScores.news2.total}</span>
                    <span style={{ fontSize: 12, color: C.teal, fontWeight: 700 }}>{app.analysis.clinicalScores.news2.urgency?.level}</span>
                  </div>
                  {!!app.analysis.clinicalScores.news2.missing?.length && (
                    <div style={{ fontSize: 10, color: C.amber, marginTop: 4 }}>Missing: {app.analysis.clinicalScores.news2.missing.join(', ')}</div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* 7-Day Trend */}
          <div style={{ marginBottom: 8 }}>
            <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', color: C.muted, marginBottom: 10 }}>7-Day Trend</div>
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 18, padding: '16px 8px 8px' }}>
              {trendData.some(d => d.hr !== null || d.br !== null) ? (
                <ResponsiveContainer width="100%" height={160}>
                  <LineChart data={trendData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                    <XAxis dataKey="day" tick={{ fill: C.muted, fontSize: 10 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: C.muted, fontSize: 10 }} axisLine={false} tickLine={false} />
                    <Tooltip content={<ChartTip />} />
                    <Line type="monotone" dataKey="hr" name="HR" stroke={C.red} strokeWidth={2} dot={false} connectNulls />
                    <Line type="monotone" dataKey="br" name="BR" stroke={C.blue} strokeWidth={2} dot={false} connectNulls />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div style={{ height: 160, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, color: C.muted, flexDirection: 'column', gap: 8 }}>
                  <Heart size={24} style={{ opacity: 0.3 }} />
                  Measure your vitals to see your 7-day trend.
                </div>
              )}
            </div>
          </div>

        </div>
      </motion.div>
    </>
  );
}
