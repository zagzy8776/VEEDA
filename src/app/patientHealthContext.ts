// Durable patient health context for medicine checks.
//
// Empty arrays must never mean "no allergies". Unknown / not provided is a
// distinct state from "none" (user confirmed none) and "known" (listed values).

export type ContextFieldStatus = 'unknown' | 'none' | 'known';

export interface ContextField {
  status: ContextFieldStatus;
  /** Only meaningful when status === 'known'. */
  values: string[];
}

export interface PatientHealthContext {
  allergies: ContextField;
  conditions: ContextField;
  currentMedicines: ContextField;
  /** null = not asked / unknown */
  pregnantOrBreastfeeding: boolean | null;
}

export function unknownField(): ContextField {
  return { status: 'unknown', values: [] };
}

export function noneField(): ContextField {
  return { status: 'none', values: [] };
}

export function knownField(values: string[]): ContextField {
  const cleaned = values.map(v => v.trim()).filter(Boolean);
  if (cleaned.length === 0) return noneField();
  return { status: 'known', values: cleaned };
}

export function emptyPatientHealthContext(): PatientHealthContext {
  return {
    allergies: unknownField(),
    conditions: unknownField(),
    currentMedicines: unknownField(),
    pregnantOrBreastfeeding: null,
  };
}

export function patientHealthContextKey(userId: string): string {
  return `veda_patient_health_${userId}`;
}

function parseField(raw: unknown): ContextField {
  if (!raw || typeof raw !== 'object') return unknownField();
  const entry = raw as { status?: string; values?: unknown };
  if (entry.status === 'none') return noneField();
  if (entry.status === 'known' && Array.isArray(entry.values)) {
    return knownField(entry.values.filter((v): v is string => typeof v === 'string'));
  }
  return unknownField();
}

export function loadPatientHealthContext(userId: string): PatientHealthContext {
  try {
    const parsed = JSON.parse(localStorage.getItem(patientHealthContextKey(userId)) || 'null');
    if (!parsed || typeof parsed !== 'object') return emptyPatientHealthContext();
    return {
      allergies: parseField(parsed.allergies),
      conditions: parseField(parsed.conditions),
      currentMedicines: parseField(parsed.currentMedicines),
      pregnantOrBreastfeeding:
        typeof parsed.pregnantOrBreastfeeding === 'boolean' ? parsed.pregnantOrBreastfeeding : null,
    };
  } catch {
    return emptyPatientHealthContext();
  }
}

export function savePatientHealthContext(userId: string, context: PatientHealthContext): boolean {
  try {
    localStorage.setItem(patientHealthContextKey(userId), JSON.stringify(context));
    return true;
  } catch {
    return false;
  }
}

/** True when any required medicine-check field has not been provided. */
export function hasUnknownMedicineContext(context: PatientHealthContext): boolean {
  return (
    context.allergies.status === 'unknown'
    || context.conditions.status === 'unknown'
    || context.currentMedicines.status === 'unknown'
  );
}

export function fieldDisplay(field: ContextField): string {
  if (field.status === 'unknown') return 'Not provided';
  if (field.status === 'none') return 'None recorded';
  return field.values.join('; ') || 'None recorded';
}
