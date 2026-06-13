import { motion } from 'motion/react';
import { Heart, Wind, Droplet, Moon, Footprints, Thermometer, Camera, Mic, Plus, AlertTriangle } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { useState } from 'react';

const C = {
  teal: '#2DD4A4',
  blue: '#378ADD',
  amber: '#EF9F27',
  red: '#E24B4A',
  text: '#E2F4F0',
  muted: '#5A7A72',
  card: 'rgba(13,21,37,0.88)',
  border: 'rgba(255,255,255,0.08)',
  bg: '#0D1525',
};

interface VitalsData {
  heartRate: number;
  respiratory: number;
  oxygen: number;
  stamina: number;
  hydration: number;
  skinTemp: number;
}

const trendData = [
  { day: 'Mon', hr: 68, br: 15, hyd: 1.6 },
  { day: 'Tue', hr: 74, br: 17, hyd: 2.1 },
  { day: 'Wed', hr: 71, br: 14, hyd: 1.9 },
  { day: 'Thu', hr: 76, br: 18, hyd: 1.5 },
  { day: 'Fri', hr: 69, br: 15, hyd: 2.3 },
  { day: 'Sat', hr: 72, br: 16, hyd: 1.8 },
  { day: 'Sun', hr: 72, br: 16, hyd: 1.8 },
];

function BioCard({
  icon: Icon, color, value, unit, label, children, disclaimer
}: {
  icon: typeof Heart; color: string; value: string | number; unit: string;
  label: string; children?: React.ReactNode; disclaimer?: string;
}) {
  return (
    <div style={{
      background: C.card,
      border: `1px solid ${C.border}`,
      borderRadius: 18,
      padding: '16px 14px',
      backdropFilter: 'blur(12px)',
    }}>
      <div style={{ color, marginBottom: 8 }}><Icon size={18} strokeWidth={2} /></div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginBottom: 3 }}>
        <span style={{ fontSize: 26, fontWeight: 700, color: C.text, fontFamily: "'Geist Mono', monospace", lineHeight: 1 }}>{value}</span>
        <span style={{ fontSize: 10, color: C.muted }}>{unit}</span>
      </div>
      <div style={{ fontSize: 11, fontWeight: 600, color: C.muted, marginBottom: children ? 10 : 0 }}>{label}</div>
      {children}
      {disclaimer && (
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 5, marginTop: 8, fontSize: 10, color: C.muted, lineHeight: 1.4 }}>
          <AlertTriangle size={11} style={{ color: C.amber, flexShrink: 0, marginTop: 1 }} />
          <span>{disclaimer}</span>
        </div>
      )}
    </div>
  );
}

function ProgressBar({ pct, color }: { pct: number; color: string }) {
  return (
    <div style={{ width: '100%', height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.06)', overflow: 'hidden', marginTop: 6 }}>
      <motion.div
        initial={{ width: 0 }}
        animate={{ width: `${Math.min(100, pct)}%` }}
        transition={{ duration: 0.8, ease: 'easeOut' }}
        style={{ height: '100%', borderRadius: 2, background: color }}
      />
    </div>
  );
}

function MiniBtn({ label, onClick }: { label: string; onClick?: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '6px 12px',
        background: 'rgba(55,138,221,0.14)',
        border: '0.5px solid rgba(55,138,221,0.25)',
        borderRadius: 8,
        color: C.blue,
        fontSize: 11,
        fontWeight: 600,
        cursor: 'pointer',
      }}
    >
      {label}
    </button>
  );
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: '#111827', border: '0.5px solid rgba(255,255,255,0.1)', borderRadius: 10, padding: '8px 12px', fontSize: 11, color: C.text }}>
      <div style={{ color: C.muted, marginBottom: 4 }}>{label}</div>
      {payload.map((p: any) => (
        <div key={p.dataKey} style={{ color: p.color }}>
          {p.name}: <strong>{p.value}</strong>
        </div>
      ))}
    </div>
  );
};

