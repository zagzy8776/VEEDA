// Emergency contacts for the SOS screen.
//
// A user may save up to three people to notify in an emergency, each with a
// name and a phone number ONLY. We deliberately store nothing else — no
// relationship label, no email, no medical detail — because this is a third
// party's contact detail kept on the user's own device.
//
// The app NEVER sends a message or places a call itself. It builds an `sms:`
// or `tel:` link that opens the phone's own app, where the user reviews and
// sends it. Location is optional and only included when the user has granted
// location access; without it the message still works.
//
// All functions are pure and operate on an injected Storage-like object so they
// can be unit tested without a browser.

import type { StorageLike } from './consent.ts';

export interface EmergencyContact {
  id: string;
  name: string;
  phone: string;
}

/** Hard cap: three contacts. Enforced here, not only in the UI. */
export const MAX_EMERGENCY_CONTACTS = 3;

export const CONTACTS_STORAGE_PREFIX = 'veda_emergency_contacts:';

/** Per-user storage key so a shared device does not leak one user's contacts. */
export function contactsStorageKey(userId: string): string {
  return `${CONTACTS_STORAGE_PREFIX}${userId}`;
}

export interface ContactValidation {
  ok: boolean;
  /** Neutral, non-clinical correction prompt. */
  message?: string;
}

const PHONE_ALLOWED = /^[+()\d][\d\s().-]{4,}$/;

/**
 * Validate a name and number. This is a plausibility check only: it rejects
 * empty names and numbers that are obviously not dialable. It makes no claim
 * about whether a number is real or reachable.
 */
export function validateContact(input: { name?: string; phone?: string }): ContactValidation {
  const name = (input.name ?? '').trim();
  const phone = (input.phone ?? '').trim();
  if (!name) return { ok: false, message: 'Enter a name for this contact.' };
  if (!phone) return { ok: false, message: 'Enter a phone number for this contact.' };
  if (!PHONE_ALLOWED.test(phone)) {
    return { ok: false, message: 'Check this number — it looks like it may be a typo.' };
  }
  return { ok: true };
}

function sanitize(list: unknown): EmergencyContact[] {
  if (!Array.isArray(list)) return [];
  const out: EmergencyContact[] = [];
  for (const item of list) {
    if (!item || typeof item !== 'object') continue;
    const { id, name, phone } = item as Record<string, unknown>;
    if (typeof id !== 'string' || typeof name !== 'string' || typeof phone !== 'string') continue;
    out.push({ id, name, phone });
  }
  return out.slice(0, MAX_EMERGENCY_CONTACTS);
}

/** Read this user's saved contacts. Never throws; a corrupt value reads as []. */
export function loadContacts(storage: StorageLike, userId: string): EmergencyContact[] {
  try {
    const raw = storage.getItem(contactsStorageKey(userId));
    if (!raw) return [];
    return sanitize(JSON.parse(raw));
  } catch {
    return [];
  }
}

function persist(storage: StorageLike, userId: string, contacts: EmergencyContact[]): void {
  try {
    if (contacts.length === 0) storage.removeItem(contactsStorageKey(userId));
    else storage.setItem(contactsStorageKey(userId), JSON.stringify(contacts));
  } catch {}
}

export interface MutationResult {
  ok: boolean;
  message?: string;
  contacts: EmergencyContact[];
}

function makeId(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  return `c_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

/** Add a contact (up to the cap). Returns the updated list. */
export function addContact(
  storage: StorageLike,
  userId: string,
  input: { name?: string; phone?: string },
): MutationResult {
  const contacts = loadContacts(storage, userId);
  if (contacts.length >= MAX_EMERGENCY_CONTACTS) {
    return {
      ok: false,
      message: `You can save up to ${MAX_EMERGENCY_CONTACTS} contacts.`,
      contacts,
    };
  }
  const check = validateContact(input);
  if (check.ok === false) return { ok: false, message: check.message, contacts };
  contacts.push({ id: makeId(), name: input.name!.trim(), phone: input.phone!.trim() });
  persist(storage, userId, contacts);
  return { ok: true, contacts };
}

/** Replace an existing contact by id. */
export function updateContact(
  storage: StorageLike,
  userId: string,
  id: string,
  input: { name?: string; phone?: string },
): MutationResult {
  const contacts = loadContacts(storage, userId);
  const index = contacts.findIndex((c) => c.id === id);
  if (index === -1) return { ok: false, message: 'Contact not found.', contacts };
  const check = validateContact(input);
  if (check.ok === false) return { ok: false, message: check.message, contacts };
  contacts[index] = { id, name: input.name!.trim(), phone: input.phone!.trim() };
  persist(storage, userId, contacts);
  return { ok: true, contacts };
}

/** Remove a contact by id. */
export function removeContact(storage: StorageLike, userId: string, id: string): MutationResult {
  const contacts = loadContacts(storage, userId).filter((c) => c.id !== id);
  persist(storage, userId, contacts);
  return { ok: true, contacts };
}

export interface SosMessageInput {
  /** The user's own name, if they choose to include it. May be blank. */
  userName?: string;
  /** Optional human-readable location text. Included only when present. */
  locationText?: string;
}

/**
 * Build the neutral, editable SOS message. It names no condition and gives no
 * medical advice — the user reviews and edits it before sending.
 */
export function buildSosMessage(input: SosMessageInput = {}): string {
  const who = (input.userName ?? '').trim();
  const where = (input.locationText ?? '').trim();
  const parts: string[] = [];
  parts.push(who ? `${who} may need help.` : 'I may need help.');
  parts.push('This is an automated message from my phone.');
  if (where) parts.push(`My location: ${where}`);
  parts.push('Please try to reach me.');
  return parts.join(' ');
}

/** A `tel:` link that opens the phone's dialler. The app never places the call. */
export function buildTelHref(phone: string): string {
  return `tel:${phone.trim()}`;
}

/**
 * An `sms:` link that opens the phone's messaging app with the number and body
 * prefilled for the user to review. Uses the `?&body=` form, which is the
 * cross-platform-safe spelling accepted by both iOS and Android.
 */
export function buildSmsHref(phone: string, body: string): string {
  return `sms:${phone.trim()}?&body=${encodeURIComponent(body)}`;
}

const CONTACTS_CSV_HEADER = 'name,phone';

function csvCell(value: string): string {
  const needsQuotes = /[",\n\r]/.test(value);
  return needsQuotes ? `"${value.replace(/"/g, '""')}"` : value;
}

/** The user's own saved contacts as CSV. These are the user's data. */
export function buildContactsCsv(contacts: EmergencyContact[]): string {
  const rows = contacts.map((c) => [csvCell(c.name), csvCell(c.phone)].join(','));
  return [CONTACTS_CSV_HEADER, ...rows].join('\n');
}

export function contactsFilename(generatedAt: string): string {
  const date = new Date(generatedAt);
  const stamp = Number.isNaN(date.getTime()) ? 'export' : date.toISOString().slice(0, 10);
  return `emergency-contacts-${stamp}.csv`;
}

/**
 * Download this user's saved emergency contacts as CSV, if there are any.
 * The `download` callback is injected so this stays pure and testable. Returns
 * the number of contacts written.
 */
export function downloadContactsCsv(
  storage: StorageLike,
  userId: string,
  download: (filename: string, csv: string) => void,
  generatedAt: string,
): number {
  const contacts = loadContacts(storage, userId);
  if (contacts.length === 0) return 0;
  download(contactsFilename(generatedAt), buildContactsCsv(contacts));
  return contacts.length;
}
