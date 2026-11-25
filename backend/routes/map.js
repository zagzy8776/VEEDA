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
  // Primary: Open-Meteo (free, reliable temperature). Do not depend on paid keys.
  let primary = null;
  try {
    const r = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}` +
      `&current=temperature_2m,apparent_temperature,precipitation,wind_speed_10m,relative_humidity_2m,weather_code` +
      `&timezone=auto`
    );
    if (r.ok) {
      const d = await r.json();
      const c = d.current || {};
      const code = c.weather_code;
      const description = weatherCodeToLabel(code);
      if (c.temperature_2m != null || c.apparent_temperature != null) {
        primary = {
          status: 'available',
          source: 'open-meteo',
          temperature: c.temperature_2m ?? null,
          apparentTemperature: c.apparent_temperature ?? null,
          humidity: c.relative_humidity_2m ?? null,
          windSpeed: c.wind_speed_10m ?? null,
          precipitation: c.precipitation ?? null,
          description,
          weatherCode: code ?? null,
          observedAt: c.time ?? null,
        };
      }
    }
  } catch {}

  // Optional enrichment from Geoapify if configured (never block on it)
  const geoKey = process.env.GEOAPIFY_API_KEY;
  if (geoKey) {
    try {
      const r = await fetch(`https://api.geoapify.com/v1/weather?lat=${lat}&lon=${lng}&apiKey=${geoKey}`);
      if (r.ok) {
        const d = await r.json();
        const c = d?.properties?.current || d?.current || {};
        const temp = c.temperature ?? c.temp ?? c.temperature_2m ?? null;
        const feels = c.feelsLike ?? c.apparent_temperature ?? c.feels_like ?? null;
        if (primary) {
          // Fill only missing fields
          if (primary.temperature == null && temp != null) primary.temperature = temp;
          if (primary.apparentTemperature == null && feels != null) primary.apparentTemperature = feels;
          if (!primary.description && (c.description || c.summary)) primary.description = c.description || c.summary;
        } else if (temp != null) {
          primary = {
            status: 'available',
            source: 'geoapify',
            temperature: temp,
            apparentTemperature: feels,
            humidity: c.humidity ?? null,
            windSpeed: c.windSpeed ?? c.wind_speed ?? null,
            precipitation: c.precipitation ?? null,
            description: c.description || c.summary || null,
            observedAt: new Date().toISOString(),
          };
        }
      }
    } catch {}
  }

  return primary || { status: 'unavailable' };
}

function weatherCodeToLabel(code) {
  if (code == null || !Number.isFinite(Number(code))) return null;
  const c = Number(code);
  if (c === 0) return 'Clear';
  if (c <= 3) return 'Partly cloudy';
  if (c <= 48) return 'Fog';
  if (c <= 57) return 'Drizzle';
  if (c <= 67) return 'Rain';
  if (c <= 77) return 'Snow';
  if (c <= 82) return 'Showers';
  if (c <= 86) return 'Snow showers';
  if (c <= 99) return 'Thunderstorm';
  return null;
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

const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://lz4.overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];

async function fetchWithTimeout(url, options = {}, ms = 12000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function mapOverpassElements(elements, lat, lng, radiusMeters) {
  const seen = new Set();
  return (elements || [])
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
}

async function fetchNearbyOverpass(lat, lng, radiusMeters) {
  const bbox = bboxFor(lat, lng, radiusMeters);
  // Prefer POST body — GET URLs can get truncated / blocked by some mirrors
  const query = `[out:json][timeout:20];(
  nwr[amenity~"hospital|clinic|doctors|dentist|pharmacy|veterinary"](${bbox});
  nwr[amenity~"restaurant|cafe|fast_food|bar|pub|food_court"](${bbox});
  nwr[shop~"supermarket|convenience|grocery|mall|department_store|bakery|butcher|greengrocer"](${bbox});
  nwr[amenity~"school|university|college|bank|atm|fuel|parking|police|fire_station"](${bbox});
  nwr[tourism~"hotel|hostel|motel|guest_house"](${bbox});
  nwr[amenity="place_of_worship"](${bbox});
);out center tags;`;

  let lastError = null;
  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      const r = await fetchWithTimeout(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'VEEDA-Map/1.0' },
        body: `data=${encodeURIComponent(query)}`,
      }, 14000);
      if (!r.ok) {
        lastError = new Error(`Overpass HTTP ${r.status}`);
        continue;
      }
      const data = await r.json();
      if (!Array.isArray(data.elements)) {
        lastError = new Error('Overpass returned no elements');
        continue;
      }
      return mapOverpassElements(data.elements, lat, lng, radiusMeters);
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError || new Error('All Overpass endpoints failed');
}

