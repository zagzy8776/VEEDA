import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CALENDAR_DEPENDENCY_NOTE,
  NEUTRAL_FALLBACK_LABEL,
  buildReminderIcs,
  reminderFilename,
  reminderSummary,
  type ReminderInput,
} from '../src/app/medicationIcs.ts';

const BASE: ReminderInput = {
  medicationName: 'Amlodipine',
  time: '08:30',
  frequency: 'daily',
  startDate: '2026-05-01',
  generatedAt: '2026-04-28T10:00:00.000Z',
  uid: 'rem-1',
};

test('produces a valid VCALENDAR/VEVENT the calendar app can import', () => {
  const ics = buildReminderIcs(BASE);
  assert.match(ics, /^BEGIN:VCALENDAR\r\n/);
  assert.match(ics, /END:VCALENDAR\r\n$/);
  assert.match(ics, /BEGIN:VEVENT/);
  assert.match(ics, /END:VEVENT/);
  assert.match(ics, /VERSION:2\.0/);
});

test('a recurring daily event carries an RRULE', () => {
  assert.match(buildReminderIcs(BASE), /RRULE:FREQ=DAILY/);
  assert.match(buildReminderIcs({ ...BASE, frequency: 'weekly' }), /RRULE:FREQ=WEEKLY/);
});

test('an alarm block is present so the phone actually reminds the user', () => {
  const ics = buildReminderIcs({ ...BASE, alarmMinutesBefore: 10 });
  assert.match(ics, /BEGIN:VALARM/);
  assert.match(ics, /ACTION:DISPLAY/);
  assert.match(ics, /TRIGGER:-PT10M/);
});

test('the event start uses the chosen time and date', () => {
  const ics = buildReminderIcs(BASE);
  assert.match(ics, /DTSTART:20260501T083000/);
});

test('the medication name is used when provided', () => {
  assert.match(buildReminderIcs(BASE), /SUMMARY:Amlodipine/);
});

test('a custom neutral label is allowed in place of a drug name', () => {
  const ics = buildReminderIcs({ ...BASE, medicationName: 'Morning tablet' });
  assert.match(ics, /SUMMARY:Morning tablet/);
  assert.doesNotMatch(ics, /Amlodipine/);
});

test('an empty medication name falls back to a neutral label (never leaks a drug)', () => {
  assert.equal(reminderSummary({ ...BASE, medicationName: '' }), NEUTRAL_FALLBACK_LABEL);
  assert.equal(reminderSummary({ ...BASE, medicationName: '   ' }), NEUTRAL_FALLBACK_LABEL);
  assert.equal(reminderSummary({ ...BASE, medicationName: undefined }), NEUTRAL_FALLBACK_LABEL);
  const ics = buildReminderIcs({ ...BASE, medicationName: '' });
  assert.match(ics, new RegExp(`SUMMARY:${NEUTRAL_FALLBACK_LABEL}`));
});

test('there is no diagnosis or dosing advice in the event text', () => {
  const ics = buildReminderIcs(BASE).toLowerCase();
  assert.doesNotMatch(ics, /take \d|mg\b|dose of|diagnos/);
  assert.match(ics, /not medical advice/);
});

test('rejects an invalid time rather than emitting a broken calendar', () => {
  assert.throws(() => buildReminderIcs({ ...BASE, time: '25:00' }), /HH:MM/);
  assert.throws(() => buildReminderIcs({ ...BASE, time: '8:30 am' }), /HH:MM/);
});

test('special characters in the name are escaped per RFC 5545', () => {
  const ics = buildReminderIcs({ ...BASE, medicationName: 'A,B;C\\D' });
  assert.match(ics, /SUMMARY:A\\,B\\;C\\\\D/);
});

test('the filename is neutral and date-stamped', () => {
  assert.equal(reminderFilename(BASE.generatedAt), 'medication-reminder-2026-04-28.ics');
  assert.doesNotMatch(reminderFilename(BASE.generatedAt), /amlodipine|veeda/i);
});

test('the UI dependency note tells users to check calendar notifications', () => {
  assert.match(CALENDAR_DEPENDENCY_NOTE, /calendar app/i);
  assert.match(CALENDAR_DEPENDENCY_NOTE, /notifications are on/i);
});
