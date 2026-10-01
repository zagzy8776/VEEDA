// Device-only caregiver alert recipients.
//
// A caregiver is a person the user names to be messaged if an automatic check-in
// is not answered. This is device-only personal data (a third party's number), so
// it is keyed per user and MUST be in the logout clear set, exactly like the
// emergency contacts.
//
// The store never dials and never messages by itself; it only holds a name and a
// number for the caller to hand to the platform's messaging app.

export interface Caregiver {
  /** Short display name, e.g. "Ada". */
  name: string;
  /** Phone number in a form the platform dialer/messaging app accepts. */
  number: string;
}

export const MAX_CAREGIVERS = 3;

export function caregiversStorageKey(userId: string): string {
  return `veda_caregivers_${userId}`;
}

export function loadCaregivers(storage: { getItem(k: string): string | null }, userId: string): Caregiver[] {
  try {
    const parsed = JSON.parse(storage.getItem(caregiversStorageKey(userId)) || '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(c => c && typeof c.name === 'string' && typeof c.number === 'string')
      .map(c => ({ name: c.name.trim(), number: c.number.trim() }));
  } catch {
    return [];
  }
}

export function saveCaregivers(
  storage: { setItem(k: string, v: string): void; removeItem(k: string): void },
  userId: string,
  caregivers: Caregiver[],
): void {
  const cleaned = caregivers
    .map(c => ({ name: c.name.trim(), number: c.number.trim() }))
    .filter(c => c.name && c.number)
    .slice(0, MAX_CAREGIVERS);
  if (cleaned.length === 0) storage.removeItem(caregiversStorageKey(userId));
  else storage.setItem(caregiversStorageKey(userId), JSON.stringify(cleaned));
}

/** The number of caregivers the user may still add. */
export function remainingCaregiverSlots(userId: string, storage: { getItem(k: string): string | null }): number {
  return Math.max(0, MAX_CAREGIVERS - loadCaregivers(storage, userId).length);
}

/**
 * The neutral, editable message the caregiver alert pre-fills. It names no
 * condition and gives no medical advice; only the user's choice and location (if
 * granted) are included.
 */
export function caregiverAlertMessage(displayName: string, locationText?: string): string {
  const who = displayName?.trim() ? displayName.trim() : 'Someone';
  const where = locationText?.trim() ? ` Their last shared location was ${locationText.trim()}.` : '';
  return `${who} did not answer a VEEDA check-in. Please check on them.${where}`;
}
