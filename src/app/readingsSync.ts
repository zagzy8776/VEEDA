// Sync the on-device BP/glucose log to the server-of-record.
//
// The device log stays authoritative for the UI; the server is a durable copy.
// Sync happens on save (fire-and-forget) and again on login, with a small retry
// queue so a dropped connection does not lose a reading. Everything here is a
// pure function over injected dependencies so it can be unit tested without a
// network or a browser.
//
// Nothing is uploaded unless the user is signed in AND has granted consent for
// this feature; the caller decides that and passes `enabled`.

import { loadReadings, readingsStorageKey, type Reading, type StorageLike } from './bpGlucose.ts';

export const PENDING_SYNC_PREFIX = 'veda_pending_sync:';
const CLIENT_ID_PREFIX = 'veda_reading_client_id:';

/** Per-user key holding the client ids already confirmed by the server. */
export function syncedIdsKey(userId: string): string {
  return `${CLIENT_ID_PREFIX}${userId}`;
}

/** Per-user key holding readings awaiting upload. */
export function pendingSyncKey(userId: string): string {
  return `${PENDING_SYNC_PREFIX}${userId}`;
}

function readJsonArray<T>(storage: StorageLike, key: string): T[] {
  try {
    const raw = storage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

function writeJson(storage: StorageLike, key: string, value: unknown): void {
  try {
    if (value == null || (Array.isArray(value) && value.length === 0)) storage.removeItem(key);
    else storage.setItem(key, JSON.stringify(value));
  } catch {}
}

export interface SyncRecord {
  clientId: string;
  reading: Reading;
}

/** Assign a stable, collision-resistant client id for a new reading. */
export function makeClientId(seed: string): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  return `${seed}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Public key for a reading so a client id is stable across a reload. Two
 * genuinely identical readings at the same instant collapse to one, which is
 * acceptable (the user cannot save twice in the same millisecond meaningfully).
 */
export function readingKey(reading: Reading): string {
  if (reading.kind === 'blood_pressure') {
    return `bp:${reading.systolic}/${reading.diastolic}:${reading.recordedAt}:${reading.source}`;
  }
  return `glu:${reading.value}:${reading.unit}:${reading.context ?? ''}:${reading.recordedAt}:${reading.source}`;
}

/** All pending sync records for this user. */
export function loadPending(storage: StorageLike, userId: string): SyncRecord[] {
  return readJsonArray<SyncRecord>(storage, pendingSyncKey(userId));
}

function savePending(storage: StorageLike, userId: string, pending: SyncRecord[]): void {
  writeJson(storage, pendingSyncKey(userId), pending);
}

/**
 * Enqueue any on-device readings not yet confirmed by the server. Idempotent: a
 * reading already pending or already synced is not re-queued.
 */
export function enqueueUnsynced(storage: StorageLike, userId: string): SyncRecord[] {
  const pending = loadPending(storage, userId);
  const pendingKeys = new Set(pending.map((r) => r.clientId));
  const synced = new Set(readJsonArray<string>(storage, syncedIdsKey(userId)));

  for (const reading of loadReadings(storage, userId)) {
    const clientId = readingKey(reading);
    if (pendingKeys.has(clientId) || synced.has(clientId)) continue;
    pending.push({ clientId, reading });
    pendingKeys.add(clientId);
  }
  savePending(storage, userId, pending);
  return pending;
}

export interface SyncOutcome {
  ok: boolean;
  /** Client ids the server accepted (now safe to mark synced). */
  accepted: string[];
}

/**
 * Upload the pending queue in one request. The server rejects bad entries
 * individually: an accepted id is removed and marked synced, a hard-rejected id
 * is dropped (resending an impossible value would fail forever), and anything
 * else is kept for a later attempt.
 */
export async function flushPending(
  storage: StorageLike,
  userId: string,
  fetchImpl: typeof fetch,
  baseUrl: string,
  authToken: string,
): Promise<SyncOutcome> {
  const pending = loadPending(storage, userId);
  if (pending.length === 0) return { ok: true, accepted: [] };

  try {
    const response = await fetchImpl(`${baseUrl}/api/readings`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${authToken}` },
      body: JSON.stringify({ readings: pending.map((r) => ({ clientId: r.clientId, ...r.reading })) }),
    });
    if (!response.ok) return { ok: false, accepted: [] };
    const body = await response.json() as { accepted?: string[]; rejected?: { clientId?: string }[] };
    const accepted = Array.isArray(body.accepted) ? body.accepted : [];
    const rejected = new Set((body.rejected ?? []).map((r) => r.clientId).filter(Boolean) as string[]);

    const remaining = pending.filter((r) => !accepted.includes(r.clientId) && !rejected.has(r.clientId));
    savePending(storage, userId, remaining);

    const synced = new Set(readJsonArray<string>(storage, syncedIdsKey(userId)));
    for (const id of accepted) synced.add(id);
    writeJson(storage, syncedIdsKey(userId), [...synced]);

    return { ok: true, accepted };
  } catch {
    return { ok: false, accepted: [] };
  }
}

/**
 * The sync-on-save / sync-on-login entry point: enqueue unsynced readings and
 * try to upload them. Returns false when the upload did not complete, so the
 * caller can show "will retry" without losing the reading.
 */
export async function syncReadings(
  storage: StorageLike,
  userId: string,
  fetchImpl: typeof fetch,
  baseUrl: string,
  authToken: string,
  enabled: boolean,
): Promise<boolean> {
  if (!enabled) return false;
  enqueueUnsynced(storage, userId);
  const outcome = await flushPending(storage, userId, fetchImpl, baseUrl, authToken);
  return outcome.ok;
}

/** Remove this user's sync bookkeeping (e.g. on logout of a shared device). */
export function clearSyncState(storage: StorageLike, userId: string): void {
  try {
    storage.removeItem(pendingSyncKey(userId));
    storage.removeItem(syncedIdsKey(userId));
  } catch {}
}

// Re-export so callers do not need to import bpGlucose directly.
export { readingsStorageKey };
