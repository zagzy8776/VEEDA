# VEEDA — Wellness Intelligence

Mobile-first wellness platform for vital signs monitoring (camera heart rate, breathing, steps) and personal trends.

## Architecture

- **Frontend**: React + Vite + Tailwind — deployed on **Vercel**
- **Backend**: Express.js + Neon (PostgreSQL) — deployed on **Render**

## Live URLs

- Frontend: https://veeda-mu.vercel.app
- Backend API: configure the confirmed Render hostname in `vercel.json` before deployment.

## Getting Started

```bash
npm install
npm run dev
```

## Environment Variables

Copy `.env.example` to `.env`:

| Variable | Description |
|----------|-------------|
| `VITE_EMERGENCY_NUMBER` | Optional build-time fallback emergency number (e.g. `112`). The backend `EMERGENCY_NUMBER` always overrides it; the app also caches the last verified value on the device so SOS still works offline. With none set, the UI says "call your local emergency number" and never auto-dials. |

Local-only users can use device measurements without an account. Authenticated users are identified by the backend JWT; no hospital / tenant / patient ID is entered in the browser.

## Backend (Render)

Required env vars:
- `DATABASE_URL` — Neon PostgreSQL
- `FRONTEND_URL` — exact browser origins, comma-separated; production is `https://veeda-mu.vercel.app`, and every Vercel preview URL used for testing must also be listed.
- `JWT_SECRET`, `JWT_ISSUER`, and `JWT_AUDIENCE` — JWT configuration
- `ENABLE_PROXY_DEBUG` — temporary `true` only while checking `/api/admin/proxy-debug` as an admin
- Optional: `GEOAPIFY_API_KEY`, `MAPBOX_TOKEN`

## Features

- Heart rate via phone camera (quality-gated rPPG)
- Breath rate via microphone
- Step counting (DeviceMotion)
- Personal wellness score (only when real vitals exist)
- Map with nearby healthcare places
- Hydration and sleep tracking
- 7-day history
- Emergency SOS
