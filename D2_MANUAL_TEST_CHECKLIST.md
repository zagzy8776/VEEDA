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