export function VitalsPage({ vitals }: { vitals: VitalsData }) {
  const [hydration, setHydration] = useState(1800);
  const hydrationPct = Math.min(100, Math.round((hydration / 2500) * 100));

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.24 }}
      style={{ overflowY: 'auto', height: '100%', scrollbarWidth: 'none' }}
    >
      <div style={{ padding: '0 20px 100px' }}>

        {/* Header */}
        <div style={{ paddingTop: 22, paddingBottom: 4 }}>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: C.text, lineHeight: 1 }}>Vitals</h2>
          <p style={{ fontSize: 12, color: C.muted, marginTop: 4 }}>Biometric tracking</p>
        </div>

        {/* Measure Hub */}
        <div style={{
          margin: '16px 0',
          background: C.card,
          border: `1px solid ${C.border}`,
          borderRadius: 18,
          padding: '14px 16px',
        }}>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: C.muted, marginBottom: 12 }}>Measure Now</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
            {[
              { icon: Camera, label: 'Heart Rate', sub: '30s camera', color: C.red },
              { icon: Mic, label: 'Breath Rate', sub: '30s mic', color: C.blue },
              { icon: Footprints, label: 'Steps', sub: 'Motion sensor', color: C.teal },
            ].map(({ icon: Icon, label, sub, color }) => (
              <button key={label} style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 5,
                padding: '14px 8px',
                background: '#0A1220',
                border: `0.5px solid ${C.border}`,
                borderRadius: 14,
                color: C.text,
                cursor: 'pointer',
                transition: 'border-color 0.2s',
              }}>
                <Icon size={22} style={{ color }} strokeWidth={1.8} />
                <span style={{ fontSize: 11, fontWeight: 600, textAlign: 'center' }}>{label}</span>
                <span style={{ fontSize: 10, color: C.muted }}>{sub}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Bio cards grid */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>

          <BioCard icon={Heart} color={C.red} value={vitals.heartRate} unit="bpm" label="Heart Rate"
            disclaimer="Camera estimate ±5 BPM. Not medical." />

          <BioCard icon={Wind} color={C.blue} value={vitals.respiratory} unit="br/min" label="Breath Rate"
            disclaimer="Microphone breathing pattern." />

          {/* Hydration — full width feel */}
          <div style={{
            gridColumn: 'span 2',
            background: C.card,
            border: `1px solid ${C.border}`,
            borderRadius: 18,
            padding: '16px 14px',
            backdropFilter: 'blur(12px)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <div>
                <div style={{ color: C.blue, marginBottom: 6 }}><Droplet size={18} strokeWidth={2} /></div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                  <span style={{ fontSize: 26, fontWeight: 700, color: C.text, fontFamily: "'Geist Mono', monospace" }}>{(hydration / 1000).toFixed(1)}</span>
                  <span style={{ fontSize: 10, color: C.muted }}>L</span>
                </div>
                <div style={{ fontSize: 11, fontWeight: 600, color: C.muted, marginTop: 2 }}>Hydration</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 20, fontWeight: 700, color: C.blue, fontFamily: "'Geist Mono', monospace" }}>{hydrationPct}%</div>
                <div style={{ fontSize: 10, color: C.muted }}>of 2.5L target</div>
                <div style={{ fontSize: 10, color: C.muted, marginTop: 2 }}>{Math.max(0, 2500 - hydration)}ml remaining</div>
              </div>
            </div>
            <ProgressBar pct={hydrationPct} color={C.blue} />
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <MiniBtn label="+250ml" onClick={() => setHydration(h => h + 250)} />
              <MiniBtn label="+500ml" onClick={() => setHydration(h => h + 500)} />
            </div>
          </div>

          {/* Sleep */}
          <BioCard icon={Moon} color={C.amber} value="7.4" unit="hrs" label="Sleep">
            <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
              <button style={{ flex: 1, padding: '6px 8px', background: 'rgba(239,159,39,0.12)', border: '0.5px solid rgba(239,159,39,0.2)', borderRadius: 8, color: C.amber, fontSize: 10, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                <Moon size={11} /> Sleep
              </button>
              <button style={{ flex: 1, padding: '6px 8px', background: 'rgba(239,159,39,0.12)', border: '0.5px solid rgba(239,159,39,0.2)', borderRadius: 8, color: C.amber, fontSize: 10, fontWeight: 600, cursor: 'pointer' }}>
                Wake
              </button>
            </div>
          </BioCard>

          {/* Steps */}
          <BioCard icon={Footprints} color={C.teal} value="6,248" unit="steps" label="Steps Today"
            disclaimer="Device motion sensor.">
            <ProgressBar pct={62} color={C.teal} />
          </BioCard>

          {/* Temperature full width */}
          <div style={{
            gridColumn: 'span 2',
            background: C.card,
            border: `1px solid ${C.border}`,
            borderRadius: 18,
            padding: '16px 14px',
          }}>
            <div style={{ color: C.red, marginBottom: 8 }}><Thermometer size={18} strokeWidth={2} /></div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginBottom: 3 }}>
              <span style={{ fontSize: 26, fontWeight: 700, color: C.text, fontFamily: "'Geist Mono', monospace" }}>{vitals.skinTemp}</span>
              <span style={{ fontSize: 10, color: C.muted }}>°C</span>
            </div>
            <div style={{ fontSize: 11, fontWeight: 600, color: C.muted, marginBottom: 12 }}>Body Temperature</div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input
                type="number"
                placeholder="Enter temp..."
                step="0.1"
                style={{
                  flex: 1,
                  padding: '8px 12px',
                  background: '#0A1220',
                  border: '0.5px solid rgba(255,255,255,0.1)',
                  borderRadius: 10,
                  color: C.text,
                  fontSize: 13,
                  outline: 'none',
                }}
              />
              <button style={{ padding: '8px 14px', background: C.teal, color: '#04342C', borderRadius: 10, border: 'none', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                Save
              </button>
            </div>
          </div>
        </div>

        {/* Trend chart */}
        <div style={{ marginBottom: 8 }}>
          <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', color: C.muted, marginBottom: 10 }}>7-Day Trend</div>
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 18, padding: '16px 8px 8px' }}>
            <ResponsiveContainer width="100%" height={160}>
              <LineChart data={trendData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                <XAxis dataKey="day" tick={{ fill: C.muted, fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: C.muted, fontSize: 10 }} axisLine={false} tickLine={false} />
                <Tooltip content={<CustomTooltip />} />
                <Line type="monotone" dataKey="hr" name="HR" stroke={C.teal} strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="br" name="BR" stroke={C.blue} strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

      </div>
    </motion.div>
  );
}
