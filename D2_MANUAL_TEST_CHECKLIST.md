# Stage D2 preview checklist

## Render configuration before deployment

- Set `FRONTEND_URL` on Render to the exact browser origin(s), with no trailing slash and comma-separated values.
- Production exact value:

  ```text
  https://veeda-mu.vercel.app
  ```

- For a Vercel preview, append the exact preview origin currently being tested, for example:

  ```text
  https://veeda-mu.vercel.app,https://<exact-preview-name>.vercel.app
  ```

- Do not use `*`, a Vercel wildcard, or the Render API URL in `FRONTEND_URL`.
- Replace `REPLACE_WITH_LIVE_RENDER_HOST` in `vercel.json` with the confirmed Render hostname before deploying. The repository currently does not confirm whether the live host is `veeda.onrender.com` or `veda-backend-h1lj.onrender.com`.
- Keep `ENABLE_PROXY_DEBUG=true` only during the proxy verification below; return it to `false` before release.

## Browser flow

1. Open the exact Vercel preview URL in Chrome.
2. Open DevTools → Application/Storage → Cookies for the Vercel origin.
3. Register a new account with a valid email and a password of at least 10 characters.
4. Confirm registration logs the user in and the app leaves the logged-out screen.
5. In Network, confirm API requests use same-origin `/api/*` and `/auth/*` paths, include `credentials`, and do not include `x-veda-*` or `x-veda-api-key` headers.
6. Confirm the `veda_refresh_token` cookie exists with:
   - `HttpOnly` enabled;
   - `Secure` enabled;
   - `SameSite=Strict`;
   - `Path=/auth`;
   - no refresh token in the login or refresh JSON response.
7. Measure a heart rate or breathing value and confirm local measurement still works while logged in.
8. Wait for the 15-minute access token to expire, or use a short-lived preview token if available. Trigger History, Map, or another protected API call.
9. Confirm the client makes one `/auth/refresh` request, receives a rotated cookie/access token, and retries the original request once.
10. Confirm a refresh failure returns the UI to the logged-out state and clears the in-memory access token.
11. From Profile, click **Sign out**. Confirm `/auth/logout` succeeds, the refresh cookie is cleared, and the app returns to the login screen.
12. Sign in again in a private/incognito window and repeat login, refresh, and logout.
13. Repeat the cookie and refresh checks in Safari. Pay particular attention to Secure-cookie behavior and whether the rewrite preserves `Set-Cookie`.

## Legacy ID claim

1. Before signing in, create or retain an existing `veda_patient_id` in the same browser profile.
2. Sign in with a new account.
3. Confirm the one-time “Link previous VEEDA data?” prompt appears.
4. Choose **Link data** and confirm `/auth/claim-legacy-id` succeeds.
5. Verify the account can read only its linked history; do not accept an arbitrary patient ID from request headers or query parameters.

## Proxy-hop verification

1. On Render, set `ENABLE_PROXY_DEBUG=true` temporarily.
2. Authenticate as a backend user with role `admin` and call `/api/admin/proxy-debug` through the Vercel preview URL.
3. Record `ip`, `ips`, `socketAddress`, `forwardedFor`, `vercelId`, and `protocol`.
4. Confirm `req.ip` is the real browser/client address and that the forwarded chain is the expected Vercel → Render shape.
5. Send a direct request with a fake `X-Forwarded-For` header and confirm it cannot select an arbitrary login rate-limit identity; the defensive limiter must fall back to the immediate proxy peer for an unexpected chain.
6. Set `ENABLE_PROXY_DEBUG=false` before release.

## Emergency SOS and get-help click-through

Covers the emergency-number resilience work: the backend value overrides, the
device cache survives a slow/offline backend, and the build-time
`VITE_EMERGENCY_NUMBER` is a fallback. With none of them there must be **no
auto-dial and no guessed digits**.

### SOS dialer — with a configured number

1. Confirm `EMERGENCY_NUMBER` is set on Render (e.g. `112`) and load the app so a
   signed-in call to `/api/analyze` (or `/api/triage/referral`) has returned once.
2. Open **Map → Emergency SOS**. The button label reads `Emergency SOS - Call <number>`.
3. Tap it: the SOS sheet shows the number and a **10-second countdown** that
   auto-dials `tel:<number>` at zero. Verify the dialer opens with the configured
   number prefilled.
4. Repeat with the **Call Now** button (no wait) and confirm it dials the same number.
5. Take the device offline (airplane mode) and reload. The offline banner and the
   SOS sheet must still name the cached number and still dial it — this proves the
   device cache, not the live backend, is being used.

### SOS dialer — with no number configured

1. Clear the device cache (`localStorage.removeItem('veda_emergency_number')`) and

### Emergency contacts (device-only)

1. Open **Profile → Emergency contacts**. Add a contact with a name and a number
   only; there must be no relationship/email/medical field.
2. Confirm the list caps at **3** contacts and that adding a fourth is blocked with
   a plain message.
3. Tap **Call**: the phone dialer opens prefilled with that number (VEEDA itself
   must not place the call). Tap **Message**: the messaging app opens with the
   saved number and a neutral, editable message prefilled.
