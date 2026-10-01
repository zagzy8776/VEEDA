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

| Item | Status | Notes |
|------|--------|-------|
| Profile framework (warning signs, alert rules, logs, card, reminders, medicine warnings) | working | `conditionProfiles.ts` — condition-agnostic; all content from packs. |
| Sickle cell profile | framework only | Pack slot `sickle_cell`; needs a reviewed pack. |
| Kidney disease / risk profile | framework only | Pack slot `kidney_disease`; needs a reviewed pack. |
| Epilepsy & seizures profile | framework only | Pack slot `epilepsy`; needs a reviewed pack (incl. seizure log fields). |
| Hypertension & diabetes profiles | framework only | Pack slots `hypertension`/`diabetes`; need reviewed packs. |
| Pain diary / seizure log / weight & BP logging | framework only | `profileLog.ts` device store (in logout clear set) + CSV export; fields come from the pack. |
| Emergency card | framework only | Rendered from the pack's `emergencyCard`; needs a reviewed pack. |
| Test reminders | framework only | Schedules are pack text; no schedule generated in code. |
| Harmful-medicine warnings | framework only | Warnings are pack text; no drug names in code. |

## Phase 4 — Health features and prevention

| Item | Status | Notes |
|------|--------|-------|
| Malaria-first triage | framework only | `prevention.ts` rule engine; needs a reviewed malaria-first pack. |
| Maternal & child health | framework only | Engine + pack slots; needs reviewed packs. |
| Mental health check-ins | framework only | `mentalHealth.ts` check-in pack loader; needs a reviewed pack. |
| Mental health crisis referral | framework only | Gated OFF in production (`mentalHealthCrisis`); needs a reviewed pack with VERIFIED numbers. |
| Outbreak alerts | framework only | Needs a trusted outbreak feed + reviewed pack. |
| Screening reminders | framework only | `dueReminders()` computes the next due date; the cadence is pack text. |
| Water-safety / cholera-season reminders | framework only | Reminder domain slot; needs a reviewed pack. |
| Daily health score | working | `healthScore.ts` — non-clinical, prints its own formula, shows each source, confidence from recorded share. |
| Nutrition guidance | framework only | Rendered from packs; needs a reviewed pack. |
| Chronic disease trend alerts | framework only | Detector + reminder slots; needs a validated model/thresholds. |
| Medication refill alerts | framework only | Reminder domain `refill`; cadence is pack text. |
| NAFDAC / barcode lookup client | framework only | `lookupProduct()` returns "unknown" until a licensed source is configured. |
| Label reading (OCR + expiry parsing) | framework only | `parseExpiry()`/`expiryStatus()` work now; the OCR model is an unvalidated registry slot. |
| Spoilage detection slot | framework only | Registry slot `spoilage`; disabled (no model). |
| Crowd reports | working | Unverified label, moderation gate, rate-limit abuse control, privacy note. |
| Chemical test-strip guidance UI | framework only | `loadStripGuidance()`; colour chart/meanings come from a pack. |

## Phase 5 — Phone-only checks and clip-on lens

All checks share one pipeline: guided capture → photo-quality gate → consent → trace
export → model slot. The **quality gate and guided capture work now**; every model
output is DISABLED ("not yet validated") because no validated model is registered.

| Item | Status | Notes |
|------|--------|-------|
| Photo quality check + guided capture | working | `captureQuality.ts` — blur/light/framing/size gate with retake guidance. |
| Hemoglobin / anemia | framework only | Lens check; model slot `hemoglobin_anemia` unvalidated. |
| SpO2 | framework only | Model slot `spo2` unvalidated. |
| Jaundice | framework only | Model slot `jaundice` unvalidated. |
| Skin photos | framework only | Model slot `skin_photo` unvalidated. |
| Cough & voice | framework only | Needs mic consent + model slot `cough_voice`; no recording by default. |
| Malaria | framework only | Lens check; model slot `malaria` unvalidated. |
| Sickle cell | framework only | Lens check; model slot `sickle_cell` unvalidated. |
| Blood cell counting | framework only | Lens check; model slot `blood_cell_count` unvalidated. |
| Urine test-strip reading | framework only | Model slot `urine_strip` unvalidated. |
| Trace export for validation | working | `phoneCheckExport.ts` — raw trace only, no VEEDA result. |

## Phase 6 — Live camera and voice consult

_Not started._

## Phase 7 — Connection to care and the AI doctor

_Not started._

## Phase 8 — Access

_Not started._

## Phase 9 — Safety and validation

_Not started._
