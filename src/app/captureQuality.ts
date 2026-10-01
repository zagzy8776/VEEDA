// Capture quality gate and guided capture (Phase 5).
//
// These two pieces WORK NOW and are deliberately pure: they take plain image
// statistics (as any canvas/GPU would produce) and decide whether a photo is good
// enough to capture, plus tell the user how to fix it. No model is involved, so
// nothing here is clinical and nothing here can produce a diagnosis.
//
// The capture FRAMEWORKS for hemoglobin/anemia, SpO2, jaundice, skin, cough/voice,
// malaria, sickle cell, blood-cell counting and urine strips all use this gate and
// then hand the trace to a model slot via modelRegistry — which is disabled until a
// validated model is registered.

export type RetakeReason = 'blur' | 'too_dark' | 'too_bright' | 'poor_framing' | 'too_small';

export interface CaptureStats {
  width: number;
  height: number;
  /** 0..1 sharpness proxy (higher is sharper). */
  sharpness: number;
  /** 0..1 mean luminance. */
  brightness: number;
  /** 0..1 share of the frame the target occupies. */
  coverage: number;
}

export interface CaptureRequirement {
  minSharpness: number;
  minBrightness: number;
  maxBrightness: number;
  minCoverage: number;
  minWidth: number;
  minHeight: number;
}

/** Defaults are plain image-quality bounds an operator may override. */
export const DEFAULT_REQUIREMENT: CaptureRequirement = {
  minSharpness: 0.35,
  minBrightness: 0.18,
  maxBrightness: 0.92,
  minCoverage: 0.15,
  minWidth: 480,
  minHeight: 480,
};

export type QualityResult =
  | { ok: true }
  | { ok: false; reason: RetakeReason; guidance: string };

const GUIDANCE: Record<RetakeReason, string> = {
  blur: 'Hold the phone still and let the camera focus, then try again.',
  too_dark: 'Move to a brighter, even light and try again.',
  too_bright: 'Avoid direct light or glare, then try again.',
  poor_framing: 'Fill more of the frame with the area to check, then try again.',
  too_small: 'The photo is too small to use; move closer and try again.',
};

/** Evaluate a capture against the requirement. Fails safe: anything off => retake. */
export function checkQuality(
  stats: CaptureStats,
  requirement: CaptureRequirement = DEFAULT_REQUIREMENT,
): QualityResult {
  if (stats.width < requirement.minWidth || stats.height < requirement.minHeight) {
    return { ok: false, reason: 'too_small', guidance: GUIDANCE.too_small };
  }
  if (stats.brightness < requirement.minBrightness) {
    return { ok: false, reason: 'too_dark', guidance: GUIDANCE.too_dark };
  }
  if (stats.brightness > requirement.maxBrightness) {
    return { ok: false, reason: 'too_bright', guidance: GUIDANCE.too_bright };
  }
  if (stats.sharpness < requirement.minSharpness) {
    return { ok: false, reason: 'blur', guidance: GUIDANCE.blur };
  }
  if (stats.coverage < requirement.minCoverage) {
    return { ok: false, reason: 'poor_framing', guidance: GUIDANCE.poor_framing };
  }
  return { ok: true };
}

/** The step-by-step prompts for a guided capture, from a pack (never invented). */
export interface CapturePrompt {
  id: string;
  text: string;
}

export interface GuidedCapture {
  task: string;
  prompts: CapturePrompt[];
  requirement: CaptureRequirement;
}

/**
 * Build a guided-capture flow from a pack entry. The prompts and requirement are
 * content; this only assembles them and falls back to the default requirement.
 */
export function buildGuidedCapture(packEntry: {
  task?: unknown;
  prompts?: unknown;
  requirement?: unknown;
}): GuidedCapture | null {
  const task = typeof packEntry?.task === 'string' ? packEntry.task : null;
  if (!task) return null;
  const rawPrompts = Array.isArray(packEntry.prompts) ? packEntry.prompts : [];
  const prompts: CapturePrompt[] = [];
  for (const p of rawPrompts) {
    const e = p as Record<string, unknown>;
    if (typeof e?.id !== 'string' || typeof e?.text !== 'string') return null;
    prompts.push({ id: e.id, text: e.text });
  }
  const req = packEntry.requirement as Partial<CaptureRequirement> | undefined;
  const requirement: CaptureRequirement = {
    ...DEFAULT_REQUIREMENT,
    ...(req && typeof req === 'object' ? {
      minSharpness: numOr(req.minSharpness, DEFAULT_REQUIREMENT.minSharpness),
      minBrightness: numOr(req.minBrightness, DEFAULT_REQUIREMENT.minBrightness),
      maxBrightness: numOr(req.maxBrightness, DEFAULT_REQUIREMENT.maxBrightness),
      minCoverage: numOr(req.minCoverage, DEFAULT_REQUIREMENT.minCoverage),
      minWidth: numOr(req.minWidth, DEFAULT_REQUIREMENT.minWidth),
      minHeight: numOr(req.minHeight, DEFAULT_REQUIREMENT.minHeight),
    } : {}),
  };
  return { task, prompts, requirement };
}

function numOr(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}
