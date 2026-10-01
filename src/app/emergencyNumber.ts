// Emergency-number resolution: verified configuration only, never a guessed
// number. The number the user sees and dials is resolved in this order:
//
//   1. The value the backend most recently returned (it is the deployment's
//      verified config and always wins when present).
//   2. The last backend value cached on this device (so SOS still works when the
//      backend is slow or offline).
//   3. An optional build-time `VITE_EMERGENCY_NUMBER` fallback.
//
// If none is set the UI must fall back to plain wording ("call your local
// emergency number") and must NOT auto-dial. This module only stores and
// resolves a value; it never invents digits.

export const EMERGENCY_CACHE_KEY = 'veda_emergency_number';
export const EMERGENCY_LOCAL_TEXT = 'your local emergency number';

/** Build-time fallback, inlined by Vite (or Node expose). Unset => null. */
export function buildTimeEmergencyNumber(): string | null {
  try {
    const override = testEnvOverride();
    const env = override ?? (import.meta as unknown as { env?: Record<string, string | undefined> }).env;
    const value = typeof env?.VITE_EMERGENCY_NUMBER === 'string' ? env.VITE_EMERGENCY_NUMBER.trim() : '';
    return value ? value : null;
  } catch {
    return null;
  }
}

// Test seam: `import.meta.env` is a read-only ESM namespace in Node, so unit
// tests cannot assign to it. A global override lets tests exercise the
// build-time fallback without changing the Vite-inlined production behavior.
function testEnvOverride(): Record<string, string | undefined> | undefined {
  return (globalThis as { __veedaEnv?: Record<string, string | undefined> }).__veedaEnv;
}

let backendEmergencyNumber: string | null = null;

/** The last number the backend sent this session (null until one arrives). */
export function getBackendEmergencyNumber(): string | null {
  return backendEmergencyNumber;
}

/**
 * Record the emergency number the backend returned. A non-empty string is
 * remembered in memory and cached on the device; a null/empty value clears the
 * in-memory value but deliberately leaves the device cache intact, so a later
 * offline or slow start can still show the last verified number.
 */
export function recordEmergencyNumber(value: string | null | undefined): string | null {
  const normalized = typeof value === 'string' && value.trim() ? value.trim() : null;
  backendEmergencyNumber = normalized;
  if (normalized) {
    try { localStorage.setItem(EMERGENCY_CACHE_KEY, normalized); } catch {}
  }
  return normalized;
}

/** The last verified number cached on this device (survives reload/offline). */
export function cachedEmergencyNumber(): string | null {
  try {
    const value = localStorage.getItem(EMERGENCY_CACHE_KEY);
    return value && value.trim() ? value.trim() : null;
  } catch {
    return null;
  }
}

/** Clear the on-device cache. Kept for tests and manual reset; logout does not
 * call this because the emergency number is deployment config, not user data. */
export function clearCachedEmergencyNumber() {
  try { localStorage.removeItem(EMERGENCY_CACHE_KEY); } catch {}
}

/**
 * The verified number to show and dial, or null when none is configured. Backend
 * value wins, then the device cache, then the build-time fallback.
 */
export function resolveEmergencyNumber(): string | null {
  return backendEmergencyNumber || cachedEmergencyNumber() || buildTimeEmergencyNumber();
}

/**
 * Plain, non-dialling instruction shown when no verified number is available.
 * It never contains digits and is never a dialable target.
 */
export function emergencyHelpLine(): string {
  return `If you feel very unwell, get medical help now or call ${EMERGENCY_LOCAL_TEXT}.`;
}

/**
 * A dialable `tel:` target, or null when there is nothing verified to dial.
 * Callers must treat null as "no auto-dial".
 */
export function emergencyTelHref(): string | null {
  const number = resolveEmergencyNumber();
  return number ? `tel:${number}` : null;
}
