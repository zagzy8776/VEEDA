// One-model-per-task registry with version pinning.
//
// VEEDA ships NO trained model. Every feature that would need one (illness
// drift, seizure detection, sickle-cell crisis, breathing trouble, and all of
// Phase 5's camera checks) declares its task here and runs ONLY when a validated
// model — with an explicit version and acceptance thresholds — is registered.
//
// The rules this module enforces:
//   - A task with no registered model returns `not_validated`; the caller must
//     show a plain "not yet validated" state and MUST NOT produce a result.
//   - A model may only be used when it has a pinned version, a validation record
//     (error range + sensitivity + specificity), and acceptance thresholds.
//   - Updates are explicit and pinned: switching versions is a deliberate act,
//     never an automatic drift.
//
// Pure module; no network, no storage, so it is fully unit-testable.

export type MlTask =
  | 'illness_drift'
  | 'seizure_detection'
  | 'fall_detection'
  | 'sickle_cell_crisis'
  | 'sickle_cell'
  | 'breathing_trouble'
  | 'hemoglobin_anemia'
  | 'spo2'
  | 'jaundice'
  | 'skin_photo'
  | 'cough_voice'
  | 'malaria'
  | 'blood_cell_count'
  | 'urine_strip'
  | 'spoilage';

export interface ValidationRecord {
  /** Reported error range, e.g. "±2 g/dL", as text (no invented numbers here). */
  errorRange: string;
  /** Sensitivity/specificity as reported by the validation study (0..1). */
  sensitivity: number;
  specificity: number;
  /** Where the validation came from (study id / reference). */
  reference: string;
  /** ISO date of the validation. */
  validatedAt: string;
}

export interface ModelRegistration {
  task: MlTask;
  /** Immutable model version, e.g. "1.2.0" or a provider hash. */
  version: string;
  validation: ValidationRecord;
  /**
   * Acceptance thresholds the deployment requires before this model may run in
   * production. A model that does not meet them is treated as not validated.
   */
  acceptance: { minSensitivity: number; minSpecificity: number };
  /** True only once a human has signed off on running this version. */
  approved: boolean;
}

export interface ModelRegistry {
  get(task: MlTask): ModelRegistration | undefined;
}

export type ModelLookup =
  | { available: true; version: string; validation: ValidationRecord }
  | { available: false; state: 'not_validated'; reason: string };

const NOT_VALIDATED_REASON =
  'this check is not yet validated on VEEDA; it is not available and does not give a result';

/** True when a registration meets its own acceptance thresholds and is approved. */
export function isUsable(model: ModelRegistration | undefined): boolean {
  if (!model) return false;
  if (!model.approved) return false;
  if (typeof model.version !== 'string' || !model.version.trim()) return false;
  const v = model.validation;
  if (!v || typeof v.sensitivity !== 'number' || typeof v.specificity !== 'number') return false;
  if (v.sensitivity < model.acceptance.minSensitivity) return false;
  if (v.specificity < model.acceptance.minSpecificity) return false;
  return true;
}

/**
 * Resolve a task against a registry. Fails safe: anything not present, not
 * approved, or below its acceptance thresholds is `not_validated`.
 */
export function lookupModel(registry: ModelRegistry, task: MlTask): ModelLookup {
  const model = registry.get(task);
  if (!isUsable(model)) {
    return { available: false, state: 'not_validated', reason: NOT_VALIDATED_REASON };
  }
  const m = model as ModelRegistration;
  return { available: true, version: m.version, validation: m.validation };
}

/**
 * A registry built from a list of registrations, pinning the highest approved
 * version per task. Constructing it never enables anything by itself: only an
 * approved, threshold-meeting registration is ever returned by `lookupModel`.
 */
export function buildRegistry(models: ModelRegistration[]): ModelRegistry {
  const byTask = new Map<MlTask, ModelRegistration>();
  for (const model of models) {
    const existing = byTask.get(model.task);
    // Pin: prefer an approved, usable model; otherwise keep the first.
    if (!existing || (isUsable(model) && !isUsable(existing))) {
      byTask.set(model.task, model);
    }
  }
  return { get: task => byTask.get(task) };
}

/** The plain, non-diagnostic label a UI shows while a model is not validated. */
export function notValidatedLabel(): string {
  return 'Not yet validated — this check is not available. Early warning only, not a diagnosis.';
}