/** Nominatim fallback — slower, but works when Overpass is blocked from the host. */
async function fetchNearbyNominatim(lat, lng, radiusMeters) {
  const queries = [
    { q: 'hospital', type: 'hospital' },
    { q: 'medical centre', type: 'clinic' },
    { q: 'clinic', type: 'clinic' },
    { q: 'pharmacy', type: 'pharmacy' },
    { q: 'chemist', type: 'pharmacy' },
    { q: 'police station', type: 'police' },
    { q: 'atm', type: 'atm' },
    { q: 'bank', type: 'bank' },
    { q: 'petrol station', type: 'fuel' },
    { q: 'supermarket', type: 'supermarket' },
    { q: 'restaurant', type: 'restaurant' },
    { q: 'hotel', type: 'hotel' },
    { q: 'school', type: 'school' },
    { q: 'church', type: 'place_of_worship' },
  ];

  // viewbox: left, top, right, bottom (lng/lat)
  const latDelta = radiusMeters / 111320;
  const cosLat = Math.max(Math.cos(lat * Math.PI / 180), 0.15);
  const lngDelta = radiusMeters / (111320 * cosLat);
  const left = lng - lngDelta;
  const right = lng + lngDelta;
  const top = lat + latDelta;
  const bottom = lat - latDelta;
  const viewbox = `${left},${top},${right},${bottom}`;

  const seen = new Set();
  const places = [];

  // Sequential with a short pause to respect Nominatim usage policy
  for (const item of queries) {
    try {
      const url =
        `https://nominatim.openstreetmap.org/search?format=json&limit=12` +
        `&q=${encodeURIComponent(item.q)}` +
        `&viewbox=${encodeURIComponent(viewbox)}&bounded=1` +
        `&addressdetails=0`;
      const r = await fetchWithTimeout(url, {
        headers: { 'User-Agent': 'VEEDA-Map/1.0 (wellness map; contact: support@veeda.app)', Accept: 'application/json' },
      }, 10000);
      if (!r.ok) continue;
      const rows = await r.json();
      for (const row of rows || []) {
        const plat = Number(row.lat);
        const plng = Number(row.lon);
        if (!Number.isFinite(plat) || !Number.isFinite(plng)) continue;
        const name = (row.name || row.display_name || '').split(',')[0].trim();
        if (!name) continue;
        const id = `nominatim-${row.osm_type || 'n'}-${row.osm_id || row.place_id}`;
        if (seen.has(id)) continue;
        const distM = distBetween(lat, lng, plat, plng);
        if (distM > radiusMeters) continue;
        seen.add(id);
        const amenity = row.type && row.type !== 'yes' ? row.type : item.type;
        places.push({
          id,
          name,
          type: String(amenity),
          category: getCategory(amenity),
          phone: null,
          opening_hours: null,
          website: null,
          distM,
          dist: fmtDist(distM),
          lat: plat,
          lng: plng,
        });
      }
    } catch {
      // try next query
    }
  }

  places.sort((a, b) => a.distM - b.distM);
  return places;
}

