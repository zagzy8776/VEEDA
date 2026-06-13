import { motion, AnimatePresence } from 'motion/react';
import { Search, Navigation, MapPin, Phone, Route as RouteIcon, Star,
  Hospital, Pill, Stethoscope, Loader, AlertTriangle, Share2,
  Car, Footprints, WifiOff, ShoppingCart, Utensils, Building,
  Fuel, Shield, BookOpen, X, ChevronDown, ChevronUp } from 'lucide-react';
import { useState, useEffect, useRef, useCallback } from 'react';
import { apiFetch } from '../api';
import type { Location } from '../useVedaApp';

const C = {
  teal: '#2DD4A4', blue: '#378ADD', amber: '#EF9F27', red: '#E24B4A',
  text: '#E2F4F0', muted: '#5A7A72', card: 'rgba(13,21,37,0.92)', border: 'rgba(255,255,255,0.09)',
  green: '#22C55E', purple: '#A855F7', orange: '#F97316',
};

interface Place {
  id: number; name: string; type: string; category: string;
  dist: string; distM: number; lat: number; lng: number;
  phone?: string | null; opening_hours?: string | null; website?: string | null;
}
interface ETA { walk: { durationMin: number } | null; drive: { durationMin: number } | null; }
interface SearchResult { name: string; address: string; lat: number; lng: number; type: string; }

// Category config — covers every type Overpass returns
const catConfig: Record<string, { color: string; bg: string; icon: any; label: string }> = {
  health:    { color: C.red,    bg: 'rgba(226,75,74,0.15)',   icon: Hospital,     label: 'Health'    },
  food:      { color: C.amber,  bg: 'rgba(239,159,39,0.15)',  icon: Utensils,     label: 'Food'      },
  shopping:  { color: C.green,  bg: 'rgba(34,197,94,0.15)',   icon: ShoppingCart, label: 'Shopping'  },
  education: { color: C.blue,   bg: 'rgba(55,138,221,0.15)',  icon: BookOpen,     label: 'Education' },
  finance:   { color: C.teal,   bg: 'rgba(45,212,164,0.15)', icon: Building,     label: 'Finance'   },
  lodging:   { color: C.purple, bg: 'rgba(168,85,247,0.15)',  icon: Building,     label: 'Lodging'   },
  transport: { color: C.orange, bg: 'rgba(249,115,22,0.15)',  icon: Fuel,         label: 'Transport' },
  emergency: { color: C.red,    bg: 'rgba(226,75,74,0.15)',   icon: Shield,       label: 'Emergency' },
  other:     { color: C.muted,  bg: 'rgba(90,122,114,0.15)',  icon: MapPin,       label: 'Other'     },
};

function getCat(p: Place) { return catConfig[p.category] || catConfig.other; }

