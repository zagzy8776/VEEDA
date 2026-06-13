import { Activity } from 'lucide-react';

const C = {
  teal: '#2DD4A4',
  bg: 'rgba(10,15,28,0.92)',
  border: 'rgba(255,255,255,0.07)',
  text: '#E2F4F0',
  muted: '#5A7A72',
  amber: '#EF9F27',
};

interface HeaderProps {
  wellnessScore: number;
  status: 'online' | 'checking' | 'failed';
}

export function Header({ wellnessScore, status }: HeaderProps) {
  const statusColors = {
    online: { bg: 'rgba(45,212,164,0.12)', border: 'rgba(45,212,164,0.25)', text: C.teal, dot: C.teal, label: 'VEDA active' },
    checking: { bg: 'rgba(239,159,39,0.12)', border: 'rgba(239,159,39,0.25)', text: C.amber, dot: C.amber, label: 'Starting...' },
    failed: { bg: 'rgba(226,75,74,0.12)', border: 'rgba(226,75,74,0.25)', text: '#E24B4A', dot: '#E24B4A', label: 'Offline' },
  };
  const s = statusColors[status];

  const riskLabel = wellnessScore >= 80 ? 'Stable' : wellnessScore >= 60 ? 'Watch' : 'Care';
  const riskColor = wellnessScore >= 80 ? C.teal : wellnessScore >= 60 ? C.amber : '#E24B4A';

  return (
    <header style={{
      position: 'sticky',
      top: 0,
      zIndex: 300,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
      padding: '16px 20px 14px',
      background: 'rgba(10,15,28,0.88)',
      backdropFilter: 'blur(20px)',
      WebkitBackdropFilter: 'blur(20px)',
      borderBottom: `1px solid ${C.border}`,
    }}>
      {/* Left: logo */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{
          width: 42,
          height: 42,
          borderRadius: 14,
          display: 'grid',
          placeItems: 'center',
          background: 'linear-gradient(180deg, rgba(45,212,164,0.2), rgba(45,212,164,0.06))',
          border: '1px solid rgba(45,212,164,0.18)',
          color: C.teal,
          flexShrink: 0,
        }}>
          <Activity size={20} strokeWidth={2} />
        </div>
        <div>
          <div style={{
            fontFamily: "'Plus Jakarta Sans', sans-serif",
            fontSize: 20,
            fontWeight: 700,
            letterSpacing: '-0.02em',
            color: C.text,
            lineHeight: 1.1,
          }}>
            <span style={{ color: C.teal }}>V</span>EDA
          </div>
          <div style={{ fontSize: 11, color: C.muted, marginTop: 1, letterSpacing: '0.01em' }}>
            Wellness Intelligence
          </div>
        </div>
      </div>

      {/* Right: status pill + risk badge */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          padding: '5px 11px',
          borderRadius: 20,
          background: s.bg,
          border: `0.5px solid ${s.border}`,
          fontSize: 11,
          fontWeight: 600,
          color: s.text,
        }}>
          <span style={{
            width: 6,
            height: 6,
            borderRadius: '50%',
            background: s.dot,
            flexShrink: 0,
            animation: status === 'online' ? 'vedaPulse 2s ease-in-out infinite' : 'none',
          }} />
          <span>{s.label}</span>
        </div>

        <div style={{
          padding: '6px 12px',
          borderRadius: 14,
          background: `${riskColor}18`,
          border: `0.5px solid ${riskColor}40`,
          fontSize: 11,
          fontWeight: 700,
          color: riskColor,
          letterSpacing: '0.04em',
        }}>
          {riskLabel}
        </div>
      </div>

      <style>{`
        @keyframes vedaPulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.35; }
        }
      `}</style>
    </header>
  );
}
