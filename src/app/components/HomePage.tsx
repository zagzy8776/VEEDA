import { motion } from 'motion/react';
import { MessageCircle, Heart, Wind, Droplets, Zap, Thermometer, Droplet, CloudSun, MapPin, AlertTriangle, Info } from 'lucide-react';
import { useEffect, useState } from 'react';

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

interface VitalsData {
  heartRate: number;
  respiratory: number;
  oxygen: number;
  stamina: number;
  hydration: number;
  skinTemp: number;
}

interface EnvData {
  temp: string;
  air: string;
  weather: string;
  gps: string;
}

interface HomePageProps {
  onOpenChat: () => void;
  vitals: VitalsData;
  env: EnvData;
  wellnessScore: number;
}

const vitalItems = (v: VitalsData) => [
  { id: 'hr', icon: Heart, color: C.red, label: 'Heart rate', value: v.heartRate, unit: 'bpm', pct: 55, source: 'Camera estimate' },
  { id: 'resp', icon: Wind, color: C.blue, label: 'Respiratory', value: v.respiratory, unit: 'br/min', pct: 30, source: 'Mic estimate' },
  { id: 'spo2', icon: Droplets, color: C.teal, label: 'Oxygen', value: v.oxygen, unit: '%', pct: 97, source: 'Wearable' },
  { id: 'stamina', icon: Zap, color: C.amber, label: 'Stamina', value: v.stamina, unit: '%', pct: v.stamina, source: 'Wearable' },
  { id: 'hydration', icon: Droplet, color: C.blue, label: 'Hydration', value: v.hydration, unit: '%', pct: v.hydration, source: 'Water log' },
  { id: 'temp', icon: Thermometer, color: C.teal, label: 'Skin temp', value: v.skinTemp, unit: '°C', pct: 45, source: 'Manual' },
];

const envItems = (env: EnvData) => [
  { icon: Thermometer, color: C.amber, value: env.temp, label: 'Outside' },
  { icon: Wind, color: C.blue, value: env.air, label: 'Air' },
  { icon: CloudSun, color: C.teal, value: env.weather, label: 'Weather' },
  { icon: MapPin, color: C.red, value: env.gps, label: 'GPS' },
];

const notices = [
  { type: 'info', icon: Info, title: 'Hydration on track', desc: 'You\'ve logged 1.8L today — 90% of your daily target.' },
  { type: 'warning', icon: AlertTriangle, title: 'Heart rate elevated', desc: 'Resting HR above 80 bpm in the last hour. Try slow breathing.' },
];

function GuardianRing({ score }: { score: number }) {
  const [animated, setAnimated] = useState(false);
  useEffect(() => { setTimeout(() => setAnimated(true), 300); }, []);

  const r = 54;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - (animated ? score / 100 : 0));
  const glowColor = score >= 80 ? C.teal : score >= 60 ? C.amber : C.red;

  return (
    <div style={{ position: 'relative', width: 160, height: 160, margin: '0 auto' }}>
      {/* Outer glow */}
      <div style={{
        position: 'absolute',
        inset: -4,
        borderRadius: '50%',
        background: `radial-gradient(circle, ${glowColor}14 0%, transparent 70%)`,
        animation: 'ringGlow 3s ease-in-out infinite',
      }} />
      <svg width="160" height="160" viewBox="0 0 120 120" style={{ transform: 'rotate(-90deg)' }}>
        {/* Track */}
        <circle cx="60" cy="60" r={r} fill="none" stroke="rgba(45,212,164,0.08)" strokeWidth="9" />
        {/* Glow blur layer */}
        <circle
          cx="60" cy="60" r={r}
          fill="none"
          stroke={glowColor}
          strokeWidth="14"
          strokeDasharray={circ}
          strokeDashoffset={offset}
          strokeLinecap="round"
          opacity="0.18"
          style={{ transition: 'stroke-dashoffset 1.2s cubic-bezier(0.4,0,0.2,1), stroke 0.4s ease' }}
          filter="url(#ringGlow)"
        />
        {/* Main ring */}
        <circle
          cx="60" cy="60" r={r}
          fill="none"
          stroke={glowColor}
          strokeWidth="9"
          strokeDasharray={circ}
          strokeDashoffset={offset}
          strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 1.2s cubic-bezier(0.4,0,0.2,1), stroke 0.4s ease' }}
        />
        <defs>
          <filter id="ringGlow">
            <feGaussianBlur stdDeviation="3" result="coloredBlur" />
            <feMerge><feMergeNode in="coloredBlur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>
      </svg>
      <div style={{
        position: 'absolute',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        textAlign: 'center',
        pointerEvents: 'none',
      }}>
        <motion.div
          initial={{ opacity: 0, scale: 0.7 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.5, duration: 0.5, ease: 'easeOut' }}
          style={{ fontSize: 38, fontWeight: 700, color: C.text, lineHeight: 1, fontFamily: "'Geist Mono', monospace" }}
        >
          {score}
        </motion.div>
        <div style={{ fontSize: 10, color: C.muted, marginTop: 4, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Wellness</div>
      </div>
      <style>{`
        @keyframes ringGlow {
          0%, 100% { opacity: 0.7; transform: scale(1); }
          50% { opacity: 1; transform: scale(1.04); }
        }
      `}</style>
    </div>
  );
}

function VitalCard({ item }: { item: ReturnType<typeof vitalItems>[0] }) {
  const { icon: Icon, color, label, value, unit, pct, source } = item;
  return (
    <motion.div
      whileHover={{ y: -2, boxShadow: `0 20px 48px rgba(0,0,0,0.3)` }}
      style={{
        background: C.card,
        border: `1px solid ${C.border}`,
        borderRadius: 18,
        padding: 16,
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        cursor: 'default',
        transition: 'box-shadow 0.2s ease',
      }}
    >
      {/* Top row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <div style={{
          width: 28,
          height: 28,
          borderRadius: 10,
          background: `${color}14`,
          display: 'grid',
          placeItems: 'center',
          color,
          flexShrink: 0,
        }}>
          <Icon size={14} strokeWidth={2.2} />
        </div>
        <span style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: C.muted }}>
          {label}
        </span>
      </div>

      {/* Value */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginBottom: 6 }}>
        <span style={{ fontSize: 22, fontWeight: 600, color: C.text, fontFamily: "'Geist Mono', monospace", lineHeight: 1 }}>
          {value}
        </span>
        <span style={{ fontSize: 10, color: C.muted }}>{unit}</span>
      </div>

      {/* Source */}
      <div style={{ fontSize: 10, color: C.muted, marginBottom: 10, letterSpacing: '0.02em' }}>{source}</div>

      {/* Bar */}
      <div style={{ height: 3, borderRadius: 2, background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ delay: 0.3, duration: 0.8, ease: 'easeOut' }}
          style={{ height: '100%', borderRadius: 2, background: color }}
        />
      </div>
    </motion.div>
  );
}