4. Confirm the message names no condition and gives no medical advice; with
   location permission granted the message includes the location, and with it
   denied the message still works without it.
5. Sign out, then sign in as a different user on the same device: the first user's
   contacts must NOT appear (the per-user key is cleared on logout).

### Export my data (account)

1. Open **Profile → Data & account → Export**. Confirm a
   `veeda-account-<date>.json` file downloads that contains your owned readings
   and your consent history.
2. Sign out and confirm **Export** shows "Could not reach the server" / is inert
   (the server export requires a signed-in session).

### Delete my account (hard erase)

1. Open **Profile → Data & account → Delete…**. Confirm the confirm button is
   disabled until BOTH the password is entered AND `DELETE` is typed exactly.
2. Type `delete` (lower-case) and confirm deletion is refused (the word is
   case-sensitive).
3. Type a wrong password: the server returns "Password is incorrect" and nothing
   is deleted.
4. With the right password and `DELETE`, confirm the account is erased and you are
   signed out. Then sign in again: the account no longer exists and no readings

### BP/glucose server sync

1. Signed in AND consented, save a BP reading in **Profile → Blood pressure &
   glucose**. Confirm it appears in the account export
   (`GET /api/account/export` → `data.readings`) after a moment.
2. Go offline (airplane mode) and save a reading. Confirm the reading still saves
   on the device and the app does not error; the sync silently retries.
3. Go back online and re-open the screen (or sign out and in). Confirm the offline
   reading is uploaded and no duplicate appears (the `client_id` upsert).
4. Withdraw the logging consent. Confirm new readings stop syncing. Then press
   **Delete my synced readings** and confirm the server copy is gone (the local
   device log is untouched).
5. Confirm the server rejects an impossible value: post a reading with

### Family profiles (dependants) + age gate

1. Signed in, open the header switcher. With no family profiles it shows only
   **Me** (and the switcher may be hidden). Add a family profile via
   `POST /api/dependents` (or the UI) and confirm it appears in the switcher.
2. Switch to the profile: readings shown/saved are scoped to that profile, and the
   account owner's readings are not shown for it.
3. Confirm a dependant is guardian-only: sign in as another account and confirm
   the first guardian's profiles are NOT visible, and `GET /api/dependents`
   returns only the signed-in guardian's list.
4. **Age gate (clinical):** add a dependant with age `8`, switch to them, and open
   the clinical chat. Confirm the reply/header says **"Not validated for
   children"** and shows NO NEWS2 or qSOFA score.
5. Add a dependant with **no age**, switch to them, and confirm the same "not
   validated" behavior (unknown age is never scored).
6. Set `VITE_ADULT_AGE_CUTOFF` to a different value, rebuild, and confirm the same
   age is reclassified at the new cutoff (the cutoff is configuration, not a
   hard-coded number).

### Content packs (authoring + validator)

1. Read `docs/CONTENT_PACK_GUIDE.md` and confirm it states the format and the
   process but contains **no** clinical guidance of its own.
2. Confirm a pack with `clinicallyReviewed: false` is refused in production and
   the feature reports "unavailable" (never a false all-clear).
3. Confirm a pack whose `reviewerCredential` is a license number (e.g. `1234567`)
   is refused by both validators.
4. Confirm the shipped example (`backend/triage/referralPack.example.json`) is
   **refused** in production and works only in development.
5. Grep the repo for a real license number / patient data before publishing — the
   repo may be public; only a reviewer name and credential **type** belong in a
   pack.

7. Sign out on a shared device and confirm the selected subject is cleared (the
   next user does not inherit the previous person's switcher selection).

   `systolic` below `diastolic` directly to `/api/readings` and confirm it is
   returned in `rejected`, not stored.

   remain.
5. On a **real Postgres** (a Neon test branch), confirm the erase succeeds even
   when the user has `audit_logs` rows (this proves migration 007 was applied).
   The in-memory tests cannot catch a missing 007.

6. Sign out with contacts saved and confirm the logout export includes an
   `emergency-contacts-<date>.csv` file with the user's own contacts.

   set neither `EMERGENCY_NUMBER` on Render nor `VITE_EMERGENCY_NUMBER` at build.
2. Reload and open **Map → Emergency SOS**. The button reads plain `Emergency SOS`
   (no number in the label).
3. Tap it: the sheet shows the plain line **"call your local emergency number"**,
   **no countdown**, and **no auto-dial**. There must be no `tel:` link and no
   digits anywhere in the sheet.
4. The offline banner must also read the plain "call your local emergency number"
   wording, not a `Call <number>` button.
5. Confirm tapping close/cancel never triggers a phone dialer.

### Get-help line (home + chat)

1. With only a partial set of vitals measured, confirm the home safety line reads
   "…get medical help now or call `<number>`" when a number is configured, and
   "…call your local emergency number" when none is.
2. Open the chat panel and send **"emergency"** or **"help"**. The assistant reply
   must include the same get-help line (backend `safetyNotice` first, then the
   resolved number).
3. Confirm the chat fallback reply (backend unavailable) says to use the emergency
   workflow / call the local emergency number — never a blank or error-only bubble.