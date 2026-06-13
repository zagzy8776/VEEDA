import { motion } from 'motion/react';
import { Heart, Wind, Droplet, Moon, Footprints, Thermometer, Activity, RefreshCw, Download } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { useMemo, useState } from 'react';
import type { BiometricEvent } from '../useVedaApp';

const C = { teal: '#2DD4A4', blue: '#378ADD', amber: '#EF9F27', red: '#E24B4A', text: '#E2F4F0', muted: '#5A7A72', card: 'rgba(13,21,37,0.88)', border: 'rgba(255,255,255,0.08)' };

const typeMap: Record<string, { icon: typeof Heart; color: string; label: string; unit: string }> = {
  heart_rate:  { icon: Heart,       color: C.red,   label: 'Heart Rate',  unit: 'bpm'      },
  breath_rate: { icon: Wind,        color: C.blue,  label: 'Breath Rate', unit: 'br/min'   },
  hydration:   { icon: Droplet,     color: C.blue,  label: 'Hydration',   unit: 'L'        },
  sleep:       { icon: Moon,        color: C.amber, label: 'Sleep',       unit: 'hrs'      },
  steps:       { icon: Footprints,  color: C.teal,  label: 'Steps',       unit: 'steps'    },
  temperature: { icon: Thermometer, color: C.red,   label: 'Temperature', unit: '°C'       },
};

const FILTER_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'heart_rate', label: 'Heart' },
  { value: 'breath_rate', label: 'Breath' },
  { value: 'hydration', label: 'Water' },
  { value: 'sleep', label: 'Sleep' },
  { value: 'temperature', label: 'Temp' },
];

const ChartTip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: '#111827', border: '0.5px solid rgba(255,255,255,0.1)', borderRadius: 10, padding: '8px 12px', fontSize: 11, color: C.text }}>
      <div style={{ color: C.muted }}>{label}</div>
      <div style={{ color: C.teal, fontWeight: 700 }}>Entries: {payload[0].value}</div>
    </div>
  );
};

function riskFor(e: BiometricEvent) {
  if (e.type === 'heart_rate') {
    if (e.value > 120) return { color: C.red, label: 'Critical' };
    if (e.value > 100 || e.value < 50) return { color: C.amber, label: 'Elevated' };
    return { color: C.teal, label: 'Normal' };
  }
  if (e.type === 'breath_rate') {
    if (e.value > 24 || e.value < 8) return { color: C.red, label: 'Abnormal' };
    return { color: C.teal, label: 'Normal' };
  }
  if (e.type === 'temperature') {
    if (e.value >= 38.5) return { color: C.red, label: 'Fever' };
    if (e.value > 37.5) return { color: C.amber, label: 'Elevated' };
    if (e.value < 36.0) return { color: C.blue, label: 'Low' };
    return { color: C.teal, label: 'Normal' };
  }
  if (e.type === 'sleep') return e.value < 6 ? { color: C.amber, label: 'Low' } : e.value >= 7 ? { color: C.teal, label: 'Good' } : { color: C.muted, label: 'Fair' };
  if (e.type === 'hydration') return e.value < 1 ? { color: C.amber, label: 'Low' } : { color: C.teal, label: 'Logged' };
  return { color: C.teal, label: 'Logged' };
}

function timeAgo(ts: string) {
  const diff = Date.now() - new Date(ts).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return days === 1 ? 'Yesterday' : `${days}d ago`;
}

