import { motion } from 'motion/react';
import { Search, Navigation, MapPin, Phone, Route as RouteIcon, Star, Hospital, Pill, Stethoscope } from 'lucide-react';
import { useState } from 'react';

const C = {
  teal: '#2DD4A4',
  blue: '#378ADD',
  amber: '#EF9F27',
  red: '#E24B4A',
  text: '#E2F4F0',
  muted: '#5A7A72',
  card: 'rgba(13,21,37,0.9)',
  border: 'rgba(255,255,255,0.09)',
};

const nearbyPlaces = [
  { id: 1, name: 'Lagos Island General Hospital', type: 'hospital', dist: '1.2km', open: true, rating: 4.3 },
  { id: 2, name: 'MedPlus Pharmacy', type: 'pharmacy', dist: '0.4km', open: true, rating: 4.7 },
  { id: 3, name: 'LifePoint Medical Clinic', type: 'clinic', dist: '0.8km', open: false, rating: 4.1 },
  { id: 4, name: 'Victoria Island Pharmacy', type: 'pharmacy', dist: '1.8km', open: true, rating: 4.5 },
  { id: 5, name: 'Eko Hospital', type: 'hospital', dist: '2.3km', open: true, rating: 4.6 },
];

const typeStyle: Record<string, { color: string; bg: string; icon: typeof Hospital }> = {
  hospital: { color: C.red, bg: 'rgba(226,75,74,0.15)', icon: Hospital },
  pharmacy: { color: C.blue, bg: 'rgba(55,138,221,0.15)', icon: Pill },
  clinic: { color: C.amber, bg: 'rgba(239,159,39,0.15)', icon: Stethoscope },
};

/* Stylized map grid background */
function MapBackground({ userLat = 6.5244, userLng = 3.3792 }) {
  const dots: { x: number; y: number; type: string }[] = [
    { x: 35, y: 42, type: 'hospital' },
    { x: 68, y: 28, type: 'pharmacy' },
    { x: 52, y: 65, type: 'clinic' },
    { x: 22, y: 70, type: 'pharmacy' },
    { x: 79, y: 60, type: 'hospital' },
  ];

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden', background: '#0a1322' }}>
      {/* Grid lines */}
      <svg width="100%" height="100%" style={{ position: 'absolute', inset: 0 }}>
        <defs>
          <pattern id="mapGrid" width="40" height="40" patternUnits="userSpaceOnUse">
            <path d="M 40 0 L 0 0 0 40" fill="none" stroke="rgba(255,255,255,0.035)" strokeWidth="0.5" />
          </pattern>
          <pattern id="mapGridBig" width="120" height="120" patternUnits="userSpaceOnUse">
            <path d="M 120 0 L 0 0 0 120" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="0.5" />
          </pattern>
          <radialGradient id="mapFade" cx="50%" cy="50%">
            <stop offset="0%" stopColor="#0a1322" stopOpacity="0" />
            <stop offset="100%" stopColor="#07101D" stopOpacity="0.9" />
          </radialGradient>
        </defs>
        <rect width="100%" height="100%" fill="url(#mapGrid)" />
        <rect width="100%" height="100%" fill="url(#mapGridBig)" />
        {/* Roads */}
        <line x1="0" y1="50%" x2="100%" y2="50%" stroke="rgba(255,255,255,0.06)" strokeWidth="2" />
        <line x1="50%" y1="0" x2="50%" y2="100%" stroke="rgba(255,255,255,0.06)" strokeWidth="2" />
        <line x1="0" y1="30%" x2="100%" y2="35%" stroke="rgba(255,255,255,0.04)" strokeWidth="1" />
        <line x1="0" y1="70%" x2="100%" y2="65%" stroke="rgba(255,255,255,0.04)" strokeWidth="1" />
        <line x1="30%" y1="0" x2="25%" y2="100%" stroke="rgba(255,255,255,0.04)" strokeWidth="1" />
        <line x1="75%" y1="0" x2="80%" y2="100%" stroke="rgba(255,255,255,0.04)" strokeWidth="1" />
        {/* Road labels */}
        <text x="52%" y="48%" fill="rgba(255,255,255,0.12)" fontSize="8" fontFamily="monospace">Broad Street</text>
        <text x="52%" y="68%" fill="rgba(255,255,255,0.12)" fontSize="8" fontFamily="monospace">Marina Road</text>
        {/* Vignette */}
        <rect width="100%" height="100%" fill="url(#mapFade)" />
      </svg>

      {/* Place markers */}
      {dots.map((dot, i) => {
        const ts = typeStyle[dot.type] || typeStyle.clinic;
        return (
          <motion.div
            key={i}
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.2 + i * 0.08 }}
            style={{
              position: 'absolute',
              left: `${dot.x}%`,
              top: `${dot.y}%`,
              transform: 'translate(-50%, -50%)',
              width: 14,
              height: 14,
              borderRadius: '50%',
              background: ts.color,
              border: '2px solid rgba(10,19,34,0.9)',
              boxShadow: `0 0 10px ${ts.color}60`,
              cursor: 'pointer',
            }}
          />
        );
      })}

      {/* User marker */}
      <div style={{
        position: 'absolute',
        left: '50%',
        top: '50%',
        transform: 'translate(-50%, -50%)',
        zIndex: 5,
      }}>
        <motion.div
          animate={{ boxShadow: ['0 0 0 0 rgba(45,212,164,0.4)', '0 0 0 12px rgba(45,212,164,0)', '0 0 0 0 rgba(45,212,164,0)'] }}
          transition={{ duration: 2, repeat: Infinity }}
          style={{
            width: 18,
            height: 18,
            borderRadius: '50%',
            background: C.teal,
            border: '3px solid #0a1322',
          }}
        />
      </div>
    </div>
  );
}

