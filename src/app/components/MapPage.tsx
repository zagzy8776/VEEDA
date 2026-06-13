import { motion, AnimatePresence } from 'motion/react';
import { Search, Navigation, MapPin, Phone, Route as RouteIcon, Star, Hospital, Pill, Stethoscope, Loader, AlertTriangle, X } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';
import type { Location } from '../useVedaApp';

const C = { teal: '#2DD4A4', blue: '#378ADD', amber: '#EF9F27', red: '#E24B4A', text: '#E2F4F0', muted: '#5A7A72', card: 'rgba(13,21,37,0.9)', border: 'rgba(255,255,255,0.09)' };

interface Place { id: number; name: string; type: string; dist: string; distM: number; lat: number; lng: number; }

const typeStyle: Record<string, { color: string; bg: string; icon: typeof Hospital }> = {
  hospital: { color: C.red,   bg: 'rgba(226,75,74,0.15)',   icon: Hospital    },
  pharmacy: { color: C.blue,  bg: 'rgba(55,138,221,0.15)',  icon: Pill        },
  clinic:   { color: C.amber, bg: 'rgba(239,159,39,0.15)',  icon: Stethoscope },
};

function distBetween(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6371000, toR = (x: number) => x * Math.PI / 180;
  const dLat = toR(lat2 - lat1), dLng = toR(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toR(lat1)) * Math.cos(toR(lat2)) * Math.sin(dLng / 2) ** 2;
  return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}
function fmtDist(m: number) { return m < 1000 ? `${m}m` : `${(m / 1000).toFixed(1)}km`; }

// SOS countdown modal
function SOSModal({ onCancel }: { onCancel: () => void }) {
  const [count, setCount] = useState(10);
  useEffect(() => {
    const t = setInterval(() => setCount(c => { if (c <= 1) { window.location.href = 'tel:112'; return 0; } return c - 1; }), 1000);
    return () => clearInterval(t);
  }, []);
  const circ = 2 * Math.PI * 44;
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.9)', zIndex: 9000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
        style={{ background: '#0a0f1c', border: '1px solid rgba(226,75,74,0.4)', borderRadius: 24, padding: 32, textAlign: 'center', width: '100%', maxWidth: 320 }}>
        <div style={{ fontSize: 13, color: C.red, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 20 }}>⚠ Emergency SOS</div>
        <div style={{ position: 'relative', width: 110, height: 110, margin: '0 auto 20px' }}>
          <svg width="110" height="110" viewBox="0 0 100 100" style={{ transform: 'rotate(-90deg)' }}>
            <circle cx="50" cy="50" r="44" fill="none" stroke="rgba(226,75,74,0.15)" strokeWidth="7" />
            <circle cx="50" cy="50" r="44" fill="none" stroke={C.red} strokeWidth="7"
              strokeDasharray={circ} strokeDashoffset={circ * (1 - count / 10)} strokeLinecap="round" style={{ transition: 'stroke-dashoffset 0.9s linear' }} />
          </svg>
          <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ fontSize: 32, fontWeight: 800, color: C.red }}>{count}</div>
          </div>
        </div>
        <p style={{ fontSize: 13, color: C.muted, marginBottom: 20, lineHeight: 1.6 }}>Calling emergency services (112) in <strong style={{ color: C.text }}>{count} seconds</strong>.</p>
        <div style={{ display: 'flex', gap: 10 }}>
          <a href="tel:112" style={{ flex: 1, padding: '13px', background: C.red, color: '#fff', borderRadius: 12, fontSize: 13, fontWeight: 700, textDecoration: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
            <Phone size={14} /> Call Now
          </a>
          <button onClick={onCancel} style={{ flex: 1, padding: '13px', background: 'rgba(255,255,255,0.08)', color: C.muted, borderRadius: 12, fontSize: 13, fontWeight: 700, border: 'none', cursor: 'pointer' }}>Cancel</button>
        </div>
      </motion.div>
    </div>
  );
}

