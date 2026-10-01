# Deploy runbook

Merge-day checklist for shipping the auth/health branches to production.
Frontend is on **Vercel**, backend on **Render**, database on **Neon**.

Follow the steps **in order**. Each step lists what to do, how to tell it
worked, and how to roll it back.

---

## 0. Pre-flight

- [ ] CI is green on the branch (`npm run test:client`, `npm run test:backend`).
- [ ] `npm run build` succeeds locally.
- [ ] No uncommitted changes (`git status` clean).

**Rollback:** nothing deployed yet; just stop.

---

## 1. Neon backup branch (do this FIRST)

Never run migrations against the primary branch without a restore point.

1. In the Neon console, open the project and create a **branch** from the
   current primary (name it e.g. `pre-deploy-YYYYMMDD`).
2. Confirm the branch is listed and its data is present.

**Verify:** the new branch exists and is a copy of production data.

**Rollback:** delete the backup branch only after the deploy is confirmed good.
If production data is damaged, point the Render `DATABASE_URL` at the backup
branch, or reset the primary branch to it, then re-run the failed step.

---

## 2. Run migrations 001–006 (one at a time)

Use [`backend/migrations/MIGRATIONS.md`](backend/migrations/MIGRATIONS.md) as the
reference. Apply each file **in order**, against the **primary** branch, one
statement set at a time:

| Order | File |
|-------|------|
| 1 | `backend/migrations/001_users.sql` |
| 2 | `backend/migrations/002_refresh_tokens.sql` |
| 3 | `backend/migrations/003_ownership_columns.sql` |
| 4 | `backend/migrations/004_patient_identity_mappings.sql` |
| 5 | `backend/migrations/005_ownership_indexes.sql` |
| 6 | `backend/migrations/006_consent_records.sql` |

Run each with the Neon SQL editor or `psql "$DATABASE_URL" -f <file>`.

- Every migration is **idempotent** (safe to run twice), so a re-run is not a
  hazard — but still run them one at a time so a failure is easy to isolate.
- 003 and 005 assume the base tables (`biometric_events`, `raw_biometrics`,
  `clinical_summaries`, `audit_logs`) already exist.

**Verify:** after each file, the expected table/column/index exists (e.g.
`\dt` shows `users`, `refresh_tokens`, `patient_identity_mappings`,
`consent_records`; `\d biometric_events` shows `owner_user_id`).

**Rollback:** migrations are non-destructive (no drops, no renames). To back out,
reset the Neon branch to the step-1 backup branch, then fix the migration and
re-run from the failed step.

---

## 3. Set Render environment variables

Set these on the Render **web service** before (re)deploying. Names only —
values come from the secret store / Neon dashboard.

Required:

- `DATABASE_URL`
- `FRONTEND_URL`
- `JWT_SECRET`
- `JWT_ISSUER`
- `JWT_AUDIENCE`
- `NODE_ENV`

Optional / feature:

- `BACKEND_URL`
- `DEFAULT_TENANT_ID`
- `EMERGENCY_NUMBER`
- `ENABLE_PROXY_DEBUG` — **must be off** (unset or `false`) in production
- `GEOAPIFY_API_KEY`
- `MAPBOX_TOKEN`
- `GROQ_API_KEY`
- `GROQ_MODEL`
- `CEREBRAS_API_KEY`
- `CEREBRAS_MODEL`
- `FITBIT_CLIENT_ID`
- `REFERRAL_PACK_PATH`

Notes:
- `FRONTEND_URL` is a comma-separated list of **exact browser origins**. It must
  include the production Vercel origin and every preview origin in use. A
  missing origin makes the browser fail CORS.
- `ENABLE_PROXY_DEBUG` must be off once you have finished checking
  `/api/admin/proxy-debug`.

**Verify:** the service restarts cleanly and the logs show no missing-env errors.

**Rollback:** Render keeps the previous env var values in its event log; restore
the prior values and redeploy. Turning `ENABLE_PROXY_DEBUG` off first is the safe
default if anything looks wrong.

---

## 4. Vercel rewrite host

`vercel.json` rewrites `/api/*` and `/auth/*` to the live Render host:

```json
"destination": "https://REPLACE_WITH_LIVE_RENDER_HOST/api/:path*"
```

1. Replace `REPLACE_WITH_LIVE_RENDER_HOST` with the **single confirmed** Render
   hostname (decide between `veeda.onrender.com` and
   `veda-backend-h1lj.onrender.com`, and shut down or secure the other).
2. Commit on the deploy branch only. For **preview** deployments, do not point
   the preview branch at production — use a preview Render service and a Neon
   test branch, and set that preview host in the preview branch's `vercel.json`.

**Verify:** `curl https://<the-frontend>/api/health` returns the backend
response (not a 404 from Vercel). Load the app and confirm a signed-in request
succeeds with no CORS error in the console.

**Rollback:** `git revert` the `vercel.json` change (or restore the previous
commit) and redeploy on Vercel.

---

## 5. Post-deploy smoke test

Run against the deployed URLs (see also `D2_MANUAL_TEST_CHECKLIST.md` for the
full manual pass):

1. **App loads** — home screen renders, no console errors.
2. **Sign up / sign in** — a new account can register and log in; the session
   survives a page reload.
3. **Local mode** — "continue locally" works without an account.
4. **Consent** — granting consent reaches the server
   (`consent_records` has a row with `granted = true`); withdrawing flips it to
   `granted = false`.
5. **Logout clears device data** — with a BP/glucose reading saved, log out; the
   prompt offers **Export CSV & log out**, the file downloads, and after logout
   the reading is gone from the same device.
6. **Health data** — a signed-in request to `/api/history` (or the in-app view)
   returns the user's own data and 401s without a token.
7. **CORS** — no cross-origin errors from the deployed frontend origin.

**Rollback:** if any step fails, redeploy the previous frontend commit on Vercel
and the previous backend commit on Render. Because migrations are additive, the
previous backend still runs against the migrated schema.

---

## 6. Merge and deploy

Only after steps 1–5 pass:

1. Merge the branch.
2. Let Render deploy the backend, then Vercel deploy the frontend (or trigger
   manually).
3. Re-run the step-5 smoke test against production.
4. Keep the Neon backup branch for at least a release cycle before deleting it.

**Rollback (overall):**
- Frontend: Vercel → redeploy the previous deployment.
- Backend: Render → roll back to the previous deploy.
- Database: reset the primary Neon branch to the step-1 backup branch. As a last
  resort, repoint `DATABASE_URL` at the backup branch.


