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