function exportCSV(history: BiometricEvent[]) {
  const rows = [['Type', 'Value', 'Unit', 'Timestamp', 'Date'].join(',')];
  history.forEach(e => {
    const d = new Date(e.timestamp);
    rows.push([e.type, e.value, e.unit, e.timestamp, d.toLocaleString()].join(','));
  });
  const blob = new Blob([rows.join('\n')], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `veda_health_export_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
}

export function HistoryPage({ history, onRefresh }: { history: BiometricEvent[]; onRefresh: () => void }) {
  const [filter, setFilter] = useState('all');
  const [refreshing, setRefreshing] = useState(false);

  async function handleRefresh() {
    setRefreshing(true);
    await onRefresh();
    setTimeout(() => setRefreshing(false), 800);
  }

  const weeklyData = useMemo(() => {
    const days: Record<string, { day: string; count: number; dateStr: string }> = {};
    for (let i = 6; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i);
      days[d.toDateString()] = { day: d.toLocaleDateString('en-US', { weekday: 'short' }), count: 0, dateStr: d.toDateString() };
    }
    history.forEach(e => {
      const key = new Date(e.timestamp).toDateString();
      if (days[key]) days[key].count++;
    });
    return Object.values(days);
  }, [history]);

  const todayStr = new Date().toDateString();

  const avgHR = useMemo(() => {
    const v = history.filter(e => e.type === 'heart_rate').map(e => e.value);
    return v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) : null;
  }, [history]);

  const avgSleep = useMemo(() => {
    const v = history.filter(e => e.type === 'sleep').map(e => e.value);
    return v.length ? (v.reduce((a, b) => a + b, 0) / v.length).toFixed(1) : null;
  }, [history]);

  const totalWater = useMemo(() => {
    const today = new Date().toDateString();
    const v = history.filter(e => e.type === 'hydration' && new Date(e.timestamp).toDateString() === today).map(e => e.value);
    return v.length ? v[v.length - 1].toFixed(1) : null;
  }, [history]);

  const filtered = filter === 'all' ? history : history.filter(e => e.type === filter);

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.24 }}
      style={{ overflowY: 'auto', height: '100%', scrollbarWidth: 'none' }}>
      <div style={{ padding: '0 20px 100px' }}>

        <div style={{ paddingTop: 22, paddingBottom: 4, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h2 style={{ fontSize: 20, fontWeight: 700, color: C.text, lineHeight: 1 }}>History</h2>
            <p style={{ fontSize: 12, color: C.muted, marginTop: 4 }}>Live from Neon database</p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => exportCSV(history)} title="Export CSV"
              style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(255,255,255,0.07)', border: 'none', cursor: 'pointer', display: 'grid', placeItems: 'center', color: C.muted }}>
              <Download size={15} />
            </button>
            <button onClick={handleRefresh} title="Refresh"
              style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(255,255,255,0.07)', border: 'none', cursor: 'pointer', display: 'grid', placeItems: 'center', color: C.teal }}>
              <RefreshCw size={15} style={{ animation: refreshing ? 'spin 0.8s linear infinite' : 'none' }} />
            </button>
          </div>
        </div>

        {/* Weekly chart */}
        <div style={{ margin: '16px 0', background: C.card, border: `1px solid ${C.border}`, borderRadius: 18, padding: '16px 8px 8px' }}>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: C.muted, marginBottom: 12, paddingLeft: 8 }}>Weekly Activity</div>
          <ResponsiveContainer width="100%" height={120}>
            <BarChart data={weeklyData} margin={{ top: 0, right: 8, left: -20, bottom: 0 }}>
              <XAxis dataKey="day" tick={{ fill: C.muted, fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: C.muted, fontSize: 10 }} axisLine={false} tickLine={false} allowDecimals={false} />
              <Tooltip content={<ChartTip />} />
              <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                {weeklyData.map((entry, i) => (
                  <Cell key={i} fill={entry.dateStr === todayStr ? C.teal : `${C.teal}45`} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Summary stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8, marginBottom: 16 }}>
          {[
            { label: 'Avg HR', value: avgHR !== null ? String(avgHR) : '--', unit: 'bpm', color: C.red },
            { label: 'Avg Sleep', value: avgSleep ?? '--', unit: 'hrs', color: C.amber },
            { label: "Today's Water", value: totalWater ?? '--', unit: 'L', color: C.blue },
          ].map(({ label, value, unit, color }) => (
            <div key={label} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: '12px 10px', textAlign: 'center' }}>
              <div style={{ fontSize: 20, fontWeight: 700, color, fontFamily: "'Geist Mono',monospace" }}>{value}</div>
              <div style={{ fontSize: 9, color: C.muted, marginTop: 1 }}>{unit}</div>
              <div style={{ fontSize: 9, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: 3 }}>{label}</div>
            </div>
          ))}
        </div>

        {/* Filter tabs */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 12, overflowX: 'auto', scrollbarWidth: 'none', paddingBottom: 4 }}>
          {FILTER_OPTIONS.map(opt => (
            <button key={opt.value} onClick={() => setFilter(opt.value)}
              style={{ flexShrink: 0, padding: '5px 12px', borderRadius: 20, border: 'none', background: filter === opt.value ? C.teal : 'rgba(255,255,255,0.07)', color: filter === opt.value ? '#04342C' : C.muted, fontSize: 11, fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s' }}>
              {opt.label}
            </button>
          ))}
        </div>

        {/* Event count */}
        <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', color: C.muted, marginBottom: 10 }}>
          {filtered.length} Event{filtered.length !== 1 ? 's' : ''}{filter !== 'all' ? ` · ${typeMap[filter]?.label ?? filter}` : ''}
        </div>

        {filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 20px', fontSize: 13, color: C.muted }}>
            <Activity size={32} style={{ color: C.muted, margin: '0 auto 12px', display: 'block', opacity: 0.35 }} />
            {filter === 'all' ? 'No events yet. Measure vitals or log water to get started.' : `No ${typeMap[filter]?.label ?? filter} events yet.`}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {filtered.map((entry, i) => {
              const meta = typeMap[entry.type] || { icon: Activity, color: C.teal, label: entry.type, unit: entry.unit };
              const Icon = meta.icon;
              const risk = riskFor(entry);
              return (
                <motion.div key={i} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: Math.min(i * 0.02, 0.3) }}
                  style={{ background: C.card, border: `1px solid ${risk.color === C.red ? 'rgba(226,75,74,0.2)' : C.border}`, borderRadius: 14, padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ width: 36, height: 36, borderRadius: 12, background: `${meta.color}14`, display: 'grid', placeItems: 'center', color: meta.color, flexShrink: 0 }}>
                    <Icon size={16} strokeWidth={2} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: C.text }}>{meta.label}</div>
                    <div style={{ fontSize: 11, color: C.muted, marginTop: 1 }}>{timeAgo(entry.timestamp)} · {new Date(entry.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
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
      <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
    </motion.div>
  );
}