async function fetchNearbyGeoapify(lat, lng, radiusMeters) {
  const geoKey = process.env.GEOAPIFY_API_KEY;
  if (!geoKey) return null;

  // Split into batches so healthcare is not crowded out by dozens of fuel stops
  const batches = [
    ['healthcare.hospital', 'healthcare.clinic_or_praxis', 'healthcare.pharmacy', 'healthcare', 'emergency.ambulance_station', 'service.police', 'service.fire_station'],
    ['catering.restaurant', 'catering.fast_food', 'catering.cafe', 'commercial.supermarket', 'commercial.shopping_mall', 'commercial.convenience'],
    ['service.financial.atm', 'service.financial.bank', 'accommodation.hotel', 'education.school', 'education.university', 'service.vehicle.fuel'],
  ];

  const seen = new Set();
  const places = [];

  for (const cats of batches) {
    const url =
      `https://api.geoapify.com/v2/places?categories=${cats.join(',')}` +
      `&filter=circle:${lng},${lat},${radiusMeters}&bias=proximity:${lng},${lat}` +
      `&limit=50&apiKey=${geoKey}`;
    try {
      const r = await fetchWithTimeout(url, {}, 12000);
      if (!r.ok) continue;
      const data = await r.json();
      for (const f of data.features || []) {
        const [plng, plat] = f.geometry?.coordinates || [];
        const props = f.properties || {};
        const name = props.name || props.address_line1;
        if (!name || !Number.isFinite(plat) || !Number.isFinite(plng)) continue;
        // Prefer real POI names over pure street labels
        if (/street|road|avenue|close|lane$/i.test(String(name)) && !/hospital|clinic|pharmacy|medical|hospital/i.test(String(name))) {
          if (!props.name) continue;
        }
        const id = `geoapify-${props.place_id || props.osm_id || `${plat},${plng}`}`;
        if (seen.has(id)) continue;
        const distM = distBetween(lat, lng, plat, plng);
        if (distM > radiusMeters) continue;
        seen.add(id);
        const catStr = String(props.categories || props.category || '');
        let amenity = 'place';
        if (catStr.includes('hospital')) amenity = 'hospital';
        else if (catStr.includes('pharmacy')) amenity = 'pharmacy';
        else if (catStr.includes('clinic') || catStr.includes('praxis')) amenity = 'clinic';
        else if (catStr.includes('ambulance')) amenity = 'hospital';
        else if (catStr.includes('restaurant') || catStr.includes('fast_food') || catStr.includes('cafe') || catStr.includes('catering')) amenity = 'restaurant';
        else if (catStr.includes('supermarket') || catStr.includes('shopping_mall') || catStr.includes('convenience')) amenity = 'supermarket';
        else if (catStr.includes('atm')) amenity = 'atm';
        else if (catStr.includes('bank')) amenity = 'bank';
        else if (catStr.includes('fuel')) amenity = 'fuel';
        else if (catStr.includes('hotel') || catStr.includes('accommodation')) amenity = 'hotel';
        else if (catStr.includes('school') || catStr.includes('university') || catStr.includes('education')) amenity = 'school';
        else if (catStr.includes('police')) amenity = 'police';
        else if (catStr.includes('fire')) amenity = 'fire_station';
        places.push({
          id,
          name: String(name),
          type: amenity,
          category: getCategory(amenity),
          phone: props.contact?.phone || null,
          opening_hours: props.opening_hours || null,
          website: props.website || null,
          distM,
          dist: fmtDist(distM),
          lat: Number(plat),
          lng: Number(plng),
        });
      }
    } catch {
      // try next batch
    }
  }
  places.sort((a, b) => a.distM - b.distM);
  return places;
}

