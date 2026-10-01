// Medication reminder export (.ics).
//
// VEEDA does not push reminders itself. It creates a calendar file with a
// recurring event and an alarm, and the phone's calendar app is what actually
// reminds the user. This keeps reminders reliable and keeps health data on the
// device. The medication NAME is optional: calendars can sync to cloud accounts
// and shared devices, so the user may use a neutral label like "Morning tablet"
// instead of a drug name.
//
// All functions are pure so they can be unit tested without a browser.

export type Frequency = 'daily' | 'twice_daily' | 'weekly';

export interface ReminderInput {
  /** Optional medication name. When empty, a neutral fallback label is used. */
  medicationName?: string;
  /** Time of first dose, 24h "HH:MM". */
  time: string;
  frequency: Frequency;
  /** Optional start date (YYYY-MM-DD). Defaults to today. */
  startDate?: string;
  /** Minutes before the event to raise the alarm. */
  alarmMinutesBefore?: number;
  /** Generated-at timestamp (ISO), stamped into the file for provenance. */
  generatedAt: string;
  /** Stable id so re-exporting updates rather than duplicates. */
  uid: string;
}

export const NEUTRAL_FALLBACK_LABEL = 'Medication reminder';

export const CALENDAR_DEPENDENCY_NOTE =
  'Reminders depend on your phone\u2019s calendar app. Check that notifications are on.';

// Never emit a drug name the user did not type; fall back to a neutral label.
export function reminderSummary(input: ReminderInput): string {
  const name = (input.medicationName ?? '').trim();
  return name === '' ? NEUTRAL_FALLBACK_LABEL : name;
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function isValidTime(time: string): boolean {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(time);
  return match !== null;
}

function dateStamp(date: Date): string {
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}`;
}

// ICS text escaping: backslash, semicolon, comma, and newlines.
function escapeText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

// Fold long content lines to 75 octets per RFC 5545.
function foldLine(line: string): string {
  if (line.length <= 73) return line;
  const chunks: string[] = [line.slice(0, 73)];
  for (let i = 73; i < line.length; i += 72) {
    chunks.push(` ${line.slice(i, i + 72)}`);
  }
  return chunks.join('\r\n');
}

const RRULE: Record<Frequency, string> = {
  daily: 'FREQ=DAILY',
  twice_daily: 'FREQ=DAILY;INTERVAL=12H',
  weekly: 'FREQ=WEEKLY',
};

export function buildReminderIcs(input: ReminderInput): string {
  if (!isValidTime(input.time)) {
    throw new Error('time must be in 24-hour HH:MM format.');
  }

  const startBase = input.startDate ? new Date(`${input.startDate}T00:00:00`) : new Date(input.generatedAt);
  if (Number.isNaN(startBase.getTime())) {
    throw new Error('startDate must be in YYYY-MM-DD format.');
  }
  const [hours, minutes] = input.time.split(':').map(Number);
  const start = new Date(startBase);
  start.setHours(hours, minutes, 0, 0);
  const end = new Date(start.getTime() + 15 * 60 * 1000);

  const alarm = input.alarmMinutesBefore ?? 0;
  const nowStamp = new Date(input.generatedAt);

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//VEEDA//Medication Reminder//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${input.uid}@veeda.local`,
    `DTSTAMP:${dateStamp(nowStamp)}T${pad(nowStamp.getHours())}${pad(nowStamp.getMinutes())}00Z`,
    `DTSTART:${dateStamp(start)}T${pad(hours)}${pad(minutes)}00`,
    `DTEND:${dateStamp(end)}T${pad(end.getHours())}${pad(end.getMinutes())}00`,
    `RRULE:${RRULE[input.frequency]}`,
    foldLine(`SUMMARY:${escapeText(reminderSummary(input))}`),
    'DESCRIPTION:Set up in VEEDA. This is a personal reminder and not medical advice.',
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    `TRIGGER:-PT${alarm}M`,
    foldLine(`DESCRIPTION:${escapeText(reminderSummary(input))}`),
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ];

  return `${lines.join('\r\n')}\r\n`;
}

/** Neutral, date-stamped filename with no personal name or drug name. */
export function reminderFilename(generatedAt: string): string {
  const date = new Date(generatedAt);
  const stamp = Number.isNaN(date.getTime()) ? 'export' : date.toISOString().slice(0, 10);
  return `medication-reminder-${stamp}.ics`;
}
