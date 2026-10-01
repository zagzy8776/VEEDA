# Data-protection checklist

This checklist is the standing data-protection review for VEEDA. The legal wording
below is a **placeholder** to be replaced by counsel-supplied text — do not treat any
line marked `[LEGAL: …]` as final.

## Scope and roles

- Data controller / processor roles: `[LEGAL: name the controller and processor, and
  the lawful basis per processing activity]`.
- Governing data-protection law(s) and regulator: `[LEGAL: e.g. NDPA, GDPR, and the
  supervising authority]`.
- Cross-border transfer basis: `[LEGAL: transfer mechanism and safeguards]`.

## Lawful basis and consent

- [ ] Consent is captured per feature and versioned (`src/app/consent.ts`); the durable
      record is server-side (`consent_records`, migration 006).
- [ ] Every sensor (camera, mic, motion, location) has its own consent item and prompt.
- [ ] Withdrawing consent is mirrored to the server (`withdrawConsentAndSync`).
- [ ] `[LEGAL: consent wording and withdrawal wording for each feature]`.

## Data minimisation

- [ ] Readings, contacts and logs are device-only until the user consents to sync.
- [ ] Emergency contacts and caregivers hold a third party's number and are cleared on
      logout (per-user keys in `perUserDeviceKeys`).
- [ ] No clinical content is hard-coded; packs carry only a reviewer name and
      credential **type** (never a license number).

## Rights

- [ ] Access/portability: `GET /api/account/export` returns the account's owned data.
- [ ] Erasure: account delete is a hard erase (migration 007 drops the audit FK so the
      user row can be removed while the append-only audit trail is retained by id).
- [ ] `[LEGAL: retention periods per data category]`.
- [ ] `[LEGAL: breach-notification process and timelines]`.

## Security

- [ ] Auth: JWT access tokens + httpOnly refresh cookies; RBAC on every protected route.
- [ ] Audit: append-only `audit_logs` for create/read/update/delete.
- [ ] `[LEGAL: encryption, key management and penetration-testing requirements]`.

## Sign-off

| Area | Owner | Date | Status |
|------|-------|------|--------|
| Legal text | `[LEGAL]` | | placeholder |
| Data-protection officer | | | placeholder |
