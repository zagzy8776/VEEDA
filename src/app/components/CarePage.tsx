import { useState } from 'react';
import { Building2, CalendarPlus, MapPin } from 'lucide-react';
import { findCare, bookingState, type CarePlace } from '../care.ts';
import { notAvailableLine } from '../packText.ts';

// Connection-to-care surface (Phase 7): find a lab/pharmacy, book a doctor, and
// (for a clinician) the review queue. Prices, stock and booking all come only from a
// configured partner; nothing is invented.

const C = {
  teal: '#2DD4A4', blue: '#378ADD', amber: '#EF9F27', red: '#E24B4A',
  text: '#E2F4F0', muted: '#5A7A72', card: 'rgba(13,21,37,0.88)', border: 'rgba(255,255,255,0.08)',
};

export interface CarePageProps {
  production: boolean;
  /** Configured care-partner endpoint (empty => unknown prices/stock, booking off). */
  partnerEndpoint?: string;
  emergencyNumber?: string | null;
  onClose?: () => void;
}

export function CarePage({ production, partnerEndpoint = '', emergencyNumber, onClose }: CarePageProps) {
  const [query, setQuery] = useState('');
  const [places, setPlaces] = useState<CarePlace[]>([]);
  const booking = bookingState({ production, requested: true, configured: partnerEndpoint });
  const unavailable = notAvailableLine(emergencyNumber);

  const search = async () => {
    // A map/search UI would supply the surrounding places; this stays honest and
    // returns whatever a configured partner provides, otherwise nothing priced.
    const result = await findCare(query, {
      endpoint: partnerEndpoint,
      fetchImpl: partnerEndpoint ? fetch : undefined,
    }, []);
    setPlaces(result);
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1500, background: '#0A1120', overflowY: 'auto', padding: 18, color: C.text }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <div style={{ fontSize: 18, fontWeight: 800 }}>Find care</div>
        {onClose && (
          <button onClick={onClose} style={{ background: 'transparent', border: `1px solid ${C.border}`, color: C.text, borderRadius: 8, padding: '6px 10px', cursor: 'pointer' }}>
            Close
          </button>
        )}
      </div>

      <Card icon={MapPin} title="Labs & pharmacies">
        <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search nearby labs or pharmacies"
            style={{ flex: 1, padding: 9, borderRadius: 8, border: `1px solid ${C.border}`, background: 'transparent', color: C.text }}
          />
          <button onClick={search} style={{ padding: '9px 14px', borderRadius: 8, border: 0, background: C.teal, color: '#04342C', fontWeight: 800, cursor: 'pointer' }}>
            Search
          </button>
        </div>
        {places.length === 0 ? (
          <div style={{ color: C.muted, fontSize: 12, lineHeight: 1.5 }}>
            {partnerEndpoint
              ? 'No results from the configured partner right now.'
              : 'Prices and stock are shown only from a configured partner. There is none, so results stay unknown.'}
          </div>
        ) : places.map(p => (
          <div key={p.id} style={{ fontSize: 12, marginBottom: 8 }}>
            <span style={{ fontWeight: 600 }}>{p.name}</span>
            <span style={{ color: C.muted }}> · {p.kind} · source: {p.source}</span>
            {p.prices?.map((price, i) => <div key={i} style={{ color: C.muted }}>{price.label}: {price.amount}</div>)}
            {p.stock?.map((s, i) => <div key={i} style={{ color: C.muted }}>{s.label}: {s.inStock ? 'in stock' : 'out of stock'}</div>)}
          </div>
        ))}
      </Card>

      <Card icon={CalendarPlus} title="Book a doctor">
        {booking.available ? (
          <div style={{ color: C.text, fontSize: 12 }}>Booking is enabled with the configured partner.</div>
        ) : (
          <div style={{ color: C.muted, fontSize: 12, lineHeight: 1.5 }}>{booking.reason}</div>
        )}
        <div style={{ color: C.muted, fontSize: 11, marginTop: 8 }}>{unavailable}</div>
      </Card>

      <Card icon={Building2} title="Clinician review queue">
        <div style={{ color: C.muted, fontSize: 12, lineHeight: 1.5 }}>
          Requests that need a human are placed on a queue (backend, role-gated, with an SLA and reviewer
          sign-off). Nothing is auto-answered; a licensed clinician resolves every item.
        </div>
      </Card>
    </div>
  );
}

function Card({ icon: Icon, title, children }: { icon: typeof MapPin; title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 14, marginBottom: 10 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', fontWeight: 700, fontSize: 14, marginBottom: 8 }}>
        <Icon size={16} color={C.teal} /> {title}
      </div>
      {children}
    </div>
  );
}
