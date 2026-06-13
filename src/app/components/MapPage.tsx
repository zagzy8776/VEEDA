import { motion } from 'motion/react';
import { Search, Navigation, MapPin, Phone, Route as RouteIcon, Star, Hospital, Pill, Stethoscope, Loader } from 'lucide-react';
import { useState, useEffect } from 'react';
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

function MapGrid({ lat, lng, places }: { lat: number; lng: number; places: Place[] }) {
  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', background: '#0a1322', overflow: 'hidden' }}>
      <svg width="100%" height="100%" style={{ position: 'absolute', inset: 0 }}>
        <defs>
          <pattern id="g1" width="40" height="40" patternUnits="userSpaceOnUse">
            <path d="M 40 0 L 0 0 0 40" fill="none" stroke="rgba(255,255,255,0.035)" strokeWidth="0.5" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#g1)" />
        <line x1="0" y1="50%" x2="100%" y2="50%" stroke="rgba(255,255,255,0.06)" strokeWidth="2" />
        <line x1="50%" y1="0" x2="50%" y2="100%" stroke="rgba(255,255,255,0.06)" strokeWidth="2" />
      </svg>
      {/* Place dots */}
      {places.slice(0, 8).map((p, i) => {
        const ts = typeStyle[p.type] || typeStyle.clinic;
        const x = 20 + (i % 4) * 20;
        const y = 25 + Math.floor(i / 4) * 40;
        return (
          <motion.div key={p.id} initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 0.1 * i }}
            style={{ position: 'absolute', left: `${x}%`, top: `${y}%`, transform: 'translate(-50%,-50%)', width: 12, height: 12, borderRadius: '50%', background: ts.color, border: '2px solid rgba(10,19,34,0.9)', boxShadow: `0 0 8px ${ts.color}60` }} />
        );
      })}
      {/* User dot */}
      <motion.div animate={{ boxShadow: ['0 0 0 0 rgba(45,212,164,0.4)', '0 0 0 12px rgba(45,212,164,0)', '0 0 0 0 rgba(45,212,164,0)'] }} transition={{ duration: 2, repeat: Infinity }}
        style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%,-50%)', width: 18, height: 18, borderRadius: '50%', background: C.teal, border: '3px solid #0a1322', zIndex: 5 }} />
    </div>
  );
}

