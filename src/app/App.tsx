import { lazy, Suspense, useEffect, useState, Component, type ReactNode } from 'react';
import { AnimatePresence } from 'motion/react';
import { Header } from './components/Header';
import { BottomNav, type Route } from './components/BottomNav';
import { HomePage } from './components/HomePage';
import { Onboarding } from './components/Onboarding';
import { AuthGateway } from './components/AuthGateway';
import { apiFetch, clearLocalIdentity, deleteAccount, exportAccountData, getLegacyPatientId, hasPendingLocalReadings, listDependents, logout, restoreSession, syncConsentedReadings, type AuthUser, type ServerDependent } from './api';
import { hasConsent } from './consent';
import { resolveEmergencyNumber } from './emergencyNumber';
import { SELF_SUBJECT, activeSubject, adultScoresAllowed, setActiveSubject } from './dependents';
import { downloadReadingsCsv } from './bpGlucose';
import { downloadContactsCsv } from './emergencyContacts';
import { downloadCsvFile, downloadJsonFile } from './download';
import { useVedaApp, isFirstLaunch } from './useVedaApp';
import type { SummarySection } from './healthSummary';

// Build the selectable summary sections from the user's own recorded data.
// Source labels reflect how each reading was captured; nothing is inferred.
const HISTORY_SOURCE: Record<string, 'camera_estimate' | 'typed_in' | 'device' | 'unknown'> = {
  heart_rate: 'camera_estimate',
  breath_rate: 'camera_estimate',
  respiratory_rate: 'camera_estimate',
  temperature: 'typed_in',
  hydration: 'typed_in',
  sleep: 'typed_in',
  steps: 'device',
  spo2: 'device',
  blood_pressure: 'typed_in',
  blood_glucose: 'typed_in',
};

function buildSummarySections(app: ReturnType<typeof useVedaApp>): SummarySection[] {
  const vitals = app.history.slice(0, 50).map(event => ({
    label: event.type.replace(/_/g, ' '),
    value: `${event.value} ${event.unit}`.trim(),
    source: HISTORY_SOURCE[event.type] ?? 'unknown' as const,
    recordedAt: event.timestamp,
  }));
  return [
    { id: 'vitals', title: 'Vitals', values: vitals },
    { id: 'bp_glucose', title: 'Blood pressure and glucose', values: [] },
    { id: 'medications', title: 'Medications', values: [] },
    { id: 'notes', title: 'Notes', values: [] },
  ];
}

const VitalsPage = lazy(() => import('./components/VitalsPage').then(m => ({ default: m.VitalsPage })));
const MapPage = lazy(() => import('./components/MapPage').then(m => ({ default: m.MapPage })));
const HistoryPage = lazy(() => import('./components/HistoryPage').then(m => ({ default: m.HistoryPage })));
const ProfilePage = lazy(() => import('./components/ProfilePage').then(m => ({ default: m.ProfilePage })));
const SummaryPage = lazy(() => import('./components/SummaryPage').then(m => ({ default: m.SummaryPage })));
const RemindersPage = lazy(() => import('./components/RemindersPage').then(m => ({ default: m.RemindersPage })));
const BpGlucosePage = lazy(() => import('./components/BpGlucosePage').then(m => ({ default: m.BpGlucosePage })));
const EmergencyContactsPage = lazy(() => import('./components/EmergencyContactsPage').then(m => ({ default: m.EmergencyContactsPage })));
const AlertsPage = lazy(() => import('./components/AlertsPage').then(m => ({ default: m.AlertsPage })));
const DetectionPage = lazy(() => import('./components/DetectionPage').then(m => ({ default: m.DetectionPage })));
const ChatPanel = lazy(() => import('./components/ChatPanel').then(m => ({ default: m.ChatPanel })));

class ErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  constructor(props: { children: ReactNode }) { super(props); this.state = { hasError: false }; }
  static getDerivedStateFromError() { return { hasError: true }; }
  render() { if (this.state.hasError) return null; return this.props.children; }
}
function LoadingPane() { return <div style={{ height: '100%', display: 'grid', placeItems: 'center', color: '#5A7A72', fontSize: 12 }}>Loading...</div>; }

