import { useState } from 'react';
import { CloudOff, Languages, MessageSquare, Wifi } from 'lucide-react';
import { isOffline, lowDataPolicy, ussdSession, loadQueue, type UssdProvider } from '../access.ts';
import { SUPPORTED_LANGUAGES } from '../languagePacks.ts';

// Access surface (Phase 8): offline mode, low-data mode, languages, USSD/SMS.
//
// Everything reflects real state: offline is read from the browser, low-data trims
// uploads, and the USSD fallback stays "not available" with no short code until a
// provider is configured.

const C = {
  teal: '#2DD4A4', blue: '#378ADD', amber: '#EF9F27', red: '#E24B4A',
  text: '#E2F4F0', muted: '#5A7A72', card: 'rgba(13,21,37,0.88)', border: 'rgba(255,255,255,0.08)',
};

export interface AccessPageProps {
  userId: string;
  storage?: { getItem(k: string): string | null };
  provider?: UssdProvider | null;
  onClose?: () => void;
}

export function AccessPage({ userId, storage, provider = null, onClose }: AccessPageProps) {
  const [lowData, setLowData] = useState(false);
  const [connectivity, setConnectivity] = useState<'unknown' | 'online' | 'offline'>('unknown');
  const queued = storage ? loadQueue(storage, userId).length : 0;
  const policy = lowDataPolicy(lowData, false);
  const ussd = ussdSession(provider);

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1500, background: '#0A1120', overflowY: 'auto', padding: 18, color: C.text }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <div style={{ fontSize: 18, fontWeight: 800 }}>Access & offline</div>
        {onClose && (
          <button onClick={onClose} style={{ background: 'transparent', border: `1px solid ${C.border}`, color: C.text, borderRadius: 8, padding: '6px 10px', cursor: 'pointer' }}>
            Close
          </button>
        )}
      </div>

      <Card icon={Wifi} title="Offline mode">
        <div style={{ color: C.muted, fontSize: 12, lineHeight: 1.5 }}>
          Core checks and logging work offline. Entries are saved on your device and sent when you are
          back online — {queued} waiting to sync.
        </div>
        <button
          onClick={() => setConnectivity(isOffline((navigator as unknown as { onLine?: boolean })) ? 'offline' : 'online')}
          style={{ marginTop: 10, padding: '9px 14px', borderRadius: 8, border: `1px solid ${C.border}`, background: 'transparent', color: C.text, cursor: 'pointer' }}
        >
          Check connection
        </button>
        {connectivity !== 'unknown' && (
          <div style={{ fontSize: 12, marginTop: 8, color: connectivity === 'online' ? C.teal : C.amber }}>
            {connectivity === 'online' ? 'Online — queued entries will sync.' : 'Offline — entries stay queued on your device.'}
          </div>
        )}
      </Card>

      <Card icon={CloudOff} title="Low-data mode">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button
            onClick={() => setLowData(v => !v)}
            style={{ padding: '8px 12px', borderRadius: 8, border: 0, background: lowData ? C.teal : C.border, color: lowData ? '#04342C' : C.text, fontWeight: 700, cursor: 'pointer' }}
          >
            {lowData ? 'On' : 'Off'}
          </button>
          <div style={{ color: C.muted, fontSize: 12 }}>
            Sends small batches ({policy.batchSize}), no images, and no maps unless you ask.
          </div>
        </div>
      </Card>

      <Card icon={Languages} title="Languages">
        <div style={{ color: C.muted, fontSize: 12, lineHeight: 1.5 }}>
          {SUPPORTED_LANGUAGES.map(l => l.label).join(', ')}. A language pack is loaded only when it has been
          reviewed; otherwise the app stays in English. Voice input and replies use the browser where supported.
        </div>
      </Card>

      <Card icon={MessageSquare} title="USSD / SMS fallback">
        <div style={{ color: ussd.available ? C.text : C.muted, fontSize: 12, lineHeight: 1.5 }}>
          {ussd.available ? `Available via short code ${ussd.shortCode}.` : ussd.reason}
        </div>
      </Card>
    </div>
  );
}

function Card({ icon: Icon, title, children }: { icon: typeof Wifi; title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 14, marginBottom: 10 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', fontWeight: 700, fontSize: 14, marginBottom: 8 }}>
        <Icon size={16} color={C.teal} /> {title}
      </div>
      {children}
    </div>
  );
}
