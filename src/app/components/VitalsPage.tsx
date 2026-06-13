import { motion } from 'motion/react';
import { Heart, Wind, Droplet, Moon, Footprints, Thermometer, Camera, Mic, AlertTriangle } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { useState, useMemo } from 'react';
import type { VedaApp } from '../useVedaApp';

const C = { teal: '#2DD4A4', blue: '#378ADD', amber: '#EF9F27', red: '#E24B4A', text: '#E2F4F0', muted: '#5A7A72', card: 'rgba(13,21,37,0.88)', border: 'rgba(255,255,255,0.08)' };

const Tip = ({ msg }: { msg: string }) => (
  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 5, marginTop: 8, fontSize: 10, color: C.muted, lineHeight: 1.4 }}>
    <AlertTriangle size={11} style={{ color: C.amber, flexShrink: 0, marginTop: 1 }} />
    <span>{msg}</span>
  </div>
);

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: '#111827', border: '0.5px solid rgba(255,255,255,0.1)', borderRadius: 10, padding: '8px 12px', fontSize: 11, color: C.text }}>
      <div style={{ color: C.muted, marginBottom: 4 }}>{label}</div>
      {payload.map((p: any) => <div key={p.dataKey} style={{ color: p.color }}>{p.name}: <strong>{p.value}</strong></div>)}
    </div>
  );
};

