// Condition-profile framework (Phase 3).
//
// A "condition profile" is a named set of features a person with a long-term
// condition can enable: warning signs, alert rules, logs, an emergency card,
// test reminders and harmful-medicine warnings. NONE of the content lives here.
// Every warning sign, log field, reminder and medicine warning is read from a
// validated content pack. When no reviewed pack is loaded the profile is
// "unavailable" and nothing is shown.
//
// The framework is deliberately condition-agnostic: sickle cell, kidney disease,
// epilepsy and hypertension/diabetes are all just pack ids. No condition-specific
// branch exists in this code, so no condition content can be hard-coded by
// accident.

import { validateContentPack, type ContentPackMeta } from './contentPack.ts';

/** The pack ids the framework understands. Each is authored by a clinician. */
export type ConditionId =
  | 'sickle_cell'
  | 'kidney_disease'
  | 'epilepsy'
  | 'hypertension'
  | 'diabetes';

export interface WarningSign {
  id: string;
  /** Plain pack wording, e.g. shown on the emergency card. */
  label: string;
  /** What the pack says to do about it (never invented here). */
  action: string;
}

export interface LogField {
  id: string;
  label: string;
  type: 'number' | 'text' | 'yes_no' | 'scale';
  /** Optional unit shown to the user, from the pack. */
  unit?: string;
  /** For 'scale', the pack-provided bounds. */
  min?: number;
  max?: number;
}

export interface TestReminder {
  id: string;
  /** What the reminder is for, from the pack. */
  label: string;
  /** Free-text schedule authored by the clinician; no schedule is generated here. */
  schedule: string;
}

export interface HarmfulMedicineWarning {
  id: string;
  /** The pack's plain warning text. No drug names are hard-coded in this code. */
  warning: string;
}

export interface ConditionProfile {
  id: ConditionId;
  warningSigns: WarningSign[];
  logFields: LogField[];
  testReminders: TestReminder[];
  medicineWarnings: HarmfulMedicineWarning[];
  /** Pack-provided emergency-card heading/lines. */
  emergencyCard: { title: string; lines: string[] };
}

export interface ProfilePackEntry {
  condition: ConditionId;
  warningSigns?: unknown[];
  logFields?: unknown[];
  testReminders?: unknown[];
  medicineWarnings?: unknown[];
  emergencyCard?: { title?: unknown; lines?: unknown };
}

export type ProfileLoadResult =
  | { ok: true; meta: ContentPackMeta; profiles: ConditionProfile[] }
  | { ok: false; reason: string };

const VALID_CONDITIONS: ConditionId[] = [
  'sickle_cell', 'kidney_disease', 'epilepsy', 'hypertension', 'diabetes',
];

const LOG_TYPES: LogField['type'][] = ['number', 'text', 'yes_no', 'scale'];

function str(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

function parseWarning(value: unknown): WarningSign | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  const id = str(v.id);
  const label = str(v.label);
  const action = str(v.action);
  if (!id || !label || !action) return null;
  return { id, label, action };
}

function parseLogField(value: unknown): LogField | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  const id = str(v.id);
  const label = str(v.label);
  if (!id || !label) return null;
  if (typeof v.type !== 'string' || !LOG_TYPES.includes(v.type as LogField['type'])) return null;
  const field: LogField = { id, label, type: v.type as LogField['type'] };
  if (typeof v.unit === 'string') field.unit = v.unit;
  if (typeof v.min === 'number') field.min = v.min;
  if (typeof v.max === 'number') field.max = v.max;
  return field;
}

function parseReminder(value: unknown): TestReminder | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  const id = str(v.id);
  const label = str(v.label);
  const schedule = str(v.schedule);
  if (!id || !label || !schedule) return null;
  return { id, label, schedule };
}

function parseMedicineWarning(value: unknown): HarmfulMedicineWarning | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  const id = str(v.id);
  const warning = str(v.warning);
  if (!id || !warning) return null;
  return { id, warning };
}

function parseList<T>(raw: unknown, parse: (v: unknown) => T | null): T[] | null {
  if (raw == null) return [];
  if (!Array.isArray(raw)) return null;
  const out: T[] = [];
  for (const item of raw) {
    const parsed = parse(item);
    if (parsed === null) return null;
    out.push(parsed);
  }
  return out;
}

function parseProfile(value: unknown): ConditionProfile | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as ProfilePackEntry;
  if (typeof v.condition !== 'string' || !VALID_CONDITIONS.includes(v.condition)) return null;

  const warningSigns = parseList(v.warningSigns, parseWarning);
  const logFields = parseList(v.logFields, parseLogField);
  const testReminders = parseList(v.testReminders, parseReminder);
  const medicineWarnings = parseList(v.medicineWarnings, parseMedicineWarning);
  if (!warningSigns || !logFields || !testReminders || !medicineWarnings) return null;

  const card = v.emergencyCard;
  if (!card || typeof card !== 'object') return null;
  const title = str(card.title);
  const lines = Array.isArray(card.lines) ? card.lines.map(str) : null;
  if (!title || !lines || lines.some(l => l === null)) return null;

  return {
    id: v.condition,
    warningSigns,
    logFields,
    testReminders,
    medicineWarnings,
    emergencyCard: { title, lines: lines as string[] },
  };
}

/** Validate a raw condition-profile pack (shared meta + `entries`). */
export function loadProfilePack(raw: unknown, options: { production?: boolean } = {}): ProfileLoadResult {
  const validated = validateContentPack<unknown[]>(raw, {
    production: options.production,
    label: 'condition-profile pack',
  });
  if (validated.ok === false) return { ok: false, reason: validated.reason };

  const profiles: ConditionProfile[] = [];
  for (const entry of validated.pack.entries) {
    const profile = parseProfile(entry);
    if (!profile) return { ok: false, reason: 'condition-profile pack contains an invalid profile entry' };
    profiles.push(profile);
  }
  return { ok: true, meta: validated.pack.meta, profiles };
}

/** Look up one condition's profile, or null when the pack does not carry it. */
export function getProfile(result: ProfileLoadResult, condition: ConditionId): ConditionProfile | null {
  if (result.ok === false) return null;
  return result.profiles.find(p => p.id === condition) ?? null;
}