export default function App() {
  const [authState, setAuthState] = useState<'checking' | 'logged-out' | 'local' | 'authenticated'>('checking');
  const [user, setUser] = useState<AuthUser | null>(null);
  const [logoutPromptOpen, setLogoutPromptOpen] = useState(false);

  useEffect(() => {
    restoreSession().then(restored => {
      if (restored) {
        setUser(restored);
        setAuthState('authenticated');
      } else {
        setAuthState('logged-out');
      }
    });
  }, []);

  useEffect(() => {
    const handleSessionExpired = () => {
      setUser(null);
      setAuthState('logged-out');
    };
    window.addEventListener('veda:session-expired', handleSessionExpired);
    return () => window.removeEventListener('veda:session-expired', handleSessionExpired);
  }, []);

  // Sync-on-login: once signed in, push any on-device BP/glucose readings the
  // server has not seen, when the user has consented. Best-effort; a failure is
  // retried on the next save or login.
  useEffect(() => {
    if (authState !== 'authenticated' || !user) return;
    const consented = hasConsent(window.localStorage, user.id, 'bp_glucose_logging');
    void syncConsentedReadings(user.id, consented);
  }, [authState, user?.id]);

  if (authState === 'checking') return <div style={{ minHeight: '100dvh', background: '#07101D', display: 'grid', placeItems: 'center', color: '#5A7A72', fontSize: 13 }}>Connecting to VEEDA…</div>;
  if (authState === 'logged-out') return <AuthGateway onAuthenticated={nextUser => { setUser(nextUser); setAuthState('authenticated'); }} onContinueLocally={() => setAuthState('local')} />;

  async function handleLogout() {
    // If there is unsaved, device-only data, warn before we wipe it. A plain
    // confirm() cannot export, so a real prompt is shown instead: it offers an
    // Export CSV action that downloads first, then continues to logout.
    if (hasPendingLocalReadings()) {
      setLogoutPromptOpen(true);
      return;
    }
    await completeLogout();
  }

  async function completeLogout() {
    await logout();
    clearLocalIdentity();
    setLogoutPromptOpen(false);
    setUser(null);
    setAuthState('logged-out');
  }

  // Download the user's on-device readings *before* logout clears them. Runs
  // synchronously, so the file is written while the data still exists.
  function exportReadingsThenLogout() {
    const uid = user?.id ?? 'local';
    const stamp = new Date().toISOString();
    downloadReadingsCsv(window.localStorage, uid, downloadCsvFile, stamp);
    downloadContactsCsv(window.localStorage, uid, downloadCsvFile, stamp);
    void completeLogout();
  }

  async function handleExportAccount(): Promise<string | null> {
    const data = await exportAccountData();
    if (!data) return null;
    const stamp = new Date().toISOString().slice(0, 10);
    downloadJsonFile(`veeda-account-${stamp}.json`, data);
    return `veeda-account-${stamp}.json`;
  }

  return (
    <>
      <VedaShell user={user} authenticated={authState === 'authenticated'} onLogout={handleLogout} onExportAccount={handleExportAccount} />
      {logoutPromptOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 2100, background: 'rgba(0,0,0,0.7)', display: 'grid', placeItems: 'center', padding: 24 }}>
          <div style={{ width: '100%', maxWidth: 360, background: '#0D1525', border: '1px solid rgba(239,159,39,0.45)', borderRadius: 20, padding: 22, color: '#E2F4F0' }}>
            <div style={{ fontSize: 17, fontWeight: 800, marginBottom: 8 }}>Readings are stored on this device</div>
            <div style={{ color: '#5A7A72', fontSize: 12, lineHeight: 1.5 }}>
              You have readings saved on this device that aren't in your account. Logging out removes them for good.
              Export a CSV first if you want to keep a copy.
            </div>
            <button onClick={exportReadingsThenLogout}
              style={{ width: '100%', padding: 12, borderRadius: 12, border: 0, background: '#2DD4A4', color: '#04342C', fontWeight: 800, cursor: 'pointer', marginTop: 18 }}>
              Export CSV &amp; log out
            </button>
            <button onClick={() => void completeLogout()}
              style={{ width: '100%', padding: 11, borderRadius: 12, border: '1px solid rgba(255,255,255,0.1)', background: 'transparent', color: '#E2F4F0', cursor: 'pointer', marginTop: 8 }}>
              Log out without exporting
            </button>
            <button onClick={() => setLogoutPromptOpen(false)}
              style={{ width: '100%', padding: 11, borderRadius: 12, border: '1px solid rgba(255,255,255,0.1)', background: 'transparent', color: '#5A7A72', cursor: 'pointer', marginTop: 8 }}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </>
  );
}

