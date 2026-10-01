// Versioned, per-feature consent handling.
//
// Consent is stored locally per signed-in user, keyed by user id, so a shared
// device does not leak one person's consent choices to another. Each record
// captures the feature, the consent text version, and an ISO timestamp. A user
// can withdraw consent, which removes the record entirely.
//
// These are pure functions over a Storage-like object so they can be unit
// tested without a DOM.

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export type ConsentFeature =
  | 'health_data_processing'
  | 'shareable_summary'
  | 'medication_reminders'
  | 'bp_glucose_logging';

export interface ConsentRecord {
  feature: ConsentFeature;
  version: string;
  grantedAt: string;
}

/** Bump when consent wording changes so old grants are re-confirmed. */
export const CONSENT_VERSION = '1.0.0';

// Maps each client feature to the feature name the server records. The server
// set is coarser (it is about data handling, not UI sections).
export const SERVER_FEATURE: Record<ConsentFeature, string> = {
  health_data_processing: 'health_data',
  shareable_summary: 'sharing',
  medication_reminders: 'reminders',
  bp_glucose_logging: 'health_data',
};

export interface SyncResult {
  ok: boolean;
  status?: number;
}

/**
 * Mirror a local consent decision to the server-of-record. localStorage is only
 * a cache; this call is what produces durable evidence that survives a cleared
 * browser. Failures are non-fatal for the UI (the local record still stands and
 * the caller may retry), so this never throws.
 */
export async function syncConsent(
  fetchImpl: typeof fetch,
  baseUrl: string,
  authToken: string,
  feature: ConsentFeature,
  granted: boolean,
  version: string = CONSENT_VERSION,
): Promise<SyncResult> {
  try {
    const response = await fetchImpl(`${baseUrl}/api/consent`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({ feature: SERVER_FEATURE[feature], version, granted }),
    });
    return { ok: response.ok, status: response.status };
  } catch {
    return { ok: false };
  }
}

export interface ConsentItem {
  feature: ConsentFeature;
  title: string;
  body: string;
}

// Plain-language, non-diagnostic descriptions of what each feature does with
// data. Wording is deliberately about data handling only; it makes no medical
// claim, so it does not require clinical sign-off.
export const CONSENT_ITEMS: ConsentItem[] = [
  {
    feature: 'health_data_processing',
    title: 'Store my health readings',
    body: 'VEEDA will save the readings you record on your device and, when you are signed in, to your account so you can see your history.',
  },
  {
    feature: 'shareable_summary',
    title: 'Create a shareable summary',
    body: 'You can create a health summary to share with someone you choose. The summary is created on your device and only shared when you act.',
  },
  {
    feature: 'medication_reminders',
    title: 'Medication reminders',
    body: 'VEEDA can remind you about medications you type in yourself. It does not give dosing advice and never changes what your clinician prescribed.',
  },
  {
    feature: 'bp_glucose_logging',
    title: 'Blood pressure and glucose logging',
    body: 'You can record blood pressure and blood glucose readings to see your own trends. VEEDA shows the numbers you enter without labelling them.',
  },
];

function storageKey(userId: string): string {
  return `veda_consent_${userId}`;
}

/** The localStorage key that caches this user's consent decisions. */
export function consentStorageKey(userId: string): string {
  return storageKey(userId);
}

function readAll(storage: StorageLike, userId: string): Record<string, ConsentRecord> {
  try {
    const raw = storage.getItem(storageKey(userId));
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed as Record<string, ConsentRecord> : {};
  } catch {
    return {};
  }
}

function writeAll(storage: StorageLike, userId: string, records: Record<string, ConsentRecord>): void {
  try {
    if (Object.keys(records).length === 0) storage.removeItem(storageKey(userId));
    else storage.setItem(storageKey(userId), JSON.stringify(records));
  } catch {}
}

/** Record consent for a single feature at the current consent version. */
export function recordConsent(
  storage: StorageLike,
  userId: string,
  feature: ConsentFeature,
  now: Date = new Date(),
): ConsentRecord {
  const record: ConsentRecord = {
    feature,
    version: CONSENT_VERSION,
    grantedAt: now.toISOString(),
  };
  const records = readAll(storage, userId);
  records[feature] = record;
  writeAll(storage, userId, records);
  return record;
}

/** Remove consent for a single feature. */
export function withdrawConsent(storage: StorageLike, userId: string, feature: ConsentFeature): void {
  const records = readAll(storage, userId);
  delete records[feature];
  writeAll(storage, userId, records);
}

/**
 * Withdraw consent locally AND mirror the withdrawal to the server-of-record.
 *
 * Withdrawing is a data-handling decision, so the durable server row must flip
 * to `granted: false` too — otherwise a later client (or a support query) would
 * still see consent as active. `syncConsent` carries `granted: false`; this
 * helper exists so no caller can withdraw locally and forget the server.
 * Sync failures are non-fatal (the local record is already gone), so this never
 * throws and returns the sync result for the caller to log if it wants.
 */
export async function withdrawConsentAndSync(
  storage: StorageLike,
  userId: string,
  feature: ConsentFeature,
  fetchImpl: typeof fetch,
  baseUrl: string,
  authToken: string,
  version: string = CONSENT_VERSION,
): Promise<SyncResult> {
  withdrawConsent(storage, userId, feature);
  return syncConsent(fetchImpl, baseUrl, authToken, feature, false, version);
}

/** Withdraw every feature locally AND mirror each withdrawal to the server. */
export async function withdrawAllConsentAndSync(
  storage: StorageLike,
  userId: string,
  features: ConsentFeature[],
  fetchImpl: typeof fetch,
  baseUrl: string,
  authToken: string,
  version: string = CONSENT_VERSION,
): Promise<SyncResult[]> {
  withdrawAllConsent(storage, userId);
  return Promise.all(features.map(f => syncConsent(fetchImpl, baseUrl, authToken, f, false, version)));
}

/** Remove all consent records for a user. */
export function withdrawAllConsent(storage: StorageLike, userId: string): void {
  writeAll(storage, userId, {});
}

/** Read the consent record for a feature, or null when not granted. */
export function getConsent(
  storage: StorageLike,
  userId: string,
  feature: ConsentFeature,
): ConsentRecord | null {
  return readAll(storage, userId)[feature] ?? null;
}

/**
 * True only when the feature has been granted at the current consent version.
 * Consent granted against an older version is treated as not granted so the
 * user is re-prompted after wording changes.
 */
export function hasConsent(
  storage: StorageLike,
  userId: string,
  feature: ConsentFeature,
): boolean {
  const record = getConsent(storage, userId, feature);
  return record !== null && record.version === CONSENT_VERSION;
}
