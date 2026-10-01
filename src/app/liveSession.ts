// Live camera & voice consult session (Phase 6).
//
// A "live session" is a state machine plus the safety rules that must hold for
// any camera/microphone session:
//
//   - Consent is PER SESSION. Starting a session records consent for that session
//     and the session ends without it.
//   - Recording is OFF by default. The session tracks a `recording` flag that
//     starts false; nothing is captured to storage unless the user turns it on.
//   - A "camera is on" / "microphone is on" indicator is derived from the session
//     state, never asserted manually.
//   - The stroke-screen steps and every visual-check label come from a pack.
//   - Local-language voice is a language-pack slot (see languagePacks.ts).
//
// Pure module: no MediaStream, no DOM. The caller wires the actual devices.

import { validateContentPack } from './contentPack.ts';

export type SessionKind =
  | 'self_check'
  | 'caregiver_remote'
  | 'emergency'
  | 'label_reading'
  | 'stroke_screen';

export interface SessionState {
  kind: SessionKind;
  active: boolean;
  /** True only while the camera is actually in use. */
  cameraOn: boolean;
  /** True only while the microphone is actually in use. */
  micOn: boolean;
  /** ALWAYS starts false; no recording by default. */
  recording: boolean;
  /** Consent captured for THIS session. */
  consented: boolean;
}

/** Start a session. Recording is forced off and devices are not yet on. */
export function startSession(kind: SessionKind, consented: boolean): SessionState {
  return { kind, active: true, cameraOn: false, micOn: false, recording: false, consented };
}

/** Turn the camera on/off for the session (no-op when there is no consent). */
export function setCamera(state: SessionState, on: boolean): SessionState {
  if (!state.active || !state.consented) return state;
  return { ...state, cameraOn: on };
}

/** Turn the microphone on/off for the session (no-op when there is no consent). */
export function setMic(state: SessionState, on: boolean): SessionState {
  if (!state.active || !state.consented) return state;
  return { ...state, micOn: on };
}

/** Explicitly opt in to recording. Recording is never enabled by default. */
export function setRecording(state: SessionState, on: boolean): SessionState {
  if (!state.active || !state.consented) return state;
  return { ...state, recording: on };
}

/** End the session: everything off, recording off. */
export function endSession(state: SessionState): SessionState {
  return { ...state, active: false, cameraOn: false, micOn: false, recording: false };
}

/** The visible indicator text, or null when neither device is on. */
export function inUseIndicator(state: SessionState): string | null {
  if (state.cameraOn && state.micOn) return 'Camera and microphone are on';
  if (state.cameraOn) return 'Camera is on';
  if (state.micOn) return 'Microphone is on';
  return null;
}

/** True when the session is capturing anything (used to block silent capture). */
export function isCapturing(state: SessionState): boolean {
  return state.active && (state.cameraOn || state.micOn);
}

/** Stroke-screen flow: steps come from a pack; the screen itself invents none. */
export interface StrokeScreen {
  meta: { reviewer: string; reviewDate: string; region: string; clinicallyReviewed: boolean };
  steps: { id: string; prompt: string; instruction: string }[];
}

export function loadStrokeScreen(
  raw: unknown,
  options: { production?: boolean } = {},
): { ok: true; screen: StrokeScreen } | { ok: false; reason: string } {
  const base = validateContentPack<unknown>(raw, { production: options.production, label: 'stroke-screen pack' });
  if (base.ok === false) return { ok: false, reason: base.reason };
  const entries = base.pack.entries[0] as Record<string, unknown>;
  const rawSteps = Array.isArray(entries?.steps) ? entries.steps : null;
  if (!rawSteps) return { ok: false, reason: 'stroke-screen pack needs a "steps" array' };
  const steps: StrokeScreen['steps'] = [];
  for (const s of rawSteps) {
    const e = s as Record<string, unknown>;
    if (typeof e?.id !== 'string' || typeof e?.prompt !== 'string' || typeof e?.instruction !== 'string') {
      return { ok: false, reason: 'stroke-screen pack contains an invalid step' };
    }
    steps.push({ id: e.id, prompt: e.prompt, instruction: e.instruction });
  }
  return { ok: true, screen: { meta: base.pack.meta, steps } };
}
