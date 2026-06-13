import { Router } from 'express';
const router = Router();

// ── Weather context (GET + POST) ─────────────────────────────────────────────
async function fetchWeather(lat, lng) {
  try {
    const r = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,apparent_temperature,precipitation,wind_speed_10m,relative_humidity_2m&timezone=auto`
    );
    const d = await r.json();
    const c = d.current || {};
    return {
      status: 'available',
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

// ── Nearby care via Overpass ─────────────────────────────────────────────────
router.get('/nearby', async (req, res) => {
  const { lat, lng, radius = 0.07 } = req.query;
  if (!lat || !lng) return res.status(400).json({ error: 'lat and lng required' });

  const d = parseFloat(radius);
  const query = `[out:json][timeout:20];(
    node[amenity~"hospital|pharmacy|clinic"](${lat - d},${lng - d},${lat + d},${lng + d});
    way[amenity~"hospital|pharmacy|clinic"](${lat - d},${lng - d},${lat + d},${lng + d});
  );out center 30;`;

  try {
    const r = await fetch(`https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`);
    const data = await r.json();

    function distBetween(lat1, lng1, lat2, lng2) {
      const R = 6371000, toR = x => x * Math.PI / 180;
      const dLat = toR(lat2 - lat1), dLng = toR(lng2 - lng1);
      const a = Math.sin(dLat / 2) ** 2 + Math.cos(toR(lat1)) * Math.cos(toR(lat2)) * Math.sin(dLng / 2) ** 2;
      return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
    }

    const places = (data.elements || [])
      .filter(e => e.lat || e.center)
      .map((e, i) => {
        const plat = e.lat ?? e.center.lat;
        const plng = e.lon ?? e.center.lon;
        const distM = distBetween(parseFloat(lat), parseFloat(lng), plat, plng);
        return {
          id: i,
          name: e.tags?.name || 'Unnamed facility',
          type: e.tags?.amenity || 'clinic',
          phone: e.tags?.phone || e.tags?.['contact:phone'] || null,
          distM,
          dist: distM < 1000 ? `${distM}m` : `${(distM / 1000).toFixed(1)}km`,
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

// ── Reverse geocode via Nominatim (free, no key needed) ──────────────────────
router.get('/reverse-geocode', async (req, res) => {
  const { lat, lng } = req.query;
  if (!lat || !lng) return res.json({ status: 'unavailable' });
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

// ── ETA via OSRM (walking + driving) ─────────────────────────────────────────
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
      return {
        distanceM: Math.round(route.distance),
        durationMin: Math.round(route.duration / 60),
      };
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

// ── Search via Nominatim ──────────────────────────────────────────────────────
router.get('/search', async (req, res) => {
  const { q, lat, lng } = req.query;
  if (!q) return res.json([]);
  try {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=5${lat ? `&viewbox=${parseFloat(lng)-0.1},${parseFloat(lat)+0.1},${parseFloat(lng)+0.1},${parseFloat(lat)-0.1}&bounded=0` : ''}`;
    const r = await fetch(url, { headers: { 'User-Agent': 'VEDA-WellnessApp/1.0' } });
    const d = await r.json();
    res.json((d || []).map(f => ({ name: f.display_name?.split(',')[0], address: f.display_name, lat: parseFloat(f.lat), lng: parseFloat(f.lon) })));
  } catch {
    res.json([]);
  }
});

// ── Tiles token (Mapbox fallback) ─────────────────────────────────────────────
router.get('/tiles-token', (req, res) => {
  const token = process.env.MAPBOX_TOKEN;
  if (!token) return res.status(503).json({ error: 'Mapbox token not configured' });
  res.json({ token });
});

export default router;
