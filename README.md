# VEEDA — Wellness Intelligence

Mobile-first wellness platform for vital signs monitoring (camera heart rate, breathing, steps) and personal trends.

## Architecture

- **Frontend**: React + Vite + Tailwind — deployed on **Vercel**
- **Backend**: Express.js + Neon (PostgreSQL) — deployed on **Render**

## Live URLs

- Frontend: https://veeda-mu.vercel.app
- Backend API: https://veeda.onrender.com

## Getting Started

```bash
npm install
npm run dev
```

## Environment Variables

Copy `.env.example` to `.env`:

| Variable | Description |
|----------|-------------|
| `VITE_API_URL` | Backend URL (https://veeda.onrender.com) |
| `VITE_VEDA_API_KEY` | Shared API key (must match backend) |
| `VITE_EMERGENCY_NUMBER` | Emergency number (default: 112) |

Users get a private unique ID automatically. No hospital / tenant / patient ID is required.

## Backend (Render)

Required env vars:
- `DATABASE_URL` — Neon PostgreSQL
- `VEDA_API_KEY` — same key as frontend
- `FRONTEND_URL` — https://veeda-mu.vercel.app
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
