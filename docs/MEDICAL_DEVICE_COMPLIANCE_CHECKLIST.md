# Medical-device-compliance checklist

This checklist tracks whether VEEDA — or any given feature — is a regulated medical
device in the target market. Every legal line is a **placeholder** for counsel text;
do not treat any `[LEGAL: …]` line as final.

## Intended use and classification

- [ ] Intended use / indications for use statement: `[LEGAL: intended-use text]`.
- [ ] Classification per market: `[LEGAL: e.g. FDA class, EU MDR class, NAFDAC device
      classification]`.
- [ ] Confirmation of which features are **non-device** (wellness/screening-only) and
      which would cross into device territory if a validated model were enabled.

## Feature classification

The following ship as **framework only** and are explicitly non-diagnostic until a
validated model and acceptance thresholds are configured (see `src/app/modelRegistry.ts`
and `src/app/validation.ts`):

- [ ] Phone-camera checks (hemoglobin/anemia, SpO2, jaundice, skin, malaria, sickle
      cell, blood-cell count, urine strip) — no result is produced today.
- [ ] NEWS2 / qSOFA adult scores — labelled screening, adults only.
- [ ] rPPG heart-rate estimate — labelled "camera estimate", quality-gated.

## Quality management and validation

- [ ] Validation harness per feature reports error range, sensitivity, specificity and
      abstention, and per-stratum (skin tone / condition) results
      (`src/app/validation.ts`).
- [ ] Case sets come from doctors in the documented format, with a reviewed metadata
      block (reviewer, credential type, review date, region, stratifiers).
- [ ] Model updates are pinned and only promote when acceptance thresholds are met
      (`promotionDecision`).
- [ ] `[LEGAL: QMS, IEC 62304 software lifecycle and risk-management requirements]`.

## Labelling

- [ ] Every estimate shows its source and, where a real estimator supplies one, a
      confidence value.
- [ ] Outputs are labelled "early warning / screening, not a diagnosis".
- [ ] `[LEGAL: required label/IFU text per market]`.

## Post-market

- [ ] `[LEGAL: adverse-event reporting, vigilance and recall obligations]`.
- [ ] Audit trail and review queue support traceability (`audit_logs`,
      `review_queue` migration 010).

## Sign-off

| Area | Owner | Date | Status |
|------|-------|------|--------|
| Classification | `[LEGAL]` | | placeholder |
| QMS | | | placeholder |
