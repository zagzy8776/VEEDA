// Server-side consent record helpers (pure, unit-testable).
//
// The client keeps consent in localStorage as a *cache* so the UI can render
// without a round trip. This module validates and normalizes the record that
// the client syncs to the server, which is the durable evidence of consent.
// Keeping the parsing pure lets us test it without a database.

export const CONSENT_FEATURES = ['health_data', 'camera_analysis', 'sharing', 'reminders'];

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim() !== '';
}

// Validate and normalize a client-submitted consent event.
// Returns { ok: true, record } or { ok: false, error }.
export function normalizeConsentInput(input) {
  if (!input || typeof input !== 'object') {
    return { ok: false, error: 'Consent payload must be an object.' };
  }

  const { feature, version, granted } = input;

  if (!isNonEmptyString(feature)) {
    return { ok: false, error: 'feature is required.' };
  }
  if (!CONSENT_FEATURES.includes(feature)) {
    return { ok: false, error: `Unknown consent feature: ${feature}` };
  }
  if (!isNonEmptyString(version)) {
    return { ok: false, error: 'version is required.' };
  }
  if (typeof granted !== 'boolean') {
    return { ok: false, error: 'granted must be a boolean.' };
  }

  return {
    ok: true,
    record: {
      feature,
      consentVersion: version.trim(),
      granted,
    },
  };
}

// The upsert keeps one row per (user, feature, version) and updates it when the
// user re-consents or withdraws, so the table reflects the current decision
// while the row identity (and recorded_at on first write) is preserved.
export const CONSENT_UPSERT_SQL = `
  INSERT INTO consent_records (user_id, tenant_id, feature, consent_version, granted, recorded_at)
  VALUES ($1, $2, $3, $4, $5, NOW())
  ON CONFLICT (user_id, feature, consent_version)
  DO UPDATE SET granted = EXCLUDED.granted, recorded_at = NOW()
  RETURNING user_id, tenant_id, feature, consent_version, granted, recorded_at
`;
