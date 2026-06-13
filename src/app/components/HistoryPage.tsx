import { motion } from 'motion/react';
import { Heart, Wind, Droplet, Moon, Footprints, Thermometer, Activity } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { useMemo } from 'react';
import type { BiometricEvent } from '../useVedaApp';

const C = { teal: '#2DD4A4', blue: '#378ADD', amber: '#EF9F27', red: '#E24B4A', text: '#E2F4F0', muted: '#5A7A72', card: 'rgba(13,21,37,0.88)', border: 'rgba(255,255,255,0.08)' };

const typeMap: Record<string, { icon: typeof Heart; color: string; label: string; unit: string }> = {
  heart_rate:  { icon: Heart,       color: C.red,   label: 'Heart Rate',  unit: 'bpm'    },
  breath_rate: { icon: Wind,        color: C.blue,  label: 'Breath Rate', unit: 'br/min' },
  hydration:   { icon: Droplet,     color: C.blue,  label: 'Hydration',   unit: 'L'      },
  sleep:       { icon: Moon,        color: C.amber, label: 'Sleep',       unit: 'hrs'    },
  steps:       { icon: Footprints,  color: C.teal,  label: 'Steps',       unit: 'steps'  },
  temperature: { icon: Thermometer, color: C.red,   label: 'Temperature', unit: '°C'     },
};

const Tooltip2 = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: '#111827', border: '0.5px solid rgba(255,255,255,0.1)', borderRadius: 10, padding: '8px 12px', fontSize: 11, color: C.text }}>
      <div style={{ color: C.muted }}>{label}</div>
      <div style={{ color: C.teal, fontWeight: 700 }}>Entries: {payload[0].value}</div>
    </div>
  );
};

export function HistoryPage({ history }: { history: BiometricEvent[] }) {

  // Weekly activity (count of entries per day)
  const weeklyData = useMemo(() => {
    const days: Record<string, { day: string; count: number }> = {};
    for (let i = 6; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i);
      days[d.toDateString()] = { day: d.toLocaleDateString('en-US', { weekday: 'short' }), count: 0 };
    }
    history.forEach(e => {
      const key = new Date(e.timestamp).toDateString();
      if (days[key]) days[key].count++;
    });
    return Object.values(days);
  }, [history]);

  // Summary stats from real data
  const avgHR = useMemo(() => {
    const hrs = history.filter(e => e.type === 'heart_rate').map(e => e.value);
    return hrs.length ? Math.round(hrs.reduce((a, b) => a + b, 0) / hrs.length) : null;
  }, [history]);

  const avgSleep = useMemo(() => {
    const s = history.filter(e => e.type === 'sleep').map(e => e.value);
    return s.length ? (s.reduce((a, b) => a + b, 0) / s.length).toFixed(1) : null;
  }, [history]);

  const lastHydration = useMemo(() => {
    const h = history.filter(e => e.type === 'hydration');
    return h.length ? h[0].value.toFixed(1) : null;
  }, [history]);

  function riskFor(e: BiometricEvent) {
    if (e.type === 'heart_rate') return e.value > 100 || e.value < 50 ? { color: C.amber, label: 'Elevated' } : { color: C.teal, label: 'Normal' };
    if (e.type === 'temperature') return e.value > 37.8 ? { color: C.red, label: 'High' } : e.value < 36 ? { color: C.blue, label: 'Low' } : { color: C.teal, label: 'Normal' };
    if (e.type === 'sleep') return e.value < 6 ? { color: C.amber, label: 'Low' } : { color: C.teal, label: 'Good' };
    return { color: C.teal, label: 'Logged' };
  }

  function timeAgo(ts: string) {
    const diff = Date.now() - new Date(ts).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  }

  const today = new Date().toDateString();
  const isToday = weeklyData[weeklyData.length - 1];

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.24 }}
      style={{ overflowY: 'auto', height: '100%', scrollbarWidth: 'none' }}>
      <div style={{ padding: '0 20px 100px' }}>

        <div style={{ paddingTop: 22, paddingBottom: 4 }}>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: C.text, lineHeight: 1 }}>History</h2>
          <p style={{ fontSize: 12, color: C.muted, marginTop: 4 }}>Biometric events from Neon DB</p>
        </div>

        {/* Weekly activity chart */}
        <div style={{ margin: '16px 0', background: C.card, border: `1px solid ${C.border}`, borderRadius: 18, padding: '16px 8px 8px' }}>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: C.muted, marginBottom: 12, paddingLeft: 8 }}>
            Weekly Activity
          </div>
          <ResponsiveContainer width="100%" height={130}>
            <BarChart data={weeklyData} margin={{ top: 0, right: 8, left: -20, bottom: 0 }}>
              <XAxis dataKey="day" tick={{ fill: C.muted, fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: C.muted, fontSize: 10 }} axisLine={false} tickLine={false} allowDecimals={false} />
              <Tooltip content={<Tooltip2 />} />
              <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                {weeklyData.map((entry, i) => (
                  <Cell key={i} fill={entry.day === isToday?.day ? C.teal : `${C.teal}50`} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Summary stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8, marginBottom: 16 }}>
          {[
            { label: 'Avg HR', value: avgHR !== null ? String(avgHR) : '--', unit: 'bpm', color: C.red },
            { label: 'Sleep avg', value: avgSleep ?? '--', unit: 'hrs', color: C.amber },
            { label: 'Last Hydration', value: lastHydration ?? '--', unit: 'L', color: C.blue },
          ].map(({ label, value, unit, color }) => (
            <div key={label} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: '14px 12px', textAlign: 'center' }}>
              <div style={{ fontSize: 20, fontWeight: 700, color, fontFamily: "'Geist Mono',monospace" }}>{value}</div>
              <div style={{ fontSize: 10, color: C.muted, marginTop: 1 }}>{unit}</div>
              <div style={{ fontSize: 10, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: 3 }}>{label}</div>
            </div>
          ))}
        </div>

        {/* Event list */}
        <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', color: C.muted, marginBottom: 10 }}>
          Recent Events ({history.length})
        </div>

        {history.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 20px', fontSize: 13, color: C.muted }}>
            <Activity size={32} style={{ color: C.muted, margin: '0 auto 12px', display: 'block', opacity: 0.4 }} />
            No events yet. Start by logging water or measuring vitals.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {history.map((entry, i) => {
              const meta = typeMap[entry.type] || { icon: Activity, color: C.teal, label: entry.type, unit: entry.unit };
              const Icon = meta.icon;
              const risk = riskFor(entry);
              return (
                <motion.div key={i} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.03 }}
                  style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ width: 36, height: 36, borderRadius: 12, background: `${meta.color}14`, display: 'grid', placeItems: 'center', color: meta.color, flexShrink: 0 }}>
                    <Icon size={16} strokeWidth={2} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: C.text }}>{meta.label}</div>
                    <div style={{ fontSize: 11, color: C.muted, marginTop: 1 }}>{timeAgo(entry.timestamp)}</div>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{ fontSize: 16, fontWeight: 700, color: C.text, fontFamily: "'Geist Mono',monospace" }}>
                      {entry.value}<span style={{ fontSize: 10, color: C.muted }}> {meta.unit}</span>
                    </div>
                    <div style={{ display: 'inline-block', marginTop: 3, padding: '2px 8px', borderRadius: 6, background: `${risk.color}18`, color: risk.color, fontSize: 9, fontWeight: 700, textTransform: 'uppercase' }}>
                      {risk.label}
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>
    </motion.div>
  );
}
