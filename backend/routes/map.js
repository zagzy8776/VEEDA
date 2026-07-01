import { Router } from 'express';
const router = Router();

// ── Helper: haversine distance ────────────────────────────────────────────────
function distBetween(lat1, lng1, lat2, lng2) {
  const R = 6371000, toR = x => x * Math.PI / 180;
  const dLat = toR(lat2 - lat1), dLng = toR(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toR(lat1)) * Math.cos(toR(lat2)) * Math.sin(dLng / 2) ** 2;
  return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}
function fmtDist(m) { return m < 1000 ? `${m}m` : `${(m / 1000).toFixed(1)}km`; }

// ── Weather via Geoapify (with open-meteo fallback) ───────────────────────────
async function fetchWeather(lat, lng) {
  const geoKey = process.env.GEOAPIFY_API_KEY;

  // Try Geoapify first
  if (geoKey) {
    try {
      const r = await fetch(
        `https://api.geoapify.com/v1/weather?lat=${lat}&lon=${lng}&apiKey=${geoKey}`
      );
      const d = await r.json();
      const c = d?.properties?.current;
      if (c) {
        return {
          status: 'available',
          source: 'geoapify',
          temperature: c.temperature ?? null,
          apparentTemperature: c.feelsLike ?? null,
          humidity: c.humidity ?? null,
          windSpeed: c.windSpeed ?? null,
          precipitation: c.precipitation ?? null,
          description: c.description || null,
          observedAt: new Date().toISOString(),
        };
      }
    } catch { /* fall through */ }
  }

  // Fallback: open-meteo (free, no key)
  try {
    const r = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,apparent_temperature,precipitation,wind_speed_10m,relative_humidity_2m&timezone=auto`
    );
    const d = await r.json();
    const c = d.current || {};
    return {
      status: 'available',
      source: 'open-meteo',
      temperature: c.temperature_2m ?? null,
      apparentTemperature: c.apparent_temperature ?? null,
      humidity: c.relative_humidity_2m ?? null,
      windSpeed: c.wind_speed_10m ?? null,
      precipitation: c.precipitation ?? null,
      observedAt: c.time ?? null,
    };
  } catch {
    return { status: 'unavailable' };
  }
}

router.get('/context', async (req, res) => {
  const { lat, lng } = req.query;
  if (!lat || !lng) return res.status(400).json({ error: 'lat and lng required' });
  const weather = await fetchWeather(lat, lng);
  res.json({ weather, airQuality: { status: 'unavailable' }, nearbyCare: [] });
});

router.post('/context', async (req, res) => {
  const { lat, lng } = req.body;
  if (!lat || !lng) return res.status(400).json({ error: 'lat and lng required' });
  const weather = await fetchWeather(lat, lng);
  res.json({ weather, airQuality: { status: 'unavailable' }, nearbyCare: [] });
});

// ── Nearby places via Overpass — ALL place types ──────────────────────────────
router.get('/nearby', async (req, res) => {
  const { lat, lng, radius = 0.08 } = req.query;
  if (!lat || !lng) return res.status(400).json({ error: 'lat and lng required' });

  const d = parseFloat(radius);
  const bbox = `${parseFloat(lat) - d},${parseFloat(lng) - d},${parseFloat(lat) + d},${parseFloat(lng) + d}`;

  // Comprehensive Overpass query — health + food + shopping + streets
  const query = `[out:json][timeout:25];(
    node[amenity~"hospital|pharmacy|clinic|doctors|dentist|veterinary"](${bbox});
    way[amenity~"hospital|pharmacy|clinic|doctors|dentist"](${bbox});
    node[amenity~"restaurant|cafe|fast_food|bar|pub|food_court"](${bbox});
    way[amenity~"restaurant|cafe|fast_food"](${bbox});
    node[shop~"supermarket|convenience|grocery|mall|department_store|bakery|butcher|greengrocer"](${bbox});
    node[amenity~"school|university|college|bank|atm|fuel|parking|police|fire_station"](${bbox});
    node[tourism~"hotel|hostel|motel|guest_house"](${bbox});
    node[amenity="place_of_worship"](${bbox});
  );out center 100;`;

  try {
    const r = await fetch(`https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`);
    const data = await r.json();

    const places = (data.elements || [])
      .filter(e => (e.lat || e.center) && e.tags?.name)
      .map((e, i) => {
        const plat = e.lat ?? e.center.lat;
        const plng = e.lon ?? e.center.lon;
        const distM = distBetween(parseFloat(lat), parseFloat(lng), plat, plng);
        const amenity = e.tags?.amenity || e.tags?.shop || e.tags?.tourism || 'place';
        return {
          id: i,
          name: e.tags.name,
          type: amenity,
          category: getCategory(amenity),
          phone: e.tags?.phone || e.tags?.['contact:phone'] || null,
          opening_hours: e.tags?.opening_hours || null,
          website: e.tags?.website || e.tags?.['contact:website'] || null,
          distM,
          dist: fmtDist(distM),
          lat: plat,
          lng: plng,
        };
      })
      .sort((a, b) => a.distM - b.distM);

    res.json({ places, count: places.length });
  } catch (err) {
    res.json({ places: [], count: 0, error: 'Overpass unavailable' });
  }
});

function getCategory(amenity) {
  if (['hospital', 'clinic', 'doctors', 'dentist', 'pharmacy', 'veterinary'].includes(amenity)) return 'health';
  if (['restaurant', 'cafe', 'fast_food', 'bar', 'pub', 'food_court'].includes(amenity)) return 'food';
  if (['supermarket', 'convenience', 'grocery', 'mall', 'department_store', 'bakery', 'butcher', 'greengrocer'].includes(amenity)) return 'shopping';
  if (['school', 'university', 'college'].includes(amenity)) return 'education';
  if (['bank', 'atm'].includes(amenity)) return 'finance';
  if (['hotel', 'hostel', 'motel', 'guest_house'].includes(amenity)) return 'lodging';
  if (['fuel', 'parking'].includes(amenity)) return 'transport';
  if (['police', 'fire_station'].includes(amenity)) return 'emergency';
  return 'other';
}

// ── Search via Geoapify geocoding (with Nominatim fallback) ───────────────────
router.get('/search', async (req, res) => {
  const { q, lat, lng } = req.query;
  if (!q) return res.json([]);

  const geoKey = process.env.GEOAPIFY_API_KEY;

  if (geoKey) {
    try {
      const bias = lat ? `&bias=proximity:${lng},${lat}` : '';
      const url = `https://api.geoapify.com/v1/geocode/autocomplete?text=${encodeURIComponent(q)}&limit=8&apiKey=${geoKey}${bias}`;
      const r = await fetch(url);
      const d = await r.json();
      const results = (d.features || []).map(f => ({
        name: f.properties.name || f.properties.formatted?.split(',')[0],
        address: f.properties.formatted,
        lat: f.geometry.coordinates[1],
        lng: f.geometry.coordinates[0],
        type: f.properties.result_type || 'place',
      }));
      if (results.length) return res.json(results);
    } catch { /* fall through */ }
  }

  // Nominatim fallback
  try {
    const viewbox = lat ? `&viewbox=${parseFloat(lng)-0.2},${parseFloat(lat)+0.2},${parseFloat(lng)+0.2},${parseFloat(lat)-0.2}&bounded=0` : '';
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=8${viewbox}`;
    const r = await fetch(url, { headers: { 'User-Agent': 'VEDA-WellnessApp/1.0' } });
    const d = await r.json();
    res.json((d || []).map(f => ({
      name: f.display_name?.split(',')[0],
      address: f.display_name,
      lat: parseFloat(f.lat),
      lng: parseFloat(f.lon),
      type: f.type,
    })));
  } catch {
    res.json([]);
  }
});

// ── Reverse geocode via Geoapify (with Nominatim fallback) ────────────────────
router.get('/reverse-geocode', async (req, res) => {
  const { lat, lng } = req.query;
  if (!lat || !lng) return res.json({ status: 'unavailable' });

  const geoKey = process.env.GEOAPIFY_API_KEY;

  if (geoKey) {
    try {
      const r = await fetch(
        `https://api.geoapify.com/v1/geocode/reverse?lat=${lat}&lon=${lng}&apiKey=${geoKey}`
      );
      const d = await r.json();
      const p = d.features?.[0]?.properties;
      if (p) {
        return res.json({
          status: 'available',
          street: p.street || p.name || '',
          suburb: p.suburb || p.neighbourhood || p.district || '',
          city: p.city || p.town || p.village || '',
          country: p.country || '',
          displayName: p.formatted || '',
        });
      }
    } catch { /* fall through */ }
  }

  // Nominatim fallback
  try {
    const r = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`,
      { headers: { 'User-Agent': 'VEDA-WellnessApp/1.0' } }
    );
    const d = await r.json();
    const a = d.address || {};
    res.json({
      status: 'available',
      street: a.road || a.pedestrian || a.path || '',
      suburb: a.suburb || a.neighbourhood || a.quarter || '',
      city: a.city || a.town || a.village || '',
      country: a.country || '',
      displayName: d.display_name || '',
    });
  } catch {
    res.json({ status: 'unavailable' });
  }
});

// ── ETA via OSRM ──────────────────────────────────────────────────────────────
router.get('/eta', async (req, res) => {
  const { from_lat, from_lng, to_lat, to_lng } = req.query;
  if (!from_lat || !from_lng || !to_lat || !to_lng) return res.status(400).json({ error: 'coords required' });

  async function getRoute(mode) {
    try {
      const r = await fetch(
        `https://router.project-osrm.org/route/v1/${mode}/${from_lng},${from_lat};${to_lng},${to_lat}?overview=false`
      );
      const d = await r.json();
      const route = d.routes?.[0];
      if (!route) return null;
      return { distanceM: Math.round(route.distance), durationMin: Math.round(route.duration / 60) };
    } catch { return null; }
  }

  const [walk, drive] = await Promise.all([getRoute('foot'), getRoute('driving')]);
  res.json({ walk, drive });
});

// ── Full route geometry ───────────────────────────────────────────────────────
router.get('/route', async (req, res) => {
  const { from_lat, from_lng, to_lat, to_lng, mode = 'driving' } = req.query;
  if (!from_lat || !from_lng || !to_lat || !to_lng) return res.status(400).json({ error: 'coords required' });
  try {
    const r = await fetch(
      `https://router.project-osrm.org/route/v1/${mode}/${from_lng},${from_lat};${to_lng},${to_lat}?overview=full&geometries=geojson`
    );
    const d = await r.json();
    const route = d.routes?.[0];
    if (!route) return res.json({ geometry: { coordinates: [] } });
    res.json({
      geometry: route.geometry,
      distance_km: (route.distance / 1000).toFixed(1),
      duration_minutes: Math.round(route.duration / 60),
    });
  } catch {
    res.json({ geometry: { coordinates: [] } });
  }
});

// ── Tiles token ───────────────────────────────────────────────────────────────
router.get('/tiles-token', (req, res) => {
  const token = process.env.MAPBOX_TOKEN;
  if (!token) return res.status(503).json({ error: 'Mapbox token not configured' });
  res.json({ token });
});

export default router;
