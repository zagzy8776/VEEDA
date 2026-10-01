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

## 2. Run migrations (one at a time)

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
| 7 | `backend/migrations/007_audit_logs_actor_fk.sql` |
| 8 | `backend/migrations/008_readings.sql` |
| 9 | `backend/migrations/009_dependents.sql` |
| 10 | `backend/migrations/010_review_queue.sql` |
| 11 | `backend/migrations/011_dependents_birth_year.sql` |

Run each with the Neon SQL editor or `psql "$DATABASE_URL" -f <file>`.

- Every migration is **idempotent** (safe to run twice), so a re-run is not a
  hazard — but still run them one at a time so a failure is easy to isolate.
- 003 and 005 assume the base tables (`biometric_events`, `raw_biometrics`,
  `clinical_summaries`, `audit_logs`) already exist.
- 007 drops only the `audit_logs.actor_user_id` foreign key (the column and the
  append-only triggers stay). Run it on a real Postgres — the FK behaviour it
  fixes cannot be exercised by the in-memory tests.
- 009 adds `readings.dependent_id`; run 008 first so the `readings` table exists.
- 011 replaces `dependents.age` with `birth_year`/`birth_month` so the server can
  work out a dependant's age **at request time**. It backfills `birth_year`
  approximately from the old `age` + `created_at` and marks those rows
  `age_confirmed = false`, so **a backfilled dependant is treated as unknown age
  until a carer confirms it** — they get no adult-only scores until then. This is
  the safe direction for the gate.

**Verify:** after each file, the expected table/column/index exists (e.g.
`\dt` shows `users`, `refresh_tokens`, `patient_identity_mappings`,
`consent_records`; `\d biometric_events` shows `owner_user_id`). After 007,
`\d audit_logs` must show `actor_user_id` with **no** foreign-key constraint.
After 011, `\d dependents` shows `birth_year`, `birth_month`, `age_confirmed`,
`age_confirmed_at`, and **no** `age` column.

**Age-gate configuration (server env, never a Vite variable):**

- `ADULT_AGE_CUTOFF` — the age at/above which NEWS2, qSOFA and adult BP
  interpretation apply. Defaults to a safe `16` if unset.
- `AGE_RECONFIRM_MONTHS` — how long a confirmed dependant age is trusted before
  it must be confirmed again. Defaults to `12`. A dependant whose confirmation is
  older than this is treated as unknown age (no adult scores) until re-confirmed.

**Rollback:** migrations are non-destructive to health data (011 drops
`dependents.age` only after backfilling it into `birth_year`). To back out,
reset the Neon branch to the step-1 backup branch, then fix the migration and
re-run from the failed step.

**Local test runs exit cleanly.** `npm run test:backend` (and the client suites)
run without `DATABASE_URL` and must **exit on their own** — the DB pool is opened
lazily on first query (`backend/db.js`), and a missing `DATABASE_URL` is a
rejected query, not a hang. Route factories (`account`, `dependents`, `readings`,
`review-queue`, `analyze`, `triage`, `auth`) are **invoked** in their default
export so `server.js` mounts a Router, not a factory function. If a suite ever
hangs again, one of those two invariants has regressed — fix the cause rather
than adding `--test-force-exit` (on Windows it aborts the runner on teardown
without telling you anything useful).

---

## 3. Set Render environment variables

Set these on the Render **web service** before (re)deploying. Names only —
values come from the secret store / Neon dashboard.

The list below is the **complete** set of `process.env` names the backend reads
(derived from the code, not from memory). A missing *required* name stops the
server at boot; a missing *optional* name disables a feature.

### Required in production (boot fails without it)

| Name | If missing at startup |
|------|------------------------|
| `NODE_ENV` | Must be `production`. Production-only guards do not run, so the server boots with **unreviewed packs allowed** and no FRONTEND_URL check — a silent safety downgrade. |
| `DATABASE_URL` | Server boots, but the first DB call fails; every data route 500s. Neon's `Pool` is constructed with `undefined`. |
| `JWT_SECRET` | **Boot fails** — `createAuthRouter` throws `JWT_SECRET must be configured and at least 32 characters long.` (must be ≥ 32 chars). |
| `FRONTEND_URL` | **Boot fails in production** — `server.js` throws `FRONTEND_URL must contain at least one allowed origin in production.` Also used for CORS and refresh-cookie CSRF. |

