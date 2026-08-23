# VEEDA rPPG Heart-Rate Validation Protocol

## Purpose

This protocol defines how the VEEDA camera rPPG estimator is to be validated against a reference heart-rate measurement before any claim of clinical accuracy is made.

## Algorithm under test

The current estimator uses normalized RGB channels, a CHROM-style chrominance projection, band-pass filtering over 0.67–3.33 Hz (40–200 BPM), spectral peak estimation, temporal stability, and signal-quality/SNR gating.

Implementation:

- `backend/rppg-core.mjs`
- `src/app/sensors.ts`

## Software verification

Automated tests must cover:

- clean synthetic sinusoidal signals at multiple heart rates;
- deterministic noise and interference;
- flat/no-information signals;
- insufficient sample counts;
- invalid sampling rates;
- configured BPM bounds;
- rejection of low-quality signals.

These tests establish algorithm behavior, not clinical accuracy.

## Reference standard

Use a validated reference heart-rate measurement appropriate to the study setting (for example, a validated clinical monitor or ECG-derived reference). Record reference timestamps synchronized to VEEDA measurements.

## Paired-observation dataset

Each observation should include at minimum:

- study subject identifier;
- timestamp;
- VEEDA BPM;
- VEEDA signal-quality score;
- VEEDA SNR;
- VEEDA sampling rate;
- reference BPM;
- device model and OS;
- camera/environment conditions;
- study condition (rest, controlled movement, other predefined condition);
- measurement success/failure reason.

## Primary accuracy metrics

For paired valid observations calculate:

- mean absolute error (MAE);
- root mean square error (RMSE);
- mean signed error (bias);
- standard deviation of error;
- Bland–Altman mean difference and 95% limits of agreement;
- valid-measurement rate;
- signal rejection/failure rate.

Do not replace missing/rejected VEEDA measurements with zero or imputed values when computing accuracy.

## Stratified analysis

Report results separately by predefined factors that may influence optical PPG performance, including:

- device/camera model;
- lighting condition;
- motion condition;
- skin pigmentation/skin-tone grouping using the study's approved terminology and consent procedure;
- heart-rate range;
- age group when relevant to the study population.

## Clinical-use gate

A VEEDA rPPG reading must not be represented as clinically validated solely because the synthetic tests pass.

The claim `clinically accurate` requires documented paired-reference validation with prespecified acceptance criteria, an analysis dataset, and review/approval appropriate to the intended clinical use.

## Traceability

Every reported result must be traceable to the exact VEEDA algorithm version/commit, test dataset version, reference-device identity, and analysis script/version.
