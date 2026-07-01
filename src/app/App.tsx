import { lazy, Suspense, useState, Component, type ReactNode } from 'react';
import { AnimatePresence } from 'motion/react';
import { Header } from './components/Header';
import { BottomNav, type Route } from './components/BottomNav';
import { HomePage } from './components/HomePage';
import { Onboarding } from './components/Onboarding';
import { useVedaApp, isFirstLaunch } from './useVedaApp';
import { LoginGateway } from './components/LoginGateway';

const VitalsPage = lazy(() => import('./components/VitalsPage').then(m => ({ default: m.VitalsPage })));
const MapPage = lazy(() => import('./components/MapPage').then(m => ({ default: m.MapPage })));
const HistoryPage = lazy(() => import('./components/HistoryPage').then(m => ({ default: m.HistoryPage })));
const ProfilePage = lazy(() => import('./components/ProfilePage').then(m => ({ default: m.ProfilePage })));
const ChatPanel = lazy(() => import('./components/ChatPanel').then(m => ({ default: m.ChatPanel })));
const ClinicianDashboard = lazy(() => import('./components/ClinicianDashboard').then(m => ({ default: m.ClinicianDashboard })));

class ErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  render() {
    if (this.state.hasError) {
      return null;
    }
    return this.props.children;
  }
}

function LoadingPane() {
  return (
    <div style={{ height: '100%', display: 'grid', placeItems: 'center', color: '#5A7A72', fontSize: 12 }}>
      Loading...
    </div>
  );
}

export default function App() {
  const [route, setRoute] = useState<Route>('home');
  const [chatOpen, setChatOpen] = useState(false);
  const [onboarded, setOnboarded] = useState(() => !isFirstLaunch());
  const [institutionalReady, setInstitutionalReady] = useState(() => localStorage.getItem('veda_session_ready') === 'true');
  const app = useVedaApp();
  const emergencyMode = app.analysis?.riskLevel === 'Urgent';
  const showClinical = ['nurse', 'attending', 'system_admin'].includes(app.actor.role);

  function handleOnboardingComplete(name: string, age: number, weight: number, height: number, sex: string) {
    app.saveProfile({ name, age, weight, height, sex });
    setOnboarded(true);
  }

  if (!onboarded) {
    return <Onboarding onComplete={handleOnboardingComplete} />;
  }

  if (!institutionalReady) {
    return <LoginGateway onContinue={() => {
      localStorage.setItem('veda_session_ready', 'true');
      setInstitutionalReady(true);
    }} />;
  }

  return (
    <div style={{
      minHeight: '100dvh',
      background:
        'radial-gradient(circle at 18% 10%, rgba(45,212,164,0.18), transparent 30%),' +
        'radial-gradient(circle at 86% 16%, rgba(55,138,221,0.16), transparent 28%),' +
        'radial-gradient(circle at 50% 100%, rgba(45,212,164,0.08), transparent 34%),' +
        (emergencyMode ? '#170608' : '#07101D'),
    }}>
      <div style={{
        maxWidth: 390, margin: '0 auto', minHeight: '100dvh',
        display: 'flex', flexDirection: 'column',
        background: emergencyMode ? 'rgba(22,6,8,0.95)' : 'rgba(9,14,26,0.88)', position: 'relative', overflow: 'hidden',
        borderLeft: emergencyMode ? '2px solid rgba(226,75,74,0.7)' : '0.5px solid rgba(255,255,255,0.04)',
        borderRight: emergencyMode ? '2px solid rgba(226,75,74,0.7)' : '0.5px solid rgba(255,255,255,0.04)',
        boxShadow: emergencyMode ? '0 0 0 4px rgba(226,75,74,0.22), 0 0 90px rgba(226,75,74,0.22)' : '0 0 80px rgba(0,0,0,0.5)',
      }}>
        <Header
          wellnessScore={app.wellnessScore}
          status={app.backendStatus}
          riskLevel={app.analysis?.riskLevel ?? null}
        />

        <main style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
          <ErrorBoundary>
          <Suspense fallback={<LoadingPane />}>
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
              {route === 'clinician' && showClinical && (
                <div key="clinician" style={{ position: 'absolute', inset: 0 }}>
                  <ClinicianDashboard history={app.history} />
                </div>
              )}
              {route === 'profile' && (
                <div key="profile" style={{ position: 'absolute', inset: 0 }}>
                  <ProfilePage profile={app.profile!} saveProfile={app.saveProfile} />
                </div>
              )}
            </AnimatePresence>
          </Suspense>
          </ErrorBoundary>
        </main>

        <BottomNav route={route} onNavigate={setRoute} showClinical={showClinical} />
      </div>

      <Suspense fallback={null}>
        {chatOpen && (
          <ChatPanel
            open={chatOpen}
            onClose={() => setChatOpen(false)}
            vitals={app.vitals}
            analysis={app.analysis}
            wellnessScore={app.wellnessScore}
            profile={app.profile}
            saveBiometric={app.saveBiometric}
          />
        )}
      </Suspense>
    </div>
  );
}
