// Prevention engine (Phase 4): rule-based triage, reminders and schedulers.
//
// Every rule, schedule, instrument, threshold and hotline is content and comes
// from a reviewed pack. This module is the ENGINE: it evaluates rules and due
// reminders against a pack, and fails safe (unavailable) when no approved pack is
// loaded. It contains no malaria/maternal/screening/water-safety text of its own.
//
// A rule is a plain conditional over a named input: { when: { inputId, op, value } }
// and a pack-authored outcome. The engine never invents an outcome.

import { validateContentPack, type ContentPackMeta } from './contentPack.ts';
import { notAvailableLine } from './packText.ts';

export type RuleOp = 'eq' | 'neq' | 'gte' | 'lte' | 'truthy';

export interface TriageRule {
  id: string;
  /** Pack-authored domain tag: malaria_first, maternal, child, outbreak, screening, water_safety. */
  domain: string;
  when: { inputId: string; op: RuleOp; value?: number | string | boolean };
  /** Pack outcome: red_flag | see_clinician | self_care | info. */
  outcome: 'red_flag' | 'see_clinician' | 'self_care' | 'info';
  /** Pack wording for the outcome. */
  message: string;
  /** Optional pack next-step wording. */
  advice?: string;
}

export interface ReminderSpec {
  id: string;
  /** Pack domain: screening, water_safety, outbreak, refill, chronic_trend. */
  domain: string;
  label: string;
  /** Pack-authored cadence in days; the engine only computes the next due date. */
  everyDays?: number;
  /** Pack-authored note shown with the reminder. */
  note?: string;
}

export interface PreventionPack {
  meta: ContentPackMeta;
  rules: TriageRule[];
  reminders: ReminderSpec[];
}

export type PreventionLoadResult =
  | { ok: true; pack: PreventionPack }
  | { ok: false; reason: string };

const OPS: RuleOp[] = ['eq', 'neq', 'gte', 'lte', 'truthy'];
const OUTCOMES: TriageRule['outcome'][] = ['red_flag', 'see_clinician', 'self_care', 'info'];

function isRule(value: unknown): value is TriageRule {
  if (!value || typeof value !== 'object') return false;
  const r = value as Record<string, unknown>;
  if (typeof r.id !== 'string' || !r.id.trim()) return false;
  if (typeof r.domain !== 'string' || !r.domain.trim()) return false;
  if (typeof r.message !== 'string' || !r.message.trim()) return false;
  if (typeof r.outcome !== 'string' || !OUTCOMES.includes(r.outcome as TriageRule['outcome'])) return false;
  const when = r.when as Record<string, unknown> | undefined;
  if (!when || typeof when.inputId !== 'string' || typeof when.op !== 'string') return false;
  if (!OPS.includes(when.op as RuleOp)) return false;
  return true;
}

function isReminder(value: unknown): value is ReminderSpec {
  if (!value || typeof value !== 'object') return false;
  const r = value as Record<string, unknown>;
  if (typeof r.id !== 'string' || !r.id.trim()) return false;
  if (typeof r.domain !== 'string' || !r.domain.trim()) return false;
  if (typeof r.label !== 'string' || !r.label.trim()) return false;
  if (r.everyDays != null && (typeof r.everyDays !== 'number' || r.everyDays <= 0)) return false;
  return true;
}

