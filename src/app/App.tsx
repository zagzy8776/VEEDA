import { useState } from 'react';
import { AnimatePresence } from 'motion/react';
import { Header } from './components/Header';
import { BottomNav, type Route } from './components/BottomNav';
import { HomePage } from './components/HomePage';
import { VitalsPage } from './components/VitalsPage';
import { MapPage } from './components/MapPage';
import { HistoryPage } from './components/HistoryPage';
import { ProfilePage } from './components/ProfilePage';
import { ChatPanel } from './components/ChatPanel';

const mockVitals = {
  heartRate: 72,
  respiratory: 16,
  oxygen: 97,
  stamina: 78,
  hydration: 72,
  skinTemp: 36.8,
};

const mockEnv = {
  temp: '28°C',
  air: 'Good',
  weather: 'Clear',
  gps: 'Active',
};

export default function App() {
  const [route, setRoute] = useState<Route>('home');
  const [chatOpen, setChatOpen] = useState(false);
  const wellnessScore = 82;

  return (
    <div
      style={{
        minHeight: '100dvh',
        background:
          'radial-gradient(circle at 18% 10%, rgba(45,212,164,0.18), transparent 30%),' +
          'radial-gradient(circle at 86% 16%, rgba(55,138,221,0.16), transparent 28%),' +
          'radial-gradient(circle at 50% 100%, rgba(45,212,164,0.08), transparent 34%),' +
          '#07101D',
      }}
    >
      {/* Phone shell */}
      <div
        style={{
          maxWidth: 390,
          margin: '0 auto',
          minHeight: '100dvh',
          display: 'flex',
          flexDirection: 'column',
          background: 'rgba(9,14,26,0.88)',
          backdropFilter: 'blur(0px)',
          position: 'relative',
          overflow: 'hidden',
          borderLeft: '0.5px solid rgba(255,255,255,0.04)',
          borderRight: '0.5px solid rgba(255,255,255,0.04)',
          boxShadow: '0 0 80px rgba(0,0,0,0.5)',
        }}
      >
        <Header wellnessScore={wellnessScore} status="online" />

        {/* Page content */}
        <main style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
          <AnimatePresence mode="wait" initial={false}>
            {route === 'home' && (
              <div key="home" style={{ position: 'absolute', inset: 0 }}>
                <HomePage
                  onOpenChat={() => setChatOpen(true)}
                  vitals={mockVitals}
                  env={mockEnv}
                  wellnessScore={wellnessScore}
                />
              </div>
            )}
            {route === 'vitals' && (
              <div key="vitals" style={{ position: 'absolute', inset: 0 }}>
                <VitalsPage vitals={mockVitals} />
              </div>
            )}
            {route === 'map' && (
              <div key="map" style={{ position: 'absolute', inset: 0 }}>
                <MapPage />
              </div>
            )}
            {route === 'history' && (
              <div key="history" style={{ position: 'absolute', inset: 0 }}>
                <HistoryPage />
              </div>
            )}
            {route === 'profile' && (
              <div key="profile" style={{ position: 'absolute', inset: 0 }}>
                <ProfilePage />
              </div>
            )}
          </AnimatePresence>
        </main>

        <BottomNav route={route} onNavigate={setRoute} />
      </div>

      <ChatPanel open={chatOpen} onClose={() => setChatOpen(false)} />
    </div>
  );
}