router.get('/nearby', async (req, res) => {
  try {
    const { lat, lng } = assertCoords(req.query.lat, req.query.lng);
    const radiusMeters = Math.min(Math.max(Number(req.query.radiusMeters || 10000), 500), 15000);

    const errors = [];
    const buckets = [];

    // Run sources in parallel and MERGE results so one weak source cannot
    // hide hospitals/pharmacies that another source still knows about.
    // Prefer fast sources. Overpass is often blocked/slow on serverless — give it
    // a short timeout and never let it prevent Nominatim/Geoapify results.
    const withSoftTimeout = (promise, ms, label) => Promise.race([
      promise,
      new Promise((_, reject) => setTimeout(() => reject(new Error(`${label} timeout`)), ms)),
    ]);

    const tasks = [
      withSoftTimeout(fetchNearbyNominatim(lat, lng, radiusMeters), 12000, 'nominatim')
        .then(p => ({ source: 'nominatim', places: p || [] }))
        .catch(err => { errors.push(`nominatim: ${err.message || err}`); return { source: 'nominatim', places: [] }; }),
      withSoftTimeout(fetchNearbyGeoapify(lat, lng, radiusMeters), 10000, 'geoapify')
        .then(p => ({ source: 'geoapify', places: p || [] }))
        .catch(err => { errors.push(`geoapify: ${err.message || err}`); return { source: 'geoapify', places: [] }; }),
      withSoftTimeout(fetchNearbyOverpass(lat, lng, radiusMeters), 6000, 'overpass')
        .then(p => ({ source: 'overpass', places: p || [] }))
        .catch(err => { errors.push(`overpass: ${err.message || err}`); return { source: 'overpass', places: [] }; }),
    ];
    const results = await Promise.all(tasks);
    for (const r of results) buckets.push(r);

    // Merge + dedupe by rounded lat/lng + normalized name
    const seen = new Set();
    const merged = [];
    const keyOf = (p) => {
      const n = String(p.name || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
      return `${n}|${p.lat.toFixed(4)}|${p.lng.toFixed(4)}`;
    };
    // Prefer richer / health-first ordering of sources when deduping
    const order = { nominatim: 0, overpass: 1, geoapify: 2 };
    buckets.sort((a, b) => (order[a.source] ?? 9) - (order[b.source] ?? 9));
    for (const bucket of buckets) {
      for (const p of bucket.places) {
        if (!p?.name || !Number.isFinite(p.lat) || !Number.isFinite(p.lng)) continue;
        // Drop obviously useless labels (street-only, single generic word)
        const name = String(p.name).trim();
        if (name.length < 3) continue;
        if (/^(gas|fuel|pharmacy|hospital|clinic|hotel|school)$/i.test(name)) {
          // keep but deprioritize later via sort; still include
        }
        const k = keyOf(p);
        if (seen.has(k)) continue;
        seen.add(k);
        merged.push({ ...p, source: bucket.source });
      }
    }

    // Category priority: health & emergency first, then everyday needs, fuel last
    const catRank = (c) => ({
      health: 0, emergency: 1, finance: 2, food: 3, shopping: 4,
      education: 5, lodging: 6, transport: 7, other: 8,
    }[c] ?? 9);

    // Cap fuel/gas so 20 petrol stations do not drown the list
    const fuel = merged.filter(p => p.type === 'fuel' || /fuel|petrol|gas station/i.test(p.type));
    const nonFuel = merged.filter(p => !(p.type === 'fuel' || /fuel|petrol|gas station/i.test(p.type)));
    const cappedFuel = fuel.sort((a, b) => a.distM - b.distM).slice(0, 8);
    let places = [...nonFuel, ...cappedFuel];

    places.sort((a, b) => {
      const cr = catRank(a.category) - catRank(b.category);
      if (cr !== 0) return cr;
      return a.distM - b.distM;
    });

    // Hard-cap total but keep all health/emergency
    const mustKeep = places.filter(p => p.category === 'health' || p.category === 'emergency');
    const rest = places.filter(p => p.category !== 'health' && p.category !== 'emergency');
    places = [...mustKeep, ...rest].slice(0, 120);
    // Re-sort final list: health first by distance, then others by distance within category rank
    places.sort((a, b) => {
      const cr = catRank(a.category) - catRank(b.category);
      if (cr !== 0) return cr;
      return a.distM - b.distM;
    });

    const hospitals = places.filter(p =>
      p.type === 'hospital' || p.type === 'clinic' || p.category === 'health'
    ).slice(0, 30);

    const sourcesUsed = buckets.filter(b => b.places.length).map(b => b.source);

    if (!places.length) {
      return res.status(503).json({
        places: [],
        hospitals: [],
        count: 0,
        radiusMeters,
        sources: sourcesUsed,
        error: errors.join('; ') || 'Nearby places unavailable',
      });
    }
    res.json({
      places,
      hospitals,
      count: places.length,
      radiusMeters,
      sources: sourcesUsed,
    });
  } catch (err) {
    res.status(503).json({ places: [], hospitals: [], count: 0, error: err.message || 'Nearby places unavailable' });
  }
});

router.get('/search', async (req, res) => {
  const q = String(req.query.q || '').trim();
  if (!q) return res.json([]);

  let userLat = null;
  let userLng = null;
  try {
    if (req.query.lat != null && req.query.lng != null) {
      const c = assertCoords(req.query.lat, req.query.lng);
      userLat = c.lat;
      userLng = c.lng;
    }
  } catch {}

  const maxKm = 40; // drop anything farther than this when we have a fix
  const results = [];
  const seen = new Set();

  const pushResult = (item) => {
    if (!item?.name || !Number.isFinite(item.lat) || !Number.isFinite(item.lng)) return;
    const key = `${String(item.name).toLowerCase()}|${item.lat.toFixed(3)}|${item.lng.toFixed(3)}`;
    if (seen.has(key)) return;
    if (userLat != null && userLng != null) {
      const d = distBetween(userLat, userLng, item.lat, item.lng);
      item.distM = d;
      item.dist = fmtDist(d);
      if (d > maxKm * 1000) return; // never show Uganda when the user is in Nigeria
    }
    seen.add(key);
    results.push(item);
  };

  // 1) Local amenity-style search first when we know where the user is
  if (userLat != null && userLng != null) {
    const latDelta = maxKm / 111.32;
    const cosLat = Math.max(Math.cos(userLat * Math.PI / 180), 0.15);
    const lngDelta = maxKm / (111.32 * cosLat);
    const viewbox = `${userLng - lngDelta},${userLat + latDelta},${userLng + lngDelta},${userLat - latDelta}`;

    // Geoapify places (local) when key present
    const geoKey = process.env.GEOAPIFY_API_KEY;
    if (geoKey) {
      try {
        const cats = /hospital|clinic|medical/i.test(q)
          ? 'healthcare.hospital,healthcare.clinic_or_praxis,healthcare'
          : /pharmac|chemist/i.test(q)
            ? 'healthcare.pharmacy'
            : /police/i.test(q)
              ? 'service.police'
              : /atm|bank/i.test(q)
                ? 'service.financial.atm,service.financial.bank'
                : /fuel|petrol|gas/i.test(q)
                  ? 'service.vehicle.fuel'
                  : /hotel/i.test(q)
                    ? 'accommodation.hotel'
                    : /school/i.test(q)
                      ? 'education.school,education.university'
                      : /restaurant|food/i.test(q)
                        ? 'catering.restaurant,catering.fast_food'
                        : null;
        const url = cats
          ? `https://api.geoapify.com/v2/places?categories=${cats}&filter=circle:${userLng},${userLat},${maxKm * 1000}&bias=proximity:${userLng},${userLat}&limit=15&apiKey=${geoKey}`
          : `https://api.geoapify.com/v1/geocode/autocomplete?text=${encodeURIComponent(q)}&filter=circle:${userLng},${userLat},${maxKm * 1000}&bias=proximity:${userLng},${userLat}&limit=12&apiKey=${geoKey}`;
        const r = await fetchWithTimeout(url, {}, 8000);
        if (r.ok) {
          const d = await r.json();
          for (const f of d.features || []) {
            const coords = f.geometry?.coordinates;
            if (!coords) continue;
            const props = f.properties || {};
            pushResult({
              name: props.name || props.address_line1 || props.formatted?.split(',')[0],
              address: props.formatted || props.address_line2 || '',
              lat: coords[1],
              lng: coords[0],
              type: props.categories?.[0] || props.result_type || 'place',
            });
          }
        }
      } catch {}
    }

    // Nominatim STRICTLY bounded to the user's area
    try {
      const url =
        `https://nominatim.openstreetmap.org/search?format=json&limit=12` +
        `&q=${encodeURIComponent(q)}` +
        `&viewbox=${encodeURIComponent(viewbox)}&bounded=1` +
        `&addressdetails=1`;
      const r = await fetchWithTimeout(url, {
        headers: { 'User-Agent': 'VEEDA-Map/1.0 (wellness map)', Accept: 'application/json' },
      }, 9000);
      if (r.ok) {
        const d = await r.json();
        for (const f of d || []) {
          pushResult({
            name: f.name || f.display_name?.split(',')[0],
            address: f.display_name || '',
            lat: parseFloat(f.lat),
            lng: parseFloat(f.lon),
            type: f.type || 'place',
          });
        }
      }
    } catch {}
  }

  // 2) Only if nothing local: wider geocode (still distance-filtered when possible)
  if (!results.length) {
    const geoKey = process.env.GEOAPIFY_API_KEY;
    if (geoKey) {
      try {
        const bias = userLat != null ? `&bias=proximity:${userLng},${userLat}&filter=circle:${userLng},${userLat},${maxKm * 1000}` : '';
        const r = await fetchWithTimeout(
          `https://api.geoapify.com/v1/geocode/autocomplete?text=${encodeURIComponent(q)}&limit=8&apiKey=${geoKey}${bias}`,
          {},
          8000,
        );
        if (r.ok) {
          const d = await r.json();
          for (const f of d.features || []) {
            pushResult({
              name: f.properties.name || f.properties.formatted?.split(',')[0],
              address: f.properties.formatted,
              lat: f.geometry.coordinates[1],
              lng: f.geometry.coordinates[0],
              type: f.properties.result_type || 'place',
            });
          }
        }
      } catch {}
    }
  }

  if (!results.length && userLat == null) {
    // Absolute last resort without a location — global nominatim
    try {
      const r = await fetchWithTimeout(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=8`,
        { headers: { 'User-Agent': 'VEEDA-Map/1.0' } },
        8000,
      );
      if (r.ok) {
        const d = await r.json();
        for (const f of d || []) {
          pushResult({
            name: f.display_name?.split(',')[0],
            address: f.display_name,
            lat: parseFloat(f.lat),
            lng: parseFloat(f.lon),
            type: f.type,
          });
        }
      }
    } catch {}
  }

  results.sort((a, b) => (a.distM ?? 0) - (b.distM ?? 0));
  res.json(results.slice(0, 12));
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
