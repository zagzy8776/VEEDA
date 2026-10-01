import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  CONTACTS_STORAGE_PREFIX,
  MAX_EMERGENCY_CONTACTS,
  addContact,
  buildContactsCsv,
  buildSmsHref,
  buildSosMessage,
  buildTelHref,
  contactsStorageKey,
  downloadContactsCsv,
  loadContacts,
  removeContact,
  updateContact,
  validateContact,
} from '../src/app/emergencyContacts.ts';

// Emergency contacts are a third party's phone number kept on the user's device.
// These tests pin the store, the cap, the per-user key, the neutral message, and
// the export — and that nothing invents a medical claim or dials on its own.

class TestStorage {
  private values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, String(value)); }
  removeItem(key: string) { this.values.delete(key); }
  clear() { this.values.clear(); }
}

const USER = 'user-1';
const OTHER = 'user-2';
const store = new TestStorage();

beforeEach(() => store.clear());

test('the storage key is per-user so a shared device does not leak contacts', () => {
  assert.equal(contactsStorageKey(USER), `${CONTACTS_STORAGE_PREFIX}${USER}`);
  assert.notEqual(contactsStorageKey(USER), contactsStorageKey(OTHER));
});

test('a name and number are saved and read back for that user only', () => {
  const added = addContact(store, USER, { name: 'Ada', phone: '+234 801 234 5678' });
  assert.equal(added.ok, true);
  assert.equal(loadContacts(store, USER).length, 1);
  assert.equal(loadContacts(store, OTHER).length, 0);
  assert.equal(loadContacts(store, USER)[0].name, 'Ada');
});

test('validateContact rejects an empty name, an empty number, and a junk number', () => {
  assert.equal(validateContact({ name: '', phone: '12345' }).ok, false);
  assert.equal(validateContact({ name: 'Ada', phone: '' }).ok, false);
  assert.equal(validateContact({ name: 'Ada', phone: 'call me' }).ok, false);
  assert.equal(validateContact({ name: 'Ada', phone: '+2348012345678' }).ok, true);
});

test('at most MAX_EMERGENCY_CONTACTS are stored and the cap is enforced', () => {
  for (let i = 0; i < MAX_EMERGENCY_CONTACTS; i += 1) {
    assert.equal(addContact(store, USER, { name: `C${i}`, phone: '0800000000' }).ok, true);
  }
  const overflow = addContact(store, USER, { name: 'Extra', phone: '0800000000' });
  assert.equal(overflow.ok, false);
  assert.equal(loadContacts(store, USER).length, MAX_EMERGENCY_CONTACTS);
});

test('update replaces a contact in place and remove deletes it', () => {
  const first = addContact(store, USER, { name: 'Ada', phone: '0800000000' }).contacts[0];
  assert.equal(updateContact(store, USER, first.id, { name: 'Ada O.', phone: '0801111111' }).ok, true);
  assert.equal(loadContacts(store, USER)[0].name, 'Ada O.');
  assert.equal(loadContacts(store, USER)[0].id, first.id, 'the id is stable across an edit');
  removeContact(store, USER, first.id);
  assert.equal(loadContacts(store, USER).length, 0);
});

test('a corrupt stored value reads back as an empty list, never a throw', () => {
  store.setItem(contactsStorageKey(USER), '{not json');
  assert.deepEqual(loadContacts(store, USER), []);
});

test('the SOS message is neutral, carries no diagnosis, and includes optional location', () => {
  const bare = buildSosMessage();
  assert.match(bare, /help/i);
  assert.equal(/blood pressure|glucose|diagnos|covid|diabet/i.test(bare), false);

  const withWhoAndWhere = buildSosMessage({ userName: 'Ada', locationText: '6.5244, 3.3792' });
  assert.match(withWhoAndWhere, /Ada/);
  assert.match(withWhoAndWhere, /6.5244, 3.3792/);
});

test('tel: and sms: links open the phone app; the app never dials or sends itself', () => {
  assert.equal(buildTelHref('+2348012345678'), 'tel:+2348012345678');
  const sms = buildSmsHref('+2348012345678', 'I may need help.');
  assert.match(sms, /^sms:\+2348012345678\?&body=/);
  assert.match(sms, /I%20may%20need%20help/);
});

test('contacts export as CSV and report how many were written', () => {
  addContact(store, USER, { name: 'Ada, Lovelace', phone: '0800000000' });
  const written: { filename: string; csv: string }[] = [];
  const count = downloadContactsCsv(store, USER, (filename, csv) => written.push({ filename, csv }), '2026-01-02T00:00:00Z');

  assert.equal(count, 1);
  assert.equal(written[0].filename, 'emergency-contacts-2026-01-02.csv');
  assert.match(written[0].csv, /name,phone/);
  assert.match(written[0].csv, /"Ada, Lovelace"/, 'a comma in a name is quoted');
  assert.equal(buildContactsCsv(loadContacts(store, USER)), written[0].csv);
});

test('export writes nothing (and returns 0) when there are no contacts', () => {
  let called = false;
  const count = downloadContactsCsv(store, USER, () => { called = true; }, '2026-01-02T00:00:00Z');
  assert.equal(count, 0);
  assert.equal(called, false);
});
