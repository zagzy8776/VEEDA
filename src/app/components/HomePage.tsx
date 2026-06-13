import { motion } from 'motion/react';
import { MessageCircle, Heart, Wind, Droplets, Zap, Thermometer, Droplet, CloudSun, MapPin, AlertTriangle, Info } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { VedaApp } from '../useVedaApp';

const C = { teal: '#2DD4A4', blue: '#378ADD', amber: '#EF9F27', red: '#E24B4A', text: '#E2F4F0', muted: '#5A7A72', card: 'rgba(13,21,37,0.88)', border: 'rgba(255,255,255,0.08)' };

function GuardianRing({ score }: { score: number | null }) {
  const [animated, setAnimated] = useState(false);
  useEffect(() => { setTimeout(() => setAnimated(true), 300); }, []);
  const r = 54, circ = 2 * Math.PI * r;
  const pct = score !== null ? score / 100 : 0;
  const offset = circ * (1 - (animated ? pct : 0));
  const color = score === null ? C.muted : score >= 80 ? C.teal : score >= 60 ? C.amber : C.red;

  return (
    <div style={{ position: 'relative', width: 160, height: 160, margin: '0 auto' }}>
      <svg width="160" height="160" viewBox="0 0 120 120" style={{ transform: 'rotate(-90deg)' }}>
        <circle cx="60" cy="60" r={r} fill="none" stroke="rgba(45,212,164,0.08)" strokeWidth="9" />
        <circle cx="60" cy="60" r={r} fill="none" stroke={color} strokeWidth="9"
          strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 1.2s cubic-bezier(0.4,0,0.2,1), stroke 0.4s ease' }} />
      </svg>
      <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', textAlign: 'center' }}>
        <div style={{ fontSize: 38, fontWeight: 700, color: C.text, lineHeight: 1, fontFamily: "'Geist Mono',monospace" }}>
          {score !== null ? score : '--'}
        </div>
        <div style={{ fontSize: 10, color: C.muted, marginTop: 4, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Wellness</div>
      </div>
    </div>
  );
}

export function HomePage({ app, onOpenChat }: { app: VedaApp; onOpenChat: () => void }) {
  const { vitals, sources, env, analysis, wellnessScore, history, hydrationMl, profile } = app;

  const today = new Date();
  const h = today.getHours();
  const greeting = h < 12 ? 'morning' : h < 17 ? 'afternoon' : 'evening';
  const dateStr = today.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

  // Stats from real history
  const streak = (() => {
    if (!history.length) return 0;
    const days = new Set(history.map(e => new Date(e.timestamp).toDateString()));
    let s = 0;
    for (let i = 0; i < 30; i++) {
      const d = new Date(); d.setDate(d.getDate() - i);
      if (days.has(d.toDateString())) s++; else break;
    }
    return s;
  })();
  const checks = history.length;
  const alerts = analysis?.riskLevel === 'Urgent' ? 1 : analysis?.riskLevel === 'Watch' ? 1 : 0;

  const vitalItems = [
    { id: 'hr', icon: Heart, color: C.red, label: 'Heart rate', value: vitals.heartRate, unit: 'bpm', pct: vitals.heartRate ? Math.min(100, (vitals.heartRate / 200) * 100) : 0, source: sources.heartRate },
    { id: 'resp', icon: Wind, color: C.blue, label: 'Respiratory', value: vitals.respiratory, unit: 'br/min', pct: vitals.respiratory ? Math.min(100, (vitals.respiratory / 40) * 100) : 0, source: sources.respiratory },
    { id: 'spo2', icon: Droplets, color: C.teal, label: 'Oxygen', value: vitals.oxygen, unit: '%', pct: vitals.oxygen ?? 0, source: sources.oxygen },
    { id: 'stamina', icon: Zap, color: C.amber, label: 'Stamina', value: vitals.stamina, unit: '%', pct: vitals.stamina ?? 0, source: sources.stamina },
    { id: 'hydration', icon: Droplet, color: C.blue, label: 'Hydration', value: vitals.hydration, unit: '%', pct: vitals.hydration ?? 0, source: sources.hydration },
    { id: 'temp', icon: Thermometer, color: C.teal, label: 'Skin temp', value: vitals.skinTemp, unit: '°C', pct: vitals.skinTemp ? Math.min(100, ((vitals.skinTemp - 35) / 5) * 100) : 0, source: sources.skinTemp },
  ];

  const envItems = [
    { icon: Thermometer, color: C.amber, value: env.temp, label: 'Outside' },
    { icon: Wind, color: C.blue, value: env.air, label: 'Air' },
    { icon: CloudSun, color: C.teal, value: env.weather, label: 'Weather' },
    { icon: MapPin, color: C.red, value: env.gps, label: 'GPS' },
  ];

  // Notices from real analysis
  const notices = [];
  if (!Object.values(vitals).some(v => v !== null)) {
    notices.push({ type: 'info', icon: Info, title: 'No measurements yet', desc: 'Go to Vitals tab to measure your heart rate, breathing, log water or enter temperature.' });
  }
  if (analysis?.supportCheck) {
    notices.push({ type: analysis.riskLevel === 'Urgent' || analysis.riskLevel === 'Watch' ? 'warning' : 'info', icon: analysis.riskLevel === 'Watch' || analysis.riskLevel === 'Urgent' ? AlertTriangle : Info, title: analysis.headline, desc: analysis.supportCheck });
  }
  if (env.outsideTemp !== null) {
    notices.push({ type: 'info', icon: Info, title: 'Environment synced', desc: `${env.weather} · ${env.temp} outside · Air ${env.air}` });
  }

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.24 }}
      style={{ overflowY: 'auto', height: '100%', scrollbarWidth: 'none' }}>
      <div style={{ padding: '0 20px 100px' }}>

        <div style={{ paddingTop: 24, paddingBottom: 4 }}>
          <div style={{ fontSize: 11, color: C.muted, letterSpacing: '0.04em', marginBottom: 4 }}>{dateStr}</div>
          <div style={{ fontSize: 20, fontWeight: 500, color: C.text }}>
            Good {greeting}, <span style={{ color: C.teal, fontWeight: 700 }}>{profile.name}</span>
          </div>
        </div>

        <div style={{ padding: '28px 0 20px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <GuardianRing score={wellnessScore} />
          <div style={{ marginTop: 16, display: 'flex', gap: 20, alignItems: 'center' }}>
            {[{ label: 'Streak', value: streak > 0 ? `${streak}d` : '0d', color: C.amber }, { label: 'Checks', value: String(checks), color: C.teal }, { label: 'Alerts', value: String(alerts), color: C.red }].map(stat => (
              <div key={stat.label} style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 16, fontWeight: 700, color: stat.color, fontFamily: "'Geist Mono',monospace" }}>{stat.value}</div>
                <div style={{ fontSize: 9, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.07em', marginTop: 2 }}>{stat.label}</div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', color: C.muted, marginBottom: 10 }}>Live Vitals</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {vitalItems.map(item => (
              <motion.div key={item.id} whileHover={{ y: -2 }}
                style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 18, padding: 16, backdropFilter: 'blur(12px)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                  <div style={{ width: 28, height: 28, borderRadius: 10, background: `${item.color}14`, display: 'grid', placeItems: 'center', color: item.color }}>
                    <item.icon size={14} strokeWidth={2.2} />
                  </div>
                  <span style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: C.muted }}>{item.label}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginBottom: 6 }}>
                  <span style={{ fontSize: 22, fontWeight: 600, color: item.value !== null ? C.text : C.muted, fontFamily: "'Geist Mono',monospace", lineHeight: 1 }}>
                    {item.value !== null ? item.value : '--'}
                  </span>
                  <span style={{ fontSize: 10, color: C.muted }}>{item.unit}</span>
                </div>
                <div style={{ fontSize: 10, color: C.muted, marginBottom: 10 }}>{item.source === 'none' ? 'Not measured' : item.source}</div>
                <div style={{ height: 3, borderRadius: 2, background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
                  <motion.div initial={{ width: 0 }} animate={{ width: `${item.pct}%` }} transition={{ delay: 0.3, duration: 0.8 }}
                    style={{ height: '100%', borderRadius: 2, background: item.color }} />
                </div>
              </motion.div>
            ))}
          </div>
        </div>

        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', color: C.muted, marginBottom: 10 }}>Environment</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8 }}>
            {envItems.map(({ icon: Icon, color, value, label }) => (
              <div key={label} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: '14px 8px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5 }}>
                <div style={{ width: 32, height: 32, borderRadius: 11, background: `${color}14`, display: 'grid', placeItems: 'center', color }}>
                  <Icon size={15} strokeWidth={2} />
                </div>
                <div style={{ fontSize: 13, fontWeight: 600, color: C.text, textAlign: 'center', fontFamily: "'Geist Mono',monospace" }}>{value}</div>
                <div style={{ fontSize: 9, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: C.muted }}>{label}</div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', color: C.muted, marginBottom: 10 }}>VEDA Notices</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {notices.length === 0 && (
              <div style={{ fontSize: 12, color: C.muted, padding: '12px 0' }}>All vitals within normal range. VEDA is watching quietly.</div>
            )}
            {notices.map((n, i) => {
              const color = n.type === 'warning' ? C.amber : C.teal;
              return (
                <motion.div key={i} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.1 * i + 0.4 }}
                  style={{ background: `${color}0d`, border: `1px solid ${color}28`, borderRadius: 16, padding: '14px 16px', display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                  <div style={{ color, marginTop: 1, flexShrink: 0 }}><n.icon size={15} strokeWidth={2.2} /></div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: C.text, marginBottom: 2 }}>{n.title}</div>
                    <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.45 }}>{n.desc}</div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>

        <motion.button whileTap={{ scale: 0.98 }} whileHover={{ opacity: 0.95, y: -1 }} onClick={onOpenChat}
          style={{ width: '100%', background: `linear-gradient(135deg,${C.teal},#1fb391)`, color: '#04342C', fontSize: 15, fontWeight: 700, padding: '14px 20px', borderRadius: 18, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, boxShadow: '0 12px 32px rgba(45,212,164,0.22)' }}>
          <MessageCircle size={18} strokeWidth={2.2} />
          Chat with VEDA
        </motion.button>
      </div>
    </motion.div>
  );
}