export function MapPage({ location }: { location: Location }) {
  const mapRef = useRef<HTMLDivElement>(null);
  const leafletRef = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const [search, setSearch] = useState('');
  const [places, setPlaces] = useState<Place[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);
  const [streetAddress, setStreetAddress] = useState<string>('');
  const [showSOS, setShowSOS] = useState(false);
  const [favorites, setFavorites] = useState<number[]>(() => {
    try { return JSON.parse(localStorage.getItem('veda_fav_places') || '[]'); } catch { return []; }
  });

  // Load Leaflet dynamically
  useEffect(() => {
    if (!mapRef.current || leafletRef.current) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
    document.head.appendChild(link);

    const script = document.createElement('script');
    script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
    script.onload = () => initMap();
    document.head.appendChild(script);
  }, []);

  function initMap() {
    if (!mapRef.current || !(window as any).L) return;
    const L = (window as any).L;
    const lat = location.lat ?? 6.5244;
    const lng = location.lng ?? 3.3792;

    const map = L.map(mapRef.current, { zoomControl: true }).setView([lat, lng], 15);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
      attribution: '© OpenStreetMap © CARTO', maxZoom: 19,
    }).addTo(map);

    // User marker
    const userIcon = L.divIcon({ className: '', html: `<div style="width:16px;height:16px;background:#2DD4A4;border:3px solid #0a1322;border-radius:50%;box-shadow:0 0 0 4px rgba(45,212,164,0.3)"></div>`, iconSize: [16, 16], iconAnchor: [8, 8] });
    markerRef.current = L.marker([lat, lng], { icon: userIcon }).addTo(map);
    leafletRef.current = map;

    // Filter tiles brightness for dark theme
    const pane = map.getPane('tilePane') as HTMLElement;
    if (pane) pane.style.filter = 'brightness(0.75) contrast(1.1) saturate(0.9)';
  }

  // Update map position when GPS changes
  useEffect(() => {
    if (!leafletRef.current || !location.lat || !(window as any).L) return;
    const L = (window as any).L;
    const { lat, lng } = location;
    leafletRef.current.setView([lat, lng], 15);
    const userIcon = L.divIcon({ className: '', html: `<div style="width:16px;height:16px;background:#2DD4A4;border:3px solid #0a1322;border-radius:50%;box-shadow:0 0 0 4px rgba(45,212,164,0.3)"></div>`, iconSize: [16, 16], iconAnchor: [8, 8] });
    if (markerRef.current) markerRef.current.remove();
    markerRef.current = L.marker([lat, lng], { icon: userIcon }).addTo(leafletRef.current);
  }, [location.lat, location.lng]);

  // Fetch nearby care from Overpass
  useEffect(() => {
    if (!location.lat) return;
    setLoading(true);
    const { lat, lng } = location;
    const d = 0.07;
    const query = `[out:json][timeout:15];(node[amenity~"hospital|pharmacy|clinic"](${lat-d},${lng-d},${lat+d},${lng+d});way[amenity~"hospital|pharmacy|clinic"](${lat-d},${lng-d},${lat+d},${lng+d}););out center 25;`;
    fetch(`https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`)
      .then(r => r.json())
      .then(data => {
        const results: Place[] = (data.elements || [])
          .filter((e: any) => e.lat || e.center)
          .map((e: any, i: number) => {
            const plat = e.lat ?? e.center.lat;
            const plng = e.lon ?? e.center.lon;
            const distM = distBetween(lat, lng, plat, plng);
            return { id: i, name: e.tags?.name || 'Unnamed facility', type: e.tags?.amenity || 'clinic', dist: fmtDist(distM), distM, lat: plat, lng: plng };
          })
          .sort((a: Place, b: Place) => a.distM - b.distM);
        setPlaces(results);
        addPlaceMarkers(results);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [location.lat, location.lng]);

  // Reverse geocode
  useEffect(() => {
    if (!location.lat) return;
    fetch(`https://nominatim.openstreetmap.org/reverse?lat=${location.lat}&lon=${location.lng}&format=json`)
      .then(r => r.json())
      .then(d => {
        const a = d.address;
        setStreetAddress(a?.road ? `${a.road}${a.suburb ? ', ' + a.suburb : ''}` : d.display_name?.split(',')[0] || '');
      })
      .catch(() => {});
  }, [location.lat, location.lng]);

  function addPlaceMarkers(ps: Place[]) {
    if (!leafletRef.current || !(window as any).L) return;
    const L = (window as any).L;
    ps.forEach(p => {
      const ts = typeStyle[p.type] || typeStyle.clinic;
      const icon = L.divIcon({ className: '', html: `<div style="width:13px;height:13px;background:${ts.color};border:2px solid #0a1322;border-radius:50%;box-shadow:0 0 6px ${ts.color}60"></div>`, iconSize: [13, 13], iconAnchor: [6, 6] });
      const gmUrl = `https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lng}`;
      L.marker([p.lat, p.lng], { icon }).addTo(leafletRef.current)
        .bindPopup(`<div style="font-family:sans-serif;min-width:160px"><strong style="font-size:13px">${p.name}</strong><div style="font-size:11px;color:#888;margin:4px 0">${p.type} · ${p.dist}</div><a href="${gmUrl}" target="_blank" style="display:inline-block;margin-top:6px;padding:5px 10px;background:#2DD4A4;color:#04342C;border-radius:6px;font-size:11px;font-weight:700;text-decoration:none">Get Directions</a></div>`);
    });
  }

  function recenter() {
    if (!leafletRef.current || !location.lat) return;
    leafletRef.current.setView([location.lat, location.lng], 15);
  }

  function toggleFav(id: number) {
    setFavorites(prev => {
      const next = prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id];
      localStorage.setItem('veda_fav_places', JSON.stringify(next));
      return next;
    });
  }

  const filtered = places.filter(p => !search || p.name.toLowerCase().includes(search.toLowerCase()) || p.type.includes(search.toLowerCase()));

  return (
    <>
      <AnimatePresence>{showSOS && <SOSModal onCancel={() => setShowSOS(false)} />}</AnimatePresence>

      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.24 }}
        style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {/* Real Leaflet map */}
        <div style={{ flex: '0 0 240px', position: 'relative' }}>
          <div ref={mapRef} style={{ width: '100%', height: '100%' }} />

          {/* Search overlay */}
          <div style={{ position: 'absolute', top: 10, left: 10, right: 10, zIndex: 1000 }}>
            <div style={{ position: 'relative' }}>
              <Search size={14} style={{ position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)', color: C.muted, zIndex: 1 }} />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search hospitals, pharmacies..."
                style={{ width: '100%', paddingLeft: 34, paddingRight: 14, paddingTop: 10, paddingBottom: 10, background: 'rgba(10,15,28,0.92)', backdropFilter: 'blur(12px)', border: '0.5px solid rgba(255,255,255,0.12)', borderRadius: 20, color: C.text, fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />
            </div>
          </div>

          {/* Street address badge */}
          {streetAddress && (
            <div style={{ position: 'absolute', bottom: 48, left: 10, right: 60, zIndex: 1000, background: 'rgba(10,15,28,0.88)', backdropFilter: 'blur(8px)', border: '0.5px solid rgba(45,212,164,0.2)', borderRadius: 10, padding: '5px 10px', display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: C.teal, fontWeight: 600 }}>
              <MapPin size={11} /><span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{streetAddress}</span>
            </div>
          )}

          {/* GPS accuracy */}
          <div style={{ position: 'absolute', bottom: 10, left: 10, zIndex: 1000, background: 'rgba(10,15,28,0.88)', backdropFilter: 'blur(8px)', border: '0.5px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '4px 8px', fontSize: 10, color: C.muted }}>
            {location.lat ? `GPS ${location.accuracy ? `±${location.accuracy}m` : 'active'}` : 'Acquiring GPS...'}
          </div>

          {/* Recenter */}
          <button onClick={recenter} style={{ position: 'absolute', bottom: 10, right: 10, zIndex: 1000, width: 38, height: 38, borderRadius: '50%', background: 'rgba(10,15,28,0.9)', border: '0.5px solid rgba(255,255,255,0.15)', color: C.blue, display: 'grid', placeItems: 'center', cursor: 'pointer' }}>
            <Navigation size={15} />
          </button>
        </div>

        {/* SOS + list */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '10px 16px 100px', scrollbarWidth: 'none' }}>

          {/* SOS button */}
          <motion.button whileTap={{ scale: 0.96 }} onClick={() => setShowSOS(true)}
            style={{ width: '100%', marginBottom: 12, padding: '12px', background: 'rgba(226,75,74,0.12)', border: `1px solid rgba(226,75,74,0.35)`, borderRadius: 14, color: C.red, fontSize: 13, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            <AlertTriangle size={16} strokeWidth={2.2} /> Emergency SOS — Tap to call 112
          </motion.button>

          <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', color: C.muted, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
            Nearby Care ({filtered.length})
            {loading && <Loader size={12} style={{ color: C.teal, animation: 'spin 1s linear infinite' }} />}
          </div>

          {!location.lat && !loading && (
            <div style={{ textAlign: 'center', padding: '30px 0', fontSize: 13, color: C.muted }}>
              <MapPin size={28} style={{ color: C.muted, margin: '0 auto 10px', display: 'block', opacity: 0.4 }} />
              Allow location access to see real nearby care facilities.
            </div>
          )}

          {location.lat && !loading && filtered.length === 0 && (
            <div style={{ textAlign: 'center', padding: '20px 0', fontSize: 13, color: C.muted }}>No facilities found nearby. Try expanding your search.</div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {filtered.map(place => {
              const ts = typeStyle[place.type] || typeStyle.clinic;
              const Icon = ts.icon;
              const isFav = favorites.includes(place.id);
              const isSel = selected === place.id;
              return (
                <motion.div key={place.id} whileTap={{ scale: 0.99 }} onClick={() => setSelected(isSel ? null : place.id)}
                  style={{ background: isSel ? 'rgba(45,212,164,0.08)' : C.card, border: `1px solid ${isSel ? 'rgba(45,212,164,0.3)' : C.border}`, borderRadius: 16, padding: 14, cursor: 'pointer' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ width: 40, height: 40, borderRadius: 14, background: ts.bg, display: 'grid', placeItems: 'center', color: ts.color, flexShrink: 0 }}>
                      <Icon size={18} strokeWidth={1.8} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: C.text, marginBottom: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{place.name}</div>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <span style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', padding: '2px 7px', borderRadius: 6, background: ts.bg, color: ts.color }}>{place.type}</span>
                        <span style={{ fontSize: 11, color: C.teal, fontWeight: 600 }}>{place.dist}</span>
                      </div>
                    </div>
                    <button onClick={e => { e.stopPropagation(); toggleFav(place.id); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: isFav ? C.amber : C.muted, padding: 4 }}>
                      <Star size={16} fill={isFav ? C.amber : 'none'} />
                    </button>
                  </div>
                  <AnimatePresence>
                    {isSel && (
                      <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                        style={{ marginTop: 12, paddingTop: 12, borderTop: '0.5px solid rgba(255,255,255,0.06)', display: 'flex', gap: 8 }}>
                        <a href={`https://www.google.com/maps/dir/?api=1&destination=${place.lat},${place.lng}`} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
                          style={{ flex: 1, padding: '8px 12px', background: C.teal, color: '#04342C', borderRadius: 10, fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, textDecoration: 'none' }}>
                          <RouteIcon size={13} /> Route
                        </a>
                        <a href="tel:112" onClick={e => e.stopPropagation()}
                          style={{ flex: 1, padding: '8px 12px', background: 'rgba(226,75,74,0.18)', color: C.red, borderRadius: 10, fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, textDecoration: 'none' }}>
                          <Phone size={13} /> SOS
                        </a>
                        <a href={`https://www.google.com/maps/search/${encodeURIComponent(place.name)}`} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
                          style={{ flex: 1, padding: '8px 12px', background: 'rgba(255,255,255,0.07)', color: C.text, borderRadius: 10, fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, textDecoration: 'none' }}>
                          <MapPin size={13} /> Maps
                        </a>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              );
            })}
          </div>
        </div>
        <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}.leaflet-control-attribution{display:none}`}</style>
      </motion.div>
    </>
  );
}