export function loadPreventionPack(raw: unknown, options: { production?: boolean } = {}): PreventionLoadResult {
  // The prevention pack carries its rules/reminders under a single `entries`
  // object. The shared validator expects an array, so we wrap it for validation
  // and unwrap afterwards — provenance and production rules stay enforced.
  if (!raw || typeof raw !== 'object') return { ok: false, reason: 'prevention pack is not an object' };
  const asRecord = raw as Record<string, unknown>;
  const wrapped = { ...asRecord, entries: [asRecord.entries] };
  const base = validateContentPack<unknown>(wrapped, { production: options.production, label: 'prevention pack' });
  if (base.ok === false) return { ok: false, reason: base.reason };
  const entries = (base.pack.entries as unknown[])[0] as Record<string, unknown>;
  const rules = Array.isArray(entries?.rules) ? entries.rules : null;
  const reminders = Array.isArray(entries?.reminders) ? entries.reminders : null;
  if (!rules || !reminders) return { ok: false, reason: 'prevention pack needs "rules" and "reminders" arrays' };
  if (!rules.every(isRule)) return { ok: false, reason: 'prevention pack contains an invalid rule' };
  if (!reminders.every(isReminder)) return { ok: false, reason: 'prevention pack contains an invalid reminder' };
  return { ok: true, pack: { meta: base.pack.meta, rules: rules as TriageRule[], reminders: reminders as ReminderSpec[] } };
}

function match(when: TriageRule['when'], inputs: Record<string, number | string | boolean | null | undefined>): boolean {
  const value = inputs[when.inputId];
  switch (when.op) {
    case 'truthy': return Boolean(value);
    case 'eq': return value === when.value;
    case 'neq': return value !== when.value;
    case 'gte': return typeof value === 'number' && typeof when.value === 'number' && value >= when.value;
    case 'lte': return typeof value === 'number' && typeof when.value === 'number' && value <= when.value;
    default: return false;
  }
}

export interface TriageOutcome {
  state: 'unavailable' | 'evaluated';
  reason?: string;
  /** The first matching rule's outcome, or a plain info default from the pack. */
  outcome?: TriageRule['outcome'];
  message?: string;
  advice?: string;
  /** True when a red flag matched — the caller must escalate. */
  redFlag: boolean;
  /** Provenance of the pack. */
  reviewedBy?: string;
}

/**
 * Evaluate triage rules against recorded inputs. Returns the FIRST matching rule
 * (rules are ordered by the pack author). With no pack it is "unavailable".
 */
export function evaluateTriage(
  result: PreventionLoadResult,
  inputs: Record<string, number | string | boolean | null | undefined>,
  emergencyNumber?: string | null,
): TriageOutcome {
  if (result.ok === false) {
    return { state: 'unavailable', reason: notAvailableLine(emergencyNumber), redFlag: false };
  }
  const matched = result.pack.rules.find(rule => match(rule.when, inputs));
  if (!matched) {
    return {
      state: 'evaluated', outcome: 'info',
      message: 'No rule in the approved pack matched your answers.',
      redFlag: false,
      reviewedBy: `${result.pack.meta.reviewer} (${result.pack.meta.reviewDate})`,
    };
  }
  return {
    state: 'evaluated',
    outcome: matched.outcome,
    message: matched.message,
    advice: matched.advice,
    redFlag: matched.outcome === 'red_flag',
    reviewedBy: `${result.pack.meta.reviewer} (${result.pack.meta.reviewDate})`,
  };
}

export interface DueReminder extends ReminderSpec {
  dueOn: string | null;
}

/**
 * Compute which reminders are due given the last-completed dates. The cadence is
 * from the pack; this only does date arithmetic. A reminder with no cadence is
 * returned as always-due (the pack decided it is a standing reminder).
 */
export function dueReminders(
  result: PreventionLoadResult,
  lastDone: Record<string, string | undefined>,
  now: Date = new Date(),
): DueReminder[] {
  if (result.ok === false) return [];
  const today = now.toISOString().slice(0, 10);
  return result.pack.reminders.map(reminder => {
    if (!reminder.everyDays) return { ...reminder, dueOn: null };
    const last = lastDone[reminder.id];
    if (!last) return { ...reminder, dueOn: today };
    const due = new Date(last);
    due.setDate(due.getDate() + reminder.everyDays);
    return { ...reminder, dueOn: due.toISOString().slice(0, 10) };
  }).filter(r => r.dueOn == null || r.dueOn <= today);
}
