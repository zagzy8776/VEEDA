// Shared fail-safe wording.
//
// The one sentence the whole app uses when a pack, data source, model or
// permission is missing. Keeping it in one place means the "never a blank screen,
// never a false all-clear" rule reads the same everywhere, and tests can pin it.
//
// It contains NO digits and makes NO clinical claim, so it is safe to show even
// with no configuration at all.

export const NOT_AVAILABLE_TEXT = 'This is not available right now.';

export const GET_HELP_TEXT = 'If you feel unwell, get medical help.';

/** The combined plain line, optionally naming a verified emergency number. */
export function notAvailableLine(emergencyNumber?: string | null): string {
  const help = emergencyNumber
    ? `If you feel unwell, get medical help now or call ${emergencyNumber}.`
    : GET_HELP_TEXT;
  return `${NOT_AVAILABLE_TEXT} ${help}`;
}

/** Used by framework-only features so a disabled state is self-explaining. */
export const CONTENT_UNAVAILABLE_TEXT = 'No approved content is loaded, so nothing is shown.';

export const EARLY_WARNING_LABEL = 'Early warning / screening, not a diagnosis.';
