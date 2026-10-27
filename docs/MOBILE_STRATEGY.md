# Mobile strategy — PWA now, native wrapper for guardian mode

Short version: the PWA stays the deployment engine. A thin native Android
wrapper (Capacitor) is the accepted next step for anything that must work while
VEEDA is closed, pocketed, or in another room. This document records why, and
the trigger points for paying that debt.

## What the browser can and cannot do (capability facts)

The web platform is a cage for background sensing. These are platform rules,
not VEEDA choices:

- Service workers cannot access the microphone, camera, or motion sensors.
  When the tab closes or is backgrounded, `getUserMedia` streams stop.
- iOS suspends timers, audio capture, and motion events for background pages.
- Background work a PWA CAN do: Web Push notifications, offline queue sync,
  and anything already stored on the device.
- Web Bluetooth exists only on some browsers and never in the background, so
  cuffs / oximeters / the home-safety kit cannot rely on it.
- Foreground-only features work fine in the PWA: every Phase 5 phone check,
  the live consult, and the audio-distress watch (by design it is
  foreground-only until a native layer exists).

## Architecture decision

1. **Keep the Vite PWA as the single codebase.** All features ship there first:
   fast to test, instant to deploy, works on any phone with a browser.
2. **Wrap, do not rewrite.** When guardian mode is needed, wrap the same app
   with Capacitor so the React code and all pure modules (`detectors.ts`,
   `audioDistress.ts`, `escalation.ts`, consent, storage) stay unchanged.
3. **Add native modules only for what the web cannot do:**
   - Android foreground service for background watching (fall, audio distress,
     no-response check-ins), with a persistent notification and the same
     consent + in-use indicator rules.
   - Background task scheduling for periodic check-ins beyond Web Push.
   - BLE plumbing for paired health devices (reusing the `home_safety`
     paired-device framework).
4. **iOS is a separate, later decision.** iOS has no general background
   monitoring either; it would need specific entitlements (background audio,
   significant-location) and App Store review. Do not promise guardian mode on
   iOS until that investigation is done.

## Trigger points (when to build the wrapper)

Build the native layer when ANY of these becomes true:

- [ ] A detector must run while the app is closed (fall / audio distress /
      no-response escalation for an unconscious user) — this is the "works
      when the user cannot reach the phone" promise.
- [ ] Scheduled check-ins must fire reliably without the app being open.
- [ ] A paired device (cuff, oximeter, home-safety kit) must sync in the
      background.

Until then, every detector stays foreground-only and says so plainly in the UI.

## Rules carried into the native layer

The same non-negotiables apply, unchanged: per-feature consent before any
sensor; a visible "sensor is on" indicator; nothing recorded by default; every
per-user key stays in the logout clear set; a detection only ever starts the
check-in ladder; no invented clinical content and no unvalidated model output.
