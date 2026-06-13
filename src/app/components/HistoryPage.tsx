import { motion } from 'motion/react';
import { Heart, Wind, Droplet, Moon, Footprints, Thermometer } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';

const C = {
  teal: '#2DD4A4',
  blue: '#378ADD',
  amber: '#EF9F27',
  red: '#E24B4A',
  text: '#E2F4F0',
  muted: '#5A7A72',
  card: 'rgba(13,21,37,0.88)',
  border: 'rgba(255,255,255,0.08)',
};

const historyEntries = [
  { id: 1, type: 'heart_rate', icon: Heart, color: C.red, value: 72, unit: 'bpm', label: 'Heart Rate', time: '2 min ago', risk: 'stable', riskLabel: 'Normal' },
  { id: 2, type: 'breath_rate', icon: Wind, color: C.blue, value: 16, unit: 'br/min', label: 'Breath Rate', time: '2 min ago', risk: 'stable', riskLabel: 'Normal' },
  { id: 3, type: 'hydration', icon: Droplet, color: C.blue, value: 1.8, unit: 'L', label: 'Hydration logged', time: '1 hour ago', risk: 'stable', riskLabel: 'On track' },
  { id: 4, type: 'sleep', icon: Moon, color: C.amber, value: 7.4, unit: 'hrs', label: 'Sleep session', time: '8 hours ago', risk: 'stable', riskLabel: 'Good' },
  { id: 5, type: 'heart_rate', icon: Heart, color: C.red, value: 88, unit: 'bpm', label: 'Heart Rate', time: 'Yesterday 5pm', risk: 'watch', riskLabel: 'Elevated' },
  { id: 6, type: 'steps', icon: Footprints, color: C.teal, value: 8432, unit: 'steps', label: 'Daily steps', time: 'Yesterday', risk: 'stable', riskLabel: 'Active' },
  { id: 7, type: 'temperature', icon: Thermometer, color: C.red, value: 37.1, unit: '°C', label: 'Temperature', time: '2 days ago', risk: 'stable', riskLabel: 'Normal' },
  { id: 8, type: 'heart_rate', icon: Heart, color: C.red, value: 64, unit: 'bpm', label: 'Heart Rate', time: '3 days ago', risk: 'stable', riskLabel: 'Resting' },
];

const weeklyData = [
  { day: 'Mon', score: 78 },
  { day: 'Tue', score: 84 },
  { day: 'Wed', score: 71 },
  { day: 'Thu', score: 86 },
  { day: 'Fri', score: 80 },
  { day: 'Sat', score: 88 },
  { day: 'Sun', score: 82 },
];

const riskColors = { stable: C.teal, watch: C.amber, care: C.red, urgent: C.red };

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: '#111827', border: '0.5px solid rgba(255,255,255,0.1)', borderRadius: 10, padding: '8px 12px', fontSize: 11, color: C.text }}>
      <div style={{ color: C.muted }}>{label}</div>
      <div style={{ color: C.teal, fontWeight: 700 }}>Score: {payload[0].value}</div>
    </div>
  );
};

export function HistoryPage() {
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
          <h2 style={{ fontSize: 20, fontWeight: 700, color: C.text, lineHeight: 1 }}>History</h2>
          <p style={{ fontSize: 12, color: C.muted, marginTop: 4 }}>Biometric events</p>
        </div>

        {/* Weekly wellness score chart */}
        <div style={{ margin: '16px 0', background: C.card, border: `1px solid ${C.border}`, borderRadius: 18, padding: '16px 8px 8px' }}>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: C.muted, marginBottom: 12, paddingLeft: 8 }}>
            Weekly Wellness Score
          </div>
          <ResponsiveContainer width="100%" height={130}>
            <BarChart data={weeklyData} margin={{ top: 0, right: 8, left: -20, bottom: 0 }}>
              <XAxis dataKey="day" tick={{ fill: C.muted, fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis domain={[50, 100]} tick={{ fill: C.muted, fontSize: 10 }} axisLine={false} tickLine={false} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="score" radius={[4, 4, 0, 0]}>
                {weeklyData.map((entry, index) => (
                  <Cell key={index} fill={entry.day === 'Sun' ? C.teal : `${C.teal}60`} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Summary stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 16 }}>
          {[
            { label: 'Avg HR', value: '71', unit: 'bpm', color: C.red },
            { label: 'Sleep avg', value: '7.2', unit: 'hrs', color: C.amber },
            { label: 'Hydration', value: '85', unit: '%', color: C.blue },
          ].map(({ label, value, unit, color }) => (
            <div key={label} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: '14px 12px', textAlign: 'center' }}>
              <div style={{ fontSize: 20, fontWeight: 700, color, fontFamily: "'Geist Mono', monospace" }}>{value}</div>
              <div style={{ fontSize: 10, color: C.muted, marginTop: 1 }}>{unit}</div>
              <div style={{ fontSize: 10, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: 3 }}>{label}</div>
            </div>
          ))}
        </div>

        {/* Event list */}
        <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', color: C.muted, marginBottom: 10 }}>
          Recent Events
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {historyEntries.map((entry, i) => {
            const Icon = entry.icon;
            const risk = (riskColors as any)[entry.risk] || C.teal;
            return (
              <motion.div
                key={entry.id}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.04 }}
                style={{
                  background: C.card,
                  border: `1px solid ${C.border}`,
                  borderRadius: 14,
                  padding: '12px 14px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                }}
              >
                <div style={{
                  width: 36,
                  height: 36,
                  borderRadius: 12,
                  background: `${entry.color}14`,
                  display: 'grid',
                  placeItems: 'center',
                  color: entry.color,
                  flexShrink: 0,
                }}>
                  <Icon size={16} strokeWidth={2} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: C.text }}>{entry.label}</div>
                  <div style={{ fontSize: 11, color: C.muted, marginTop: 1 }}>{entry.time}</div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ fontSize: 16, fontWeight: 700, color: C.text, fontFamily: "'Geist Mono', monospace" }}>
                    {entry.value}
                    <span style={{ fontSize: 10, color: C.muted, fontFamily: 'inherit' }}> {entry.unit}</span>
                  </div>
                  <div style={{
                    display: 'inline-block',
                    marginTop: 3,
                    padding: '2px 8px',
                    borderRadius: 6,
                    background: `${risk}18`,
                    color: risk,
                    fontSize: 9,
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                  }}>
                    {entry.riskLabel}
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>

      </div>
    </motion.div>
  );
}