export function VitalsPage({ app }: { app: VedaApp }) {
  const { vitals, hydrationMl, logWater, setVital, saveBiometric, history, sleepHours, setSleepHours, steps, profile } = app;
  const [tempInput, setTempInput] = useState('');
  const [tempUnit, setTempUnit] = useState<'C' | 'F'>('C');
  const [sleepStart, setSleepStart] = useState<string | null>(null);

  const hydPct = Math.min(100, Math.round((hydrationMl / (profile.waterTarget || 2500)) * 100));

  // Build 7-day trend from real Neon history
  const trendData = useMemo(() => {
    const days: Record<string, { hr: number | null; br: number | null; day: string }> = {};
    for (let i = 6; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i);
      const key = d.toDateString();
      days[key] = { hr: null, br: null, day: d.toLocaleDateString('en-US', { weekday: 'short' }) };
    }
    history.forEach(e => {
      const key = new Date(e.timestamp).toDateString();
      if (!days[key]) return;
      if (e.type === 'heart_rate') days[key].hr = e.value;
      if (e.type === 'breath_rate') days[key].br = e.value;
    });
    return Object.values(days);
  }, [history]);

  function saveTemp() {
    let val = parseFloat(tempInput);
    if (isNaN(val)) return;
    if (tempUnit === 'F') val = (val - 32) * 5 / 9;
    const c = parseFloat(val.toFixed(1));
    setVital('skinTemp', c, 'manual');
    saveBiometric('temperature', c, 'celsius');
    setTempInput('');
  }

  function sleepNow() { setSleepStart(new Date().toISOString()); }
  function wakeNow() {
    if (!sleepStart) return;
    const hrs = parseFloat(((Date.now() - new Date(sleepStart).getTime()) / 3600000).toFixed(1));
    if (hrs >= 0.5) { setSleepHours(hrs); saveBiometric('sleep', hrs, 'hours'); }
    setSleepStart(null);
  }

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.24 }}
      style={{ overflowY: 'auto', height: '100%', scrollbarWidth: 'none' }}>
      <div style={{ padding: '0 20px 100px' }}>

        <div style={{ paddingTop: 22, paddingBottom: 4 }}>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: C.text, lineHeight: 1 }}>Vitals</h2>
          <p style={{ fontSize: 12, color: C.muted, marginTop: 4 }}>Biometric tracking</p>
        </div>

        {/* Measure Hub */}
        <div style={{ margin: '16px 0', background: C.card, border: `1px solid ${C.border}`, borderRadius: 18, padding: '14px 16px' }}>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: C.muted, marginBottom: 12 }}>Measure Now</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8 }}>
            {[
              { icon: Camera, label: 'Heart Rate', sub: '30s camera', color: C.red, action: () => alert('Open camera and place fingertip over lens — heart rate measurement via camera requires native device integration.') },
              { icon: Mic, label: 'Breath Rate', sub: '30s mic', color: C.blue, action: () => alert('Place phone near face and breathe normally — breath rate via microphone requires native device integration.') },
              { icon: Footprints, label: 'Steps', sub: `${steps} today`, color: C.teal, action: () => {} },
            ].map(({ icon: Icon, label, sub, color, action }) => (
              <button key={label} onClick={action} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, padding: '14px 8px', background: '#0A1220', border: `0.5px solid ${C.border}`, borderRadius: 14, color: C.text, cursor: 'pointer' }}>
                <Icon size={22} style={{ color }} strokeWidth={1.8} />
                <span style={{ fontSize: 11, fontWeight: 600, textAlign: 'center' }}>{label}</span>
                <span style={{ fontSize: 10, color: C.muted }}>{sub}</span>
              </button>
            ))}
          </div>
          <Tip msg="Camera/mic measurements require device sensor access. Results are estimates only — not medical devices." />
        </div>

        {/* Bio cards */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>

          {/* Heart Rate */}
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 18, padding: '16px 14px' }}>
            <div style={{ color: C.red, marginBottom: 8 }}><Heart size={18} strokeWidth={2} /></div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginBottom: 3 }}>
              <span style={{ fontSize: 26, fontWeight: 700, color: C.text, fontFamily: "'Geist Mono',monospace" }}>{vitals.heartRate ?? '--'}</span>
              <span style={{ fontSize: 10, color: C.muted }}>bpm</span>
            </div>
            <div style={{ fontSize: 11, fontWeight: 600, color: C.muted }}>Heart Rate</div>
            <Tip msg="Camera estimate ±5 BPM. Not medical." />
          </div>

          {/* Breath Rate */}
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 18, padding: '16px 14px' }}>
            <div style={{ color: C.blue, marginBottom: 8 }}><Wind size={18} strokeWidth={2} /></div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginBottom: 3 }}>
              <span style={{ fontSize: 26, fontWeight: 700, color: C.text, fontFamily: "'Geist Mono',monospace" }}>{vitals.respiratory ?? '--'}</span>
              <span style={{ fontSize: 10, color: C.muted }}>br/min</span>
            </div>
            <div style={{ fontSize: 11, fontWeight: 600, color: C.muted }}>Breath Rate</div>
            <Tip msg="Microphone breathing pattern estimate." />
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
                <div style={{ fontSize: 10, color: C.muted }}>of {(profile.waterTarget / 1000).toFixed(1)}L target</div>
                <div style={{ fontSize: 10, color: C.muted, marginTop: 2 }}>{Math.max(0, profile.waterTarget - hydrationMl)}ml left</div>
              </div>
            </div>
            <div style={{ width: '100%', height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.06)', overflow: 'hidden', marginBottom: 12 }}>
              <motion.div initial={{ width: 0 }} animate={{ width: `${hydPct}%` }} transition={{ duration: 0.8 }} style={{ height: '100%', borderRadius: 2, background: C.blue }} />
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              {[250, 500].map(ml => (
                <button key={ml} onClick={() => logWater(ml)} style={{ padding: '6px 14px', background: 'rgba(55,138,221,0.14)', border: '0.5px solid rgba(55,138,221,0.25)', borderRadius: 8, color: C.blue, fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
                  +{ml}ml
                </button>
              ))}
            </div>
          </div>

          {/* Sleep */}
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 18, padding: '16px 14px' }}>
            <div style={{ color: C.amber, marginBottom: 8 }}><Moon size={18} strokeWidth={2} /></div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginBottom: 3 }}>
              <span style={{ fontSize: 26, fontWeight: 700, color: C.text, fontFamily: "'Geist Mono',monospace" }}>{sleepHours ?? '--'}</span>
              <span style={{ fontSize: 10, color: C.muted }}>hrs</span>
            </div>
            <div style={{ fontSize: 11, fontWeight: 600, color: C.muted, marginBottom: 8 }}>Sleep</div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button onClick={sleepNow} disabled={!!sleepStart} style={{ flex: 1, padding: '6px 8px', background: 'rgba(239,159,39,0.12)', border: '0.5px solid rgba(239,159,39,0.2)', borderRadius: 8, color: sleepStart ? C.muted : C.amber, fontSize: 10, fontWeight: 600, cursor: 'pointer' }}>
                {sleepStart ? 'Sleeping...' : '😴 Sleep'}
              </button>
              <button onClick={wakeNow} disabled={!sleepStart} style={{ flex: 1, padding: '6px 8px', background: 'rgba(239,159,39,0.12)', border: '0.5px solid rgba(239,159,39,0.2)', borderRadius: 8, color: !sleepStart ? C.muted : C.amber, fontSize: 10, fontWeight: 600, cursor: 'pointer' }}>
                ☀️ Wake
              </button>
            </div>
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
              <div style={{ height: '100%', borderRadius: 2, background: C.teal, width: `${Math.min(100, (steps / profile.stepGoal) * 100)}%`, transition: 'width 0.5s ease' }} />
            </div>
            <Tip msg="Device motion sensor estimate." />
          </div>

          {/* Temperature */}
          <div style={{ gridColumn: 'span 2', background: C.card, border: `1px solid ${C.border}`, borderRadius: 18, padding: '16px 14px' }}>
            <div style={{ color: C.red, marginBottom: 8 }}><Thermometer size={18} strokeWidth={2} /></div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginBottom: 3 }}>
              <span style={{ fontSize: 26, fontWeight: 700, color: C.text, fontFamily: "'Geist Mono',monospace" }}>{vitals.skinTemp ?? '--'}</span>
              <span style={{ fontSize: 10, color: C.muted }}>°C</span>
            </div>
            <div style={{ fontSize: 11, fontWeight: 600, color: C.muted, marginBottom: 12 }}>Body Temperature</div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input type="number" value={tempInput} onChange={e => setTempInput(e.target.value)} placeholder={`Enter temp in °${tempUnit}...`} step="0.1"
                style={{ flex: 1, padding: '8px 12px', background: '#0A1220', border: '0.5px solid rgba(255,255,255,0.1)', borderRadius: 10, color: C.text, fontSize: 13, outline: 'none' }} />
              <button onClick={() => setTempUnit(u => u === 'C' ? 'F' : 'C')}
                style={{ padding: '8px 10px', background: 'rgba(255,255,255,0.07)', border: 'none', borderRadius: 10, color: C.muted, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>°{tempUnit}</button>
              <button onClick={saveTemp}
                style={{ padding: '8px 14px', background: C.teal, color: '#04342C', borderRadius: 10, border: 'none', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>Save</button>
            </div>
          </div>
        </div>

        {/* 7-Day Trend from real Neon data */}
        <div style={{ marginBottom: 8 }}>
          <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', color: C.muted, marginBottom: 10 }}>7-Day Trend</div>
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 18, padding: '16px 8px 8px' }}>
            {trendData.some(d => d.hr !== null || d.br !== null) ? (
              <ResponsiveContainer width="100%" height={160}>
                <LineChart data={trendData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                  <XAxis dataKey="day" tick={{ fill: C.muted, fontSize: 10 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: C.muted, fontSize: 10 }} axisLine={false} tickLine={false} />
                  <Tooltip content={<CustomTooltip />} />
                  <Line type="monotone" dataKey="hr" name="HR" stroke={C.teal} strokeWidth={2} dot={false} connectNulls />
                  <Line type="monotone" dataKey="br" name="BR" stroke={C.blue} strokeWidth={2} dot={false} connectNulls />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div style={{ height: 160, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, color: C.muted }}>
                No trend data yet — start measuring your vitals.
              </div>
            )}
          </div>
        </div>

      </div>
    </motion.div>
  );
}
