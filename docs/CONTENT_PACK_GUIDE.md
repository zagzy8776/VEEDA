# Content-pack authoring guide

VEEDA ships **no clinical content in code**. Every triage rule, red flag,
intake question, threshold and crisis instruction arrives as a versioned
**content pack** authored and approved by a clinician. This guide describes the
file format and the review process. It **does not** contain any clinical
guidance — that is yours to write.

> This repository may be **public**. Never put a real patient's data, a real
> license/registration number, or any other personal data in a pack, an example,
> or a test. Use the reviewer's **name and credential type only** (e.g.
> `"reviewer": "A. Clinician", "reviewerCredential": "Physician"`).

## Why packs

1. **Provenance.** Each pack records who reviewed it and when, so the app can
   show the user where a recommendation came from.
2. **Fail-safe.** A pack that is missing, invalid, or not reviewed is refused.
   The app then reports the feature as *unavailable* — it never invents an
   answer, and never shows a false all-clear.

## Common metadata (every pack)

| Field | Type | Notes |
|-------|------|-------|
| `id` | string | Stable id, e.g. `intake.febrile.v1`. |
| `version` | string | Your pack version, e.g. `1.0.0`. Bump on any change. |
| `reviewer` | string | Name **or role** of the approver. |
| `reviewerCredential` | string (optional) | Credential **type only** — `"Physician"`, `"Registered Nurse"`. **Never a license number.** |
| `reviewDate` | string | ISO date `YYYY-MM-DD`. |
| `region` | string | `"NG"`, `"global"`, etc. |
| `clinicallyReviewed` | boolean | `true` **only** after a qualified human approves this exact content. |
| `entries` | array | The pack body (shape depends on the pack type). |

The validator **rejects** a pack with a missing/blank required field, a
non-ISO `reviewDate`, a non-boolean `clinicallyReviewed`, a missing `entries`
array, or a `reviewerCredential` that looks like a license number.

## Production rule

In production, a pack is used **only** when `clinicallyReviewed` is `true`.
Any other value is refused, and the app reports the feature as unavailable.
The sample packs shipped in this repo are deliberately **not** reviewed and are
**refused in production** — they exist so local development works.

## Intake packs

An intake pack's `entries` are questions:

```json
{
  "id": "sample.fever_duration",
  "prompt": "<your question text>",
  "type": "number | yes_no | text | choice",
  "required": true
}
```

- `type` — the input control. `choice` also needs an `options` array.
- `required` — whether the user must answer before continuing.

## Referral packs (band table)

A referral pack's `entries` map a score range to an action. Bands are the
clinician's decision; the engine only looks up the band that contains the score.

```json
{
  "minTotal": 0,
  "maxTotal": 0,
  "action": "self_care | urgent_care | emergency",
  "instruction": "<your guidance text>"
}
```

- Bands must not overlap and should cover the whole possible range; a score
  outside every band makes the engine report *unavailable*, not a false calm.

## Authoring checklist

1. Copy the relevant sample from `src/app/*.sample.json` or
   `backend/triage/*.sample.json` as a starting point.
2. Replace every `SAMPLE ...` placeholder with your own text.
3. Fill in all metadata; set `clinicallyReviewed: false` while drafting.
4. Run the validator (and the test suite) — a pack that fails validation is
   refused, which is the intended fail-safe.
5. Get a qualified clinician to review this exact text, then set
   `clinicallyReviewed: true`, update `reviewDate`, and record the reviewer.
6. Keep the license number **out of the file**; the reviewer's name and
   credential type are enough.

## Loading a pack

- **Client:** intake packs are validated with `validateContentPack()`.
- **Server:** referral packs are validated with `validateReferralPack()` and the
  path is supplied by config (`REFERRAL_PACK_PATH`), so the app never guesses.
