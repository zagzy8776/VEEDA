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
| Audio distress (scream/crash) watch | framework only | `audioDistress.ts` + registry slot `audio_distress`; foreground-only, needs mic consent + config + a validated classifier; needs several consecutive positives, and a detection only starts the check-in ladder (`escalation.ts`) — never dials, never auto-SOS. |
| Chat hardening (Clinical Support) | working | Grounded reply protocol (data → scores → do now → watch → escalate), escalation ladder recommendation only, conversation memory (6 sanitized turns), server-side pediatric gate (adult scores stripped for child/unknown-age subjects), 20s provider timeout, 30/15min per-user limit surfaced in-app; rate limiter + hardening pinned by tests. **Always-engage guarantee:** an offline dialogue engine (`src/app/dialogueEngine.ts`) answers first, so the conversation keeps going when every AI provider is down — the client sends its local plan as `localGuidance` and the server returns it verbatim (`source: 'local'`) instead of a static clinical block, which was the old failure. |
| Emergency escalation names mapped care | working | A red flag or "where am I" / "find a hospital" turn names the nearest mapped hospital and pharmacy from `/api/map/nearby` (distance + phone), always stating they are mapped places, never contacted, and open status unknown. The reply still stands with no network: the care line is simply omitted. |
| Daily health dialogue (check-ins, steps/water/activity) | working | `dailyCheckIn(now, goals)` opens by time of day; the chat opener uses it, and steps/sleep/activity are captured into `CURRENT_EVENT`. The profile water/steps goals only *frame* a question — the reply echoes the number without judging or scoring it (`dailyGoals` in `src/app/dialogueEngine.ts`). |
| Bluetooth device intake (BP / glucose / temperature) | working | `src/app/bleDevices.ts` reads the standard GATT services (Blood Pressure `0x1810`, Health Thermometer `0x1809`, Glucose `0x1808`) with pure 16-bit SFLOAT / IEEE-11073 32-bit FLOAT decoders. A device reading is validated exactly like a typed one (marked `source: 'device'`) — nothing is trusted merely because it arrived over Bluetooth — and is stored/trended alongside typed entries (`temperatureTrend` averages within one unit only, never mixing °C/°F). Web Bluetooth does not exist in iOS Safari, so `BpGlucosePage.tsx` states that plainly and keeps typed entry as the fallback; a cancelled or failed connect never blocks entry. Syncing a temperature needs migration 012. |
| Symptom intake → doctor summary (chat) | working | "Report a symptom" runs an 8-question interview; red flags (keywords, severity ≥ 8) end it early with emergency advice; record saves per-user on-device (logout clear set); printable summary (browser print → Save as PDF) with provenance-labeled readings, pediatric-gated scores, and a not-a-diagnosis disclaimer. |
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
| Medicine intelligence (package reading, authenticity, interactions, patient gate, schedule + adherence) | working | `src/app/medicineIntelligence.ts` parses a typed label (missing fields come back null, never guessed); authenticity stays `unverified` unless a configured authoritative service confirms it — a photo can never prove a medicine is genuine; interactions are `unavailable` with no verified source and are never invented; a patient-context gate raises flags and questions (allergies, other medicines, child, pregnancy) and never states a dose or a diagnosis; plan + adherence live on-device per user (`src/app/medicines.ts`, in the logout clear set) and reminders export as an `.ics`. UI: `src/app/components/MedicinePage.tsx`. |
| Label reading (OCR + expiry parsing) | framework only | `parseExpiry()`/`expiryStatus()` work now; the OCR model is an unvalidated registry slot. |
| Spoilage detection slot | framework only | Registry slot `spoilage`; disabled (no model). |
| Food scanner (camera + adaptive questions + safety flags) | working | `src/app/foodScan.ts` — the photo is an input channel, never a verdict: `food_recognition` is an unvalidated registry slot so it never claims to identify a food; it asks one adaptive question at a time and raises only supported general food-safety flags (spoilage, undercooking, packaging), with severe-allergy symptoms escalated as urgent. UI: `src/app/components/FoodScanPage.tsx`. |
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

