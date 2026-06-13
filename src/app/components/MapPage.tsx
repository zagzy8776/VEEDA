import { motion, AnimatePresence } from 'motion/react';
import { Search, Navigation, MapPin, Phone, Route as RouteIcon, Star, Hospital, Pill, Stethoscope, Loader, AlertTriangle } from 'lucide-react';
import { useState, useEffect, useRef, useCallback } from 'react';
import type { Location } from '../useVedaApp';

const C = { teal: '#2DD4A4', blue: '#378ADD', amber: '#EF9F27', red: '#E24B4A', text: '#E2F4F0', muted: '#5A7A72', card: 'rgba(13,21,37,0.9)', border: 'rgba(255,255,255,0.09)' };

interface Place { id: number; name: string; type: string; dist: string; distM: number; lat: number; lng: number; }

const typeStyle: Record<string, { color: string; bg: string; icon: typeof Hospital }> = {
  hospital: { color: C.red,   bg: 'rgba(226,75,74,0.15)',   icon: Hospital    },
  pharmacy: { color: C.blue,  bg: 'rgba(55,138,221,0.15)',  icon: Pill        },
  clinic:   { color: C.amber, bg: 'rgba(239,159,39,0.15)',  icon: Stethoscope },
};

function dist(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6371000, r = (x: number) => x * Math.PI / 180;
  const dLat = r(lat2 - lat1), dLng = r(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(r(lat1)) * Math.cos(r(lat2)) * Math.sin(dLng / 2) ** 2;
  return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}
function fmt(m: number) { return m < 1000 ? `${m}m` : `${(m / 1000).toFixed(1)}km`; }

// ── SOS Modal ────────────────────────────────────────────────────────────────
function SOSModal({ onCancel }: { onCancel: () => void }) {
  const [count, setCount] = useState(10);
  useEffect(() => {
    const t = setInterval(() => setCount(c => {
      if (c <= 1) { clearInterval(t); window.location.href = 'tel:112'; return 0; }
      return c - 1;
    }), 1000);
    return () => clearInterval(t);
  }, []);
  const circ = 2 * Math.PI * 44;
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.92)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <motion.div initial={{ scale: 0.85, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
        style={{ background: '#0a0f1c', border: '1px solid rgba(226,75,74,0.5)', borderRadius: 24, padding: 32, textAlign: 'center', width: '100%', maxWidth: 320 }}>
        <div style={{ fontSize: 12, color: C.red, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 20 }}>⚠ Emergency SOS</div>
        <div style={{ position: 'relative', width: 120, height: 120, margin: '0 auto 20px' }}>
          <svg width="120" height="120" viewBox="0 0 100 100" style={{ transform: 'rotate(-90deg)' }}>
            <circle cx="50" cy="50" r="44" fill="none" stroke="rgba(226,75,74,0.12)" strokeWidth="8" />
            <circle cx="50" cy="50" r="44" fill="none" stroke={C.red} strokeWidth="8"
              strokeDasharray={circ} strokeDashoffset={circ * (count / 10)}
              strokeLinecap="round" style={{ transition: 'stroke-dashoffset 0.95s linear' }} />
          </svg>
          <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ fontSize: 36, fontWeight: 800, color: C.red, lineHeight: 1 }}>{count}</div>
            <div style={{ fontSize: 10, color: C.muted, marginTop: 2 }}>seconds</div>
          </div>
        </div>
        <p style={{ fontSize: 13, color: C.muted, marginBottom: 24, lineHeight: 1.6 }}>
          Calling <strong style={{ color: C.text }}>emergency services (112)</strong> automatically in {count}s.
        </p>
        <div style={{ display: 'flex', gap: 10 }}>
          <a href="tel:112" style={{ flex: 1, padding: '14px', background: C.red, color: '#fff', borderRadius: 12, fontSize: 14, fontWeight: 700, textDecoration: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
            <Phone size={15} /> Call Now
          </a>
          <button onClick={onCancel} style={{ flex: 1, padding: '14px', background: 'rgba(255,255,255,0.07)', color: C.muted, borderRadius: 12, fontSize: 14, fontWeight: 700, border: 'none', cursor: 'pointer' }}>Cancel</button>
        </div>
      </motion.div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
export function MapPage({ location }: { location: Location }) {
  const mapRef      = useRef<HTMLDivElement>(null);
  const mapObj      = useRef<any>(null);
  const userMarker  = useRef<any>(null);
  const placeLayer  = useRef<any[]>([]);
  const leafletReady = useRef(false);
  const pendingPlaces = useRef<Place[]>([]);
  const userHasPanned = useRef(false);

  const [search,    setSearch]    = useState('');
  const [places,    setPlaces]    = useState<Place[]>([]);
  const [loading,   setLoading]   = useState(false);
  const [selected,  setSelected]  = useState<number | null>(null);
  const [address,   setAddress]   = useState('');
  const [showSOS,   setShowSOS]   = useState(false);
  const [mapReady,  setMapReady]  = useState(false);
  const [favorites, setFavorites] = useState<number[]>(() => {
    try { return JSON.parse(localStorage.getItem('veda_fav_places') || '[]'); } catch { return []; }
  });

  // ── Build user icon HTML ─────────────────────────────────────────────────
  function userIconHtml() {
    return `<div style="width:18px;height:18px;background:#2DD4A4;border:3px solid #07101D;border-radius:50%;box-shadow:0 0 0 5px rgba(45,212,164,0.25),0 0 12px rgba(45,212,164,0.4)"></div>`;
  }

  // ── Add/update user marker ───────────────────────────────────────────────
  function placeUserMarker(L: any, map: any, lat: number, lng: number) {
    const icon = L.divIcon({ className: '', html: userIconHtml(), iconSize: [18, 18], iconAnchor: [9, 9] });
    if (userMarker.current) { userMarker.current.setLatLng([lat, lng]); }
    else { userMarker.current = L.marker([lat, lng], { icon, zIndexOffset: 1000 }).addTo(map); }
  }

  // ── Add place markers ────────────────────────────────────────────────────
  const addPlaceMarkers = useCallback((ps: Place[]) => {
    const L = (window as any).L;
    if (!L || !mapObj.current) { pendingPlaces.current = ps; return; }
    placeLayer.current.forEach(m => m.remove());
    placeLayer.current = [];
    ps.forEach(p => {
      const ts = typeStyle[p.type] || typeStyle.clinic;
      const icon = L.divIcon({
        className: '',
        html: `<div style="width:13px;height:13px;background:${ts.color};border:2px solid #07101D;border-radius:50%;box-shadow:0 0 6px ${ts.color}80"></div>`,
        iconSize: [13, 13], iconAnchor: [6, 6],
      });
      const popup = `<div style="font-family:system-ui;min-width:170px;color:#E2F4F0;background:#111827;padding:2px">
        <div style="font-size:13px;font-weight:700;margin-bottom:3px">${p.name}</div>
        <div style="font-size:11px;color:#5A7A72;margin-bottom:8px">${p.type} · ${p.dist}</div>
        <a href="https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lng}" target="_blank"
          style="display:inline-block;padding:6px 12px;background:#2DD4A4;color:#04342C;border-radius:8px;font-size:11px;font-weight:700;text-decoration:none">
          Get Directions
        </a>
      </div>`;
      const m = L.marker([p.lat, p.lng], { icon })
        .addTo(mapObj.current)
        .bindPopup(popup, { className: 'veda-popup', maxWidth: 220 });
      placeLayer.current.push(m);
    });
  }, []);

  // ── Init Leaflet ──────────────────────────────────────────────────────────
  const initMap = useCallback((lat: number, lng: number) => {
    if (!mapRef.current || mapObj.current) return;
    const L = (window as any).L;
    if (!L) return;

    const map = L.map(mapRef.current, { zoomControl: false, attributionControl: false }).setView([lat, lng], 15);

    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
      maxZoom: 19,
    }).addTo(map);

    // Dark theme filter
    setTimeout(() => {
      const tp = map.getPane('tilePane') as HTMLElement | undefined;
      if (tp) tp.style.filter = 'brightness(0.72) contrast(1.1) saturate(0.85)';
    }, 300);

    // Zoom control bottom-right
    L.control.zoom({ position: 'bottomright' }).addTo(map);

    // Track if user is panning so we don't re-center on GPS update
    map.on('dragstart', () => { userHasPanned.current = true; });

    placeUserMarker(L, map, lat, lng);
    mapObj.current = map;
    leafletReady.current = true;
    setMapReady(true);

    // Flush any pending markers that arrived before map was ready
    if (pendingPlaces.current.length) {
      addPlaceMarkers(pendingPlaces.current);
      pendingPlaces.current = [];
    }
  }, [addPlaceMarkers]);

  // ── Load Leaflet script once ──────────────────────────────────────────────
  useEffect(() => {
    if ((window as any).L) {
      // Already loaded
      const lat = location.lat ?? 6.5244;
      const lng = location.lng ?? 3.3792;
      initMap(lat, lng);
      return;
    }

    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
    document.head.appendChild(link);

    const script = document.createElement('script');
    script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
    script.onload = () => {
      const lat = location.lat ?? 6.5244;
      const lng = location.lng ?? 3.3792;
      initMap(lat, lng);
    };
    document.head.appendChild(script);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── React to GPS updates ──────────────────────────────────────────────────
  useEffect(() => {
    if (!location.lat || !mapObj.current) return;
    const L = (window as any).L;
    if (!L) return;
    placeUserMarker(L, mapObj.current, location.lat, location.lng!);
    // Only re-centre if user hasn't panned
    if (!userHasPanned.current) {
      mapObj.current.setView([location.lat, location.lng], 15, { animate: true });
    }
  }, [location.lat, location.lng]);

  // ── Fetch nearby care from Overpass ──────────────────────────────────────
  useEffect(() => {
    if (!location.lat) return;
    setLoading(true);
    const { lat, lng } = location;
    const d = 0.07;
    const q = `[out:json][timeout:20];(
      node[amenity~"hospital|pharmacy|clinic"](${lat-d},${lng!-d},${lat+d},${lng!+d});
      way[amenity~"hospital|pharmacy|clinic"](${lat-d},${lng!-d},${lat+d},${lng!+d});
    );out center 30;`;
    fetch(`https://overpass-api.de/api/interpreter?data=${encodeURIComponent(q)}`)
      .then(r => r.json())
      .then(data => {
        const results: Place[] = (data.elements || [])
          .filter((e: any) => e.lat || e.center)
          .map((e: any, i: number) => {
            const plat = e.lat ?? e.center.lat;
            const plng = e.lon ?? e.center.lon;
            const distM = dist(lat, lng!, plat, plng);
            return { id: i, name: e.tags?.name || 'Unnamed facility', type: e.tags?.amenity || 'clinic', dist: fmt(distM), distM, lat: plat, lng: plng };
          })
          .sort((a: Place, b: Place) => a.distM - b.distM);
        setPlaces(results);
        addPlaceMarkers(results);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [location.lat, location.lng, addPlaceMarkers]);

  // ── Reverse geocode ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!location.lat) return;
    fetch(`https://nominatim.openstreetmap.org/reverse?lat=${location.lat}&lon=${location.lng}&format=json`)
      .then(r => r.json())
      .then(d => {
        const a = d.address;
        setAddress(a?.road ? `${a.road}${a.suburb ? ', ' + a.suburb : ''}` : d.display_name?.split(',')[0] || '');
      })
      .catch(() => {});
  }, [location.lat, location.lng]);

  function recenter() {
    if (!mapObj.current || !location.lat) return;
    userHasPanned.current = false;
    mapObj.current.setView([location.lat, location.lng], 16, { animate: true });
  }

  function flyToPlace(p: Place) {
    if (!mapObj.current) return;
    mapObj.current.flyTo([p.lat, p.lng], 17, { duration: 1.2 });
  }

  function toggleFav(id: number) {
    setFavorites(prev => {
      const next = prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id];
      localStorage.setItem('veda_fav_places', JSON.stringify(next));
      return next;
    });
  }

  const filtered = places.filter(p =>
    !search || p.name.toLowerCase().includes(search.toLowerCase()) || p.type.includes(search.toLowerCase())
  );

  return (
    <>
      <AnimatePresence>{showSOS && <SOSModal onCancel={() => setShowSOS(false)} />}</AnimatePresence>

      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}
        style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {/* ── Map area ── */}
        <div style={{ flex: '0 0 52%', position: 'relative', background: '#0d1520' }}>

          {/* Leaflet container */}
          <div ref={mapRef} style={{ width: '100%', height: '100%' }} />

          {/* Loading skeleton while Leaflet loads */}
          {!mapReady && (
            <div style={{ position: 'absolute', inset: 0, background: '#0d1520', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, zIndex: 10 }}>
              <motion.div animate={{ opacity: [0.4, 1, 0.4] }} transition={{ duration: 1.5, repeat: Infinity }}
                style={{ width: 40, height: 40, borderRadius: '50%', background: 'rgba(45,212,164,0.15)', display: 'grid', placeItems: 'center' }}>
                <MapPin size={18} style={{ color: C.teal }} />
              </motion.div>
              <div style={{ fontSize: 12, color: C.muted }}>Loading map...</div>
            </div>
          )}

          {/* Search bar */}
          <div style={{ position: 'absolute', top: 10, left: 10, right: 10, zIndex: 1000 }}>
            <div style={{ position: 'relative' }}>
              <Search size={13} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: C.muted, zIndex: 1, pointerEvents: 'none' }} />
              <input value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Search hospitals, pharmacies..."
                style={{ width: '100%', paddingLeft: 32, paddingRight: 14, paddingTop: 10, paddingBottom: 10, background: 'rgba(7,16,29,0.92)', backdropFilter: 'blur(14px)', border: '0.5px solid rgba(255,255,255,0.12)', borderRadius: 22, color: C.text, fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />
            </div>
          </div>

          {/* Street address */}
          {address && (
            <div style={{ position: 'absolute', bottom: 46, left: 10, right: 56, zIndex: 1000, background: 'rgba(7,16,29,0.88)', backdropFilter: 'blur(10px)', border: '0.5px solid rgba(45,212,164,0.25)', borderRadius: 10, padding: '5px 10px', display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: C.teal, fontWeight: 600 }}>
              <MapPin size={10} strokeWidth={2.5} />
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{address}</span>
            </div>
          )}

          {/* GPS badge */}
          <div style={{ position: 'absolute', bottom: 10, left: 10, zIndex: 1000, background: 'rgba(7,16,29,0.88)', backdropFilter: 'blur(8px)', border: '0.5px solid rgba(255,255,255,0.08)', borderRadius: 8, padding: '4px 9px', fontSize: 10, color: location.lat ? C.teal : C.muted, fontWeight: 600 }}>
            {location.lat ? `GPS ${location.accuracy ? `±${location.accuracy}m` : 'active'}` : 'Acquiring GPS...'}
          </div>

          {/* Recenter button */}
          <button onClick={recenter}
            style={{ position: 'absolute', bottom: 10, right: 10, zIndex: 1000, width: 38, height: 38, borderRadius: '50%', background: 'rgba(7,16,29,0.9)', border: '0.5px solid rgba(255,255,255,0.15)', color: C.blue, display: 'grid', placeItems: 'center', cursor: 'pointer', boxShadow: '0 2px 8px rgba(0,0,0,0.4)' }}>
            <Navigation size={15} strokeWidth={2} />
          </button>
        </div>

        {/* ── List area ── */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '10px 14px 100px', scrollbarWidth: 'none', minHeight: 0 }}>

          {/* SOS */}
          <motion.button whileTap={{ scale: 0.97 }} onClick={() => setShowSOS(true)}
            style={{ width: '100%', marginBottom: 10, padding: '11px 14px', background: 'rgba(226,75,74,0.1)', border: '1px solid rgba(226,75,74,0.3)', borderRadius: 14, color: C.red, fontSize: 13, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            <AlertTriangle size={15} strokeWidth={2.2} /> Emergency SOS — Call 112
          </motion.button>

          {/* Count + spinner */}
          <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', color: C.muted, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 7 }}>
            Nearby Care ({filtered.length})
            {loading && <Loader size={11} style={{ color: C.teal, animation: 'spin 1s linear infinite' }} />}
          </div>

          {!location.lat && !loading && (
            <div style={{ textAlign: 'center', padding: '24px 0', fontSize: 13, color: C.muted }}>
              <MapPin size={26} style={{ color: C.muted, margin: '0 auto 8px', display: 'block', opacity: 0.35 }} />
              Allow location access to see nearby care.
            </div>
          )}

          {location.lat && !loading && filtered.length === 0 && !search && (
            <div style={{ textAlign: 'center', padding: '16px 0', fontSize: 12, color: C.muted }}>Searching for nearby facilities...</div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            {filtered.map(place => {
              const ts = typeStyle[place.type] || typeStyle.clinic;
              const Icon = ts.icon;
              const isFav = favorites.includes(place.id);
              const isSel = selected === place.id;
              return (
                <motion.div key={place.id} whileTap={{ scale: 0.99 }}
                  onClick={() => { setSelected(isSel ? null : place.id); flyToPlace(place); }}
                  style={{ background: isSel ? 'rgba(45,212,164,0.07)' : C.card, border: `1px solid ${isSel ? 'rgba(45,212,164,0.28)' : C.border}`, borderRadius: 15, padding: '12px 13px', cursor: 'pointer', transition: 'border-color 0.2s' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
                    <div style={{ width: 38, height: 38, borderRadius: 13, background: ts.bg, display: 'grid', placeItems: 'center', color: ts.color, flexShrink: 0 }}>
                      <Icon size={17} strokeWidth={1.8} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: C.text, marginBottom: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{place.name}</div>
                      <div style={{ display: 'flex', gap: 7, alignItems: 'center' }}>
                        <span style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', padding: '2px 6px', borderRadius: 5, background: ts.bg, color: ts.color }}>{place.type}</span>
                        <span style={{ fontSize: 11, color: C.teal, fontWeight: 600 }}>{place.dist}</span>
                      </div>
                    </div>
                    <button onClick={e => { e.stopPropagation(); toggleFav(place.id); }}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: isFav ? C.amber : C.muted, padding: 4, flexShrink: 0 }}>
                      <Star size={15} fill={isFav ? C.amber : 'none'} />
                    </button>
                  </div>

                  <AnimatePresence>
                    {isSel && (
                      <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                        style={{ marginTop: 10, paddingTop: 10, borderTop: '0.5px solid rgba(255,255,255,0.06)', display: 'flex', gap: 7 }}>
                        <a href={`https://www.google.com/maps/dir/?api=1&destination=${place.lat},${place.lng}`}
                          target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
                          style={{ flex: 1, padding: '8px 6px', background: C.teal, color: '#04342C', borderRadius: 9, fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, textDecoration: 'none' }}>
                          <RouteIcon size={12} /> Route
                        </a>
                        <a href="tel:112" onClick={e => e.stopPropagation()}
                          style={{ flex: 1, padding: '8px 6px', background: 'rgba(226,75,74,0.18)', color: C.red, borderRadius: 9, fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, textDecoration: 'none' }}>
                          <Phone size={12} /> SOS
                        </a>
                        <a href={`https://www.google.com/maps/search/${encodeURIComponent(place.name)}`}
                          target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
                          style={{ flex: 1, padding: '8px 6px', background: 'rgba(255,255,255,0.07)', color: C.text, borderRadius: 9, fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, textDecoration: 'none' }}>
                          <MapPin size={12} /> Maps
                        </a>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              );
            })}
          </div>
        </div>

        <style>{`
          @keyframes spin { from { transform:rotate(0deg) } to { transform:rotate(360deg) } }
          .leaflet-control-attribution { display: none !important; }
          .leaflet-control-zoom { border: none !important; box-shadow: none !important; }
          .leaflet-control-zoom a { background: rgba(7,16,29,0.92) !important; color: #E2F4F0 !important; border: 0.5px solid rgba(255,255,255,0.12) !important; border-radius: 8px !important; margin-bottom: 4px !important; width: 32px !important; height: 32px !important; line-height: 32px !important; font-size: 16px !important; }
          .veda-popup .leaflet-popup-content-wrapper { background: #111827 !important; border: 0.5px solid rgba(255,255,255,0.1) !important; border-radius: 12px !important; color: #E2F4F0 !important; box-shadow: 0 8px 32px rgba(0,0,0,0.5) !important; padding: 0 !important; }
          .veda-popup .leaflet-popup-content { margin: 14px 16px !important; }
          .veda-popup .leaflet-popup-tip { background: #111827 !important; }
          .veda-popup .leaflet-popup-close-button { color: #5A7A72 !important; font-size: 18px !important; }
        `}</style>
      </motion.div>
    </>
  );
}
