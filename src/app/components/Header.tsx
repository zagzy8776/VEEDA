import { Activity, ChevronDown, Users } from 'lucide-react';
import { useState } from 'react';

const C = { teal: '#2DD4A4', amber: '#EF9F27', text: '#E2F4F0', muted: '#5A7A72' };

export interface HeaderSubject {
  id: string;
  label: string;
}

interface HeaderProps {
  wellnessScore: number | null;
  status: 'online' | 'checking' | 'failed';
  riskLevel: string | null;
  /** Selectable subjects: "self" plus any family profiles (dependants). */
  subjects?: HeaderSubject[];
  activeSubjectId?: string;
  onSelectSubject?: (id: string) => void;
}

export function Header({ wellnessScore, status, riskLevel, subjects, activeSubjectId, onSelectSubject }: HeaderProps) {
  const [open, setOpen] = useState(false);
  const s = {
    online:   { bg: 'rgba(45,212,164,0.12)', border: 'rgba(45,212,164,0.25)', text: C.teal,    dot: C.teal,    label: 'Online' },
    checking: { bg: 'rgba(239,159,39,0.12)', border: 'rgba(239,159,39,0.25)', text: C.amber,   dot: C.amber,   label: 'Connecting...' },
    failed:   { bg: 'rgba(226,75,74,0.12)',  border: 'rgba(226,75,74,0.25)',  text: '#E24B4A', dot: '#E24B4A', label: 'Offline' },
  }[status];

  // Only show risk badge when we have a real score or a non-default risk
  const showRisk =
    wellnessScore !== null ||
    (riskLevel != null && riskLevel !== 'Stable');

  const riskColor =
    riskLevel === 'Urgent' ? '#E24B4A' :
    riskLevel === 'Watch' ? C.amber :
    C.teal;

  const riskLabel =
    riskLevel === 'Urgent' ? 'Needs attention' :
    riskLevel === 'Watch' ? 'Watch' :
    wellnessScore !== null ? 'Good' : null;

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

      {subjects && subjects.length > 1 && (
        <div style={{ position: 'relative' }}>
          <button onClick={() => setOpen(o => !o)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 10px', borderRadius: 20, background: 'rgba(45,212,164,0.1)', border: '0.5px solid rgba(45,212,164,0.28)', fontSize: 11, fontWeight: 700, color: C.teal, cursor: 'pointer' }}>
            <Users size={12} />
            {(subjects.find(s => s.id === activeSubjectId) || subjects[0]).label}
            <ChevronDown size={12} />
          </button>
          {open && (
            <div style={{ position: 'absolute', top: '110%', left: 0, minWidth: 160, background: '#0D1525', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, padding: 6, zIndex: 400, boxShadow: '0 8px 30px rgba(0,0,0,0.5)' }}>
              {subjects.map(sub => (
                <button key={sub.id} onClick={() => { onSelectSubject?.(sub.id); setOpen(false); }} style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 10px', borderRadius: 8, border: 0, background: sub.id === activeSubjectId ? 'rgba(45,212,164,0.14)' : 'transparent', color: sub.id === activeSubjectId ? C.teal : C.text, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>{sub.label}</button>
              ))}
            </div>
          )}
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 11px', borderRadius: 20, background: s.bg, border: `0.5px solid ${s.border}`, fontSize: 11, fontWeight: 600, color: s.text }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: s.dot, flexShrink: 0, animation: status === 'online' ? 'vedaPulse 2s ease-in-out infinite' : 'none' }} />
          {s.label}
        </div>
        {showRisk && riskLabel && (
          <div style={{ padding: '6px 12px', borderRadius: 14, background: `${riskColor}18`, border: `0.5px solid ${riskColor}40`, fontSize: 11, fontWeight: 700, color: riskColor }}>
            {wellnessScore !== null ? `${wellnessScore} · ` : ''}{riskLabel}
          </div>
        )}
      </div>

      <style>{`@keyframes vedaPulse{0%,100%{opacity:1}50%{opacity:0.35}}`}</style>
    </header>
  );
}
