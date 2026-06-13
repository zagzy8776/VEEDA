import { motion, AnimatePresence } from 'motion/react';
import { Search, Navigation, MapPin, Phone, Route as RouteIcon, Star, Hospital, Pill,
  Stethoscope, Loader, AlertTriangle, Share2, Clock, Car, Footprints, Wifi, WifiOff } from 'lucide-react';
import { useState, useEffect, useRef, useCallback } from 'react';
import { apiFetch } from '../api';
import type { Location } from '../useVedaApp';

const C = { teal: '#2DD4A4', blue: '#378ADD', amber: '#EF9F27', red: '#E24B4A', text: '#E2F4F0', muted: '#5A7A72', card: 'rgba(13,21,37,0.9)', border: 'rgba(255,255,255,0.09)' };

interface Place { id: number; name: string; type: string; dist: string; distM: number; lat: number; lng: number; phone?: string | null; }
interface ETA { walk: { durationMin: number; distanceM: number } | null; drive: { durationMin: number; distanceM: number } | null; }

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
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.93)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
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
          Calling <strong style={{ color: C.text }}>emergency services (112)</strong> in {count}s.
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
  const mapRef       = useRef<HTMLDivElement>(null);
  const mapObj       = useRef<any>(null);
  const userMarker   = useRef<any>(null);
  const accuracyCirc = useRef<any>(null);
  const placeMarkers = useRef<any[]>([]);
  const pendingPlaces = useRef<Place[]>([]);
  const userHasPanned = useRef(false);
  const lastFetchCoord = useRef<{ lat: number; lng: number } | null>(null);

  const [search,    setSearch]    = useState('');
  const [places,    setPlaces]    = useState<Place[]>([]);
  const [loading,   setLoading]   = useState(false);
  const [selected,  setSelected]  = useState<number | null>(null);
  const [address,   setAddress]   = useState('');
  const [showSOS,   setShowSOS]   = useState(false);
  const [mapReady,  setMapReady]  = useState(false);
  const [online,    setOnline]    = useState(navigator.onLine);
  const [eta,       setEta]       = useState<ETA | null>(null);
  const [etaLoading, setEtaLoading] = useState(false);
  const [geofenceMsg, setGeofenceMsg] = useState<string | null>(null);
  const [filter,    setFilter]    = useState<'all' | 'hospital' | 'pharmacy' | 'clinic'>('all');
  const [favorites, setFavorites] = useState<number[]>(() => {
    try { return JSON.parse(localStorage.getItem('veda_fav_places') || '[]'); } catch { return []; }
  });

  // Online/offline detection
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);

  // ── User marker + accuracy circle ─────────────────────────────────────────
  function updateUserOnMap(L: any, map: any, lat: number, lng: number, accuracy: number | null) {
    const icon = L.divIcon({
      className: '',
      html: `<div style="width:18px;height:18px;background:#2DD4A4;border:3px solid #07101D;border-radius:50%;box-shadow:0 0 0 5px rgba(45,212,164,0.25),0 0 14px rgba(45,212,164,0.45)"></div>`,
      iconSize: [18, 18], iconAnchor: [9, 9],
    });
    if (userMarker.current) userMarker.current.setLatLng([lat, lng]);
    else userMarker.current = L.marker([lat, lng], { icon, zIndexOffset: 1000 }).addTo(map).bindTooltip('You are here', { permanent: false, direction: 'top' });

    // Accuracy circle
    if (accuracy && accuracy < 500) {
      if (accuracyCirc.current) accuracyCirc.current.setLatLng([lat, lng]).setRadius(accuracy);
      else accuracyCirc.current = L.circle([lat, lng], { radius: accuracy, color: '#2DD4A4', fillColor: '#2DD4A4', fillOpacity: 0.06, weight: 1, opacity: 0.3 }).addTo(map);
    }
  }

  // ── Add place markers ──────────────────────────────────────────────────────
  const addPlaceMarkersToMap = useCallback((ps: Place[]) => {
    const L = (window as any).L;
    if (!L || !mapObj.current) { pendingPlaces.current = ps; return; }
    placeMarkers.current.forEach(m => m.remove());
    placeMarkers.current = [];
    ps.forEach(p => {
      const ts = typeStyle[p.type] || typeStyle.clinic;
      const icon = L.divIcon({
        className: '',
        html: `<div style="width:13px;height:13px;background:${ts.color};border:2px solid #07101D;border-radius:50%;box-shadow:0 0 7px ${ts.color}90"></div>`,
        iconSize: [13, 13], iconAnchor: [6, 6],
      });
      const gmUrl = `https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lng}`;
      const phoneBtn = p.phone ? `<a href="tel:${p.phone}" style="display:inline-block;margin-top:4px;margin-left:6px;padding:6px 12px;background:rgba(55,138,221,0.2);color:#378ADD;border-radius:8px;font-size:11px;font-weight:700;text-decoration:none">📞 Call</a>` : '';
      const popup = `<div style="font-family:system-ui;min-width:175px;color:#E2F4F0;background:#111827;padding:2px">
        <div style="font-size:13px;font-weight:700;margin-bottom:2px">${p.name}</div>
        <div style="font-size:11px;color:#5A7A72;margin-bottom:8px">${p.type} · ${p.dist}</div>
        <a href="${gmUrl}" target="_blank" style="display:inline-block;padding:6px 12px;background:#2DD4A4;color:#04342C;border-radius:8px;font-size:11px;font-weight:700;text-decoration:none">🗺 Directions</a>${phoneBtn}
      </div>`;
      const m = L.marker([p.lat, p.lng], { icon }).addTo(mapObj.current).bindPopup(popup, { className: 'veda-popup', maxWidth: 240 });
      placeMarkers.current.push(m);
    });
  }, []);

  // ── Init Leaflet ───────────────────────────────────────────────────────────
  const initMap = useCallback((lat: number, lng: number, accuracy: number | null) => {
    if (!mapRef.current || mapObj.current) return;
    const L = (window as any).L;
    if (!L) return;

    const map = L.map(mapRef.current, { zoomControl: false, attributionControl: false }).setView([lat, lng], 15);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', { maxZoom: 19 }).addTo(map);
    setTimeout(() => {
      const tp = map.getPane('tilePane') as HTMLElement | undefined;
      if (tp) tp.style.filter = 'brightness(0.72) contrast(1.1) saturate(0.85)';
    }, 300);
    L.control.zoom({ position: 'bottomright' }).addTo(map);
    map.on('dragstart', () => { userHasPanned.current = true; });

    updateUserOnMap(L, map, lat, lng, accuracy);
    mapObj.current = map;
    setMapReady(true);

    if (pendingPlaces.current.length) {
      addPlaceMarkersToMap(pendingPlaces.current);
      pendingPlaces.current = [];
    }
  }, [addPlaceMarkersToMap]);

  // ── Load Leaflet once ──────────────────────────────────────────────────────
  useEffect(() => {
    if ((window as any).L) {
      initMap(location.lat ?? 6.5244, location.lng ?? 3.3792, location.accuracy);
      return;
    }
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
    document.head.appendChild(link);
    const script = document.createElement('script');
    script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
    script.onload = () => initMap(location.lat ?? 6.5244, location.lng ?? 3.3792, location.accuracy);
    document.head.appendChild(script);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Update map when GPS changes ────────────────────────────────────────────
  useEffect(() => {
    if (!location.lat || !mapObj.current) return;
    const L = (window as any).L;
    if (!L) return;
    updateUserOnMap(L, mapObj.current, location.lat, location.lng!, location.accuracy);
    if (!userHasPanned.current) {
      mapObj.current.setView([location.lat, location.lng], 15, { animate: true });
    }
  }, [location.lat, location.lng, location.accuracy]);

  // ── Fetch nearby via backend (with API key) ────────────────────────────────
  const fetchNearby = useCallback(async (lat: number, lng: number) => {
    setLoading(true);
    const data = await apiFetch<{ places: Place[]; count: number }>(`/api/map/nearby?lat=${lat}&lng=${lng}`);
    setLoading(false);
    if (!data?.places) return;
    setPlaces(data.places);
    addPlaceMarkersToMap(data.places);
    lastFetchCoord.current = { lat, lng };

    // ETA to nearest hospital
    const nearest = data.places.find(p => p.type === 'hospital');
    if (nearest) {
      setEtaLoading(true);
      const etaData = await apiFetch<ETA>(`/api/map/eta?from_lat=${lat}&from_lng=${lng}&to_lat=${nearest.lat}&to_lng=${nearest.lng}`);
      if (etaData) setEta(etaData);
      setEtaLoading(false);

      // Geofence — check if within 300m of any facility
      const close = data.places.find(p => p.distM <= 300);
      if (close) setGeofenceMsg(`📍 You are near ${close.name} (${close.dist})`);
    }
  }, [addPlaceMarkersToMap]);

  useEffect(() => {
    if (!location.lat) return;
    fetchNearby(location.lat, location.lng!);
  }, [location.lat, location.lng, fetchNearby]);

  // ── Auto-refresh if user moves >500m ──────────────────────────────────────
  useEffect(() => {
    if (!location.lat || !lastFetchCoord.current) return;
    const { lat: lastLat, lng: lastLng } = lastFetchCoord.current;
    const moved = dist(location.lat, location.lng!, lastLat, lastLng);
    if (moved > 500) fetchNearby(location.lat, location.lng!);
  }, [location.lat, location.lng, fetchNearby]);

  // ── Reverse geocode via backend ────────────────────────────────────────────
  useEffect(() => {
    if (!location.lat) return;
    apiFetch<{ status: string; street: string; suburb: string; city: string }>(`/api/map/reverse-geocode?lat=${location.lat}&lng=${location.lng}`)
      .then(d => {
        if (d?.status === 'available') {
          setAddress(`${d.street}${d.suburb ? ', ' + d.suburb : ''}`.trim() || d.city || '');
        }
      });
  }, [location.lat, location.lng]);

  function recenter() {
    if (!mapObj.current || !location.lat) return;
    userHasPanned.current = false;
    mapObj.current.setView([location.lat, location.lng], 16, { animate: true });
  }

  function flyTo(p: Place) {
    if (!mapObj.current) return;
    mapObj.current.flyTo([p.lat, p.lng], 17, { duration: 1.1 });
    userHasPanned.current = true;
  }

  function shareLocation() {
    if (!location.lat) return;
    const url = `https://www.google.com/maps?q=${location.lat},${location.lng}`;
    const text = `My current location (VEDA): ${url}`;
    if (navigator.share) navigator.share({ title: 'My Location — VEDA', text, url }).catch(() => {});
    else if (navigator.clipboard) navigator.clipboard.writeText(text).then(() => alert('Location copied to clipboard'));
    else window.open(url, '_blank');
  }

  function toggleFav(id: number) {
    setFavorites(prev => {
      const next = prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id];
      localStorage.setItem('veda_fav_places', JSON.stringify(next));
      return next;
    });
  }

  const nearestHospital = places.find(p => p.type === 'hospital');
  const filtered = places.filter(p =>
    (filter === 'all' || p.type === filter) &&
    (!search || p.name.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <>
      <AnimatePresence>{showSOS && <SOSModal onCancel={() => setShowSOS(false)} />}</AnimatePresence>

      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}
        style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {/* ── Map ── */}
        <div style={{ flex: '0 0 50%', position: 'relative', background: '#0d1520' }}>
          <div ref={mapRef} style={{ width: '100%', height: '100%' }} />

          {/* Skeleton */}
          {!mapReady && (
            <div style={{ position: 'absolute', inset: 0, background: '#0d1520', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, zIndex: 10 }}>
              <motion.div animate={{ opacity: [0.4, 1, 0.4] }} transition={{ duration: 1.5, repeat: Infinity }}
                style={{ width: 44, height: 44, borderRadius: '50%', background: 'rgba(45,212,164,0.12)', display: 'grid', placeItems: 'center' }}>
                <MapPin size={20} style={{ color: C.teal }} />
              </motion.div>
              <div style={{ fontSize: 12, color: C.muted }}>Loading map...</div>
            </div>
          )}

          {/* Offline banner */}
          {!online && (
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 1100, background: 'rgba(226,75,74,0.95)', padding: '8px 14px', display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, fontWeight: 700, color: '#fff' }}>
              <WifiOff size={14} /> Offline — Emergency: call 112 directly
            </div>
          )}

          {/* Search */}
          <div style={{ position: 'absolute', top: online ? 10 : 38, left: 10, right: 10, zIndex: 1000 }}>
            <div style={{ position: 'relative' }}>
              <Search size={13} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: C.muted, zIndex: 1, pointerEvents: 'none' }} />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search hospitals, pharmacies..."
                style={{ width: '100%', paddingLeft: 32, paddingRight: 14, paddingTop: 10, paddingBottom: 10, background: 'rgba(7,16,29,0.93)', backdropFilter: 'blur(14px)', border: '0.5px solid rgba(255,255,255,0.12)', borderRadius: 22, color: C.text, fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />
            </div>
          </div>

          {/* Street address */}
          {address && (
            <div style={{ position: 'absolute', bottom: 48, left: 10, right: 100, zIndex: 1000, background: 'rgba(7,16,29,0.9)', backdropFilter: 'blur(10px)', border: '0.5px solid rgba(45,212,164,0.25)', borderRadius: 10, padding: '5px 10px', display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: C.teal, fontWeight: 600 }}>
              <MapPin size={10} strokeWidth={2.5} />
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{address}</span>
            </div>
          )}

          {/* GPS badge */}
          <div style={{ position: 'absolute', bottom: 10, left: 10, zIndex: 1000, background: 'rgba(7,16,29,0.9)', backdropFilter: 'blur(8px)', border: '0.5px solid rgba(255,255,255,0.08)', borderRadius: 8, padding: '4px 9px', fontSize: 10, color: location.lat ? C.teal : C.muted, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
            {online ? <Wifi size={9} /> : <WifiOff size={9} />}
            {location.lat ? `GPS ${location.accuracy ? `±${location.accuracy}m` : 'active'}` : 'Acquiring GPS...'}
          </div>

          {/* Share location button */}
          <button onClick={shareLocation}
            style={{ position: 'absolute', bottom: 52, right: 10, zIndex: 1000, width: 38, height: 38, borderRadius: '50%', background: 'rgba(7,16,29,0.9)', border: '0.5px solid rgba(255,255,255,0.15)', color: C.teal, display: 'grid', placeItems: 'center', cursor: 'pointer' }}>
            <Share2 size={15} strokeWidth={2} />
          </button>

          {/* Recenter */}
          <button onClick={recenter}
            style={{ position: 'absolute', bottom: 10, right: 10, zIndex: 1000, width: 38, height: 38, borderRadius: '50%', background: 'rgba(7,16,29,0.9)', border: '0.5px solid rgba(255,255,255,0.15)', color: C.blue, display: 'grid', placeItems: 'center', cursor: 'pointer' }}>
            <Navigation size={15} strokeWidth={2} />
          </button>
        </div>

        {/* ── List area ── */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '10px 14px 100px', scrollbarWidth: 'none', minHeight: 0 }}>

          {/* Geofence alert */}
          <AnimatePresence>
            {geofenceMsg && (
              <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
                style={{ marginBottom: 8, padding: '9px 12px', background: 'rgba(45,212,164,0.1)', border: '0.5px solid rgba(45,212,164,0.25)', borderRadius: 12, fontSize: 12, color: C.teal, fontWeight: 600, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>{geofenceMsg}</span>
                <button onClick={() => setGeofenceMsg(null)} style={{ background: 'none', border: 'none', color: C.muted, cursor: 'pointer', fontSize: 16, lineHeight: 1 }}>×</button>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Offline fallback */}
          {!online && (
            <div style={{ marginBottom: 10, padding: '12px 14px', background: 'rgba(226,75,74,0.1)', border: '1px solid rgba(226,75,74,0.3)', borderRadius: 14, textAlign: 'center' }}>
              <WifiOff size={20} style={{ color: C.red, margin: '0 auto 6px', display: 'block' }} />
              <div style={{ fontSize: 13, fontWeight: 700, color: C.red, marginBottom: 4 }}>You are offline</div>
              <div style={{ fontSize: 12, color: C.muted, marginBottom: 10 }}>Map data unavailable. In emergency call:</div>
              <a href="tel:112" style={{ display: 'inline-block', padding: '10px 24px', background: C.red, color: '#fff', borderRadius: 10, fontSize: 15, fontWeight: 800, textDecoration: 'none' }}>📞 Call 112</a>
            </div>
          )}

          {/* SOS */}
          <motion.button whileTap={{ scale: 0.97 }} onClick={() => setShowSOS(true)}
            style={{ width: '100%', marginBottom: 10, padding: '11px 14px', background: 'rgba(226,75,74,0.1)', border: '1px solid rgba(226,75,74,0.3)', borderRadius: 14, color: C.red, fontSize: 13, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            <AlertTriangle size={15} strokeWidth={2.2} /> Emergency SOS — Call 112
          </motion.button>

          {/* Nearest hospital card */}
          {nearestHospital && (
            <div style={{ marginBottom: 10, padding: '12px 14px', background: 'rgba(226,75,74,0.07)', border: '1px solid rgba(226,75,74,0.22)', borderRadius: 16 }}>
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: C.red, marginBottom: 6 }}>Nearest Hospital</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{nearestHospital.name}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                <span style={{ fontSize: 12, color: C.teal, fontWeight: 600 }}>{nearestHospital.dist}</span>
                {etaLoading && <Loader size={11} style={{ color: C.muted, animation: 'spin 1s linear infinite' }} />}
                {eta?.walk && <span style={{ fontSize: 11, color: C.muted, display: 'flex', alignItems: 'center', gap: 3 }}><Footprints size={11} />{eta.walk.durationMin}m walk</span>}
                {eta?.drive && <span style={{ fontSize: 11, color: C.muted, display: 'flex', alignItems: 'center', gap: 3 }}><Car size={11} />{eta.drive.durationMin}m drive</span>}
              </div>
              <a href={`https://www.google.com/maps/dir/?api=1&destination=${nearestHospital.lat},${nearestHospital.lng}`}
                target="_blank" rel="noopener noreferrer"
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '9px', background: C.red, color: '#fff', borderRadius: 10, fontSize: 12, fontWeight: 700, textDecoration: 'none' }}>
                <RouteIcon size={13} /> Get Directions Now
              </a>
            </div>
          )}

          {/* Filter chips */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 10, overflowX: 'auto', scrollbarWidth: 'none' }}>
            {(['all', 'hospital', 'pharmacy', 'clinic'] as const).map(f => (
              <button key={f} onClick={() => setFilter(f)}
                style={{ flexShrink: 0, padding: '5px 12px', borderRadius: 20, border: 'none', background: filter === f ? C.teal : 'rgba(255,255,255,0.07)', color: filter === f ? '#04342C' : C.muted, fontSize: 11, fontWeight: 600, cursor: 'pointer', textTransform: 'capitalize', transition: 'all 0.2s' }}>
                {f === 'all' ? `All (${places.length})` : `${f.charAt(0).toUpperCase() + f.slice(1)}s (${places.filter(p => p.type === f).length})`}
              </button>
            ))}
          </div>

          {/* Count + spinner */}
          <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', color: C.muted, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 7 }}>
            {filter === 'all' ? 'Nearby Care' : `${filter.charAt(0).toUpperCase() + filter.slice(1)}s`} ({filtered.length})
            {loading && <Loader size={11} style={{ color: C.teal, animation: 'spin 1s linear infinite' }} />}
          </div>

          {!location.lat && !loading && online && (
            <div style={{ textAlign: 'center', padding: '20px 0', fontSize: 13, color: C.muted }}>
              <MapPin size={24} style={{ color: C.muted, margin: '0 auto 8px', display: 'block', opacity: 0.35 }} />
              Allow location access to see nearby care.
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            {filtered.map(place => {
              const ts = typeStyle[place.type] || typeStyle.clinic;
              const Icon = ts.icon;
              const isFav = favorites.includes(place.id);
              const isSel = selected === place.id;
              return (
                <motion.div key={place.id} whileTap={{ scale: 0.99 }}
                  onClick={() => { setSelected(isSel ? null : place.id); flyTo(place); }}
                  style={{ background: isSel ? 'rgba(45,212,164,0.07)' : C.card, border: `1px solid ${isSel ? 'rgba(45,212,164,0.28)' : C.border}`, borderRadius: 15, padding: '12px 13px', cursor: 'pointer' }}>
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
                        <a href={place.phone ? `tel:${place.phone}` : 'tel:112'} onClick={e => e.stopPropagation()}
                          style={{ flex: 1, padding: '8px 6px', background: 'rgba(226,75,74,0.18)', color: C.red, borderRadius: 9, fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, textDecoration: 'none' }}>
                          <Phone size={12} /> {place.phone ? 'Call' : 'SOS'}
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
          @keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
          .leaflet-control-attribution{display:none!important}
          .leaflet-control-zoom{border:none!important;box-shadow:none!important}
          .leaflet-control-zoom a{background:rgba(7,16,29,0.92)!important;color:#E2F4F0!important;border:0.5px solid rgba(255,255,255,0.12)!important;border-radius:8px!important;margin-bottom:4px!important;width:32px!important;height:32px!important;line-height:32px!important;font-size:16px!important}
          .veda-popup .leaflet-popup-content-wrapper{background:#111827!important;border:0.5px solid rgba(255,255,255,0.1)!important;border-radius:12px!important;color:#E2F4F0!important;box-shadow:0 8px 32px rgba(0,0,0,0.5)!important;padding:0!important}
          .veda-popup .leaflet-popup-content{margin:14px 16px!important}
          .veda-popup .leaflet-popup-tip{background:#111827!important}
          .veda-popup .leaflet-popup-close-button{color:#5A7A72!important;font-size:18px!important}
        `}</style>
      </motion.div>
    </>
  );
}
