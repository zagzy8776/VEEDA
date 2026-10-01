// Intake framework.
//
// Intake questions are clinician-authored content. They are NOT hard-coded
// here: they load from a content pack and pass the shared validator. A sample
// pack is shipped for development only, clearly marked "NOT CLINICALLY
// REVIEWED". In production mode the loader refuses any pack that is not marked
// `clinicallyReviewed: true`, so the app cannot surface unreviewed questions
// to real users.

import { validateContentPack, type ContentPackMeta, type ValidatedPack } from './contentPack.ts';

export interface IntakeQuestion {
  /** Stable id used when recording answers. */
  id: string;
  /** The question text shown to the user. */
  prompt: string;
  /** Answer input type. Text only here; no diagnosis is implied. */
  type: 'text' | 'yes_no' | 'number' | 'select';
  /** Options for a 'select' question. */
  options?: string[];
  /** Whether the user must answer before continuing. */
  required?: boolean;
}

export interface IntakePack {
  meta: ContentPackMeta;
  questions: IntakeQuestion[];
}

export interface IntakeLoadOptions {
  /** Refuse unreviewed packs (used in production builds). */
  production?: boolean;
}

export type IntakeLoadResult =
  | { ok: true; pack: IntakePack }
  | { ok: false; reason: string };

const QUESTION_TYPES: IntakeQuestion['type'][] = ['text', 'yes_no', 'number', 'select'];

function isValidQuestion(value: unknown): value is IntakeQuestion {
  if (!value || typeof value !== 'object') return false;
  const q = value as Record<string, unknown>;
  if (typeof q.id !== 'string' || q.id.trim() === '') return false;
  if (typeof q.prompt !== 'string' || q.prompt.trim() === '') return false;
  if (typeof q.type !== 'string' || !QUESTION_TYPES.includes(q.type as IntakeQuestion['type'])) return false;
  if (q.type === 'select' && (!Array.isArray(q.options) || q.options.length === 0)) return false;
  return true;
}

/** Parse and validate a raw intake pack into typed questions. */
export function loadIntakePack(raw: unknown, options: IntakeLoadOptions = {}): IntakeLoadResult {
  const validated = validateContentPack<unknown[]>(raw, {
    production: options.production,
    label: 'intake pack',
  });
  if (validated.ok === false) return { ok: false, reason: validated.reason };

  const pack: ValidatedPack<unknown[]> = validated.pack;
  const questions: IntakeQuestion[] = [];
  for (const entry of pack.entries) {
    if (!isValidQuestion(entry)) {
      return { ok: false, reason: 'intake pack contains an invalid question entry' };
    }
    questions.push(entry);
  }

  return { ok: true, pack: { meta: pack.meta, questions } };
}

/** True when a pack is safe to show in production (reviewed AND production allowed). */
export function isProductionReady(meta: ContentPackMeta): boolean {
  return meta.clinicallyReviewed === true;
}
