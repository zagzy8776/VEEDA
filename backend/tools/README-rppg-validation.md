# rPPG validation harness

`validate-rppg.mjs` runs the production camera heart-rate estimator
(`backend/rppg-core.mjs`) over **recorded** RGB traces and reports how well the
estimate matches a reference pulse. It does **not** modify the estimator.

Use it to decide whether a future quality-gate / SNR change is safe on real
data before it ships, and to measure how often the gate returns `0`
(i.e. refuses to report a rate at all).

## Why this exists

The camera estimator currently rejects some valid signals — notably fast heart
rates (e.g. `48` and `120` BPM in the synthetic tests) — because the SNR
denominator counts every non-peak bin as noise and there is no explicit
peak-ambiguity rule. That fails safe, but it can refuse to report genuine
tachycardia (fever, sepsis). Any fix must be judged against **real recordings**,
not synthetic signals, so we need this harness first.

## Input format

Pass a **manifest CSV** listing one recording per row:

```csv
recording_id,reference_bpm,trace_path
subj001_rest,68,traces/subj001_rest.csv
subj001_walk,104,traces/subj001_walk.csv
subj002_fever,132,traces/subj002_fever.csv
```

- `recording_id` — any stable label (also accepts `id`).
- `reference_bpm` — the ground-truth pulse (also accepts `ref_bpm` / `bpm`).
- `trace_path` — path to the RGB trace CSV, **relative to the manifest file**.

Each trace CSV must have a header with `t_ms,r,g,b` (case-insensitive,
order-independent), one sample per row:

```csv
t_ms,r,g,b
0,101.2,118.4,131.0
33,101.4,118.9,131.2
...
```

`t_ms` is milliseconds; `r`,`g`,`b` are the averaged channel values for the
frame, exactly as the app captures them (per-frame median across ROIs).

## Running

```bash
node backend/tools/validate-rppg.mjs --manifest recordings/manifest.csv
node backend/tools/validate-rppg.mjs --manifest recordings/manifest.csv --verbose
```

Output: a per-recording table (reference, estimate, signed error, confidence,
SNR, whether the gate returned 0) and a summary with:

- **MAE** — mean absolute error over recordings that passed the gate.
- **bias** — mean signed error (positive = overestimates).
- **median absolute error**
- **within ±5 bpm** count
- **gate-zero rate** — fraction of recordings the gate refused.

Exit codes: `0` normal, `1` bad usage/manifest, `2` the gate returned `0` for
**every** recording (a fully-refusing gate — treat as a failure).

## How to collect recordings

You need paired data: a reference pulse and the camera trace captured at the
same time.

1. **Reference measurement.** Use a validated device — a fingertip pulse
   oximeter, a chest strap (e.g. Polar H10), or an ECG — and record the heart
   rate (BPM) during the same window as the camera capture. Note the average
   over the ~30 s window, not a single instantaneous value.
2. **Camera trace.** Capture with the same path the app uses: rear camera,
   fingertip fully covering the lens, good light (torch on), ~30 s at ~30 Hz.
   Export the per-frame `t_ms,r,g,b` you fed into `estimateRppg` to a CSV with
   the header above. If you add a debug export to the app, write exactly the
   `rgb` / `timestamps` arrays you pass to `estimateRppg` so the harness
   reproduces production behaviour exactly.
3. **Label the effort.** Include a range of rates and conditions — rest, after
   exercise, fever/warm, cold hands, motion, different skin tones, low light.
   The gate's failure modes only show up when the dataset spans them.
4. **One row per capture** in the manifest; keep the trace files next to it.

## What "good" looks like

There is no fixed pass threshold yet; record the baseline first. A useful target
before changing the estimator:

- **gate-zero rate** should be low (the gate should not refuse most real,
  well-captured recordings), and
- **MAE** should stay small (roughly ≤ 5 bpm on clean fingertip captures), and
- **bias** should be close to 0.

Any proposed estimator change must not raise the gate-zero rate on this dataset
and must not increase MAE/bias, while still returning `0` for genuinely
unusable input (noise-only, motion artifact, no-contact).

## Related tests

`backend/tests/rppg-core.test.js` covers the estimator on synthetic signals.
The `48/120` BPM recovery test is marked `todo` until the quality gate is fixed
and validated with this harness.
