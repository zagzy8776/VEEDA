import { Router } from 'express';
const router = Router();

function parseCoord(value, name) {
  const n = Number(value);
  if (!Number.isFinite(n)) throw new Error(`${name} must be numeric`);
  return n;
}

function assertCoords(lat, lng) {
  const la = parseCoord(lat, 'lat');
  const lo = parseCoord(lng, 'lng');
  if (la < -90 || la > 90 || lo < -180 || lo > 180) throw new Error('coordinates out of range');
  return { lat: la, lng: lo };
}

function distBetween(lat1, lng1, lat2, lng2) {
  const R = 6371000, toR = x => x * Math.PI / 180;
  const dLat = toR(lat2 - lat1), dLng = toR(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toR(lat1)) * Math.cos(toR(lat2)) * Math.sin(dLng / 2) ** 2;
  return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}
function fmtDist(m) { return m < 1000 ? `${m}m` : `${(m / 1000).toFixed(1)}km`; }

function bboxFor(lat, lng, radiusMeters) {
  const latDelta = radiusMeters / 111320;
  const cosLat = Math.max(Math.cos(lat * Math.PI / 180), 0.15);
  const lngDelta = radiusMeters / (111320 * cosLat);
  return `${lat - latDelta},${lng - lngDelta},${lat + latDelta},${lng + lngDelta}`;
}

