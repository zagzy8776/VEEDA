# VEEDA — Clinical Wellness Intelligence

VEEDA is a mobile-first clinical wellness intelligence platform for vital signs monitoring, NEWS2 scoring, and emergency response.

## Architecture

- **Frontend**: React + Vite + Tailwind CSS + Motion — deployed on **Vercel**
- **Backend**: Express.js + Neon (PostgreSQL) — deployed on **Render**
- **Database**: Neon PostgreSQL with TimescaleDB

## Live URLs

- Frontend: https://veeda-mu.vercel.app
- Backend API: https://veeda.onrender.com

## Getting Started

```bash
npm install
npm run dev
```

## Environment Variables

Copy `.env.example` to `.env` and fill in:

| Variable | Description |
|----------|-------------|
| `VITE_API_URL` | Backend URL (https://veeda.onrender.com) |
| `VITE_VEDA_API_KEY` | Shared API key for backend auth |
| `VITE_EMERGENCY_NUMBER` | Emergency services number (default: 112) |
| `VITE_VEDA_TENANT_ID` | Hospital/tenant ID |
| `VITE_VEDA_ROLE` | Default user role (patient) |
| `VITE_VEDA_PATIENT_ID` | Default patient ID |
| `VITE_VEDA_WARD_ID` | Default ward ID |

## Backend (separate deploy)

See `backend/` directory. Deployed separately on Render.

Required backend env vars:
- `DATABASE_URL` — Neon PostgreSQL connection string
- `VEDA_API_KEY` — Shared API key
- `GEOAPIFY_API_KEY` — For weather & geocoding
- `MAPBOX_TOKEN` — For map tiles
- `FRONTEND_URL` — Frontend origin for CORS (https://veeda-mu.vercel.app)

## Features

- Real-time heart rate measurement (camera rPPG)
- Breath rate measurement (microphone)
- Step counting (DeviceMotion)
- NEWS2 and qSOFA clinical scoring
- Interactive map with nearby healthcare places
- Clinician dashboard with patient roster
- Hydration and sleep tracking
- 7-day trend charts
- Emergency SOS with countdown