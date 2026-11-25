import { useState } from 'react';
import { Home, HeartPulse, MapPin, BarChart3, User } from 'lucide-react';
import { motion } from 'motion/react';
import { DURATION, EASE_OUT, SPRING_SNAPPY } from '../motion';

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

// Stable animation targets: motion replays the keyframes only when a tab
// actually becomes active. Fresh literals each render would retrigger them.
//
// Each tab animates its icon in its own way, so the bar itself says where you
// are heading: the heart thumps twice, the pin drops into place, the bars grow
// and tilt, the person lifts. Every one of them is transform-only.
const ICON_IDLE = { scale: 1, y: 0, rotate: 0 };
const LABEL_SELECTED = { opacity: 1, y: 0 };
const LABEL_IDLE = { opacity: 0.85, y: 1.5 };

const ICON_SIGNATURE = {
  home: { target: { scale: [1, 1.16, 1], y: [0, -3, 0] }, transition: { duration: 0.5, ease: EASE_OUT } },
  vitals: { target: { scale: [1, 1.22, 1, 1.13, 1] }, transition: { duration: 0.8, ease: EASE_OUT } },
  map: { target: { y: [-7, 0], scale: [1, 1.2, 1] }, transition: { duration: 0.55, ease: EASE_OUT } },
  history: { target: { scale: [1, 1.16, 1], rotate: [0, -7, 0] }, transition: { duration: 0.5, ease: EASE_OUT } },
  clinician: { target: { scale: [1, 1.16, 1] }, transition: { duration: 0.5, ease: EASE_OUT } },
  profile: { target: { scale: [1, 1.14, 1], y: [0, -2, 0] }, transition: { duration: 0.5, ease: EASE_OUT } },
} satisfies Record<Route, { target: Record<string, number[]>; transition: { duration: number; ease: [number, number, number, number] } }>;

interface BottomNavProps {
  route: Route;
  onNavigate: (r: Route) => void;
  showClinical?: boolean;
}

export function BottomNav({ route, onNavigate, showClinical = false }: BottomNavProps) {
  const visibleTabs = tabs.filter(tab => tab.id !== 'clinician' || showClinical);
  // A tap ripple. The counter changes on every tap, so a fresh ring mounts and
  // replays even when the same tab is tapped twice in a row.
  const [ripple, setRipple] = useState<{ id: Route; n: number } | null>(null);
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
      // Leaflet's map panes and controls use z-index 200-1000, so keep the bar
      // above them (map layers must never paint over the nav). Still below the
      // full-screen overlays in App.tsx, which start at z-index 1500.
      zIndex: 1200,
    }}>
      {visibleTabs.map(({ id, icon: Icon, label }) => {
        const active = route === id;
        return (
          <motion.button
            key={id}
            onClick={() => { setRipple(prev => ({ id, n: (prev?.n ?? 0) + 1 })); onNavigate(id); }}
            whileTap={{ scale: 0.94 }}
            transition={SPRING_SNAPPY}
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
              transition: 'color 0.2s ease',
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
                transition={SPRING_SNAPPY}
              />
            )}
            {ripple?.id === id && (
              <motion.span
                key={ripple.n}
                initial={{ opacity: 0.4, scale: 0.4 }}
                animate={{ opacity: 0, scale: 1.8 }}
                transition={{ duration: 0.5, ease: EASE_OUT }}
                style={{
                  position: 'absolute',
                  inset: 0,
                  borderRadius: 14,
                  background: 'radial-gradient(circle, rgba(45,212,164,0.55), rgba(45,212,164,0) 70%)',
                  pointerEvents: 'none',
                }}
              />
            )}
            <motion.span
              animate={active ? ICON_SIGNATURE[id].target : ICON_IDLE}
              transition={active ? ICON_SIGNATURE[id].transition : { duration: DURATION.fast, ease: EASE_OUT }}
              style={{ display: 'grid', placeItems: 'center', position: 'relative' }}
            >
              <Icon
                size={20}
                strokeWidth={active ? 2.2 : 1.8}
                style={{
                  filter: active ? 'drop-shadow(0 0 8px rgba(45,212,164,0.45))' : 'none',
                  transition: 'filter 0.2s ease',
                }}
              />
            </motion.span>
            <motion.span
              animate={active ? LABEL_SELECTED : LABEL_IDLE}
              transition={{ duration: DURATION.fast, ease: EASE_OUT }}
              style={{
                fontSize: 10,
                fontWeight: active ? 700 : 500,
                letterSpacing: '0.01em',
                position: 'relative',
              }}
            >
              {label}
            </motion.span>
          </motion.button>
        );
      })}
    </nav>
  );
}