| Item | Status | Notes |
|------|--------|-------|
| Camera & mic session with guided capture | working | `liveSession.ts` — per-session consent, "camera/mic is on" indicator, recording OFF by default. |
| Live vitals using existing estimators | working | Reuses the existing rPPG/breath estimators; nothing new invented. |
| Visual-check slots | framework only | Model slots; "not yet validated". |
| Stroke-screen flow | framework only | Steps come from a reviewed pack (`loadStrokeScreen`); needs a pack. |
| Label reading aloud | framework only | OCR + speech slots; not validated. |
| Caregiver-started remote check | framework only | Session kind exists; needs a caregiver delivery channel. |
| Emergency mode | working | Session kind + escalation wiring; dials only the verified number. |
| Consent each session, no recording by default, on-device first | working | Enforced by `startSession`/`setRecording`; pinned by tests. |
| Local-language voice (language-pack slot) | framework only | `languagePacks.ts` + browser voice detection; needs reviewed language packs. |

## Phase 7 — Connection to care and the AI doctor

| Item | Status | Notes |
|------|--------|-------|
| Find a lab or pharmacy | framework only | `care.ts` search over the map; prices/stock ONLY from a configured partner, else "unknown". The chat's location/emergency answers name the nearest MAPPED hospital and pharmacy from `/api/map/nearby` (see Phase 2) — position only, no prices or stock. |
| Book a real doctor | framework only | Gated OFF (`carePartnerBooking`); needs a configured care partner. |
| Clinician review queue | working | `backend/routes/review-queue.js` + migration 010: role-gated, SLA, derived escalation, audit trail, reviewer sign-off. |
| Intake before any advice | working | `careFlow.ts` blocks advice until required intake answers exist. |
| Red-flag referral | working | Surfaced as a referral, never as advice. |
| Explainable results | working | `explainResult()` returns inputs + sources + pack provenance + model version + disclaimer. |
| One-model-per-task registry | working | `modelRegistry.ts` (Phase 2); version pinning + validation requirements. |
| Controlled model updates / version pinning | working | Registry pins an approved version; updates are explicit. |

## Phase 8 — Access

| Item | Status | Notes |
|------|--------|-------|
| Offline mode (core checks, logging, queue sync) | working | `access.ts` per-user queue (in logout clear set); sync flushes by id. |
| Low-data mode | working | `lowDataPolicy()` + `trimPayload()`: small batches, no images, no maps unless asked. |
| Pidgin/Igbo/Yoruba/Hausa language packs | framework only | `languagePacks.ts` (Phase 6) + English fallback; needs reviewed language packs. |
| Voice input/replies where the browser supports it | framework only | Browser voice detection ships; needs reviewed packs + device support. |
| USSD/SMS fallback | framework only | `ussdSession()` — provider adapter ships UNCONFIGURED; no code shown until set. |

## Phase 9 — Safety and validation

| Item | Status | Notes |
|------|--------|-------|
| Per-feature validation harness (error range, sensitivity, specificity) | working | `validation.ts` — computes from cases; reports abstention and per-stratum results. |
| Test across skin tones and bad conditions | framework only | Stratifier reporting ships; the case sets themselves are supplied by a clinician. |
| Doctor-reviewed case-set format | working | `docs/VALIDATION_CASE_SET_FORMAT.md` + typed case format. |
| Model-update controls | working | `promotionDecision()` — promotion needs acceptance met AND an explicit pin. |
| Data-protection checklist doc | working | `docs/DATA_PROTECTION_CHECKLIST.md` (legal lines are placeholders). |
| Medical-device-compliance checklist doc | working | `docs/MEDICAL_DEVICE_COMPLIANCE_CHECKLIST.md` (legal lines are placeholders). |

## Finish

Both suites and a build were run at the end of every phase; the final run is recorded
in the batch report. No migration was executed against any database.
