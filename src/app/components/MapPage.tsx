import { motion, AnimatePresence, animate, useMotionValue, useReducedMotion } from 'motion/react';
import { SONAR, SONAR_TRANSITION, SPRING_SNAPPY, SPRING_SOFT, listContainer, listItem } from '../motion';
import { Search, Navigation, MapPin, Phone, Route as RouteIcon, Star, Hospital, Loader, AlertTriangle, Share2, Car, Footprints, WifiOff, ShoppingCart, Utensils, Building, Fuel, Shield, BookOpen, X, ChevronDown, Plus, Minus, Pill, Banknote, Hotel, Compass, Sparkles } from 'lucide-react';
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { apiFetch } from '../api';
import { emergencyHelpLine, emergencyTelHref, resolveEmergencyNumber } from '../emergencyNumber';
import type { Location } from '../useVedaApp';

const C = { teal: '#2DD4A4', blue: '#378ADD', amber: '#EF9F27', red: '#E24B4A', text: '#E2F4F0', muted: '#5A7A72', card: 'rgba(13,21,37,0.92)', border: 'rgba(255,255,255,0.09)', green: '#22C55E', purple: '#A855F7', orange: '#F97316' };
interface Place { id: string; name: string; type: string; category: string; dist: string; distM: number; lat: number; lng: number; phone?: string | null; opening_hours?: string | null; website?: string | null; }
interface ETA { walk: { durationMin: number } | null; drive: { durationMin: number } | null; }
interface SearchResult { name: string; address: string; lat: number; lng: number; type: string; }
const catConfig: Record<string, { color: string; bg: string; icon: any; label: string }> = {
  health: { color: C.red, bg: 'rgba(226,75,74,0.15)', icon: Hospital, label: 'Health' }, food: { color: C.amber, bg: 'rgba(239,159,39,0.15)', icon: Utensils, label: 'Food' }, shopping: { color: C.green, bg: 'rgba(34,197,94,0.15)', icon: ShoppingCart, label: 'Shopping' }, education: { color: C.blue, bg: 'rgba(55,138,221,0.15)', icon: BookOpen, label: 'Education' }, finance: { color: C.teal, bg: 'rgba(45,212,164,0.15)', icon: Building, label: 'Finance' }, lodging: { color: C.purple, bg: 'rgba(168,85,247,0.15)', icon: Building, label: 'Lodging' }, transport: { color: C.orange, bg: 'rgba(249,115,22,0.15)', icon: Fuel, label: 'Transport' }, emergency: { color: C.red, bg: 'rgba(226,75,74,0.15)', icon: Shield, label: 'Emergency' }, other: { color: C.muted, bg: 'rgba(90,122,114,0.15)', icon: MapPin, label: 'Other' },
};
function getCat(p: Place) { return catConfig[p.category] || catConfig.other; }

// Section headings for the suggestion carousels, so each row says what it is
// rather than echoing the raw API category.
const SECTION_LABEL: Record<string, string> = {
  health: 'Hospitals & clinics',
  food: 'Food & drink',
  shopping: 'Shops',
  education: 'Schools',
  finance: 'Banks & cash',
  lodging: 'Places to stay',
  transport: 'Fuel & transport',
  emergency: 'Emergency services',
  other: 'Other places',
};

// One-tap searches. These only fill the search box; the existing debounced
// search endpoint does the looking, and the sheet steps out of the way.
const SEARCH_SUGGESTIONS = ['Pharmacy', 'Hospital', 'ATM', 'Petrol station', 'Police', 'Supermarket', 'Restaurant', 'Bus stop', 'Clinic', 'Hotel', 'Bank', 'Gym', 'Park', 'Coffee shop', 'Gas station', 'Fire station', 'School', 'University', 'Library', 'Post office', 'Pharmacy drive-thru', 'Emergency room', 'Dentist', 'Doctor', 'Vet clinic', 'Car repair', 'Convenience store', 'Fast food', 'Bakery', 'Grocery'];

// The last fix is remembered locally so a later visit still has somewhere to
// start when the browser has no permission or no fix yet. It is only ever used
// as a map centre — never as a claim that the user is standing there.
const LAST_FIX_KEY = 'veda_last_fix';
function readLastFix(): { lat: number; lng: number } | null {
  try {
    const saved = JSON.parse(localStorage.getItem(LAST_FIX_KEY) || 'null');
    if (saved && Number.isFinite(saved.lat) && Number.isFinite(saved.lng)) return { lat: saved.lat, lng: saved.lng };
  } catch { /* a corrupt entry just means no remembered area */ }
  return null;
}

// Category shortcuts: the always-available half of the suggestion surface. Each
// tile runs a real search, so the page still offers plenty to tap when there is
// no fix, no results, or a slow network.
const EXPLORE_TILES: { term: string; label: string; icon: any; color: string; bg: string }[] = [
  { term: 'Hospital', label: 'Hospitals', icon: Hospital, color: C.red, bg: 'rgba(226,75,74,0.14)' },
  { term: 'Pharmacy', label: 'Pharmacy', icon: Pill, color: C.teal, bg: 'rgba(45,212,164,0.14)' },
  { term: 'Restaurant', label: 'Food', icon: Utensils, color: C.amber, bg: 'rgba(239,159,39,0.14)' },
  { term: 'Supermarket', label: 'Groceries', icon: ShoppingCart, color: C.green, bg: 'rgba(34,197,94,0.14)' },
  { term: 'ATM', label: 'Cash', icon: Banknote, color: C.blue, bg: 'rgba(55,138,221,0.14)' },
  { term: 'Petrol station', label: 'Fuel', icon: Fuel, color: C.orange, bg: 'rgba(249,115,22,0.14)' },
  { term: 'Hotel', label: 'Hotels', icon: Hotel, color: C.purple, bg: 'rgba(168,85,247,0.14)' },
  { term: 'Police', label: 'Police', icon: Shield, color: C.red, bg: 'rgba(226,75,74,0.12)' },
];

// What people actually look for changes through the day, so the quick searches
// follow the clock instead of repeating the same eight words at 3am.
function timeSuggestions(): string[] {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 11) return ['Coffee', 'Breakfast', 'Pharmacy', 'Supermarket', 'ATM'];
  if (hour >= 11 && hour < 15) return ['Lunch', 'Restaurant', 'ATM', 'Clinic', 'Pharmacy'];
  if (hour >= 15 && hour < 19) return ['Pharmacy', 'Supermarket', 'Fuel', 'Coffee', 'Park'];
  if (hour >= 19 && hour < 23) return ['Dinner', 'Restaurant', 'Hotel', 'Pharmacy', 'ATM'];
  return ['Pharmacy', 'Hospital', 'ATM', 'Fuel', 'Police'];
}

function distFn(lat1: number, lng1: number, lat2: number, lng2: number) { const R = 6371000, r = (x: number) => x * Math.PI / 180; const dLat = r(lat2 - lat1), dLng = r(lng2 - lng1); const a = Math.sin(dLat / 2) ** 2 + Math.cos(r(lat1)) * Math.cos(r(lat2)) * Math.sin(dLng / 2) ** 2; return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))); }
function esc(v: unknown) { return String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'); }

function SOSModal({ onCancel, onCall }: { onCancel: () => void; onCall: () => void }) {
  // The verified number right now: backend value, device cache, or build-time
  // fallback. With none available there is nothing safe to dial, so we show a
  // plain instruction and never auto-dial a guessed number.
  const number = resolveEmergencyNumber();
  const [count, setCount] = useState(10);
  useEffect(() => {
    if (!number) return;
    const t = setInterval(() => setCount(c => { if (c <= 1) { clearInterval(t); onCall(); return 0; } return c - 1; }), 1000);
    return () => clearInterval(t);
  }, [number, onCall]);
  const circ = 2 * Math.PI * 44;
  return <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.93)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}><motion.div initial={{ scale: .85, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} style={{ background: '#0a0f1c', border: '1px solid rgba(226,75,74,.5)', borderRadius: 24, padding: 32, textAlign: 'center', width: '100%', maxWidth: 320 }}><div style={{ fontSize: 12, color: C.red, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: 20 }}>⚠ Emergency SOS</div>{number ? <div style={{ position: 'relative', width: 120, height: 120, margin: '0 auto 20px' }}><svg width="120" height="120" viewBox="0 0 100 100" style={{ transform: 'rotate(-90deg)' }}><circle cx="50" cy="50" r="44" fill="none" stroke="rgba(226,75,74,.12)" strokeWidth="8" /><circle cx="50" cy="50" r="44" fill="none" stroke={C.red} strokeWidth="8" strokeDasharray={circ} strokeDashoffset={circ * (count / 10)} strokeLinecap="round" /></svg><div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}><div style={{ fontSize: 36, fontWeight: 800, color: C.red }}>{count}</div><div style={{ fontSize: 10, color: C.muted }}>seconds</div></div></div> : <Phone size={40} style={{ color: C.red, margin: '0 auto 20px', display: 'block' }} />}<p style={{ fontSize: 13, color: C.muted, marginBottom: 24, lineHeight: 1.6 }}>{number ? <>Calling <strong style={{ color: C.text }}>{number}</strong> in {count}s.</> : <>{emergencyHelpLine()}</>}</p><div style={{ display: 'flex', gap: 10 }}>{number && <a href={`tel:${number}`} style={{ flex: 1, padding: 14, background: C.red, color: '#fff', borderRadius: 12, fontWeight: 700, textDecoration: 'none' }}><Phone size={15} /> Call Now</a>}<button onClick={onCancel} style={{ flex: 1, padding: 14, background: 'rgba(255,255,255,.07)', color: C.muted, borderRadius: 12, border: 'none' }}>{number ? 'Cancel' : 'Close'}</button></div></motion.div></div>;
}