export function HomePage({ onOpenChat, vitals, env, wellnessScore }: HomePageProps) {
  const today = new Date();
  const greetingHour = today.getHours();
  const greeting = greetingHour < 12 ? 'morning' : greetingHour < 17 ? 'afternoon' : 'evening';
  const dateStr = today.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.24 }}
      style={{ overflowY: 'auto', height: '100%', scrollbarWidth: 'none' }}
    >
      <div style={{ padding: '0 20px 100px' }}>

        {/* Greeting */}
        <div style={{ paddingTop: 24, paddingBottom: 4 }}>
          <div style={{ fontSize: 11, color: C.muted, letterSpacing: '0.04em', marginBottom: 4 }}>{dateStr}</div>
          <div style={{ fontSize: 20, fontWeight: 500, color: C.text }}>
            Good {greeting}, <span style={{ color: C.teal, fontWeight: 700 }}>Zagzy</span>
          </div>
        </div>

        {/* Guardian Ring */}
        <div style={{ padding: '28px 0 20px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0 }}>
          <GuardianRing score={wellnessScore} />
          <div style={{ marginTop: 16, display: 'flex', gap: 20, alignItems: 'center' }}>
            {[
              { label: 'Streak', value: '7d', color: C.amber },
              { label: 'Checks', value: '24', color: C.teal },
              { label: 'Alerts', value: '2', color: C.red },
            ].map(stat => (
              <div key={stat.label} style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 16, fontWeight: 700, color: stat.color, fontFamily: "'Geist Mono', monospace" }}>{stat.value}</div>
                <div style={{ fontSize: 9, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.07em', marginTop: 2 }}>{stat.label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Vitals Grid */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', color: C.muted, marginBottom: 10 }}>
            Live Vitals
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {vitalItems(vitals).map(item => (
              <VitalCard key={item.id} item={item} />
            ))}
          </div>
        </div>

        {/* Environment Row */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', color: C.muted, marginBottom: 10 }}>
            Environment
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
            {envItems(env).map(({ icon: Icon, color, value, label }) => (
              <div key={label} style={{
                background: C.card,
                border: `1px solid ${C.border}`,
                borderRadius: 16,
                padding: '14px 8px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 5,
                backdropFilter: 'blur(8px)',
              }}>
                <div style={{
                  width: 32,
                  height: 32,
                  borderRadius: 11,
                  background: `${color}14`,
                  display: 'grid',
                  placeItems: 'center',
                  color,
                }}>
                  <Icon size={15} strokeWidth={2} />
                </div>
                <div style={{ fontSize: 13, fontWeight: 600, color: C.text, textAlign: 'center', fontFamily: "'Geist Mono', monospace" }}>{value}</div>
                <div style={{ fontSize: 9, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: C.muted }}>{label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Notices */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', color: C.muted, marginBottom: 10 }}>
            VEDA Notices
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {notices.map((notice, i) => {
              const color = notice.type === 'warning' ? C.amber : C.teal;
              const Icon = notice.icon;
              return (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.1 * i + 0.4 }}
                  style={{
                    background: `${color}0d`,
                    border: `1px solid ${color}28`,
                    borderRadius: 16,
                    padding: '14px 16px',
                    display: 'flex',
                    gap: 12,
                    alignItems: 'flex-start',
                  }}
                >
                  <div style={{ color, marginTop: 1, flexShrink: 0 }}><Icon size={15} strokeWidth={2.2} /></div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: C.text, marginBottom: 2 }}>{notice.title}</div>
                    <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.45 }}>{notice.desc}</div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>

        {/* CTA */}
        <motion.button
          whileTap={{ scale: 0.98 }}
          whileHover={{ opacity: 0.95, y: -1 }}
          onClick={onOpenChat}
          style={{
            width: '100%',
            background: `linear-gradient(135deg, ${C.teal}, #1fb391)`,
            color: '#04342C',
            fontSize: 15,
            fontWeight: 700,
            padding: '14px 20px',
            borderRadius: 18,
            border: 'none',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 10,
            boxShadow: '0 12px 32px rgba(45,212,164,0.22)',
            letterSpacing: '-0.01em',
          }}
        >
          <MessageCircle size={18} strokeWidth={2.2} />
          Chat with VEDA
        </motion.button>

      </div>
    </motion.div>
  );
}
