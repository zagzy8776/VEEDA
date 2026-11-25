# VEEDA Android native wrapper

This folder contains the native Android shell for VEEDA. It is the Capacitor
wrapper described in `docs/MOBILE_STRATEGY.md`: the existing React/Vite PWA
stays the deployment engine, and this native layer only adds what the web
platform cannot do (background sensing, foreground services, BLE, camera torch
control, offline queue sync).

## Architecture

- `MainActivity` hosts the Compose UI and the permission launcher. It never
  requests a sensor permission without an explicit per-feature consent from the
  user.
- `ConsentManager` stores per-feature consent flags. Every sensor checks
  `hasConsent(...)` before it starts.
- `SecureStorage` stores the JWT and per-user device keys. `clearAll()` is
  called on logout and wipes every per-user key (pinned by tests in the web
  layer).
- `GuardianModeService` is the foreground service for Guardian Mode. It starts
  only after consent, shows a persistent notification, and runs the fall
  detector, audio-distress watch, and missing check-in escalation. A detection
  only starts the check-in ladder; it never dials and never auto-SOS.
- `SyncWorkerService` + `WorkManagerScheduler` flush the offline measurement
  queue when the network is restored.
- `camera/` holds the CameraX rPPG capture (YUV_420_888 red/green channel
  intensity over time) with torch control.
- `BleHealthDeviceManager` reads standard GATT services for paired health
  devices: Blood Pressure (0x1810), Health Thermometer (0x1809), Glucose
  (0x1808).
- `ApiClient` is the Retrofit client for the VEEDA Express backend
  (`/api/auth/*`, `/api/map/nearby`, `/api/chat/message`, `/api/review-queue`).

## Safety rules carried into the native layer

1. Explicit per-feature consent before any sensor activates.
2. A visible in-use indicator whenever camera or microphone is active.
3. No unvalidated clinical output: missing/unvalidated results show a plain
   "not available, seek medical care if needed" state.
4. Offline resilience: emergency contact/SOS numbers and emergency dialogue
   guidance work offline from cached device values.

## Build

The wrapper expects the PWA build output in `dist/` (see `capacitor.config.json`
`webDir`). With Gradle and the Android SDK installed:

```bash
cd android
./gradlew assembleDebug
```

The full Capacitor sync (`npx cap sync android`) runs after `npm run build` in
the project root.

## Capacitor setup (one-time)

The Android shell is already generated in `android/`. To wire up the Capacitor
runtime (when the npm registry is reachable):

```bash
npm install @capacitor/core @capacitor/cli @capacitor/android --save
npm run build
npx cap sync android
```

`settings.gradle.kts` already points `:capacitor` at
`node_modules/@capacitor/android/capacitor`, so the sync only needs to copy the
web assets and refresh the plugin registry.