async function fetchWeather(lat, lng) {
  const geoKey = process.env.GEOAPIFY_API_KEY;
  if (geoKey) {
    try {
      const r = await fetch(`https://api.geoapify.com/v1/weather?lat=${lat}&lon=${lng}&apiKey=${geoKey}`);
      const d = await r.json();
      const c = d?.properties?.current;
      if (c) return {
        status: 'available', source: 'geoapify',
        temperature: c.temperature ?? null, apparentTemperature: c.feelsLike ?? null,
        humidity: c.humidity ?? null, windSpeed: c.windSpeed ?? null,
        precipitation: c.precipitation ?? null, description: c.description || null,
        observedAt: new Date().toISOString(),
      };
    } catch {}
  }
  try {
    const r = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,apparent_temperature,precipitation,wind_speed_10m,relative_humidity_2m&timezone=auto`);
    const d = await r.json();
    const c = d.current || {};
    return {
      status: 'available', source: 'open-meteo',
      temperature: c.temperature_2m ?? null, apparentTemperature: c.apparent_temperature ?? null,
      humidity: c.relative_humidity_2m ?? null, windSpeed: c.wind_speed_10m ?? null,
      precipitation: c.precipitation ?? null, description: null, observedAt: c.time ?? null,
    };
  } catch { return { status: 'unavailable' }; }
}

async function fetchAirQuality(lat, lng) {
  try {
    const r = await fetch(`https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lng}&current=us_aqi,pm2_5,pm10,carbon_monoxide,nitrogen_dioxide,sulphur_dioxide,ozone&timezone=auto`);
    const d = await r.json();
    const c = d.current || {};
    if (c.us_aqi == null && c.pm2_5 == null) return { status: 'unavailable' };
    const aqi = c.us_aqi ?? null;
    let label = 'Unknown';
    if (aqi !== null) label = aqi <= 50 ? 'Good' : aqi <= 100 ? 'Moderate' : aqi <= 150 ? 'Unhealthy for sensitive groups' : aqi <= 200 ? 'Unhealthy' : aqi <= 300 ? 'Very unhealthy' : 'Hazardous';
    return { status: 'available', source: 'open-meteo-cams', aqi, label, pm25: c.pm2_5 ?? null, pm10: c.pm10 ?? null, ozone: c.ozone ?? null, no2: c.nitrogen_dioxide ?? null, so2: c.sulphur_dioxide ?? null, co: c.carbon_monoxide ?? null, observedAt: c.time ?? null };
  } catch { return { status: 'unavailable' }; }
}

router.get('/context', async (req, res) => {
  try {
    const { lat, lng } = assertCoords(req.query.lat, req.query.lng);
    const [weather, airQuality] = await Promise.all([fetchWeather(lat, lng), fetchAirQuality(lat, lng)]);
    res.json({ weather, airQuality, nearbyCare: [] });
  } catch (err) { res.status(400).json({ error: err.message }); }
});

router.post('/context', async (req, res) => {
  try {
    const { lat, lng } = assertCoords(req.body.lat, req.body.lng);
    const [weather, airQuality] = await Promise.all([fetchWeather(lat, lng), fetchAirQuality(lat, lng)]);
    res.json({ weather, airQuality, nearbyCare: [] });
  } catch (err) { res.status(400).json({ error: err.message }); }
});

router.get('/nearby', async (req, res) => {
  try {
    const { lat, lng } = assertCoords(req.query.lat, req.query.lng);
    const radiusMeters = Math.min(Math.max(Number(req.query.radiusMeters || 5000), 500), 10000);
    const bbox = bboxFor(lat, lng, radiusMeters);
    const query = `[out:json][timeout:25];(
      nwr[amenity~"hospital|clinic|doctors|dentist|pharmacy|veterinary"](${bbox});
      nwr[amenity~"restaurant|cafe|fast_food|bar|pub|food_court"](${bbox});
      nwr[shop~"supermarket|convenience|grocery|mall|department_store|bakery|butcher|greengrocer"](${bbox});
      nwr[amenity~"school|university|college|bank|atm|fuel|parking|police|fire_station"](${bbox});
      nwr[tourism~"hotel|hostel|motel|guest_house"](${bbox});
      nwr[amenity="place_of_worship"](${bbox});
    );out center tags;`;

    const r = await fetch(`https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`);
    if (!r.ok) throw new Error(`Overpass HTTP ${r.status}`);
    const data = await r.json();
    const seen = new Set();

    const places = (data.elements || [])
      .filter(e => (e.lat || e.center?.lat) && (e.lon || e.center?.lon) && e.tags?.name)
      .map(e => {
        const plat = e.lat ?? e.center.lat;
        const plng = e.lon ?? e.center.lon;
        const amenity = e.tags?.amenity || e.tags?.shop || e.tags?.tourism || 'place';
        const id = `osm-${e.type}-${e.id}`;
        return {
          id,
          name: String(e.tags.name),
          type: String(amenity),
          category: getCategory(amenity),
          phone: e.tags?.phone || e.tags?.['contact:phone'] || null,
          opening_hours: e.tags?.opening_hours || null,
          website: e.tags?.website || e.tags?.['contact:website'] || null,
          distM: distBetween(lat, lng, plat, plng),
          lat: Number(plat),
          lng: Number(plng),
        };
      })
      .filter(p => {
        if (p.distM > radiusMeters || seen.has(p.id)) return false;
        seen.add(p.id);
        return true;
      })
      .map(p => ({ ...p, dist: fmtDist(p.distM) }))
      .sort((a, b) => a.distM - b.distM);

    const hospitals = places.filter(p => p.type === 'hospital').slice(0, 5);
    res.json({ places, hospitals, count: places.length, radiusMeters });
  } catch (err) {
    res.status(503).json({ places: [], hospitals: [], count: 0, error: err.message || 'Nearby places unavailable' });
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

router.get('/search', async (req, res) => {
  const { q, lat, lng } = req.query;
  if (!q) return res.json([]);
  const geoKey = process.env.GEOAPIFY_API_KEY;
  if (geoKey) {
    try {
      const bias = lat && lng ? `&bias=proximity:${lng},${lat}` : '';
      const r = await fetch(`https://api.geoapify.com/v1/geocode/autocomplete?text=${encodeURIComponent(q)}&limit=8&apiKey=${geoKey}${bias}`);
      const d = await r.json();
      const results = (d.features || []).map(f => ({ name: f.properties.name || f.properties.formatted?.split(',')[0], address: f.properties.formatted, lat: f.geometry.coordinates[1], lng: f.geometry.coordinates[0], type: f.properties.result_type || 'place' }));
      if (results.length) return res.json(results);
    } catch {}
  }
  try {
    const viewbox = lat && lng ? `&viewbox=${parseFloat(lng)-0.2},${parseFloat(lat)+0.2},${parseFloat(lng)+0.2},${parseFloat(lat)-0.2}&bounded=0` : '';
    const r = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=8${viewbox}`, { headers: { 'User-Agent': 'VEEDA-ClinicalWellness/1.0' } });
    const d = await r.json();
    res.json((d || []).map(f => ({ name: f.display_name?.split(',')[0], address: f.display_name, lat: parseFloat(f.lat), lng: parseFloat(f.lon), type: f.type })));
  } catch { res.json([]); }
});

router.get('/reverse-geocode', async (req, res) => {
  try {
    const { lat, lng } = assertCoords(req.query.lat, req.query.lng);
    const geoKey = process.env.GEOAPIFY_API_KEY;
    if (geoKey) {
      try {
        const r = await fetch(`https://api.geoapify.com/v1/geocode/reverse?lat=${lat}&lon=${lng}&apiKey=${geoKey}`);
        const d = await r.json();
        const p = d.features?.[0]?.properties;
        if (p) return res.json({ status: 'available', street: p.street || p.name || '', suburb: p.suburb || p.neighbourhood || p.district || '', city: p.city || p.town || p.village || '', country: p.country || '', displayName: p.formatted || '' });
      } catch {}
    }
    const r = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`, { headers: { 'User-Agent': 'VEEDA-ClinicalWellness/1.0' } });
    const d = await r.json();
    const a = d.address || {};
    res.json({ status: 'available', street: a.road || a.pedestrian || a.path || '', suburb: a.suburb || a.neighbourhood || a.quarter || '', city: a.city || a.town || a.village || '', country: a.country || '', displayName: d.display_name || '' });
  } catch { res.json({ status: 'unavailable' }); }
});

router.get('/eta', async (req, res) => {
  try {
    const from = assertCoords(req.query.from_lat, req.query.from_lng);
    const to = assertCoords(req.query.to_lat, req.query.to_lng);
    async function getRoute(mode) {
      try {
        const r = await fetch(`https://router.project-osrm.org/route/v1/${mode}/${from.lng},${from.lat};${to.lng},${to.lat}?overview=false`);
        const d = await r.json();
        const route = d.routes?.[0];
        return route ? { distanceM: Math.round(route.distance), durationMin: Math.round(route.duration / 60) } : null;
      } catch { return null; }
    }
    const [walk, drive] = await Promise.all([getRoute('foot'), getRoute('driving')]);
    res.json({ walk, drive });
  } catch (err) { res.status(400).json({ error: err.message }); }
});

router.get('/route', async (req, res) => {
  try {
    const from = assertCoords(req.query.from_lat, req.query.from_lng);
    const to = assertCoords(req.query.to_lat, req.query.to_lng);
    const mode = ['driving', 'foot'].includes(req.query.mode) ? req.query.mode : 'driving';
    const r = await fetch(`https://router.project-osrm.org/route/v1/${mode}/${from.lng},${from.lat};${to.lng},${to.lat}?overview=full&geometries=geojson`);
    const d = await r.json();
    const route = d.routes?.[0];
    if (!route) return res.json({ geometry: { coordinates: [] }, unavailable: true });
    res.json({ geometry: route.geometry, distance_km: (route.distance / 1000).toFixed(1), duration_minutes: Math.round(route.duration / 60), mode });
  } catch (err) { res.status(400).json({ geometry: { coordinates: [] }, unavailable: true, error: err.message }); }
});

router.get('/tiles-token', (req, res) => {
  const token = process.env.MAPBOX_TOKEN;
  if (!token) return res.status(503).json({ error: 'Mapbox token not configured' });
  res.json({ token });
});

export default router;
