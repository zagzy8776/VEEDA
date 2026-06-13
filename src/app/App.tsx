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
import { Onboarding } from './components/Onboarding';
import { useVedaApp, isFirstLaunch } from './useVedaApp';

export default function App() {
  const [route, setRoute] = useState<Route>('home');
  const [chatOpen, setChatOpen] = useState(false);
  const [onboarded, setOnboarded] = useState(() => !isFirstLaunch());
  const app = useVedaApp();

  function handleOnboardingComplete(name: string, age: number, weight: number, height: number, sex: string) {
    app.saveProfile({ name, age, weight, height, sex });
    setOnboarded(true);
  }

  if (!onboarded) {
    return <Onboarding onComplete={handleOnboardingComplete} />;
  }

  return (
    <div style={{
      minHeight: '100dvh',
      background:
        'radial-gradient(circle at 18% 10%, rgba(45,212,164,0.18), transparent 30%),' +
        'radial-gradient(circle at 86% 16%, rgba(55,138,221,0.16), transparent 28%),' +
        'radial-gradient(circle at 50% 100%, rgba(45,212,164,0.08), transparent 34%),' +
        '#07101D',
    }}>
      <div style={{
        maxWidth: 390, margin: '0 auto', minHeight: '100dvh',
        display: 'flex', flexDirection: 'column',
        background: 'rgba(9,14,26,0.88)', position: 'relative', overflow: 'hidden',
        borderLeft: '0.5px solid rgba(255,255,255,0.04)',
        borderRight: '0.5px solid rgba(255,255,255,0.04)',
        boxShadow: '0 0 80px rgba(0,0,0,0.5)',
      }}>
        <Header
          wellnessScore={app.wellnessScore}
          status={app.backendStatus}
          riskLevel={app.analysis?.riskLevel ?? null}
        />

        <main style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
          <AnimatePresence mode="wait" initial={false}>
            {route === 'home' && (
              <div key="home" style={{ position: 'absolute', inset: 0 }}>
                <HomePage app={app} onOpenChat={() => setChatOpen(true)} />
              </div>
            )}
            {route === 'vitals' && (
              <div key="vitals" style={{ position: 'absolute', inset: 0 }}>
                <VitalsPage app={app} />
              </div>
            )}
            {route === 'map' && (
              <div key="map" style={{ position: 'absolute', inset: 0 }}>
                <MapPage location={app.location} />
              </div>
            )}
            {route === 'history' && (
              <div key="history" style={{ position: 'absolute', inset: 0 }}>
                <HistoryPage history={app.history} onRefresh={app.fetchHistory} />
              </div>
            )}
            {route === 'profile' && (
              <div key="profile" style={{ position: 'absolute', inset: 0 }}>
                <ProfilePage profile={app.profile!} saveProfile={app.saveProfile} />
              </div>
            )}
          </AnimatePresence>
        </main>

        <BottomNav route={route} onNavigate={setRoute} />
      </div>

      <ChatPanel
        open={chatOpen}
        onClose={() => setChatOpen(false)}
        vitals={app.vitals}
        analysis={app.analysis}
        wellnessScore={app.wellnessScore}
        profile={app.profile}
        saveBiometric={app.saveBiometric}
      />
    </div>
  );
}
