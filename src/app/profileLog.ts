// Device-only profile logs (Phase 3): pain diary, seizure log, weight/BP log.
//
// These are the user's own entries against a condition profile's log fields. The
// store is deliberately dumb: it records whatever fields the reviewed pack
// defines, keyed per user, so it must be in the logout clear set. It never
// interprets a value and never labels it clinically.

export interface ProfileLogEntry {
  /** ISO timestamp of when the user recorded the entry. */
  recordedAt: string;
  /** Profile the entry belongs to, e.g. "epilepsy" — the condition's pack id. */
  condition: string;
  /** Field id -> value, matching the pack's logFields. */
  values: Record<string, string | number | boolean>;
  /** Optional free-text note the user typed. */
  note?: string;
}

export function profileLogStorageKey(userId: string): string {
  return `veda_profile_log_${userId}`;
}

export function loadProfileLog(storage: { getItem(k: string): string | null }, userId: string): ProfileLogEntry[] {
  try {
    const parsed = JSON.parse(storage.getItem(profileLogStorageKey(userId)) || '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(e =>
      e && typeof e.recordedAt === 'string' && typeof e.condition === 'string'
      && e.values && typeof e.values === 'object',
    );
  } catch {
    return [];
  }
}

export function appendProfileLog(
  storage: { getItem(k: string): string | null; setItem(k: string, v: string): void },
  userId: string,
  entry: ProfileLogEntry,
): ProfileLogEntry[] {
  const entries = [...loadProfileLog(storage, userId), entry];
  storage.setItem(profileLogStorageKey(userId), JSON.stringify(entries));
  return entries;
}

/** Entries for one condition, newest first. */
export function profileLogFor(
  storage: { getItem(k: string): string | null },
  userId: string,
  condition: string,
): ProfileLogEntry[] {
  return loadProfileLog(storage, userId)
    .filter(e => e.condition === condition)
    .sort((a, b) => (a.recordedAt < b.recordedAt ? 1 : -1));
}

/**
 * A CSV export of one condition's log for the user to take to a clinician. The
 * header is built from the pack's field ids; no clinical interpretation is added.
 */
export function profileLogCsv(entries: ProfileLogEntry[]): string {
  const fieldIds = Array.from(new Set(entries.flatMap(e => Object.keys(e.values)))).sort();
  const header = ['recordedAt', 'condition', ...fieldIds, 'note'];
  const escape = (value: unknown) => {
    const s = value == null ? '' : String(value);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const rows = entries.map(e => [
    e.recordedAt, e.condition,
    ...fieldIds.map(id => e.values[id]),
    e.note ?? '',
  ].map(escape).join(','));
  return [header.join(','), ...rows].join('\n');
}