function distFn(lat1: number, lng1: number, lat2: number, lng2: number) {
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

// ── MapPage ───────────────────────────────────────────────────────────────────
export function MapPage({ location }: { location: Location }) {
  const mapRef        = useRef<HTMLDivElement>(null);
  const mapObj        = useRef<any>(null);
  const userMarker    = useRef<any>(null);
  const accuracyCirc  = useRef<any>(null);
  const placeMarkers  = useRef<any[]>([]);
  const pendingPlaces = useRef<Place[]>([]);
  const userHasPanned = useRef(false);
  const lastFetch     = useRef<{ lat: number; lng: number } | null>(null);
  const searchDebounce = useRef<any>(null);

  const [search,      setSearch]      = useState('');
  const [searchRes,   setSearchRes]   = useState<SearchResult[]>([]);
  const [searchOpen,  setSearchOpen]  = useState(false);
  const [places,      setPlaces]      = useState<Place[]>([]);
  const [loading,     setLoading]     = useState(false);
  const [selected,    setSelected]    = useState<number | null>(null);
  const [address,     setAddress]     = useState('');
  const [showSOS,     setShowSOS]     = useState(false);
  const [mapReady,    setMapReady]    = useState(false);
  const [online,      setOnline]      = useState(navigator.onLine);
  const [eta,         setEta]         = useState<ETA | null>(null);
  const [etaLoading,  setEtaLoading]  = useState(false);
  const [geofence,    setGeofence]    = useState<string | null>(null);
  const [filter,      setFilter]      = useState('all');
  const [listOpen,    setListOpen]    = useState(true);
  const [favorites,   setFavorites]   = useState<number[]>(() => {
    try { return JSON.parse(localStorage.getItem('veda_fav_places') || '[]'); } catch { return []; }
  });

  useEffect(() => {
    const on = () => setOnline(true), off = () => setOnline(false);
    window.addEventListener('online', on); window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);

  // ── User marker + accuracy circle ─────────────────────────────────────────
  function updateUser(L: any, map: any, lat: number, lng: number, accuracy: number | null) {
    const icon = L.divIcon({
      className: '',
      html: `<div style="width:20px;height:20px;background:#2DD4A4;border:3px solid #07101D;border-radius:50%;box-shadow:0 0 0 6px rgba(45,212,164,0.2),0 0 16px rgba(45,212,164,0.5)"></div>`,
      iconSize: [20, 20], iconAnchor: [10, 10],
    });
    if (userMarker.current) userMarker.current.setLatLng([lat, lng]);
    else userMarker.current = L.marker([lat, lng], { icon, zIndexOffset: 1000 }).addTo(map).bindTooltip('You', { permanent: false, direction: 'top', className: 'veda-tooltip' });
    if (accuracy && accuracy < 800) {
      if (accuracyCirc.current) accuracyCirc.current.setLatLng([lat, lng]).setRadius(accuracy);
      else accuracyCirc.current = L.circle([lat, lng], { radius: accuracy, color: '#2DD4A4', fillColor: '#2DD4A4', fillOpacity: 0.04, weight: 1, opacity: 0.25, dashArray: '4 4' }).addTo(map);
    }
  }

  // ── Place markers ──────────────────────────────────────────────────────────
  const addMarkers = useCallback((ps: Place[]) => {
    const L = (window as any).L;
    if (!L || !mapObj.current) { pendingPlaces.current = ps; return; }
    placeMarkers.current.forEach(m => m.remove());
    placeMarkers.current = [];
    ps.forEach(p => {
      const cat = getCat(p);
      const icon = L.divIcon({
        className: '',
        html: `<div style="width:12px;height:12px;background:${cat.color};border:2px solid #07101D;border-radius:50%;box-shadow:0 0 6px ${cat.color}80"></div>`,
        iconSize: [12, 12], iconAnchor: [6, 6],
      });
      const gmUrl = `https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lng}`;
      const hoursHtml = p.opening_hours ? `<div style="font-size:10px;color:#EF9F27;margin-bottom:4px">🕐 ${p.opening_hours}</div>` : '';
      const phoneHtml = p.phone ? `<a href="tel:${p.phone}" style="display:inline-block;margin-top:4px;margin-left:4px;padding:5px 10px;background:rgba(55,138,221,0.18);color:#378ADD;border-radius:7px;font-size:11px;font-weight:700;text-decoration:none">📞 Call</a>` : '';
      const popup = `<div style="font-family:system-ui;min-width:180px;color:#E2F4F0;background:#111827;padding:2px">
        <div style="font-size:13px;font-weight:700;margin-bottom:2px">${p.name}</div>
        <div style="font-size:11px;color:#5A7A72;margin-bottom:6px">${p.type} · ${p.dist}</div>
        ${hoursHtml}
        <a href="${gmUrl}" target="_blank" style="display:inline-block;padding:6px 12px;background:#2DD4A4;color:#04342C;border-radius:8px;font-size:11px;font-weight:700;text-decoration:none">🗺 Directions</a>${phoneHtml}
      </div>`;
      const m = L.marker([p.lat, p.lng], { icon }).addTo(mapObj.current).bindPopup(popup, { className: 'veda-popup', maxWidth: 250 });
      placeMarkers.current.push(m);
    });
  }, []);

  // ── Init Leaflet ───────────────────────────────────────────────────────────
  const initMap = useCallback((lat: number, lng: number, accuracy: number | null) => {
    if (!mapRef.current || mapObj.current) return;
    const L = (window as any).L;
    if (!L) return;

    const map = L.map(mapRef.current, {
      zoomControl: false,
      attributionControl: false,
      // Allow completely free zoom — no restrictions
      minZoom: 2,
      maxZoom: 20,
      scrollWheelZoom: true,
      touchZoom: true,
      doubleClickZoom: true,
      dragging: true,
      tap: true,
    }).setView([lat, lng], 15);

    // OSM tile layer — shows ALL streets, labels, every road name like Google Maps
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 20,
      // Slight dark tint without removing street labels
    }).addTo(map);

    // Dark overlay — keeps streets visible but reduces brightness
    setTimeout(() => {
      const tp = map.getPane('tilePane') as HTMLElement | undefined;
      if (tp) tp.style.filter = 'brightness(0.78) contrast(1.05) saturate(0.9) hue-rotate(190deg)';
    }, 200);

    L.control.zoom({ position: 'bottomright' }).addTo(map);
    // Mark user as in control on ANY manual interaction — drag OR zoom
    map.on('movestart', () => { userHasPanned.current = true; });

    updateUser(L, map, lat, lng, accuracy);
    mapObj.current = map;
    setMapReady(true);

    if (pendingPlaces.current.length) {
      addMarkers(pendingPlaces.current);
      pendingPlaces.current = [];
    }
  }, [addMarkers]);

  // ── Load Leaflet ───────────────────────────────────────────────────────────
  useEffect(() => {
    if ((window as any).L) { initMap(location.lat ?? 6.5244, location.lng ?? 3.3792, location.accuracy); return; }
    const link = document.createElement('link');
    link.rel = 'stylesheet'; link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
    document.head.appendChild(link);
    const script = document.createElement('script');
    script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
    script.onload = () => initMap(location.lat ?? 6.5244, location.lng ?? 3.3792, location.accuracy);
    document.head.appendChild(script);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const hasInitiallycentered = useRef(false);

  // ── GPS update ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!location.lat || !mapObj.current) return;
    const L = (window as any).L; if (!L) return;
    updateUser(L, mapObj.current, location.lat, location.lng!, location.accuracy);
    // Only pan/zoom on the very first GPS fix, never interrupt user after that
    if (!hasInitiallycentered.current && !userHasPanned.current) {
      hasInitiallycentered.current = true;
      mapObj.current.setView([location.lat, location.lng], 15, { animate: true });
    }
  }, [location.lat, location.lng, location.accuracy]);

  // ── Fetch nearby (backend, API key protected) ──────────────────────────────
  const fetchNearby = useCallback(async (lat: number, lng: number) => {
    setLoading(true);
    const data = await apiFetch<{ places: Place[] }>(`/api/map/nearby?lat=${lat}&lng=${lng}`);
    setLoading(false);
    if (!data?.places?.length) return;
    setPlaces(data.places);
    addMarkers(data.places);
    lastFetch.current = { lat, lng };

    // ETA to nearest hospital
    const nh = data.places.find(p => p.category === 'health' && p.type === 'hospital');
    if (nh) {
      setEtaLoading(true);
      const etaData = await apiFetch<ETA>(`/api/map/eta?from_lat=${lat}&from_lng=${lng}&to_lat=${nh.lat}&to_lng=${nh.lng}`);
      if (etaData) setEta(etaData);
      setEtaLoading(false);
    }

    // Geofence
    const close = data.places.find(p => p.distM <= 300);
    if (close) setGeofence(`📍 Near ${close.name} (${close.dist})`);
  }, [addMarkers]);

  useEffect(() => {
    if (!location.lat) return;
    fetchNearby(location.lat, location.lng!);
  }, [location.lat, location.lng, fetchNearby]);

  // Auto-refresh on 500m move
  useEffect(() => {
    if (!location.lat || !lastFetch.current) return;
    const moved = distFn(location.lat, location.lng!, lastFetch.current.lat, lastFetch.current.lng);
    if (moved > 500) fetchNearby(location.lat, location.lng!);
  }, [location.lat, location.lng, fetchNearby]);

  // ── Reverse geocode (backend) ──────────────────────────────────────────────
  useEffect(() => {
    if (!location.lat) return;
    apiFetch<any>(`/api/map/reverse-geocode?lat=${location.lat}&lng=${location.lng}`).then(d => {
      if (d?.status === 'available') setAddress(`${d.street}${d.suburb ? ', ' + d.suburb : ''}`.trim() || d.city || '');
    });
  }, [location.lat, location.lng]);

  // ── Live search (backend, debounced) ──────────────────────────────────────
  useEffect(() => {
    clearTimeout(searchDebounce.current);
    if (!search.trim()) { setSearchRes([]); setSearchOpen(false); return; }
    searchDebounce.current = setTimeout(async () => {
      const data = await apiFetch<SearchResult[]>(
        `/api/map/search?q=${encodeURIComponent(search)}&lat=${location.lat || ''}&lng=${location.lng || ''}`
      );
      if (data?.length) { setSearchRes(data); setSearchOpen(true); }
    }, 350);
  }, [search, location.lat, location.lng]);

  function flyToResult(r: SearchResult) {
    if (!mapObj.current) return;
    mapObj.current.flyTo([r.lat, r.lng], 17, { duration: 1 });
    userHasPanned.current = true;
    setSearch(r.name || '');
    setSearchOpen(false);
    // Drop a temporary pin
    const L = (window as any).L; if (!L) return;
    const icon = L.divIcon({ className: '', html: `<div style="width:16px;height:16px;background:#EF9F27;border:3px solid #07101D;border-radius:50%;box-shadow:0 0 8px #EF9F2780"></div>`, iconSize: [16, 16], iconAnchor: [8, 16] });
    L.marker([r.lat, r.lng], { icon }).addTo(mapObj.current).bindPopup(`<div style="color:#E2F4F0;background:#111827;padding:2px"><strong>${r.name}</strong><div style="font-size:11px;color:#5A7A72">${r.address || ''}</div></div>`, { className: 'veda-popup' }).openPopup();
  }

  function flyTo(p: Place) {
    if (!mapObj.current) return;
    mapObj.current.flyTo([p.lat, p.lng], 17, { duration: 1.1 });
    userHasPanned.current = true;
  }

  function recenter() {
    if (!mapObj.current || !location.lat) return;
    userHasPanned.current = false;
    hasInitiallycentered.current = false;
    mapObj.current.setView([location.lat, location.lng], 16, { animate: true });
  }

  function shareLocation() {
    if (!location.lat) return;
    const url = `https://www.google.com/maps?q=${location.lat},${location.lng}`;
    if (navigator.share) navigator.share({ title: 'My Location — VEDA', text: `My location: ${url}`, url }).catch(() => {});
    else if (navigator.clipboard) navigator.clipboard.writeText(url).then(() => alert('Location link copied'));
    else window.open(url, '_blank');
  }

  function toggleFav(id: number) {
    setFavorites(prev => {
      const next = prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id];
      localStorage.setItem('veda_fav_places', JSON.stringify(next));
      return next;
    });
  }

  // Filter tabs derived from loaded categories
  const categories = ['all', ...Array.from(new Set(places.map(p => p.category)))];
  const filtered = places.filter(p =>
    (filter === 'all' || p.category === filter) &&
    (!search || p.name.toLowerCase().includes(search.toLowerCase()))
  );
  const nearestHospital = places.find(p => p.type === 'hospital');

  return (
    <>
      <AnimatePresence>{showSOS && <SOSModal onCancel={() => setShowSOS(false)} />}</AnimatePresence>

      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}
        style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {/* ── MAP AREA ── */}
        <div style={{ flex: listOpen ? '0 0 48%' : '1', position: 'relative', background: '#0d1520', transition: 'flex 0.3s ease' }}>
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
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 1100, background: 'rgba(226,75,74,0.96)', padding: '8px 14px', display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, fontWeight: 700, color: '#fff' }}>
              <WifiOff size={13} /> Offline — Emergency: call 112 directly
            </div>
          )}

          {/* Search bar with live dropdown */}
          <div style={{ position: 'absolute', top: online ? 10 : 36, left: 10, right: 10, zIndex: 1000 }}>
            <div style={{ position: 'relative' }}>
              <Search size={13} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: C.muted, zIndex: 1, pointerEvents: 'none' }} />
              <input value={search} onChange={e => setSearch(e.target.value)}
                onFocus={() => searchRes.length && setSearchOpen(true)}
                placeholder="Search any place, street, hospital..."
                style={{ width: '100%', paddingLeft: 32, paddingRight: search ? 34 : 14, paddingTop: 10, paddingBottom: 10, background: 'rgba(7,16,29,0.95)', backdropFilter: 'blur(16px)', border: '0.5px solid rgba(255,255,255,0.14)', borderRadius: 22, color: C.text, fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />
              {search && <button onClick={() => { setSearch(''); setSearchRes([]); setSearchOpen(false); }} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: C.muted, cursor: 'pointer', padding: 2, zIndex: 2 }}><X size={14} /></button>}
            </div>

            {/* Search dropdown */}
            <AnimatePresence>
              {searchOpen && searchRes.length > 0 && (
                <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
                  style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, background: 'rgba(10,15,28,0.97)', backdropFilter: 'blur(16px)', border: '0.5px solid rgba(255,255,255,0.12)', borderRadius: 14, overflow: 'hidden', maxHeight: 220, overflowY: 'auto', zIndex: 1001, boxShadow: '0 8px 32px rgba(0,0,0,0.5)' }}>
                  {searchRes.map((r, i) => (
                    <button key={i} onClick={() => flyToResult(r)}
                      style={{ width: '100%', padding: '10px 14px', background: 'none', border: 'none', borderBottom: '0.5px solid rgba(255,255,255,0.05)', cursor: 'pointer', textAlign: 'left', display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                      <MapPin size={13} style={{ color: C.amber, marginTop: 2, flexShrink: 0 }} />
                      <div>
                        <div style={{ fontSize: 13, color: C.text, fontWeight: 600 }}>{r.name}</div>
                        {r.address && r.address !== r.name && <div style={{ fontSize: 10, color: C.muted, marginTop: 1, lineHeight: 1.3 }}>{r.address.substring(0, 60)}{r.address.length > 60 ? '...' : ''}</div>}
                      </div>
                    </button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Street address badge */}
          {address && (
            <div style={{ position: 'absolute', bottom: 50, left: 10, right: 100, zIndex: 1000, background: 'rgba(7,16,29,0.92)', backdropFilter: 'blur(10px)', border: '0.5px solid rgba(45,212,164,0.25)', borderRadius: 10, padding: '5px 10px', display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: C.teal, fontWeight: 600 }}>
              <MapPin size={10} strokeWidth={2.5} />
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{address}</span>
            </div>
          )}

          {/* GPS badge */}
          <div style={{ position: 'absolute', bottom: 10, left: 10, zIndex: 1000, background: 'rgba(7,16,29,0.9)', backdropFilter: 'blur(8px)', border: '0.5px solid rgba(255,255,255,0.08)', borderRadius: 8, padding: '4px 9px', fontSize: 10, color: location.lat ? C.teal : C.muted, fontWeight: 600 }}>
            {location.lat ? `GPS ${location.accuracy ? `±${location.accuracy}m` : 'active'}` : 'Acquiring GPS...'}
          </div>

          {/* Share */}
          <button onClick={shareLocation} title="Share my location"
            style={{ position: 'absolute', bottom: 52, right: 10, zIndex: 1000, width: 38, height: 38, borderRadius: '50%', background: 'rgba(7,16,29,0.9)', border: '0.5px solid rgba(255,255,255,0.15)', color: C.teal, display: 'grid', placeItems: 'center', cursor: 'pointer' }}>
            <Share2 size={15} strokeWidth={2} />
          </button>

          {/* Recenter */}
          <button onClick={recenter} title="Recenter map"
            style={{ position: 'absolute', bottom: 10, right: 10, zIndex: 1000, width: 38, height: 38, borderRadius: '50%', background: 'rgba(7,16,29,0.9)', border: '0.5px solid rgba(255,255,255,0.15)', color: C.blue, display: 'grid', placeItems: 'center', cursor: 'pointer' }}>
            <Navigation size={15} strokeWidth={2} />
          </button>
        </div>

        {/* ── LIST TOGGLE HANDLE ── */}
        <button onClick={() => setListOpen(o => !o)}
          style={{ width: '100%', padding: '6px', background: 'rgba(10,15,28,0.95)', border: 'none', borderTop: '0.5px solid rgba(255,255,255,0.07)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, color: C.muted, fontSize: 11 }}>
          {listOpen ? <><ChevronDown size={13} /> Hide list</> : <><ChevronUp size={13} /> Show {places.length} places</>}
        </button>

        {/* ── LIST AREA ── */}
        <AnimatePresence>
          {listOpen && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.25 }}
              style={{ overflowY: 'auto', padding: '8px 14px 100px', scrollbarWidth: 'none', minHeight: 0, flex: 1 }}>

              {/* Geofence */}
              <AnimatePresence>
                {geofence && (
                  <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                    style={{ marginBottom: 8, padding: '8px 12px', background: 'rgba(45,212,164,0.1)', border: '0.5px solid rgba(45,212,164,0.25)', borderRadius: 10, fontSize: 12, color: C.teal, fontWeight: 600, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>{geofence}</span>
                    <button onClick={() => setGeofence(null)} style={{ background: 'none', border: 'none', color: C.muted, cursor: 'pointer', padding: 2, fontSize: 16, lineHeight: 1 }}>×</button>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Offline */}
              {!online && (
                <div style={{ marginBottom: 10, padding: '12px 14px', background: 'rgba(226,75,74,0.1)', border: '1px solid rgba(226,75,74,0.3)', borderRadius: 14, textAlign: 'center' }}>
                  <WifiOff size={18} style={{ color: C.red, margin: '0 auto 6px', display: 'block' }} />
                  <div style={{ fontSize: 13, fontWeight: 700, color: C.red, marginBottom: 6 }}>You are offline</div>
                  <a href="tel:112" style={{ display: 'inline-block', padding: '9px 22px', background: C.red, color: '#fff', borderRadius: 10, fontSize: 14, fontWeight: 800, textDecoration: 'none' }}>📞 Call 112</a>
                </div>
              )}

              {/* SOS */}
              <motion.button whileTap={{ scale: 0.97 }} onClick={() => setShowSOS(true)}
                style={{ width: '100%', marginBottom: 8, padding: '10px 14px', background: 'rgba(226,75,74,0.1)', border: '1px solid rgba(226,75,74,0.3)', borderRadius: 12, color: C.red, fontSize: 13, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7 }}>
                <AlertTriangle size={14} strokeWidth={2.2} /> Emergency SOS — Call 112
              </motion.button>

              {/* Nearest hospital card */}
              {nearestHospital && (
                <div style={{ marginBottom: 8, padding: '11px 13px', background: 'rgba(226,75,74,0.07)', border: '1px solid rgba(226,75,74,0.2)', borderRadius: 14 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: C.red, marginBottom: 4 }}>Nearest Hospital</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{nearestHospital.name}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 12, color: C.teal, fontWeight: 600 }}>{nearestHospital.dist}</span>
                    {etaLoading && <Loader size={10} style={{ color: C.muted, animation: 'spin 1s linear infinite' }} />}
                    {eta?.walk && <span style={{ fontSize: 11, color: C.muted, display: 'flex', alignItems: 'center', gap: 3 }}><Footprints size={10} />{eta.walk.durationMin}m walk</span>}
                    {eta?.drive && <span style={{ fontSize: 11, color: C.muted, display: 'flex', alignItems: 'center', gap: 3 }}><Car size={10} />{eta.drive.durationMin}m drive</span>}
                  </div>
                  <a href={`https://www.google.com/maps/dir/?api=1&destination=${nearestHospital.lat},${nearestHospital.lng}`}
                    target="_blank" rel="noopener noreferrer"
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, padding: '8px', background: C.red, color: '#fff', borderRadius: 9, fontSize: 12, fontWeight: 700, textDecoration: 'none' }}>
                    <RouteIcon size={12} /> Get Directions Now
                  </a>
                </div>
              )}

              {/* Category filter chips */}
              <div style={{ display: 'flex', gap: 5, marginBottom: 8, overflowX: 'auto', scrollbarWidth: 'none', paddingBottom: 2 }}>
                {categories.map(cat => {
                  const cfg = cat === 'all' ? null : catConfig[cat];
                  const count = cat === 'all' ? places.length : places.filter(p => p.category === cat).length;
                  return (
                    <button key={cat} onClick={() => setFilter(cat)}
                      style={{ flexShrink: 0, padding: '4px 10px', borderRadius: 20, border: 'none', background: filter === cat ? (cfg?.color || C.teal) : 'rgba(255,255,255,0.07)', color: filter === cat ? (cat === 'all' ? '#04342C' : '#fff') : C.muted, fontSize: 10, fontWeight: 600, cursor: 'pointer', textTransform: 'capitalize', transition: 'all 0.2s' }}>
                      {cfg?.label || 'All'} ({count})
                    </button>
                  );
                })}
              </div>

              {/* Count + loader */}
              <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', color: C.muted, marginBottom: 7, display: 'flex', alignItems: 'center', gap: 6 }}>
                {filtered.length} place{filtered.length !== 1 ? 's' : ''} nearby
                {loading && <Loader size={10} style={{ color: C.teal, animation: 'spin 1s linear infinite' }} />}
              </div>

              {!location.lat && !loading && online && (
                <div style={{ textAlign: 'center', padding: '20px 0', fontSize: 13, color: C.muted }}>
                  <MapPin size={22} style={{ color: C.muted, margin: '0 auto 8px', display: 'block', opacity: 0.35 }} />
                  Allow location access to discover nearby places.
                </div>
              )}

              {/* Place list */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {filtered.map(place => {
                  const cat = getCat(place);
                  const Icon = cat.icon;
                  const isFav = favorites.includes(place.id);
                  const isSel = selected === place.id;
                  return (
                    <motion.div key={place.id} whileTap={{ scale: 0.99 }}
                      onClick={() => { setSelected(isSel ? null : place.id); flyTo(place); }}
                      style={{ background: isSel ? `${cat.color}12` : C.card, border: `1px solid ${isSel ? cat.color + '35' : C.border}`, borderRadius: 13, padding: '11px 12px', cursor: 'pointer' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{ width: 36, height: 36, borderRadius: 12, background: cat.bg, display: 'grid', placeItems: 'center', color: cat.color, flexShrink: 0 }}>
                          <Icon size={16} strokeWidth={1.8} />
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: C.text, marginBottom: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{place.name}</div>
                          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                            <span style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', padding: '1px 6px', borderRadius: 5, background: cat.bg, color: cat.color }}>{place.type}</span>
                            <span style={{ fontSize: 11, color: C.teal, fontWeight: 600 }}>{place.dist}</span>
                            {place.opening_hours && <span style={{ fontSize: 9, color: C.amber }}>🕐 {place.opening_hours.substring(0, 20)}</span>}
                          </div>
                        </div>
                        <button onClick={e => { e.stopPropagation(); toggleFav(place.id); }}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: isFav ? C.amber : C.muted, padding: 3, flexShrink: 0 }}>
                          <Star size={14} fill={isFav ? C.amber : 'none'} />
                        </button>
                      </div>

                      <AnimatePresence>
                        {isSel && (
                          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                            style={{ marginTop: 9, paddingTop: 9, borderTop: '0.5px solid rgba(255,255,255,0.06)', display: 'flex', gap: 6 }}>
                            <a href={`https://www.google.com/maps/dir/?api=1&destination=${place.lat},${place.lng}`}
                              target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
                              style={{ flex: 1, padding: '7px 5px', background: C.teal, color: '#04342C', borderRadius: 8, fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, textDecoration: 'none' }}>
                              <RouteIcon size={11} /> Route
                            </a>
                            <a href={place.phone ? `tel:${place.phone}` : 'tel:112'} onClick={e => e.stopPropagation()}
                              style={{ flex: 1, padding: '7px 5px', background: 'rgba(226,75,74,0.18)', color: C.red, borderRadius: 8, fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, textDecoration: 'none' }}>
                              <Phone size={11} /> {place.phone ? 'Call' : 'SOS'}
                            </a>
                            <a href={`https://www.google.com/maps/search/${encodeURIComponent(place.name)}`}
                              target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
                              style={{ flex: 1, padding: '7px 5px', background: 'rgba(255,255,255,0.07)', color: C.text, borderRadius: 8, fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, textDecoration: 'none' }}>
                              <MapPin size={11} /> Maps
                            </a>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </motion.div>
                  );
                })}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <style>{`
          @keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
          .leaflet-control-attribution{display:none!important}
          .leaflet-control-zoom{border:none!important;box-shadow:none!important}
          .leaflet-control-zoom a{background:rgba(7,16,29,0.92)!important;color:#E2F4F0!important;border:0.5px solid rgba(255,255,255,0.12)!important;border-radius:8px!important;margin-bottom:4px!important;width:32px!important;height:32px!important;line-height:32px!important;font-size:16px!important}
          .veda-popup .leaflet-popup-content-wrapper{background:#111827!important;border:0.5px solid rgba(255,255,255,0.1)!important;border-radius:12px!important;color:#E2F4F0!important;box-shadow:0 8px 32px rgba(0,0,0,0.5)!important;padding:0!important}
          .veda-popup .leaflet-popup-content{margin:14px 16px!important}
          .veda-popup .leaflet-popup-tip{background:#111827!important}
          .veda-popup .leaflet-popup-close-button{color:#5A7A72!important;font-size:18px!important}
          .veda-tooltip.leaflet-tooltip{background:rgba(7,16,29,0.9)!important;border:0.5px solid rgba(45,212,164,0.3)!important;color:#2DD4A4!important;font-size:11px!important;font-weight:600!important}
        `}</style>
      </motion.div>
    </>
  );
}
