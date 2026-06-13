import { Router } from 'express';
const router = Router();

router.get('/tiles-token', (req, res) => {
  const token = process.env.MAPBOX_TOKEN;
  if (!token) return res.status(503).json({ error: 'Mapbox token not configured' });
  res.json({ token });
});

router.get('/context', async (req, res) => {
  const { lat, lng } = req.query;
  if (!lat || !lng) return res.status(400).json({ error: 'lat and lng required' });

  try {
    const weatherRes = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,apparent_temperature,precipitation,wind_speed_10m,relative_humidity_2m&timezone=auto`
    );
    const weatherData = await weatherRes.json();
    const c = weatherData.current || {};

    res.json({
      weather: {
        status: 'available',
        temperature: c.temperature_2m ?? null,
        apparentTemperature: c.apparent_temperature ?? null,
        humidity: c.relative_humidity_2m ?? null,
        windSpeed: c.wind_speed_10m ?? null,
        precipitation: c.precipitation ?? null,
        observedAt: c.time ?? null,
      },
      airQuality: { status: 'unavailable' },
      nearbyCare: [],
    });
  } catch {
    res.json({ weather: { status: 'unavailable' }, airQuality: { status: 'unavailable' }, nearbyCare: [] });
  }
});

router.post('/context', async (req, res) => {
  const { lat, lng } = req.body;
  if (!lat || !lng) return res.status(400).json({ error: 'lat and lng required' });

  try {
    const weatherRes = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,apparent_temperature,precipitation,wind_speed_10m,relative_humidity_2m&timezone=auto`
    );
    const weatherData = await weatherRes.json();
    const c = weatherData.current || {};

    res.json({
      weather: {
        status: 'available',
        temperature: c.temperature_2m ?? null,
        apparentTemperature: c.apparent_temperature ?? null,
        humidity: c.relative_humidity_2m ?? null,
        windSpeed: c.wind_speed_10m ?? null,
        precipitation: c.precipitation ?? null,
        observedAt: c.time ?? null,
      },
      airQuality: { status: 'unavailable' },
      nearbyCare: [],
    });
  } catch {
    res.json({ weather: { status: 'unavailable' }, airQuality: { status: 'unavailable' }, nearbyCare: [] });
  }
});

router.get('/search', async (req, res) => {
  const { q, lat, lng } = req.query;
  if (!q) return res.json([]);

  try {
    const token = process.env.MAPBOX_TOKEN;
    if (!token) return res.json([]);
    const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(q)}.json?proximity=${lng},${lat}&access_token=${token}&limit=5`;
    const r = await fetch(url);
    const d = await r.json();
    const results = (d.features || []).map(f => ({
      name: f.text,
      address: f.place_name,
      lat: f.center[1],
      lng: f.center[0],
    }));
    res.json(results);
  } catch {
    res.json([]);
  }
});

router.get('/reverse-geocode', async (req, res) => {
  const { lat, lng } = req.query;
  if (!lat || !lng) return res.json({ status: 'unavailable' });

  try {
    const token = process.env.MAPBOX_TOKEN;
    if (!token) return res.json({ status: 'unavailable' });
    const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?access_token=${token}&limit=1`;
    const r = await fetch(url);
    const d = await r.json();
    const feat = d.features?.[0];
    if (!feat) return res.json({ status: 'unavailable' });
    res.json({
      status: 'available',
      displayName: feat.place_name,
      street: feat.text,
      city: feat.context?.find(c => c.id.startsWith('place'))?.text ?? null,
    });
  } catch {
    res.json({ status: 'unavailable' });
  }
});

router.get('/route', async (req, res) => {
  const { from_lat, from_lng, to_lat, to_lng } = req.query;
  if (!from_lat || !from_lng || !to_lat || !to_lng) return res.status(400).json({ error: 'coords required' });

  try {
    const r = await fetch(
      `https://router.project-osrm.org/route/v1/driving/${from_lng},${from_lat};${to_lng},${to_lat}?overview=full&geometries=geojson`
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

export default router;