function VedaShell({ user, authenticated, onLogout, onExportAccount }: { user: AuthUser | null; authenticated: boolean; onLogout: () => Promise<void>; onExportAccount?: () => Promise<string | null> }) {
  const [route, setRoute] = useState<Route>('home');
  const [chatOpen, setChatOpen] = useState(false);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [remindersOpen, setRemindersOpen] = useState(false);
  const [bpGlucoseOpen, setBpGlucoseOpen] = useState(false);
  const [contactsOpen, setContactsOpen] = useState(false);
  const [alertsOpen, setAlertsOpen] = useState(false);
  const [detectionOpen, setDetectionOpen] = useState(false);
  const [onboarded, setOnboarded] = useState(() => !isFirstLaunch());
  const [dependents, setDependents] = useState<ServerDependent[]>([]);
  const [activeSubjectId, setActiveSubjectId] = useState<string>(() => (user ? activeSubject(window.localStorage, user.id) : SELF_SUBJECT));
  const app = useVedaApp();
  const emergencyMode = app.analysis?.riskLevel === 'Urgent';
  const [legacyId, setLegacyId] = useState<string | null>(() => authenticated ? getLegacyPatientId() : null);
  const [claimMessage, setClaimMessage] = useState('');
  const claimKey = user ? `veda_legacy_claimed:${user.id}` : '';

  useEffect(() => {
    if (!authenticated || !user || !claimKey || localStorage.getItem(claimKey)) setLegacyId(null);
  }, [authenticated, user, claimKey]);

  // Load this guardian's family profiles once signed in, and keep the selected
  // subject valid (fall back to the account owner if it no longer exists).
  useEffect(() => {
    if (!authenticated || !user) { setDependents([]); return; }
    let cancelled = false;
    void listDependents().then(list => {
      if (cancelled) return;
      setDependents(list);
      setActiveSubjectId(current => (current === SELF_SUBJECT || list.some(d => d.id === current)) ? current : SELF_SUBJECT);
    });
    return () => { cancelled = true; };
  }, [authenticated, user?.id]);

  function chooseSubject(id: string) {
    setActiveSubjectId(id);
    if (user) setActiveSubject(window.localStorage, user.id, id);
  }

  // Adult-only scores (NEWS2/qSOFA) are shown only for the account owner or a
  // dependant known to be at/above the configured adult cutoff. A child or an
  // unknown age gets "not validated for children" instead.
  const activeDependent = dependents.find(d => d.id === activeSubjectId) || null;
  const scoresAllowed = activeSubjectId === SELF_SUBJECT || adultScoresAllowed(activeDependent?.age ?? null);

  async function claimLegacyId() {
    if (!legacyId) return;
    const result = await apiFetch<{ ok?: boolean; error?: string }>('/auth/claim-legacy-id', { method: 'POST', body: JSON.stringify({ legacy_patient_id: legacyId }) });
    if (result?.ok) {
      localStorage.setItem(claimKey, '1');
      setLegacyId(null);
      return;
    }
    setClaimMessage('This legacy ID could not be linked. You can continue with your new account.');
  }

  function skipLegacyId() {
    if (claimKey) localStorage.setItem(claimKey, '1');
    setLegacyId(null);
  }

  function handleOnboardingComplete(name: string, age: number, weight: number, height: number, sex: string) {
    app.saveProfile({ name, age, weight, height, sex });
    setOnboarded(true);
  }

  if (!onboarded) return <Onboarding onComplete={handleOnboardingComplete} />;

  return (
    <div style={{ minHeight: '100dvh', background: 'radial-gradient(circle at 18% 10%, rgba(45,212,164,0.18), transparent 30%),radial-gradient(circle at 86% 16%, rgba(55,138,221,0.16), transparent 28%),radial-gradient(circle at 50% 100%, rgba(45,212,164,0.08), transparent 34%),' + (emergencyMode ? '#170608' : '#07101D') }}>
      <div style={{ maxWidth: 390, margin: '0 auto', minHeight: '100dvh', display: 'flex', flexDirection: 'column', background: emergencyMode ? 'rgba(22,6,8,0.95)' : 'rgba(9,14,26,0.88)', position: 'relative', overflow: 'hidden', borderLeft: emergencyMode ? '2px solid rgba(226,75,74,0.7)' : '0.5px solid rgba(255,255,255,0.04)', borderRight: emergencyMode ? '2px solid rgba(226,75,74,0.7)' : '0.5px solid rgba(255,255,255,0.04)', boxShadow: emergencyMode ? '0 0 0 4px rgba(226,75,74,0.22), 0 0 90px rgba(226,75,74,0.22)' : '0 0 80px rgba(0,0,0,0.5)' }}>
          <Header wellnessScore={app.wellnessScore} status={app.backendStatus} riskLevel={app.analysis?.riskLevel ?? null}
            subjects={[{ id: SELF_SUBJECT, label: 'Me' }, ...dependents.map(d => ({ id: d.id, label: d.display_name }))]}
            activeSubjectId={activeSubjectId} onSelectSubject={chooseSubject} />
        <main style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
          <ErrorBoundary><Suspense fallback={<LoadingPane />}><AnimatePresence mode="wait" initial={false}>
            {route === 'home' && <div key="home" style={{ position: 'absolute', inset: 0 }}><HomePage app={app} onOpenChat={() => setChatOpen(true)} /></div>}
            {route === 'vitals' && <div key="vitals" style={{ position: 'absolute', inset: 0 }}><VitalsPage app={app} /></div>}
            {route === 'map' && <div key="map" style={{ position: 'absolute', inset: 0 }}><MapPage location={app.location} onOpenContacts={() => setContactsOpen(true)} /></div>}
            {route === 'history' && <div key="history" style={{ position: 'absolute', inset: 0 }}><HistoryPage history={app.history} onRefresh={app.fetchHistory} /></div>}
            {route === 'profile' && <div key="profile" style={{ position: 'absolute', inset: 0 }}><ProfilePage profile={app.profile!} saveProfile={app.saveProfile} userEmail={user?.email} onLogout={authenticated ? onLogout : undefined} onOpenSummary={() => setSummaryOpen(true)} onOpenReminders={() => setRemindersOpen(true)} onOpenBpGlucose={() => setBpGlucoseOpen(true)} onOpenContacts={() => setContactsOpen(true)} onOpenAlerts={() => setAlertsOpen(true)} onOpenDetection={() => setDetectionOpen(true)} onExportData={onExportAccount} onDeleteAccount={deleteAccount} /></div>}
          </AnimatePresence></Suspense></ErrorBoundary>
        </main>
        <BottomNav route={route} onNavigate={setRoute} showClinical={false} />
      </div>
      <Suspense fallback={null}>{summaryOpen && <SummaryPage open={summaryOpen} onClose={() => setSummaryOpen(false)} userId={user?.id ?? 'local'} sections={buildSummarySections(app)} />}</Suspense>
      <Suspense fallback={null}>{remindersOpen && <RemindersPage open={remindersOpen} onClose={() => setRemindersOpen(false)} userId={user?.id ?? 'local'} />}</Suspense>
      <Suspense fallback={null}>{bpGlucoseOpen && <BpGlucosePage open={bpGlucoseOpen} onClose={() => setBpGlucoseOpen(false)} userId={user?.id ?? 'local'} />}</Suspense>
      <Suspense fallback={null}>{contactsOpen && <EmergencyContactsPage open={contactsOpen} onClose={() => setContactsOpen(false)} userId={user?.id ?? 'local'} locationText={app.location.lat != null && app.location.lng != null ? `${app.location.lat.toFixed(4)}, ${app.location.lng.toFixed(4)}` : undefined} userName={app.profile?.name} />}</Suspense>
      <Suspense fallback={null}>{alertsOpen && <AlertsPage pack={null} triggered={[]} production={(import.meta as unknown as { env?: { PROD?: boolean } }).env?.PROD === true} emergencyNumber={resolveEmergencyNumber()} onClose={() => setAlertsOpen(false)} />}</Suspense>
      <Suspense fallback={null}>{detectionOpen && <DetectionPage configs={{}} baseline={null} onClose={() => setDetectionOpen(false)} />}</Suspense>
      <Suspense fallback={null}>{chatOpen && <ChatPanel open={chatOpen} onClose={() => setChatOpen(false)} vitals={app.vitals} analysis={app.analysis} wellnessScore={app.wellnessScore} profile={app.profile} saveBiometric={app.saveBiometric} adultScoresAllowed={scoresAllowed} subjectLabel={activeDependent?.display_name} />}</Suspense>
      {legacyId && <div style={{ position: 'fixed', inset: 0, zIndex: 2000, background: 'rgba(0,0,0,0.7)', display: 'grid', placeItems: 'center', padding: 24 }}>
        <div style={{ width: '100%', maxWidth: 360, background: '#0D1525', border: '1px solid rgba(45,212,164,0.35)', borderRadius: 20, padding: 22, color: '#E2F4F0' }}>
          <div style={{ fontSize: 17, fontWeight: 800, marginBottom: 8 }}>Link previous VEEDA data?</div>
          <div style={{ color: '#5A7A72', fontSize: 12, lineHeight: 1.5 }}>This browser has an older local patient ID. Link it to your signed-in account so protected history can recognize it.</div>
          {claimMessage && <div style={{ color: '#EF9F27', fontSize: 11, marginTop: 10 }}>{claimMessage}</div>}
          <div style={{ display: 'flex', gap: 8, marginTop: 18 }}>
            <button onClick={skipLegacyId} style={{ flex: 1, padding: 11, borderRadius: 10, border: '1px solid rgba(255,255,255,0.1)', background: 'transparent', color: '#E2F4F0', cursor: 'pointer' }}>Not now</button>
            <button onClick={claimLegacyId} style={{ flex: 1, padding: 11, borderRadius: 10, border: 0, background: '#2DD4A4', color: '#04342C', fontWeight: 800, cursor: 'pointer' }}>Link data</button>
          </div>
        </div>
      </div>}
    </div>
  );
}