### Required for the feature to be safe/working (server still boots)

| Name | If missing at startup |
|------|------------------------|
| `JWT_ISSUER` | Defaults to `veeda-api`; tokens are issued/verified under the default. Only a problem if you intended a different issuer. |
| `JWT_AUDIENCE` | Defaults to `veeda-client`; same caveat as above. |
| `EMERGENCY_NUMBER` | **A loud startup warning is printed in production** (`server.js`): the app will not show or dial a verified number, and `/api/analyze` + `/api/triage/referral` fall back to the plain line "call your local emergency number" (never a guessed default). **Set this to the region's official number.** |
| `REFERRAL_PACK_PATH` | In production the referral engine loads no pack and returns `unavailable` for every score (fail-safe). The red-flag referral screen will not give a recommendation. **Set this to a clinically-reviewed pack before go-live.** |

### Optional / feature flags

| Name | If missing at startup |
|------|------------------------|
| `PORT` | Defaults to `10000` (Render's expected port). |
| `DEFAULT_TENANT_ID` | Defaults to `default`; used for the legacy-ID claim mapping. |
| `VITE_ADULT_AGE_CUTOFF` | Build-time. Age at or above which adult-only scores (NEWS2/qSOFA) may be shown for a family profile. A clinician sets this. If unset the app defaults to **16** (a child or unknown age is never scored, and shows "Not validated for children"). **Display only — this is not the safety control.** |
| `ADULT_AGE_CUTOFF` | **Server config (the safety control).** Age at or above which the server will compute adult-only scores (NEWS2, qSOFA, adult BP interpretation) for a request that is **about a dependant**. **The server never trusts the client for this:** when a request carries a dependent id, the server looks the dependant up in its own `dependents` table (scoped to the signed-in guardian) and takes the age from that record. If unset the server defaults to **16**. A dependant below the cutoff, or of unknown age (no stored age), gets **no score at all** (an explicit "not validated for children" refusal), and a dependent id that does not belong to the caller is refused outright (403). This can never be bypassed by the client. |
| `VITE_ENABLE_GATED_FEATURES` | Build-time master switch for the **gated** features (prescribing, mental-health crisis referral, care-partner booking, partner prices/stock, model inference, clinician review queue). Defaults OFF. Only the exact string `true` requests them, and even then each flag still needs its own configuration proof (a licensed drug DB, a reviewed crisis pack, a configured partner, a validated model). In production a gated flag with no proof stays OFF regardless. |
| `ALERT_PACK_PATH` | Server-side path to a clinically-reviewed alert pack (Phase 1 wording: weather, air quality, fire, disease, battery, home safety). If unset in production the alerts panel shows "not available" instead of any wording. |
| `REVIEW_SLA_MINUTES` | The clinician review queue's SLA in minutes (defaults to `60`). An unresolved item past its deadline is surfaced as **escalated**. Configuration, not a clinical rule. |
| `VITE_CARE_PARTNER_ENDPOINT` | Build-time. Base endpoint of a configured care partner (labs/pharmacies) used for prices, stock and booking. If unset, prices and stock are dropped (shown as "unknown") and booking stays disabled. |
| `BACKEND_URL` | Fitbit OAuth callback URL is built without a base host; the Fitbit connect flow breaks. |
| `FITBIT_CLIENT_ID` | Fitbit integration is disabled (`/api/integrations` reports "Fitbit not configured"). |
| `FITBIT_CLIENT_SECRET` | Same as above — the two are checked together. |
| `GEOAPIFY_API_KEY` | Map geocoding/weather calls fail; map falls back to an error state. |
| `MAPBOX_TOKEN` | Map tiles do not load. |
| `GROQ_API_KEY` | Groq AI chat provider is skipped. |
| `GROQ_MODEL` | Defaults to `openai/gpt-oss-120b`. |
| `CEREBRAS_API_KEY` | Cerebras AI chat provider is skipped. |
| `CEREBRAS_MODEL` | Defaults to the built-in Cerebras model. |
| `ENABLE_PROXY_DEBUG` | Endpoint disabled (returns 404). **Must be unset or `false` in production.** Setting it to `true` exposes `/api/admin/proxy-debug` to admins. |

> **`LEGACY_API_KEY_ENABLED` is not part of this system.** It is **not
> referenced anywhere** in the repository. Do not set it — a phantom variable
> cannot enable anything and only hides the real auth config (`JWT_*`).
>
> **`OPENAI_API_KEY` is also unused.** It appears only as a commented-out line
> in `.env.example`; no code reads it. Leave it unset.

Notes:
- `FRONTEND_URL` is a comma-separated list of **exact browser origins**. It must
  include the production Vercel origin and every preview origin in use. A
  missing origin makes the browser fail CORS (and, in production, blocks boot).
- `JWT_SECRET` under 32 characters fails the boot assertion.
- `ENABLE_PROXY_DEBUG` must be off once you have finished checking
  `/api/admin/proxy-debug`.

### `EMERGENCY_NUMBER` is required in production

Set `EMERGENCY_NUMBER` on Render to the deployment region's **official**
emergency number. It is treated as a required value for go-live:

- **Startup warning (loud, not fatal):** when `NODE_ENV=production` and
  `EMERGENCY_NUMBER` is unset, `server.js` prints a boxed `WARNING:` block to the
  Render logs on boot. A missing value does **not** stop the server (a
  safety-critical route must not go dark), but the warning is unmissable in the
  log — treat its presence as a **release blocker**.
- **What the user gets without it:** no number is shown or dialled anywhere.
  `/api/analyze`, `/api/triage/referral` and the client all fall back to the
  plain line **"If you feel very unwell, get medical help now or call your local
  emergency number."** The SOS screen shows no countdown and offers no auto-dial.
- **Never guess the digits.** The value is verified deployment config only.

For a Nigeria deployment the verified number is **112** (unified national
emergency number). Source: the Federal Republic of Nigeria's unified emergency
line as published in the public emergency-numbers reference — confirm against the
Nigerian Communications Commission (NCC) numbering page for your region before
go-live and record the confirmation. Do not ship an unverified default.

**Verify:** the service restarts cleanly and the logs show no missing-env errors.

**Rollback:** Render keeps the previous env var values in its event log; restore
the prior values and redeploy. Turning `ENABLE_PROXY_DEBUG` off first is the safe
default if anything looks wrong.

### What the user sees when the referral pack is missing/unreviewed

Production refuses any pack that is not marked clinically reviewed, so with no
`REFERRAL_PACK_PATH` the referral engine returns `action: "unavailable"`. This is
the safe behavior — but confirm the screen still says something a person can act
on:

- `/api/analyze` always returns a non-empty `safetyNotice`. When the engine
  cannot evaluate (score incomplete) the headline reads "Not enough readings
  yet…" and the safety line reads **"If you feel very unwell, get medical help
  now or call `<EMERGENCY_NUMBER>`."** The number comes from verified config —
  it is never hard-coded. With no `EMERGENCY_NUMBER` set the line says "…call
  your local emergency number" instead of guessing a number.
- A blank or error-only screen at this moment is a **failure**; treat it as a
  blocker. Check it on the preview deploy before merging.

**Verify:** on the preview deploy, load the app with a partial set of vitals and
confirm the get-help line is visible (not blank, not an error).

**Rollback:** this is display-only; redeploy the previous frontend commit.

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
8. **Safety fallback** — with only a partial set of vitals (e.g. heart rate
   only), the home screen shows the get-help line **"…get medical help now or
   call `<EMERGENCY_NUMBER>`"**. It must not be blank and must not show an error.
   Confirm the number matches the configured `EMERGENCY_NUMBER`.

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


