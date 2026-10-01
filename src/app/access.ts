// Access framework (Phase 8): offline mode, low-data mode, USSD/SMS fallback.
//
// Three capabilities that keep VEEDA usable where the network is poor:
//
//   1. OFFLINE MODE — core checks and logging work with no network; entries are
//      queued on the device and flushed when a connection returns. The queue is
//      per-user and must be in the logout clear set.
//   2. LOW-DATA MODE — payloads are trimmed (no images, small batches) and maps are
//      not requested unless the user asks. A single helper decides what may be sent.
//   3. USSD/SMS FALLBACK — an interface with a provider adapter that ships
//      UNCONFIGURED. With no provider, the fallback reports "not available" and
//      never invents a session code.
//
// Pure module: no fetch, no storage handle beyond the passed-in one.

export interface QueuedEntry {
  id: string;
  kind: string;
  payload: Record<string, unknown>;
  queuedAt: string;
}

export function offlineQueueKey(userId: string): string {
  return `veda_offline_queue_${userId}`;
}

export function loadQueue(storage: { getItem(k: string): string | null }, userId: string): QueuedEntry[] {
  try {
    const parsed = JSON.parse(storage.getItem(offlineQueueKey(userId)) || '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(e => e && typeof e.id === 'string' && typeof e.kind === 'string');
  } catch {
    return [];
  }
}

export function enqueue(
  storage: { getItem(k: string): string | null; setItem(k: string, v: string): void },
  userId: string,
  entry: QueuedEntry,
): QueuedEntry[] {
  const queue = [...loadQueue(storage, userId), entry];
  storage.setItem(offlineQueueKey(userId), JSON.stringify(queue));
  return queue;
}

/** Remove entries that were successfully synced by id. */
export function dequeue(
  storage: { getItem(k: string): string | null; setItem(k: string, v: string): void; removeItem(k: string): void },
  userId: string,
  syncedIds: string[],
): QueuedEntry[] {
  const remaining = loadQueue(storage, userId).filter(e => !syncedIds.includes(e.id));
  if (remaining.length === 0) storage.removeItem(offlineQueueKey(userId));
  else storage.setItem(offlineQueueKey(userId), JSON.stringify(remaining));
  return remaining;
}

/** True when the browser currently has no network. */
export function isOffline(navigatorLike: { onLine?: boolean } | undefined): boolean {
  if (!navigatorLike || typeof navigatorLike.onLine !== 'boolean') return false;
  return navigatorLike.onLine === false;
}

export interface LowDataPolicy {
  lowData: boolean;
  /** Max entries per upload batch. */
  batchSize: number;
  /** Whether images may be uploaded at all. */
  allowImages: boolean;
  /** Whether map tiles/data may be requested. */
  allowMaps: boolean;
}

export function lowDataPolicy(lowData: boolean, mapRequested: boolean): LowDataPolicy {
  if (!lowData) {
    return { lowData, batchSize: 50, allowImages: true, allowMaps: true };
  }
  return {
    lowData: true,
    batchSize: 10,
    allowImages: false,
    // Maps are avoided in low-data mode unless the user explicitly asks.
    allowMaps: mapRequested,
  };
}

/** Trim a payload for low-data mode: drop large/optional fields, keep the reading. */
export function trimPayload(payload: Record<string, unknown>, policy: LowDataPolicy): Record<string, unknown> {
  if (!policy.lowData) return payload;
  const { image, images, photo, trace, ...rest } = payload;
  void image; void images; void photo; void trace;
  return rest;
}

export interface UssdProvider {
  /** Provider id, empty when none is configured. */
  id: string;
  /** The short code / number the provider exposes, if any. */
  shortCode?: string;
}

export interface UssdSession {
  available: boolean;
  reason: string;
  shortCode?: string;
}

/**
 * Resolve the USSD/SMS fallback. With no provider configured it is unavailable and
 * no short code is shown — the app never invents a code.
 */
export function ussdSession(provider: UssdProvider | null): UssdSession {
  if (!provider || !provider.id || !provider.shortCode) {
    return { available: false, reason: 'USSD/SMS fallback is not available: no provider is configured.' };
  }
  return { available: true, reason: 'enabled', shortCode: provider.shortCode };
}
