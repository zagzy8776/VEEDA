import { Home, HeartPulse, MapPin, BarChart3, User } from 'lucide-react';
import { motion } from 'motion/react';

export type Route = 'home' | 'vitals' | 'map' | 'history' | 'clinician' | 'profile';

const tabs: { id: Route; icon: typeof Home; label: string }[] = [
  { id: 'home', icon: Home, label: 'Home' },
  { id: 'vitals', icon: HeartPulse, label: 'Vitals' },
  { id: 'map', icon: MapPin, label: 'Map' },
  { id: 'history', icon: BarChart3, label: 'History' },
  { id: 'clinician', icon: BarChart3, label: 'Roster' },
  { id: 'profile', icon: User, label: 'Profile' },
];

const C = {
  teal: '#2DD4A4',
  muted: '#4A6A62',
  bg: 'rgba(10,15,28,0.92)',
  border: 'rgba(255,255,255,0.09)',
};

interface BottomNavProps {
  route: Route;
  onNavigate: (r: Route) => void;
  showClinical?: boolean;
}

export function BottomNav({ route, onNavigate, showClinical = false }: BottomNavProps) {
  const visibleTabs = tabs.filter(tab => tab.id !== 'clinician' || showClinical);
  return (
    <nav style={{
      position: 'sticky',
      bottom: 0,
      left: 0,
      right: 0,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-around',
      padding: '8px 8px 12px',
      background: C.bg,
      backdropFilter: 'blur(20px)',
      WebkitBackdropFilter: 'blur(20px)',
      borderTop: `0.5px solid ${C.border}`,
      zIndex: 100,
    }}>
      {visibleTabs.map(({ id, icon: Icon, label }) => {
        const active = route === id;
        return (
          <button
            key={id}
            onClick={() => onNavigate(id)}
            style={{
              position: 'relative',
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 3,
              padding: '8px 4px',
              border: 'none',
              background: 'none',
              cursor: 'pointer',
              borderRadius: 14,
              transition: 'all 0.2s ease',
              color: active ? C.teal : C.muted,
            }}
          >
            {active && (
              <motion.div
                layoutId="nav-active-bg"
                style={{
                  position: 'absolute',
                  inset: 0,
                  borderRadius: 14,
                  background: 'linear-gradient(180deg, rgba(45,212,164,0.14), rgba(45,212,164,0.06))',
                  border: '0.5px solid rgba(45,212,164,0.22)',
                }}
                transition={{ type: 'spring', bounce: 0.2, duration: 0.4 }}
              />
            )}
            <Icon
              size={20}
              strokeWidth={active ? 2.2 : 1.8}
              style={{
                filter: active ? 'drop-shadow(0 0 8px rgba(45,212,164,0.45))' : 'none',
                transform: active ? 'translateY(-1px) scale(1.06)' : 'none',
                transition: 'all 0.2s ease',
                position: 'relative',
              }}
            />
            <span style={{
              fontSize: 10,
              fontWeight: active ? 700 : 500,
              letterSpacing: '0.01em',
              position: 'relative',
            }}>
              {label}
            </span>
          </button>
        );
      })}
    </nav>
  );
}
