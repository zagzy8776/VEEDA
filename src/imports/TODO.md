# VEDA Map UX — Implementation Plan

## Step 1: Map UX focus state (reduce scattered overlays)
- Introduce a simple “map mode” concept (idle / searching / routing / emergency / favorites)
- Enforce overlay priority rules:
  - searching: quiet address/status + hide other panels as needed
  - routing: hide favorites + quiet geofence & extra UI
  - emergency: suppress non-emergency UI clutter
- Ensure only one bottom-sheet is visible at a time

## Step 2: Improve map readability (closer to Google Maps)
- Reduce “gray/washed” feel from top overlays:
  - adjust opacity/contrast of map overlay containers in styles.css
- Reduce marker visual noise:
  - lower marker brightness/saturation at low zoom (UX tuning)
- Keep controls at predictable positions and sizes

## Step 3: Add/upgrade map features (no broken UX)
- Search polish
  - better dropdown interaction hierarchy (open/close, select behavior)
  - highlight selected place and ensure dropdown closes cleanly
- Marker clustering at low zoom
  - cluster nearby care markers to avoid scattered look
- Nearby care drawer (expand/collapse)
  - replace always-on carousel with a drawer/sheet control
- Route-mode focus
  - clear route state + cleaner ETA presentation + close route action
- Favorites mode
  - dedicated favorites panel behavior that doesn’t fight other overlays

## Step 4: Styling & layout updates
- Update styles.css for z-index, opacity, typography, and bottom sheet transitions
- Update index.html only if required for mode/drawer hooks

## Step 5: Verification
- Build: `cd e:/VEDA && npm run build`
- Thorough testing:
  - Frontend: full Map tab interactions (GPS fallback/deny, search, select, route sheet, SOS, favorites, overlays priority)
  - Backend/API endpoints impacted:
    - `/api/map/context`
    - `/api/map/search`
    - `/api/map/reverse-geocode`
    - `/api/map/route`