export function MapPage({ location }: { location: Location }) {
  const [search, setSearch] = useState('');
  const [places, setPlaces] = useState<Place[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);
  const [favorites, setFavorites] = useState<number[]>(() => {
    try { return JSON.parse(localStorage.getItem('veda_fav_places') || '[]'); } catch { return []; }
  });

  useEffect(() => {
    if (!location.lat) return;
    setLoading(true);
    const { lat, lng } = location;
    const d = 0.08;
    const query = `[out:json];(node[amenity=hospital](${lat - d},${lng - d},${lat + d},${lng + d});node[amenity=pharmacy](${lat - d},${lng - d},${lat + d},${lng + d});node[amenity=clinic](${lat - d},${lng - d},${lat + d},${lng + d});way[amenity=hospital](${lat - d},${lng - d},${lat + d},${lng + d});way[amenity=pharmacy](${lat - d},${lng - d},${lat + d},${lng + d}););out center 30;`;
    fetch(`https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`)
      .then(r => r.json())
      .then(data => {
        const results: Place[] = (data.elements || [])
          .filter((e: any) => e.lat || e.center)
          .map((e: any, i: number) => {
            const plat = e.lat || e.center.lat;
            const plng = e.lon || e.center.lon;
            const distM = distBetween(lat, lng, plat, plng);
            return { id: i, name: e.tags?.name || 'Unnamed facility', type: e.tags?.amenity || 'clinic', dist: fmtDist(distM), distM, lat: plat, lng: plng };
          })
          .sort((a: Place, b: Place) => a.distM - b.distM);
        setPlaces(results);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [location.lat, location.lng]);

  const filtered = places.filter(p => !search || p.name.toLowerCase().includes(search.toLowerCase()) || p.type.includes(search.toLowerCase()));

  function toggleFav(id: number) {
    setFavorites(prev => {
      const next = prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id];
      localStorage.setItem('veda_fav_places', JSON.stringify(next));
      return next;
    });
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.24 }}
      style={{ position: 'relative', height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

      <div style={{ flex: '0 0 220px', position: 'relative' }}>
        <MapGrid lat={location.lat ?? 6.5244} lng={location.lng ?? 3.3792} places={places} />
        <div style={{ position: 'absolute', top: 12, left: 12, right: 12, zIndex: 20 }}>
          <div style={{ position: 'relative' }}>
            <Search size={14} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: C.muted }} />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search hospitals, pharmacies..."
              style={{ width: '100%', paddingLeft: 36, paddingRight: 16, paddingTop: 11, paddingBottom: 11, background: 'rgba(17,24,39,0.92)', backdropFilter: 'blur(12px)', border: '0.5px solid rgba(255,255,255,0.12)', borderRadius: 22, color: C.text, fontSize: 13, outline: 'none' }} />
          </div>
        </div>
        <div style={{ position: 'absolute', bottom: 12, left: 12, background: 'rgba(17,24,39,0.88)', backdropFilter: 'blur(8px)', border: '0.5px solid rgba(45,212,164,0.2)', borderRadius: 10, padding: '6px 12px', display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: C.teal, fontWeight: 600 }}>
          <MapPin size={12} />
          {location.lat ? `${location.lat.toFixed(4)}, ${location.lng?.toFixed(4)}` : 'Acquiring GPS...'}
        </div>
        <button style={{ position: 'absolute', bottom: 12, right: 12, width: 40, height: 40, borderRadius: '50%', background: 'rgba(17,24,39,0.88)', backdropFilter: 'blur(8px)', border: '0.5px solid rgba(255,255,255,0.12)', color: C.blue, display: 'grid', placeItems: 'center', cursor: 'pointer' }}>
          <Navigation size={16} />
        </button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px 100px', scrollbarWidth: 'none' }}>
        <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', color: C.muted, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
          Nearby Care ({filtered.length})
          {loading && <Loader size={12} style={{ color: C.teal, animation: 'spin 1s linear infinite' }} />}
        </div>

        {!location.lat && !loading && (
          <div style={{ textAlign: 'center', padding: '30px 0', fontSize: 13, color: C.muted }}>Allow location access to see nearby care facilities.</div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {filtered.map(place => {
            const ts = typeStyle[place.type] || typeStyle.clinic;
            const Icon = ts.icon;
            const isFav = favorites.includes(place.id);
            const isSel = selected === place.id;
            return (
              <motion.div key={place.id} whileTap={{ scale: 0.99 }} onClick={() => setSelected(isSel ? null : place.id)}
                style={{ background: isSel ? 'rgba(45,212,164,0.08)' : C.card, border: `1px solid ${isSel ? 'rgba(45,212,164,0.3)' : C.border}`, borderRadius: 16, padding: 14, cursor: 'pointer', transition: 'all 0.2s' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ width: 40, height: 40, borderRadius: 14, background: ts.bg, display: 'grid', placeItems: 'center', color: ts.color, flexShrink: 0 }}>
                    <Icon size={18} strokeWidth={1.8} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: C.text, marginBottom: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{place.name}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', padding: '2px 7px', borderRadius: 6, background: ts.bg, color: ts.color }}>{place.type}</span>
                      <span style={{ fontSize: 11, color: C.teal, fontWeight: 600 }}>{place.dist}</span>
                    </div>
                  </div>
                  <button onClick={e => { e.stopPropagation(); toggleFav(place.id); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: isFav ? C.amber : C.muted, padding: 4 }}>
                    <Star size={16} fill={isFav ? C.amber : 'none'} />
                  </button>
                </div>
                {isSel && (
                  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}
                    style={{ marginTop: 12, paddingTop: 12, borderTop: '0.5px solid rgba(255,255,255,0.06)', display: 'flex', gap: 8 }}>
                    <a href={`https://www.google.com/maps/dir/?api=1&destination=${place.lat},${place.lng}`} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
                      style={{ flex: 1, padding: '8px 12px', background: C.teal, color: '#04342C', borderRadius: 10, fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, textDecoration: 'none' }}>
                      <RouteIcon size={13} /> Route
                    </a>
                    <a href="tel:112" onClick={e => e.stopPropagation()}
                      style={{ flex: 1, padding: '8px 12px', background: 'rgba(55,138,221,0.18)', color: C.blue, borderRadius: 10, fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, textDecoration: 'none' }}>
                      <Phone size={13} /> Call
                    </a>
                    <a href={`https://www.google.com/maps/search/${encodeURIComponent(place.name)}`} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
                      style={{ flex: 1, padding: '8px 12px', background: 'rgba(255,255,255,0.07)', color: C.text, borderRadius: 10, fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, textDecoration: 'none' }}>
                      <MapPin size={13} /> Maps
                    </a>
                  </motion.div>
                )}
              </motion.div>
            );
          })}
        </div>
      </div>
      <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
    </motion.div>
  );
}
