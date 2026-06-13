import { Activity } from 'lucide-react';

const C = { teal: '#2DD4A4', amber: '#EF9F27', text: '#E2F4F0', muted: '#5A7A72' };

interface HeaderProps {
  wellnessScore: number | null;
  status: 'online' | 'checking' | 'failed';
  riskLevel: string;
}

export function Header({ wellnessScore, status, riskLevel }: HeaderProps) {
  const s = {
    online:   { bg: 'rgba(45,212,164,0.12)',  border: 'rgba(45,212,164,0.25)',  text: C.teal,    dot: C.teal,    label: 'VEDA active' },
    checking: { bg: 'rgba(239,159,39,0.12)',  border: 'rgba(239,159,39,0.25)',  text: C.amber,   dot: C.amber,   label: 'Starting...' },
    failed:   { bg: 'rgba(226,75,74,0.12)',   border: 'rgba(226,75,74,0.25)',   text: '#E24B4A', dot: '#E24B4A', label: 'Offline' },
  }[status];

  const score = wellnessScore ?? null;
  const riskColor = riskLevel === 'Urgent' ? '#E24B4A' : riskLevel === 'Watch' ? C.amber : C.teal;

  return (
    <header style={{
      position: 'sticky', top: 0, zIndex: 300,
      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
      padding: '16px 20px 14px',
      background: 'rgba(10,15,28,0.88)', backdropFilter: 'blur(20px)',
      borderBottom: '1px solid rgba(255,255,255,0.07)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ width: 42, height: 42, borderRadius: 14, display: 'grid', placeItems: 'center', background: 'linear-gradient(180deg,rgba(45,212,164,0.2),rgba(45,212,164,0.06))', border: '1px solid rgba(45,212,164,0.18)', color: C.teal }}>
          <Activity size={20} strokeWidth={2} />
        </div>
        <div>
          <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-0.02em', color: C.text, lineHeight: 1.1 }}>
            <span style={{ color: C.teal }}>V</span>EDA
          </div>
          <div style={{ fontSize: 11, color: C.muted, marginTop: 1 }}>Wellness Intelligence</div>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 11px', borderRadius: 20, background: s.bg, border: `0.5px solid ${s.border}`, fontSize: 11, fontWeight: 600, color: s.text }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: s.dot, flexShrink: 0, animation: status === 'online' ? 'vedaPulse 2s ease-in-out infinite' : 'none' }} />
          {s.label}
        </div>
        <div style={{ padding: '6px 12px', borderRadius: 14, background: `${riskColor}18`, border: `0.5px solid ${riskColor}40`, fontSize: 11, fontWeight: 700, color: riskColor }}>
          {score !== null ? `${score} · ` : ''}{riskLevel}
        </div>
      </div>

      <style>{`@keyframes vedaPulse { 0%,100%{opacity:1} 50%{opacity:0.35} }`}</style>
    </header>
  );
}
