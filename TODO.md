# Production readiness plan (Vercel + Neon)

- [ ] Step 1: Update `index.html` production SEO meta (remove `noindex, nofollow`).
- [ ] Step 2: Add/verify `vercel.json` at repo root with correct build settings (`vite build` → `dist`).
- [ ] Step 3: Add Neon backend layer.
  - [ ] 3A (preferred): Migrate to Next.js App Router and add API routes using `DATABASE_URL`.
  - [ ] 3B (fallback): Minimal serverless backend while keeping Vite (if migration is too heavy).
- [ ] Step 4: Add env docs (`.env.example`) and ensure secrets are not committed.
- [ ] Step 5: Implement API endpoints:
  - [ ] `GET /api/events` (read from Neon)
  - [ ] `POST /api/events` (write to Neon)
- [ ] Step 6: Smoke-test locally (build + run) and provide Vercel/Neon deploy verification steps.

