# STATUS — Batch 4 (feature/everything-batch-4)

Living status for the VEEDA master list. Each item is one of:

- **working** — implemented and unit-tested; no invented clinical/legal content.
- **framework only** — capture/consent/UI/storage/registry/validation harness built
  and tested, but the clinical output is DISABLED until the missing piece in
  brackets is supplied. The UI shows a plain "not yet validated / not available".
- **blocked** — cannot be built honestly without the stated input.

Global rules in force: clinical content comes only from versioned packs; production
refuses unreviewed packs; missing pack/data/model/permission shows a plain
"not available, get medical help" state; adults-only scores; every sensor prompt +
consent + in-use indicator; every new per-user device key is in the logout clear
set with a test; no migration run against any database.

## Phase 1 — Environment and safety alerts

| Item | Status | Notes |
|------|--------|-------|
| Alert engine (wording from packs, fail-safe) | working | `src/app/alerts.ts`; unreviewed/missing pack -> "unavailable". Fire/smoke/CO can never come from a phone guess. |
| Weather / heat / rain / storm alerts | framework only | Engine + pack slot ready; needs a trusted weather feed and a reviewed alert pack. |
| Air quality / harmattan / dust alerts | framework only | Needs a trusted AQI feed + reviewed pack. |
| NASA FIRMS fire alerts | framework only | Needs the FIRMS feed (API key/endpoint) + reviewed pack. |
| National weather warnings | framework only | Needs the official warning feed + reviewed pack. |
| Rainy-season malaria / cholera reminders | framework only | Needs a reviewed reminder pack. |
| Barometer reading | working | `readBarometer()`; reports "unavailable" where the device has no barometer. |
| Battery-temperature warning | working | `readBatteryTemperature()`; value only, no invented safe range. |
| Bluetooth home safety kit (temp/smoke/CO) + family alerts | framework only | `home_safety` kind is `paired_alarm` only; needs the BLE kit protocol + reviewed pack + family alert delivery. |

## Phase 2 — Automatic detection

| Item | Status | Notes |
|------|--------|-------|
| On-device baseline learning (1–2 weeks) | framework only | `learnBaseline()`; needs a real learning window set by config. Learning stays on-device. |
| Illness drift (resting HR, activity, sleep) | framework only | Detector registered, disabled by default, no thresholds. Needs a validated model + operator thresholds. |
| Seizure detection | framework only | Requires a validated model (registry slot `seizure_detection`) + thresholds; runs from the accelerometer. |
| Fall / collapse detection | framework only | Escalation ladder (check-in → family call → SOS) working; the accelerometer trigger needs operator thresholds. |
| Caregiver alert if no response | framework only | `caregivers.ts` store (device-only, in logout clear set) + neutral message; delivery uses the platform messaging app. |
| Sickle cell crisis early warning | framework only | Model-registry slot + warning-sign pack slot; no content hard-coded. |
| Breathing-trouble detection (mic/voice) | framework only | Needs mic consent + a validated model; no audio recorded by default. |
| Regular short check-ins (swelling, urine) | framework only | Questions come from packs; needs a reviewed check-in pack. |
| Escalation ladder (check-in, family call, SOS) | working | `escalation.ts`; state machine only, never dials, SOS is terminal. |
| Replay / validation harness per detector | working | `replayDetector()`; reports a disabled detector as disabled, never scores it. |
| Thresholds are config, default disabled | working | `DetectorConfig`; no thresholds => `disabled` with a plain reason. |

## Phase 3 — Condition profiles

_Not started._

## Phase 4 — Health features and prevention

_Not started._

## Phase 5 — Phone-only checks and clip-on lens

_Not started._

## Phase 6 — Live camera and voice consult

_Not started._

## Phase 7 — Connection to care and the AI doctor

_Not started._

## Phase 8 — Access

_Not started._

## Phase 9 — Safety and validation

_Not started._