export function MapPage({ location, onOpenContacts }: { location: Location; onOpenContacts?: () => void }) {
  const mapRef = useRef<HTMLDivElement>(null), mapObj = useRef<any>(null), userMarker = useRef<any>(null), accuracyCirc = useRef<any>(null), placeMarkers = useRef<any[]>([]), pendingPlaces = useRef<Place[]>([]), userHasPanned = useRef(false), lastFetch = useRef<{ lat: number; lng: number } | null>(null), fetchSeq = useRef(0), searchDebounce = useRef<any>(null), skipSearch = useRef(false);
  const [search, setSearch] = useState(''), [searchRes, setSearchRes] = useState<SearchResult[]>([]), [searchOpen, setSearchOpen] = useState(false), [places, setPlaces] = useState<Place[]>([]), [loading, setLoading] = useState(false), [mapError, setMapError] = useState<string | null>(null), [selected, setSelected] = useState<string | null>(null), [address, setAddress] = useState(''), [showSOS, setShowSOS] = useState(false), [mapReady, setMapReady] = useState(false), [online, setOnline] = useState(() => navigator.onLine), [eta, setEta] = useState<ETA | null>(null), [etaLoading, setEtaLoading] = useState(false), [geofence, setGeofence] = useState<string | null>(null), [filter, setFilter] = useState('all'), [favorites, setFavorites] = useState<string[]>(() => { try { return JSON.parse(localStorage.getItem('veda_fav_places') || '[]'); } catch { return []; } });

  // Reduced motion preference — must be declared at top level (React hook rule)
  const reduced = useReducedMotion();

  // A remembered centre keeps the page useful when there is no live fix. The
  // map, the nearby fetch and the reverse geocode all fall back to it, while the
  // "you are here" marker stays strictly tied to a real fix.
  const [lastFix, setLastFix] = useState<{ lat: number; lng: number } | null>(readLastFix);
  // ── Continuous location tracking with sonar rings ─────────────────────────
  // Watch GPS continuously for real-time map updates and nearby detection
  useEffect(() => {
    if (!navigator.geolocation) return;
    
    const success = (pos: GeolocationPosition) => {
      const { latitude, longitude, accuracy } = pos.coords;
      if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
        const next = { lat: latitude, lng: longitude };
        setLastFix(prev => {
          if (prev && distFn(prev.lat, prev.lng, next.lat, next.lng) < 50) return prev;
          try { localStorage.setItem(LAST_FIX_KEY, JSON.stringify(next)); } catch {}
          return next;
        });
        // Update sonar rings and marker dots on position change
        updateSonarRings(latitude, longitude);
        updateMarkerDots(latitude, longitude);
      }
    };
    
    locationWatchId.current = navigator.geolocation.watchPosition(success, null, {
      enableHighAccuracy: true,
      maximumAge: 5000,
      timeout: 10000
    });
    
    return () => {
      if (locationWatchId.current) navigator.geolocation.clearWatch(locationWatchId.current);
    };
  }, [updateSonarRings]);
  
  // ── Sonar ring animation ──────────────────────────────────────────────────
  const updateSonarRings = useCallback((lat: number, lng: number) => {
    const map = mapObj.current;
    const L = (window as any).L;
    if (!map || !L || !Number.isFinite(lat) || !Number.isFinite(lng)) return;
    
    // Remove old rings
    sonarRings.current.forEach(ring => ring.remove());
    sonarRings.current = [];
    
    // Create expanding sonar rings
    for (let i = 0; i < 3; i++) {
      const delay = i * 0.7;
      setTimeout(() => {
        const ring = L.circle([lat, lng], {
          radius: 0,
          color: '#2DD4A4',
          fillColor: '#2DD4A4',
          fillOpacity: 0.15 - (i * 0.04),
          weight: 2 - (i * 0.5),
          opacity: 0.6 - (i * 0.15),
          dashArray: '6 4'
        }).addTo(map);
        
        // Animate ring expansion
        let radius = 0;
        const maxRadius = 500 + (i * 300);
        const growthRate = 2 + (i * 1);
        const anim = setInterval(() => {
          radius += growthRate;
          if (radius > maxRadius) {
            clearInterval(anim);
            ring.remove();
          } else {
            ring.setRadius(radius);
            ring.setOpacity((0.6 - (i * 0.15)) * (1 - radius / maxRadius));
          }
        }, 30);
        
        sonarRings.current.push(ring);
      }, delay * 1000);
    }
  }, []);
  
  // ── Connection lines to nearby places ────────────────────────────────────
  const updateConnectionLines = useCallback((userLat: number, userLng: number, nearbyPlaces: Place[]) => {
    const map = mapObj.current;
    const L = (window as any).L;
    if (!map || !L) return;
    
    // Remove old lines
    connectionLines.current.forEach(line => line.remove());
    connectionLines.current = [];
    
    // Show connections only to places within 2km
    const closePlaces = nearbyPlaces.filter(p => p.distM <= 2000).slice(0, 8);
    
    closePlaces.forEach((place, index) => {
      const cat = getCat(place);
      const delay = index * 150;
      
      setTimeout(() => {
        const line = L.polyline(
          [[userLat, userLng], [place.lat, place.lng]],
          {
            color: cat.color,
            weight: 2,
            opacity: 0.6,
            dashArray: '8 6',
            lineCap: 'round'
          }
        ).addTo(map);
        
        // Fade in animation
        let opacity = 0;
        const fadeIn = setInterval(() => {
          opacity += 0.05;
          if (opacity >= 0.6) {
            clearInterval(fadeIn);
          }
          line.setOpacity(opacity);
        }, 50);
        
        connectionLines.current.push(line);
      }, delay);
    });
  }, []);
  
  // ── Animated marker dots (Snapchat-style pulse outward from user) ─────────
  const updateMarkerDots = useCallback((lat: number, lng: number) => {
    const map = mapObj.current;
    const L = (window as any).L;
    if (!map || !L || !Number.isFinite(lat) || !Number.isFinite(lng) || reduced) return;

    // Remove old dots
    markerDots.current.forEach(d => d.remove());
    markerDots.current = [];

    // Create 5 expanding dots in a circle around user
    for (let i = 0; i < 5; i++) {
      const angle = (i / 5) * 2 * Math.PI;
      const dotLat = lat + (Math.sin(angle) * 0.003);
      const dotLng = lng + (Math.cos(angle) * 0.003);
      const dot = L.circleMarker([dotLat, dotLng], {
        radius: 4,
        color: C.teal,
        fillColor: C.teal,
        fillOpacity: 0.8,
        weight: 2,
        opacity: 0
      }).addTo(map);

      // Animate dot expanding outward
      let radius = 0;
      const maxRadius = 80 + (i * 40);
      const anim = setInterval(() => {
        radius += 3;
        if (radius > maxRadius) {
          clearInterval(anim);
          dot.remove();
        } else {
          dot.setRadius(radius / 4);
          dot.setOpacity(Math.max(0, 1 - radius / maxRadius));
          dot.setLatLng([lat + Math.sin(angle) * (radius / 100000), lng + Math.cos(angle) * (radius / 100000)]);
        }
      }, 30);
      markerDots.current.push(dot);
    }
  }, [reduced]);

  // ── Connection dots between user and nearby places ────────────────────────
  const updateConnectionDots = useCallback((userLat: number, userLng: number, nearbyPlaces: Place[]) => {
    const map = mapObj.current;
    const L = (window as any).L;
    if (!map || !L) return;

    // Remove old dots
    connectionDots.current.forEach(d => d.remove());
    connectionDots.current = [];

    // Show dots to places within 3km
    const closePlaces = nearbyPlaces.filter(p => p.distM <= 3000).slice(0, 6);
    closePlaces.forEach((place, pIdx) => {
      const cat = getCat(place);
      const dist = distFn(userLat, userLng, place.lat, place.lng);
      const steps = Math.max(2, Math.floor(dist / 150));

      for (let s = 0; s <= steps; s++) {
        const t = s / steps;
        const dotLat = userLat + (place.lat - userLat) * t;
        const dotLng = userLng + (place.lng - userLng) * t;
        const dot = L.circleMarker([dotLat, dotLng], {
          radius: 2 + (t * 2),
          color: cat.color,
          fillColor: cat.color,
          fillOpacity: 0.6,
          weight: 0,
          opacity: 0
        }).addTo(map);

        // Pulse animation
        let pulse = 0;
        const anim = setInterval(() => {
          pulse += 0.05;
          if (pulse > 1) pulse = 0;
          dot.setOpacity(0.3 + 0.4 * Math.sin(pulse * Math.PI));
          dot.setRadius(2 + 2 * Math.sin(pulse * Math.PI));
        }, 50);
        connectionDots.current.push(dot);
      }
    });
  }, []);

  // ── Auto-refresh nearby places on movement ──────────────────────────────
  useEffect(() => {
    if (!center || !online) return;
    const prev = lastFetch.current;
    // Fetch when moved more than 200m
    if (!prev || distFn(center.lat, center.lng, prev.lat, prev.lng) > 200) {
      fetchNearby(center.lat, center.lng);
    }
  }, [center?.lat, center?.lng, online, fetchNearby]);
  
  // ── Update connections when places change ───────────────────────────────
  useEffect(() => {
    if (center && places.length > 0) {
      updateConnectionLines(center.lat, center.lng, places);
      updateMarkerDots(center.lat, center.lng);
      updateConnectionDots(center.lat, center.lng, places);
      updateSonarRings(center.lat, center.lng);
    }
  }, [places, center?.lat, center?.lng, updateConnectionLines, updateMarkerDots, updateConnectionDots, updateSonarRings]);
  
  // ── Periodic nearby refresh (every 30s) ─────────────────────────────────
  useEffect(() => {
    if (!center || !online) return;
    nearbyWatchInterval.current = window.setInterval(() => {
      fetchNearby(center.lat, center.lng);
    }, 30000);
    return () => {
      if (nearbyWatchInterval.current) clearInterval(nearbyWatchInterval.current);
    };
  }, [center?.lat, center?.lng, online, fetchNearby]);
  
  // The sonar rings are decoration, so they are skipped when the OS asks for
  // less motion.
  const live = location.lat !== null && location.lng !== null;
  const center = live ? { lat: location.lat as number, lng: location.lng as number } : lastFix;
  const startRef = useRef(center);
  startRef.current = center;

  useEffect(() => {
    if (location.lat === null || location.lng === null) return;
    const next = { lat: location.lat, lng: location.lng };
    setLastFix(prev => {
      if (prev && distFn(prev.lat, prev.lng, next.lat, next.lng) < 100) return prev;
      try { localStorage.setItem(LAST_FIX_KEY, JSON.stringify(next)); } catch { /* storage may be blocked */ }
      return next;
    });
  }, [location.lat, location.lng]);

  // The sonar rings are decoration, so they are skipped when the OS asks for
  // less motion.

  useEffect(() => { const on = () => setOnline(true), off = () => setOnline(false); window.addEventListener('online', on); window.addEventListener('offline', off); return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); }; }, []);

  const updateUser = useCallback((L: any, map: any, lat: number, lng: number, accuracy: number | null) => {
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
    const icon = L.divIcon({ 
      className: '', 
      html: `
        <div style="position:relative;display:inline-block">
          <div style="width:24px;height:24px;background:#2DD4A4;border:3px solid #07101D;border-radius:50%;box-shadow:0 0 0 4px rgba(45,212,164,.15),0 0 24px rgba(45,212,164,.6);animation:vedaPulse 2s cubic-bezier(.4,0,.6,1) infinite"></div>
          <div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:8px;height:8px;background:#07101D;border-radius:50%"></div>
        </div>
        <style>
          @keyframes vedaPulse {
            0% { transform: scale(1); box-shadow:0 0 0 0 rgba(45,212,164,.5),0 0 24px rgba(45,212,164,.6); }
            50% { transform: scale(1.05); box-shadow:0 0 0 12px rgba(45,212,164,0),0 0 32px rgba(45,212,164,.8); }
            100% { transform: scale(1); box-shadow:0 0 0 0 rgba(45,212,164,0),0 0 24px rgba(45,212,164,.6); }
          }
        </style>
      `, 
      iconSize: [24, 24], 
      iconAnchor: [12, 12] 
    });
    if (userMarker.current) userMarker.current.setLatLng([lat, lng]); else userMarker.current = L.marker([lat, lng], { icon, zIndexOffset: 1000 }).addTo(map).bindTooltip('You', { permanent: false, direction: 'top', className: 'veda-tooltip' });
    if (accuracy && accuracy < 800) { if (accuracyCirc.current) accuracyCirc.current.setLatLng([lat, lng]).setRadius(accuracy); else accuracyCirc.current = L.circle([lat, lng], { radius: accuracy, color: '#2DD4A4', fillColor: '#2DD4A4', fillOpacity: .06, weight: 1.5, opacity: .35, dashArray: '5 5' }).addTo(map); } else if (accuracyCirc.current) { accuracyCirc.current.remove(); accuracyCirc.current = null; }
  }, []);

  const addMarkers = useCallback((ps: Place[]) => {
    const L = (window as any).L;
    if (!L || !mapObj.current) { pendingPlaces.current = ps; return; }
    placeMarkers.current.forEach(m => m.remove()); placeMarkers.current = [];
    ps.forEach(p => {
      const cat = getCat(p);
      const icon = L.divIcon({ 
        className: '', 
        html: `
          <div style="position:relative;display:inline-block">
            <div style="width:14px;height:14px;background:${cat.color};border:2px solid #07101D;border-radius:50%;box-shadow:0 0 0 3px ${cat.color}30,0 0 12px ${cat.color}60;animation:vedaMarkerPulse 2s cubic-bezier(.4,0,.6,1) infinite"></div>
            <div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:4px;height:4px;background:#07101D;border-radius:50%"></div>
          </div>
          <style>
            @keyframes vedaMarkerPulse {
              0% { box-shadow:0 0 0 3px ${cat.color}30,0 0 12px ${cat.color}60; }
              50% { box-shadow:0 0 0 8px ${cat.color}0,0 0 20px ${cat.color}90; }
              100% { box-shadow:0 0 0 3px ${cat.color}30,0 0 12px ${cat.color}60; }
            }
            @keyframes vedaStoryPulse {
              0% { box-shadow:0 0 0 0 ${cat.color}80; transform: scale(1); }
              50% { box-shadow:0 0 0 6px ${cat.color}40; transform: scale(1.1); }
              100% { box-shadow:0 0 0 0 ${cat.color}0; transform: scale(1); }
            }
          </style>
        `, 
        iconSize: [14, 14], 
        iconAnchor: [7, 7] 
      });
      const gmUrl = `https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lng}`;
      const name = esc(p.name), type = esc(p.type), dist = esc(p.dist), hours = esc(p.opening_hours); const phone = p.phone ? esc(p.phone) : '';
      const hoursHtml = p.opening_hours ? `<div style="font-size:10px;color:#EF9F27;margin-bottom:4px">🕐 ${hours}</div>` : '';
      const phoneHtml = p.phone ? `<a href="tel:${phone}" style="display:inline-block;margin-top:4px;margin-left:4px;padding:5px 10px;background:rgba(55,138,221,.18);color:#378ADD;border-radius:7px;font-size:11px;font-weight:700;text-decoration:none">📞 Call</a>` : '';
      const popup = `<div style="font-family:system-ui;min-width:180px;color:#E2F4F0;background:#111827;padding:2px;border-radius:10px;overflow:hidden"><div style="font-size:13px;font-weight:700;margin-bottom:2px">${name}</div><div style="font-size:11px;color:#5A7A72;margin-bottom:6px">${type} · ${dist}</div>${hoursHtml}<a href="${gmUrl}" target="_blank" rel="noopener noreferrer" style="display:inline-block;padding:6px 12px;background:#2DD4A4;color:#04342C;border-radius:8px;font-size:11px;font-weight:700;text-decoration:none">🗺 Directions</a>${phoneHtml}</div>`;
      const marker = L.marker([p.lat, p.lng], { icon }).addTo(mapObj.current).bindPopup(popup, { className: 'veda-popup', maxWidth: 250 });
      // Tapping a pin selects the place and opens its card, so the map and the
      // sheet never disagree about what is being looked at.
      marker.on('click', () => { setSelected(p.id); setSheetOpen(true); });
      placeMarkers.current.push(marker);
    });
  }, []);

  const initMap = useCallback((lat: number, lng: number, accuracy: number | null) => {
    if (!mapRef.current || mapObj.current) return;
    const L = (window as any).L; if (!L) return;
    const validUser = Number.isFinite(lat) && Number.isFinite(lng) && !(lat === 0 && lng === 0);
    // A remembered area opens the map straight onto somewhere useful instead of
    // a world view; a live fix still takes priority.
    const start = startRef.current;
    const view: [number, number] = validUser ? [lat, lng] : start ? [start.lat, start.lng] : [0, 0];
    const map = L.map(mapRef.current, { zoomControl: false, attributionControl: false, minZoom: 2, maxZoom: 20, scrollWheelZoom: true, touchZoom: true, doubleClickZoom: true, dragging: true, tap: true }).setView(view, validUser ? 15 : start ? 14 : 2);
    // Dark basemap that is safe to embed: the public OSM tile server blocks
    // apps that hotlink it, which leaves the map blank. CARTO's dark basemap
    // allows this use with credit and already matches the app's dark theme, so
    // no colour filter is needed on top of it.
    // CARTO dark basemap with API key — replace the carto= token below with your
    // actual CARTO API key. Until then, falls back to free OpenStreetMap tiles.
    const CARTO_API_KEY = ''; // <-- PASTE YOUR CARTO API KEY HERE
    const cartoUrl = CARTO_API_KEY
      ? `https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png?carto=${CARTO_API_KEY}`
      : 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
    L.tileLayer(cartoUrl, {
      maxZoom: 20,
      subdomains: 'abcd',
      detectRetina: true,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors' + (CARTO_API_KEY ? ' · CARTO' : ''),
    }).addTo(map);
    // No Leaflet zoom control: the floating rail over the map drives zoom, and
    // the credit for the tiles lives in an always-visible pill (the bottom sheet
    // would cover a control parked in the bottom corner).
    map.on('movestart', () => { userHasPanned.current = true; });
    if (validUser) updateUser(L, map, lat, lng, accuracy);
    mapObj.current = map; setMapReady(true); setMapError(null);
    if (pendingPlaces.current.length) { addMarkers(pendingPlaces.current); pendingPlaces.current = []; }
    setTimeout(() => map.invalidateSize(), 50);
  }, [addMarkers, updateUser]);

  useEffect(() => {
    let cancelled = false;
    if ((window as any).L) { initMap(0, 0, null); return () => { cancelled = true; }; }
    const link = document.createElement('link'); link.rel = 'stylesheet'; link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'; link.dataset.veedaLeaflet = 'true'; document.head.appendChild(link);
    const script = document.createElement('script'); script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'; script.async = true;
    const timeout = window.setTimeout(() => { if (!cancelled && !(window as any).L) setMapError('Map engine could not load. Check your internet connection and reload.'); }, 10000);
    script.onload = () => { window.clearTimeout(timeout); if (!cancelled) initMap(0, 0, null); };
    script.onerror = () => { window.clearTimeout(timeout); if (!cancelled) setMapError('Map engine failed to load. Check your internet connection and reload.'); };
    document.head.appendChild(script);
    return () => { cancelled = true; window.clearTimeout(timeout); script.parentNode?.removeChild(script); document.querySelector('link[data-veeda-leaflet="true"]')?.remove(); mapObj.current?.remove?.(); mapObj.current = null; };
  }, [initMap]);

  const hasInitiallyCentered = useRef(false);
  useEffect(() => {
    const map = mapObj.current;
    if (!map) return;
    const L = (window as any).L; if (!L) return;
    // The "you are here" marker only ever tracks a real fix; the remembered area
    // just moves the viewport, so the page never implies the user is elsewhere.
    if (location.lat !== null && location.lng !== null) updateUser(L, map, location.lat, location.lng, location.accuracy);
    if (!center) return;
    if (!hasInitiallyCentered.current && !userHasPanned.current) {
      hasInitiallyCentered.current = true;
      map.setView([center.lat, center.lng], live ? 15 : 14, { animate: true });
    }
    // mapReady is a dependency on purpose: a fix that lands before the engine is
    // up must still centre the map once it is, instead of leaving a world view.
  }, [location.lat, location.lng, location.accuracy, live, center?.lat, center?.lng, mapReady, updateUser]);

  const fetchNearby = useCallback(async (lat: number, lng: number) => {
    if (!online) return;
    const seq = ++fetchSeq.current; setLoading(true);
    const data = await apiFetch<{ places: Place[]; hospitals: Place[] }>(`/api/map/nearby?lat=${lat}&lng=${lng}&radiusMeters=10000`);
    if (seq !== fetchSeq.current) return;
    setLoading(false); if (!data) return;
    setPlaces(data.places || []); addMarkers(data.places || []); lastFetch.current = { lat, lng };
    const nh = (data.hospitals || []).slice().sort((a, b) => a.distM - b.distM)[0] || data.places?.find(p => p.category === 'health' && p.type === 'hospital');
    if (nh) { setEtaLoading(true); const etaData = await apiFetch<ETA>(`/api/map/eta?from_lat=${lat}&from_lng=${lng}&to_lat=${nh.lat}&to_lng=${nh.lng}`); if (seq === fetchSeq.current) setEta(etaData || null); setEtaLoading(false); } else setEta(null);
    const close = (data.places || []).find(p => p.distM <= 500); setGeofence(close ? `📍 Near ${close.name} (${close.dist})` : null);
  }, [addMarkers, online]);

  useEffect(() => {
    if (!center || !online) return;
    const prev = lastFetch.current;
    if (!prev || distFn(center.lat, center.lng, prev.lat, prev.lng) > 500) fetchNearby(center.lat, center.lng);
  }, [center?.lat, center?.lng, online, fetchNearby]);

  useEffect(() => { if (!center) return; apiFetch<any>(`/api/map/reverse-geocode?lat=${center.lat}&lng=${center.lng}`).then(d => { if (d?.status === 'available') setAddress(`${d.street}${d.suburb ? ', ' + d.suburb : ''}`.trim() || d.city || ''); }); }, [center?.lat, center?.lng]);
  useEffect(() => {
    clearTimeout(searchDebounce.current);
    // Picking a result fills the box with its name; that must not reopen the
    // dropdown the user just dismissed.
    if (skipSearch.current) { skipSearch.current = false; return; }
    if (!search.trim()) { setSearchRes([]); setSearchOpen(false); return; }
    searchDebounce.current = setTimeout(async () => {
      const data = await apiFetch<SearchResult[]>(`/api/map/search?q=${encodeURIComponent(search)}&lat=${center?.lat ?? ''}&lng=${center?.lng ?? ''}`);
      setSearchRes(data || []); setSearchOpen(Boolean(data?.length));
    }, 350);
    return () => clearTimeout(searchDebounce.current);
  }, [search, center?.lat, center?.lng]);
  // The map is full-bleed now, so it only needs re-measuring once the route
  // wrapper has finished its entry animation and the engine is up.
  useEffect(() => {
    if (!mapReady) return;
    const t = window.setTimeout(() => mapObj.current?.invalidateSize?.(), 600);
    return () => window.clearTimeout(t);
  }, [mapReady]);

  function flyToResult(r: SearchResult) { if (!mapObj.current) return; mapObj.current.flyTo([r.lat, r.lng], 17, { duration: 1 }); userHasPanned.current = true; skipSearch.current = true; setSearch(r.name || ''); setSearchOpen(false); const L = (window as any).L; if (!L) return; const icon = L.divIcon({ className: '', html: '<div style="width:16px;height:16px;background:#EF9F27;border:3px solid #07101D;border-radius:50%;box-shadow:0 0 8px #EF9F2780"></div>', iconSize: [16, 16], iconAnchor: [8, 16] }); const popup = `<div style="color:#E2F4F0;background:#111827;padding:2px"><strong>${esc(r.name)}</strong><div style="font-size:11px;color:#5A7A72">${esc(r.address)}</div></div>`; L.marker([r.lat, r.lng], { icon }).addTo(mapObj.current).bindPopup(popup, { className: 'veda-popup' }).openPopup(); }
  function flyTo(p: Place) { if (!mapObj.current) return; mapObj.current.flyTo([p.lat, p.lng], 17, { duration: 1.1 }); userHasPanned.current = true; }
  // Selecting a place from any suggestion surface also scrolls its full row
  // (with the route/call actions) into view, so the tap never looks inert.
  // The scroll is applied to the sheet body only: scrollIntoView would also
  // scroll the map page container, pushing the whole map off-screen.
  function focusPlace(p: Place) {
    setSelected(p.id);
    flyTo(p);
    window.setTimeout(() => {
      const body = sheetBodyRef.current;
      const row = document.getElementById(`place-row-${p.id}`);
      if (!body || !row) return;
      const delta = row.getBoundingClientRect().top - body.getBoundingClientRect().top;
      body.scrollTo({ top: Math.max(0, body.scrollTop + delta - 12), behavior: 'smooth' });
    }, 140);
  }
  function recenter() { if (!mapObj.current || !center) return; userHasPanned.current = false; hasInitiallyCentered.current = false; mapObj.current.setView([center.lat, center.lng], live ? 16 : 14, { animate: true }); }
  function shareLocation() { if (location.lat === null || location.lng === null) return; const url = `https://www.google.com/maps?q=${location.lat},${location.lng}`; if (navigator.share) navigator.share({ title: 'My Location — VEEDA', text: `My location: ${url}`, url }).catch(() => {}); else if (navigator.clipboard) navigator.clipboard.writeText(url).then(() => alert('Location link copied')); else window.open(url, '_blank'); }
  function toggleFav(id: string) { setFavorites(prev => { const next = prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]; localStorage.setItem('veda_fav_places', JSON.stringify(next)); return next; }); }

  const categories = ['all', ...Array.from(new Set(places.map(p => p.category)))];
  const filtered = places.filter(p => (filter === 'all' || p.category === filter) && (!search || p.name.toLowerCase().includes(search.toLowerCase())));
  const nearestHospital = places.filter(p => p.type === 'hospital').sort((a, b) => a.distM - b.distM)[0] || null;

  // Saved places, the nearest of each everyday need and the time-aware quick
  // searches — the extra suggestion surfaces the sheet leads with.
  const savedPlaces = places.filter(p => favorites.includes(p.id));
  const quickSearches = timeSuggestions();
  const essentials = useMemo(() => {
    const nearest = (test: (p: Place) => boolean) => places.filter(test).sort((a, b) => a.distM - b.distM)[0] || null;
    const rows: { key: string; label: string; place: Place }[] = [];
    const add = (key: string, label: string, place: Place | null) => { if (place) rows.push({ key, label, place }); };
    add('hospital', 'Hospital', nearest(p => p.type === 'hospital' || p.category === 'health'));
    add('pharmacy', 'Pharmacy', nearest(p => /pharmac/i.test(p.name) || /pharmac/i.test(p.type)));
    add('cash', 'Cash & ATM', nearest(p => p.category === 'finance' || /atm|bank/i.test(p.name)));
    add('fuel', 'Fuel', nearest(p => p.category === 'transport' || /fuel|petrol|gas/i.test(p.name)));
    return rows;
  }, [places]);

  // ── Bottom sheet ──────────────────────────────────────────────────────────
  // The sheet floats over a full-bleed map and snaps between a peek (handle,
  // title, quick actions) and its open height. The gesture is driven from raw
  // pointer events on the handle rather than motion's drag gesture: a drag
  // gesture calls `stopAnimation()` as soon as a press begins, which would park
  // the sheet between its two rest positions if a press arrived mid-snap.
  // Pointer capture keeps the gesture attached to the handle, and the handle is
  // the only drag surface, so scrolling inside the sheet is never hijacked.
  const pageRef = useRef<HTMLDivElement>(null);
  const sheetBodyRef = useRef<HTMLDivElement>(null);
  const sheetY = useMotionValue(0);
  const drag = useRef<{ id: number; y: number; from: number; moved: boolean; lastY: number; lastT: number; v: number } | null>(null);
  const [sheetOpen, setSheetOpen] = useState(true);
  // The gesture handlers read the open state through a ref so they always see
  // the latest committed value, even mid-gesture.
  const sheetOpenRef = useRef(sheetOpen);
  sheetOpenRef.current = sheetOpen;
  const [boxH, setBoxH] = useState(0);
  // The peek is the handle plus the quick actions, measured from the layout so
  // the collapsed sheet hides the body completely instead of clipping a card in
  // half. 117px is what the current type sizes produce, used until measured.
  const [peek, setPeek] = useState(117);

  useEffect(() => {
    const el = pageRef.current;
    if (!el) return;
    const measure = () => {
      setBoxH(el.clientHeight);
      const body = sheetBodyRef.current;
      if (body) setPeek(Math.max(96, Math.round(body.offsetTop)));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const sheetH = boxH ? Math.round(boxH * 0.62) : 0;
  const collapsedY = Math.max(0, sheetH - peek);
  const restY = sheetOpen ? 0 : collapsedY;

  useEffect(() => {
    animate(sheetY, restY, SPRING_SOFT);
  }, [restY, sheetY]);

  /** Snap to the requested rest position, whichever state the sheet is in. */
  function settle(open: boolean) {
    setSheetOpen(open);
    animate(sheetY, open ? 0 : collapsedY, SPRING_SOFT);
  }

  function handlePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (drag.current || (e.target as HTMLElement).closest('button')) return;
    // Cancelling the press stops the browser synthesising a click at the
    // release point: the sheet slides under the finger, so that click would
    // land on whatever card moved into place and activate it by accident.
    e.preventDefault();
    drag.current = { id: e.pointerId, y: e.clientY, from: sheetY.get(), moved: false, lastY: e.clientY, lastT: e.timeStamp, v: 0 };
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function handlePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const dy = e.clientY - d.y;
    // Same 8px slop as the tap test below, so a press that barely moved is a tap.
    if (!d.moved && Math.abs(dy) < 8) return;
    const dt = e.timeStamp - d.lastT;
    if (dt > 0) d.v = (e.clientY - d.lastY) / dt;
    d.lastY = e.clientY;
    d.lastT = e.timeStamp;
    d.moved = true;
    sheetY.set(Math.min(collapsedY, Math.max(0, d.from + dy)));
  }

  function handlePointerUp(e: React.PointerEvent<HTMLDivElement>) {
    const d = drag.current;
    drag.current = null;
    if (!d || d.id !== e.pointerId) return;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    if (!d.moved) {
      // A press that never moved is a tap: snap to the other rest position.
      settle(!sheetOpenRef.current);
      return;
    }
    const dy = e.clientY - d.y;
    let next: boolean;
    if (Math.abs(dy) > 40) next = dy < 0;
    else if (d.v < -0.35) next = true;
    else if (d.v > 0.35) next = false;
    else next = sheetY.get() < collapsedY / 2;
    settle(next);
  }

  function handlePointerCancel() {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    settle(sheetOpenRef.current);
  }

  // Places grouped for the suggestion carousels: biggest group first, so the
  // sheet leads with whatever this area actually has.
  const grouped = places.reduce<Record<string, Place[]>>((acc, place) => {
    (acc[place.category] ||= []).push(place);
    return acc;
  }, {});
  const carousels = Object.entries(grouped)
    .filter(([category, list]) => category !== 'other' && list.length >= 2)
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, 4);

  function runSuggestion(term: string) {
    setSearch(term);
    setFilter('all');
    setSheetOpen(false);
  }

  function zoomBy(direction: 1 | -1) {
    const map = mapObj.current;
    if (!map) return;
    if (direction === 1) map.zoomIn(1); else map.zoomOut(1);
  }

  return <>
    <AnimatePresence>{showSOS && <SOSModal onCancel={() => setShowSOS(false)} onCall={() => { const href = emergencyTelHref(); if (href) window.location.href = href; }} />}</AnimatePresence>
    {/* overflowAnchor: 'none' is essential here: Leaflet's panes extend far past
        the container while panning, and the browser's scroll anchoring would
        otherwise scroll this whole page up to "keep" them in view. */}
    <div ref={pageRef} style={{ position: 'relative', height: '100%', overflow: 'hidden', overflowAnchor: 'none' }}>
      {/* Full-bleed map: the sheet and the floating controls sit on top of it.
          The wrapper clips the panes so they never create scrollable overflow. */}
      <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', background: '#0d1520' }}>
        <div ref={mapRef} style={{ position: 'absolute', inset: 0 }} />
        {!mapReady && !mapError && <div style={{ position: 'absolute', inset: 0, background: '#0d1520', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, zIndex: 10 }}><motion.div animate={{ opacity: [.4, 1, .4] }} transition={{ duration: 1.5, repeat: Infinity }} style={{ width: 44, height: 44, borderRadius: '50%', background: 'rgba(45,212,164,.12)', display: 'grid', placeItems: 'center' }}><MapPin size={20} style={{ color: C.teal }} /></motion.div><div style={{ fontSize: 12, color: C.muted }}>Loading map engine…</div></div>}
        {/* Until the fix lands, sweep the map for the user. Decorative only:
            pointer-events are off so it can never swallow a tap meant for the
            map, a marker or the bottom nav. */}
        {mapReady && !reduced && !center && (
          <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', zIndex: 5, pointerEvents: 'none' }}>
            <div style={{ position: 'relative', width: 130, height: 130, display: 'grid', placeItems: 'center' }}>
              {[0, 0.8, 1.6].map(delay => (
                <motion.span key={delay} animate={SONAR} transition={{ ...SONAR_TRANSITION, delay }} style={{ position: 'absolute', width: 130, height: 130, borderRadius: '50%', border: '1.5px solid rgba(45,212,164,0.5)' }} />
              ))}
              <div style={{ width: 10, height: 10, borderRadius: '50%', background: C.teal, boxShadow: '0 0 16px rgba(45,212,164,0.9)' }} />
              <div style={{ position: 'absolute', bottom: -26, fontSize: 11, color: C.teal, fontWeight: 600, whiteSpace: 'nowrap' }}>Locating you…</div>
            </div>
          </div>
        )}
        {mapError && <div style={{ position: 'absolute', inset: 0, background: '#0d1520', zIndex: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, textAlign: 'center' }}><div><AlertTriangle size={30} style={{ color: C.amber, margin: '0 auto 10px' }} /><div style={{ fontSize: 14, color: C.text, fontWeight: 700 }}>Map unavailable</div><div style={{ fontSize: 12, color: C.muted, marginTop: 5, lineHeight: 1.5 }}>{mapError}</div></div></div>}
        {!online && <div style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 1100, background: 'rgba(226,75,74,.96)', padding: '8px 14px', display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, fontWeight: 700, color: '#fff' }}><WifiOff size={13} /> Offline - Emergency: call {resolveEmergencyNumber() || 'your local emergency number'} directly</div>}
        <div style={{ position: 'absolute', top: online ? 10 : 36, left: 10, right: 10, zIndex: 1000 }}>
          <div style={{ position: 'relative' }}><Search size={13} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: C.muted, pointerEvents: 'none' }} /><input value={search} onChange={e => setSearch(e.target.value)} onFocus={() => searchRes.length && setSearchOpen(true)} placeholder="Search any place, street, hospital..." style={{ width: '100%', paddingLeft: 32, paddingRight: search ? 34 : 14, paddingTop: 10, paddingBottom: 10, background: 'rgba(7,16,29,.95)', backdropFilter: 'blur(16px)', border: '.5px solid rgba(255,255,255,.14)', borderRadius: 22, color: C.text, fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />{search && <button onClick={() => { setSearch(''); setSearchRes([]); setSearchOpen(false); }} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: C.muted, padding: 2 }}><X size={14} /></button>}</div>
          <AnimatePresence>{searchOpen && searchRes.length > 0 && <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, background: 'rgba(10,15,28,.97)', backdropFilter: 'blur(16px)', border: '.5px solid rgba(255,255,255,.12)', borderRadius: 14, overflow: 'hidden', maxHeight: 220, overflowY: 'auto', zIndex: 1001, boxShadow: '0 8px 32px rgba(0,0,0,.5)' }}>{searchRes.map((r, i) => <button key={i} onClick={() => flyToResult(r)} style={{ width: '100%', padding: '10px 14px', background: 'none', border: 'none', borderBottom: '.5px solid rgba(255,255,255,.05)', textAlign: 'left', display: 'flex', gap: 10 }}><MapPin size={13} style={{ color: C.amber, marginTop: 2, flexShrink: 0 }} /><div><div style={{ fontSize: 13, color: C.text, fontWeight: 600 }}>{r.name}</div>{r.address && r.address !== r.name && <div style={{ fontSize: 10, color: C.muted, marginTop: 1 }}>{r.address.substring(0, 60)}{r.address.length > 60 ? '...' : ''}</div>}</div></button>)}</motion.div>}</AnimatePresence>
        </div>
        {/* One-tap searches, parked under the search bar. The zIndex stays below
            the search overlay so the results list covers them when it opens. */}
        {online && <motion.div initial="initial" animate="animate" variants={listContainer} style={{ position: 'absolute', top: 54, left: 0, right: 0, zIndex: 900, display: 'flex', gap: 6, padding: '0 10px', overflowX: 'auto', scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch' }} className='veda-chip-carousel'>
          {SEARCH_SUGGESTIONS.map(term => (
            <motion.button key={term} variants={listItem} whileTap={{ scale: 0.95 }} onClick={() => runSuggestion(term)} style={{ flexShrink: 0, padding: '6px 11px', borderRadius: 999, background: 'rgba(7,16,29,.82)', backdropFilter: 'blur(14px)', border: '.5px solid rgba(255,255,255,.14)', color: C.text, fontSize: 11, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap', boxShadow: '0 4px 14px rgba(0,0,0,.3)' }}>{term}</motion.button>
          ))}
        </motion.div>}
        {/* Floating controls, kept just above the sheet's peek height so the
            sheet never hides them. */}
        <div style={{ position: 'absolute', bottom: 186, right: 10, zIndex: 1000, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {[
            { key: 'locate', title: 'Recenter map', color: C.blue, icon: <Navigation size={15} />, onClick: recenter, off: !center },
            { key: 'share', title: 'Share my location', color: C.teal, icon: <Share2 size={15} />, onClick: shareLocation, off: location.lat === null },
            { key: 'in', title: 'Zoom in', color: C.text, icon: <Plus size={16} />, onClick: () => zoomBy(1), off: !mapReady },
            { key: 'out', title: 'Zoom out', color: C.text, icon: <Minus size={16} />, onClick: () => zoomBy(-1), off: !mapReady },
          ].map(control => (
            <motion.button key={control.key} whileHover={{ scale: 1.08, boxShadow: '0 6px 24px rgba(45,212,164,.3)' }} whileTap={{ scale: 0.88 }} onClick={control.onClick} disabled={control.off} title={control.title} style={{ width: 42, height: 42, borderRadius: '50%', background: 'rgba(7,16,29,.9)', backdropFilter: 'blur(16px)', border: '.5px solid rgba(45,212,164,.25)', color: control.color, display: 'grid', placeItems: 'center', cursor: control.off ? 'not-allowed' : 'pointer', opacity: control.off ? .45 : 1, boxShadow: '0 4px 20px rgba(0,0,0,.35)', transition: 'all 0.2s cubic-bezier(.4,0,.6,1)' }}>
              {control.icon}
            </motion.button>
          ))}
        </div>
        {/* Address, GPS state and the required tile credit, all in one column. */}
        <div style={{ position: 'absolute', bottom: 186, left: 10, right: 60, zIndex: 1000, display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 6, pointerEvents: 'none' }}>
          {address && <div style={{ maxWidth: '100%', background: 'rgba(7,16,29,.86)', backdropFilter: 'blur(14px)', border: '.5px solid rgba(45,212,164,.25)', borderRadius: 10, padding: '5px 10px', display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: C.teal, fontWeight: 600 }}><MapPin size={10} /><span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{address}</span></div>}
          <div style={{ background: 'rgba(7,16,29,.86)', backdropFilter: 'blur(14px)', border: '.5px solid rgba(255,255,255,.08)', borderRadius: 8, padding: '4px 9px', fontSize: 10, color: live ? C.teal : center ? C.amber : C.muted, fontWeight: 600 }}>{live ? `GPS ${location.accuracy ? `±${location.accuracy}m` : 'active'}` : center ? 'Last known area' : 'Waiting for GPS…'}</div>
          {/* Tile credit for the basemap actually in use; keep it visible, it is
              the licence condition for the free CARTO + OpenStreetMap tiles. */}
          <a href="https://carto.com/attributions" target="_blank" rel="noopener noreferrer" style={{ pointerEvents: 'auto', fontSize: 9, color: 'rgba(155,182,173,.85)', background: 'rgba(7,16,29,.72)', borderRadius: 6, padding: '2px 6px', textDecoration: 'none' }}>© OpenStreetMap · CARTO</a>
        </div>
      </div>
      {/* ── Bottom sheet ──────────────────────────────────────────────────── */}
      <motion.section
        style={{ y: sheetY, height: sheetH || '62%', position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 1150, display: 'flex', flexDirection: 'column', background: 'rgba(9,14,26,0.97)', backdropFilter: 'blur(20px)', borderTop: '0.5px solid rgba(255,255,255,0.1)', borderRadius: '22px 22px 0 0', boxShadow: '0 -14px 44px rgba(0,0,0,0.55)' }}
      >
        {/* The handle is the only drag surface: a press that does not move snaps
            the sheet, a press that moves drags it. Both are read from the same
            pointer events, so the two cases can never disagree. */}
        <div
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerCancel}
          style={{ flexShrink: 0, padding: '10px 16px 6px', cursor: 'grab', touchAction: 'none' }}
        >
          <div style={{ width: 42, height: 4, borderRadius: 3, background: 'rgba(255,255,255,0.22)', margin: '0 auto' }} />
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginTop: 10 }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: C.text }}>Nearby</div>
              <div style={{ fontSize: 11, color: C.muted, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{!center ? 'Waiting for your location' : loading && places.length === 0 ? 'Finding real places near you…' : `${places.length} place${places.length === 1 ? '' : 's'} within 10 km${live ? '' : ' · last known area'}`}</div>
            </div>
            <motion.button whileTap={{ scale: 0.94 }} onClick={() => setSheetOpen(open => !open)} aria-label={sheetOpen ? 'Collapse suggestions' : 'Expand suggestions'} style={{ flexShrink: 0, width: 34, height: 34, borderRadius: 12, background: 'rgba(255,255,255,0.06)', border: '0.5px solid rgba(255,255,255,0.1)', color: C.muted, display: 'grid', placeItems: 'center', cursor: 'pointer' }}>
              <motion.span animate={{ rotate: sheetOpen ? 0 : 180 }} transition={SPRING_SNAPPY} style={{ display: 'grid', placeItems: 'center' }}><ChevronDown size={15} /></motion.span>
            </motion.button>
          </div>
        </div>

        {/* Quick actions stay in the peek, so help is always one tap away. */}
        <div style={{ flexShrink: 0, display: 'flex', gap: 8, padding: '0 16px 10px' }}>
          <motion.button whileTap={{ scale: 0.96 }} onClick={() => setShowSOS(true)} style={{ flex: 1, padding: '9px 6px', borderRadius: 12, background: 'rgba(226,75,74,0.14)', border: '1px solid rgba(226,75,74,0.32)', color: C.red, fontSize: 12, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}><AlertTriangle size={13} /> SOS</motion.button>
          {onOpenContacts && <motion.button whileTap={{ scale: 0.96 }} onClick={onOpenContacts} style={{ flex: 1, padding: '9px 6px', borderRadius: 12, background: 'rgba(45,212,164,0.1)', border: '1px solid rgba(45,212,164,0.28)', color: C.teal, fontSize: 12, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}><Share2 size={13} /> Notify</motion.button>}
          <motion.button whileTap={{ scale: 0.96 }} onClick={shareLocation} disabled={location.lat === null} style={{ flex: 1, padding: '9px 6px', borderRadius: 12, background: 'rgba(55,138,221,0.12)', border: '1px solid rgba(55,138,221,0.3)', color: C.blue, fontSize: 12, fontWeight: 700, cursor: location.lat === null ? 'not-allowed' : 'pointer', opacity: location.lat === null ? 0.5 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}><RouteIcon size={13} /> Share</motion.button>
        </div>

        {/* overflowAnchor: 'none' stops the browser from re-anchoring the scroll
            position when async cards (nearest hospital, explore, carousels) are
            inserted above the fold, which would otherwise yank the sheet down. */}
        <div ref={sheetBodyRef} style={{ flex: 1, minHeight: 0, overflowY: 'auto', overflowAnchor: 'none', padding: '0 16px 26px', scrollbarWidth: 'none', touchAction: 'pan-y' }}>
        {geofence && <div style={{ marginBottom: 8, padding: '8px 12px', background: 'rgba(45,212,164,.1)', border: '.5px solid rgba(45,212,164,.25)', borderRadius: 10, fontSize: 12, color: C.teal, fontWeight: 600, display: 'flex', justifyContent: 'space-between' }}><span>{geofence}</span><button onClick={() => setGeofence(null)} style={{ background: 'none', border: 'none', color: C.muted }}>×</button></div>}
        {!online && <div style={{ marginBottom: 10, padding: '12px 14px', background: 'rgba(226,75,74,.1)', border: '1px solid rgba(226,75,74,.3)', borderRadius: 14, textAlign: 'center' }}><WifiOff size={18} style={{ color: C.red, margin: '0 auto 6px' }} /><div style={{ fontSize: 13, fontWeight: 700, color: C.red, marginBottom: 6 }}>You are offline</div>{resolveEmergencyNumber() ? <a href={`tel:${resolveEmergencyNumber()}`} style={{ display: 'inline-block', padding: '9px 22px', background: C.red, color: '#fff', borderRadius: 10, fontSize: 14, fontWeight: 800, textDecoration: 'none' }}>Call {resolveEmergencyNumber()}</a> : <div style={{ fontSize: 12, color: C.muted }}>{emergencyHelpLine()}</div>}</div>}
        {/* SOS / notify now live in the sheet header, so the body leads with
            whatever is actually around the user. */}
        {nearestHospital && <div style={{ marginBottom: 8, padding: '11px 13px', background: 'rgba(226,75,74,.07)', border: '1px solid rgba(226,75,74,.2)', borderRadius: 14 }}><div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.07em', color: C.red, marginBottom: 4 }}>Nearest Hospital</div><div style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{nearestHospital.name}</div><div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, flexWrap: 'wrap' }}><span style={{ fontSize: 12, color: C.teal, fontWeight: 600 }}>{nearestHospital.dist}</span>{etaLoading && <Loader size={10} style={{ color: C.muted, animation: 'spin 1s linear infinite' }} />}{eta?.walk && <span style={{ fontSize: 11, color: C.muted, display: 'flex', alignItems: 'center', gap: 3 }}><Footprints size={10} />{eta.walk.durationMin}m walk</span>}{eta?.drive && <span style={{ fontSize: 11, color: C.muted, display: 'flex', alignItems: 'center', gap: 3 }}><Car size={10} />{eta.drive.durationMin}m drive</span>}</div><a href={`https://www.google.com/maps/dir/?api=1&destination=${nearestHospital.lat},${nearestHospital.lng}`} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, padding: 8, background: C.red, color: '#fff', borderRadius: 9, fontSize: 12, fontWeight: 700, textDecoration: 'none' }}><RouteIcon size={12} /> Get Directions Now</a></div>}
        {/* Explore: category shortcuts are always available, so the page keeps
            offering plenty to tap even with no fix, no data or a slow network. */}
        {online && (
          <motion.div variants={listContainer} initial="initial" animate="animate" style={{ marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.07em', color: C.muted }}>Explore nearby</div>
              <div style={{ fontSize: 10, color: C.muted, display: 'flex', alignItems: 'center', gap: 4 }}><Compass size={11} /> {EXPLORE_TILES.length + quickSearches.length} ideas</div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 7 }}>
              {EXPLORE_TILES.map(tile => {
                const Icon = tile.icon;
                return (
                  <motion.button key={tile.term} variants={listItem} whileTap={{ scale: 0.94 }} onClick={() => runSuggestion(tile.term)} title={`Search ${tile.label.toLowerCase()} nearby`}
                    style={{ padding: '10px 4px 8px', borderRadius: 13, background: C.card, border: `1px solid ${C.border}`, color: C.text, cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5 }}>
                    <span style={{ width: 30, height: 30, borderRadius: 10, background: tile.bg, color: tile.color, display: 'grid', placeItems: 'center' }}><Icon size={14} /></span>
                    <span style={{ fontSize: 10, fontWeight: 600, lineHeight: 1.1 }}>{tile.label}</span>
                  </motion.button>
                );
              })}
            </div>
            {/* Time-aware quick searches: the useful things differ at 8am and 8pm. */}
            <div style={{ display: 'flex', gap: 6, overflowX: 'auto', scrollbarWidth: 'none', marginTop: 9, paddingBottom: 2 }}>
              {quickSearches.map(term => (
                <motion.button key={term} variants={listItem} whileTap={{ scale: 0.95 }} onClick={() => runSuggestion(term)}
                  style={{ flexShrink: 0, padding: '6px 10px', borderRadius: 999, background: 'rgba(255,255,255,0.05)', border: `.5px solid ${C.border}`, color: C.text, fontSize: 11, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}>
                  <Sparkles size={11} style={{ color: C.teal }} /> {term}
                </motion.button>
              ))}
            </div>
          </motion.div>
        )}

        {/* The nearest of each everyday need, so "what is closest?" is answered
            without opening a category. */}
        {essentials.length > 0 && (
          <motion.div variants={listContainer} initial="initial" animate="animate" style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.07em', color: C.muted, marginBottom: 8 }}>Quick picks</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 7 }}>
              {essentials.map(item => {
                const cfg = getCat(item.place); const Icon = cfg.icon;
                return (
                  <motion.button key={item.key} variants={listItem} whileTap={{ scale: 0.97 }} onClick={() => focusPlace(item.place)}
                    style={{ textAlign: 'left', padding: 10, borderRadius: 13, background: C.card, border: `1px solid ${C.border}`, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                    <span style={{ width: 30, height: 30, borderRadius: 10, background: cfg.bg, color: cfg.color, display: 'grid', placeItems: 'center', flexShrink: 0 }}><Icon size={14} /></span>
                    <span style={{ minWidth: 0 }}>
                      <span style={{ display: 'block', fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', color: C.muted }}>{item.label}</span>
                      <span style={{ display: 'block', fontSize: 12, fontWeight: 700, color: C.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.place.name}</span>
                      <span style={{ display: 'block', fontSize: 10, color: C.teal, fontWeight: 600 }}>{item.place.dist}</span>
                    </span>
                  </motion.button>
                );
              })}
            </div>
          </motion.div>
        )}

        {/* Saved places stay pinned near the top, so a shortlist is never lost. */}
        {savedPlaces.length > 0 && filter === 'all' && (
          <motion.div variants={listContainer} initial="initial" animate="animate" style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.07em', color: C.muted, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 5 }}><Star size={11} fill={C.amber} style={{ color: C.amber }} /> Saved places</div>
            <div style={{ display: 'flex', gap: 8, overflowX: 'auto', scrollbarWidth: 'none', paddingBottom: 2 }}>
              {savedPlaces.map(place => { const cfg = getCat(place); const Icon = cfg.icon; return (
                <motion.div key={place.id} variants={listItem} whileTap={{ scale: 0.97 }} onClick={() => focusPlace(place)}
                  style={{ flexShrink: 0, width: 150, padding: 10, borderRadius: 14, background: C.card, border: `1px solid ${selected === place.id ? cfg.color + '35' : C.border}`, cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                    <span style={{ width: 26, height: 26, borderRadius: 9, background: cfg.bg, color: cfg.color, display: 'grid', placeItems: 'center' }}><Icon size={13} /></span>
                    <button onClick={e => { e.stopPropagation(); toggleFav(place.id); }} aria-label="Remove from saved" style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.amber, padding: 3 }}><Star size={13} fill={C.amber} /></button>
                  </div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: C.text, lineHeight: 1.3, minHeight: 31, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{place.name}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ fontSize: 10, color: C.teal, fontWeight: 600 }}>{place.dist}</span><span style={{ fontSize: 10, color: C.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{place.type}</span></div>
                </motion.div>
              ); })}
            </div>
          </motion.div>
        )}

        {/* Suggested carousels: the browse-what-is-around-me experience, biggest
            category first. Hidden while a category filter is applied, so the list
            below stays the single source of truth. */}
        {places.length > 0 && filter === 'all' && carousels.length > 0 && <div style={{ marginBottom: 4 }}>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.07em', color: C.muted, marginBottom: 8 }}>Suggested around you</div>
          {carousels.map(([category, list]) => { const cat = catConfig[category] || catConfig.other; const Icon = cat.icon; return (
            <div key={category} style={{ marginBottom: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                <Icon size={12} style={{ color: cat.color }} />
                <span style={{ fontSize: 12, fontWeight: 700, color: C.text }}>{SECTION_LABEL[category] || cat.label}</span>
                <span style={{ fontSize: 11, color: C.muted }}>{list.length}</span>
              </div>
              <motion.div variants={listContainer} initial="initial" animate="animate" style={{ display: 'flex', gap: 8, overflowX: 'auto', scrollbarWidth: 'none', paddingBottom: 2 }}>
                {list.slice(0, 8).map(place => { const fav = favorites.includes(place.id); return (
                  <motion.div key={place.id} variants={listItem} whileTap={{ scale: 0.97 }} onClick={() => focusPlace(place)} style={{ flexShrink: 0, width: 150, padding: 10, borderRadius: 14, background: C.card, border: `1px solid ${selected === place.id ? cat.color + '35' : C.border}`, cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                      <span style={{ width: 26, height: 26, borderRadius: 9, background: cat.bg, color: cat.color, display: 'grid', placeItems: 'center' }}><Icon size={13} /></span>
                      <button onClick={e => { e.stopPropagation(); toggleFav(place.id); }} aria-label={fav ? 'Remove from saved' : 'Save place'} style={{ background: 'none', border: 'none', cursor: 'pointer', color: fav ? C.amber : C.muted, padding: 3 }}><Star size={13} fill={fav ? C.amber : 'none'} /></button>
                    </div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: C.text, lineHeight: 1.3, minHeight: 31, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{place.name}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontSize: 10, color: C.teal, fontWeight: 700 }}>{place.dist}</span>
                      <span style={{ fontSize: 10, color: C.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{place.type}</span>
                    </div>
                  </motion.div>
                ); })}
              </motion.div>
            </div>
          ); })}
        </div>}
        {/* Empty states always offer a next step instead of a dead end. */}
        {!center && online && <div style={{ textAlign: 'center', padding: '16px 0 10px', fontSize: 12, color: C.muted, lineHeight: 1.6 }}><MapPin size={22} style={{ color: C.muted, margin: '0 auto 8px' }} />Allow location access to see what is around you.<br />Until then, tap a category above or search for a place.</div>}
        {center && !live && online && <div style={{ textAlign: 'center', padding: '2px 0 10px', fontSize: 11, color: C.amber }}>Showing your last known area — turn on location for live results.</div>}
        {center && online && loading && places.length === 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7, marginBottom: 10 }}>
            {[0, 1, 2].map(i => (
              <motion.div key={i} animate={reduced ? undefined : { opacity: [0.35, 0.7, 0.35] }} transition={{ duration: 1.4, repeat: Infinity, delay: i * 0.12 }}
                style={{ height: 62, borderRadius: 13, background: 'rgba(255,255,255,0.05)', border: `1px solid ${C.border}` }} />
            ))}
          </div>
        )}
        {center && online && !loading && !places.length && <div style={{ textAlign: 'center', padding: '12px 0', fontSize: 12, color: C.muted, lineHeight: 1.6 }}><Hospital size={22} style={{ color: C.muted, margin: '0 auto 8px' }} />No mapped places came back for this area.<br />Try a category above or search for a place.</div>}
        {places.length > 0 && <>
          <motion.div variants={listContainer} initial="initial" animate="animate" style={{ display: 'flex', gap: 5, marginBottom: 8, overflowX: 'auto', scrollbarWidth: 'none', paddingBottom: 2 }}>{['all', ...Array.from(new Set(places.map(p => p.category)))].map(cat => { const cfg = cat === 'all' ? null : catConfig[cat]; const count = cat === 'all' ? places.length : places.filter(p => p.category === cat).length; const accent = cfg?.color || C.teal; return <motion.button key={cat} variants={listItem} whileTap={{ scale: 0.94 }} onClick={() => setFilter(cat)} style={{ position: 'relative', flexShrink: 0, padding: '4px 10px', borderRadius: 20, border: 'none', background: 'transparent', color: filter === cat ? (cat === 'all' ? '#04342C' : '#fff') : C.muted, fontSize: 10, fontWeight: 600 }}>{filter === cat && <motion.span layoutId="map-filter-pill" transition={SPRING_SNAPPY} style={{ position: 'absolute', inset: 0, borderRadius: 20, background: accent }} />}<span style={{ position: 'relative' }}>{cfg?.label || 'All'} ({count})</span></motion.button>; })}</motion.div>
          <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.07em', color: C.muted, marginBottom: 7, display: 'flex', alignItems: 'center', gap: 6 }}>{filtered.length} place{filtered.length !== 1 ? 's' : ''} nearby {loading && <Loader size={10} style={{ color: C.teal, animation: 'spin 1s linear infinite' }} />}</div>
          {/* Re-stagger on every filter change: key={filter} remounts the list so the entrance replay is predictable rather than a partial diff. */}
          <motion.div key={filter} variants={listContainer} initial="initial" animate="animate" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>{filtered.map(place => { const cat = getCat(place); const Icon = cat.icon; const isFav = favorites.includes(place.id); const isSel = selected === place.id; return <motion.div key={place.id} id={`place-row-${place.id}`} variants={listItem} whileTap={{ scale: .99 }} onClick={() => { setSelected(isSel ? null : place.id); flyTo(place); }} style={{ background: isSel ? `${cat.color}12` : C.card, border: `1px solid ${isSel ? cat.color + '35' : C.border}`, borderRadius: 13, padding: '11px 12px', cursor: 'pointer' }}><div style={{ display: 'flex', alignItems: 'center', gap: 10 }}><div style={{ width: 36, height: 36, borderRadius: 12, background: cat.bg, display: 'grid', placeItems: 'center', color: cat.color, flexShrink: 0 }}><Icon size={16} /></div><div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 13, fontWeight: 600, color: C.text, marginBottom: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{place.name}</div><div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}><span style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', padding: '1px 6px', borderRadius: 5, background: cat.bg, color: cat.color }}>{place.type}</span><span style={{ fontSize: 11, color: C.teal, fontWeight: 600 }}>{place.dist}</span>{place.opening_hours && <span style={{ fontSize: 9, color: C.amber }}>🕐 {place.opening_hours.substring(0, 20)}</span>}</div></div><button onClick={e => { e.stopPropagation(); toggleFav(place.id); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: isFav ? C.amber : C.muted, padding: 3 }}><Star size={14} fill={isFav ? C.amber : 'none'} /></button></div>{isSel && <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} transition={SPRING_SOFT} style={{ marginTop: 9, paddingTop: 9, borderTop: '.5px solid rgba(255,255,255,.06)', display: 'flex', gap: 6, overflow: 'hidden' }}><a href={`https://www.google.com/maps/dir/?api=1&destination=${place.lat},${place.lng}`} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} style={{ flex: 1, padding: 7, background: C.teal, color: '#04342C', borderRadius: 8, fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, textDecoration: 'none' }}><RouteIcon size={11} /> Route</a>{(place.phone || resolveEmergencyNumber()) && <a href={place.phone ? `tel:${place.phone}` : `tel:${resolveEmergencyNumber()}`} onClick={e => e.stopPropagation()} style={{ flex: 1, padding: 7, background: 'rgba(226,75,74,.18)', color: C.red, borderRadius: 8, fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, textDecoration: 'none' }}><Phone size={11} /> {place.phone ? 'Call' : 'SOS'}</a>}<a href={`https://www.google.com/maps/search/${encodeURIComponent(place.name)}`} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} style={{ flex: 1, padding: 7, background: 'rgba(255,255,255,.07)', color: C.text, borderRadius: 8, fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, textDecoration: 'none' }}><MapPin size={11} /> Maps</a></motion.div>}</motion.div>; })}</motion.div>
        </>}
        </div>
      </motion.section>
      <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}} .leaflet-container{overflow-anchor:none!important}.leaflet-control-zoom{border:none!important;box-shadow:none!important}.leaflet-control-zoom a{background:rgba(7,16,29,.92)!important;color:#E2F4F0!important;border:.5px solid rgba(255,255,255,.12)!important;border-radius:8px!important;margin-bottom:4px!important;width:32px!important;height:32px!important;line-height:32px!important;font-size:16px!important}.leaflet-control-attribution{font-size:9px!important;background:rgba(7,16,29,.72)!important;color:#9bb6ad!important}.leaflet-control-attribution a{color:#6fe0c3!important}.veda-popup .leaflet-popup-content-wrapper{background:#111827!important;border:.5px solid rgba(255,255,255,.1)!important;border-radius:12px!important;color:#E2F4F0!important;box-shadow:0 8px 32px rgba(0,0,0,.5)!important;padding:0!important}.veda-popup .leaflet-popup-content{margin:14px 16px!important}.veda-popup .leaflet-popup-tip{background:#111827!important}.veda-popup .leaflet-popup-close-button{color:#5A7A72!important}.veda-tooltip.leaflet-tooltip{background:rgba(7,16,29,.9)!important;border:.5px solid rgba(45,212,164,.3)!important;color:#2DD4A4!important;font-size:11px!important;font-weight:600!important}`}</style>
    </div>
  </>;
}