export function MapPage() {
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<number | null>(null);
  const [favorites, setFavorites] = useState<number[]>([]);

  const filtered = nearbyPlaces.filter(p =>
    !search || p.name.toLowerCase().includes(search.toLowerCase()) || p.type.includes(search.toLowerCase())
  );

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.24 }}
      style={{ position: 'relative', height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
    >
      {/* Map area */}
      <div style={{ flex: '0 0 240px', position: 'relative' }}>
        <MapBackground />

        {/* Search overlay */}
        <div style={{ position: 'absolute', top: 12, left: 12, right: 12, zIndex: 20 }}>
          <div style={{ position: 'relative' }}>
            <Search size={14} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: C.muted }} />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search hospitals, pharmacies..."
              style={{
                width: '100%',
                paddingLeft: 36,
                paddingRight: 16,
                paddingTop: 11,
                paddingBottom: 11,
                background: 'rgba(17,24,39,0.92)',
                backdropFilter: 'blur(12px)',
                border: '0.5px solid rgba(255,255,255,0.12)',
                borderRadius: 22,
                color: C.text,
                fontSize: 13,
                outline: 'none',
                boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
              }}
            />
          </div>
        </div>

        {/* Location badge */}
        <div style={{
          position: 'absolute',
          bottom: 12,
          left: 12,
          background: 'rgba(17,24,39,0.88)',
          backdropFilter: 'blur(8px)',
          border: '0.5px solid rgba(45,212,164,0.2)',
          borderRadius: 10,
          padding: '6px 12px',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          zIndex: 20,
          fontSize: 11,
          color: C.teal,
          fontWeight: 600,
        }}>
          <MapPin size={12} />
          Lagos Island, Nigeria
        </div>

        {/* Recenter button */}
        <button
          style={{
            position: 'absolute',
            bottom: 12,
            right: 12,
            width: 40,
            height: 40,
            borderRadius: '50%',
            background: 'rgba(17,24,39,0.88)',
            backdropFilter: 'blur(8px)',
            border: '0.5px solid rgba(255,255,255,0.12)',
            color: C.blue,
            display: 'grid',
            placeItems: 'center',
            cursor: 'pointer',
            zIndex: 20,
          }}
        >
          <Navigation size={16} />
        </button>
      </div>

      {/* Nearby care list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px 100px', scrollbarWidth: 'none' }}>
        <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', color: C.muted, marginBottom: 10 }}>
          Nearby Care ({filtered.length})
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {filtered.map(place => {
            const ts = typeStyle[place.type] || typeStyle.clinic;
            const Icon = ts.icon;
            const isFav = favorites.includes(place.id);
            const isSelected = selected === place.id;
            return (
              <motion.div
                key={place.id}
                whileTap={{ scale: 0.99 }}
                onClick={() => setSelected(isSelected ? null : place.id)}
                style={{
                  background: isSelected ? 'rgba(45,212,164,0.08)' : C.card,
                  border: `1px solid ${isSelected ? 'rgba(45,212,164,0.3)' : C.border}`,
                  borderRadius: 16,
                  padding: '14px 14px',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{
                    width: 40,
                    height: 40,
                    borderRadius: 14,
                    background: ts.bg,
                    display: 'grid',
                    placeItems: 'center',
                    color: ts.color,
                    flexShrink: 0,
                  }}>
                    <Icon size={18} strokeWidth={1.8} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontSize: 13,
                      fontWeight: 600,
                      color: C.text,
                      marginBottom: 2,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}>
                      {place.name}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{
                        display: 'inline-block',
                        fontSize: 9,
                        fontWeight: 700,
                        textTransform: 'uppercase',
                        letterSpacing: '0.04em',
                        padding: '2px 7px',
                        borderRadius: 6,
                        background: ts.bg,
                        color: ts.color,
                      }}>{place.type}</span>
                      <span style={{ fontSize: 11, color: C.teal, fontWeight: 600 }}>{place.dist}</span>
                      <span style={{ fontSize: 11, color: place.open ? C.teal : C.muted }}>{place.open ? 'Open' : 'Closed'}</span>
                    </div>
                  </div>
                  <button
                    onClick={e => { e.stopPropagation(); setFavorites(f => isFav ? f.filter(id => id !== place.id) : [...f, place.id]); }}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: isFav ? C.amber : C.muted, padding: 4 }}
                  >
                    <Star size={16} fill={isFav ? C.amber : 'none'} />
                  </button>
                </div>

                {/* Expanded actions */}
                {isSelected && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    style={{ marginTop: 12, paddingTop: 12, borderTop: '0.5px solid rgba(255,255,255,0.06)', display: 'flex', gap: 8 }}
                  >
                    <button style={{ flex: 1, padding: '8px 12px', background: C.teal, color: '#04342C', borderRadius: 10, border: 'none', fontSize: 11, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                      <RouteIcon size={13} /> Route
                    </button>
                    <button style={{ flex: 1, padding: '8px 12px', background: 'rgba(55,138,221,0.18)', color: C.blue, borderRadius: 10, border: 'none', fontSize: 11, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                      <Phone size={13} /> Call
                    </button>
                    <a
                      href={`https://www.google.com/maps/search/${encodeURIComponent(place.name)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={e => e.stopPropagation()}
                      style={{ flex: 1, padding: '8px 12px', background: 'rgba(255,255,255,0.07)', color: C.text, borderRadius: 10, border: 'none', fontSize: 11, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, textDecoration: 'none' }}
                    >
                      <MapPin size={13} /> Maps
                    </a>
                  </motion.div>
                )}
              </motion.div>
            );
          })}
        </div>
      </div>
    </motion.div>
  );
}
