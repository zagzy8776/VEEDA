// Medical image safety guard – ensures that visual observations are limited to
// what is directly visible. It prevents the system from treating any observation
// as a clinical interpretation or diagnosis.

import type { VisualObservation } from './visionObservation';

/**
 * List of prohibited terms that would indicate a clinical interpretation or
 * diagnosis rather than a pure visual observation. The list is intentionally
 * conservative – any mention of disease, condition, diagnosis, or treatment
 * triggers the guard.
 */
const PROHIBITED_TERMS = [
  'diagnosis',
  'diagnosed',
  'condition',
  'disease',
  'infection',
  'sepsis',
  'stroke',
  'myocardial',
  'infarction',
  'cancer',
  'tumor',
  'fracture',
  'lesion',
  'treatment',
  'prescribe',
  'prescription',
  'medication',
  'drug',
];

/**
 * Checks a set of visual observations for prohibited language.
 *
 * Returns an object indicating whether the observations are safe to expose
 * to the user and an array of notes describing any violations.
 */
export function guardObservations(observations: VisualObservation[]) {
  const notes: string[] = [];
  let safe = true;

  observations.forEach((obs) => {
    const lower = obs.description.toLowerCase();
    const found = PROHIBITED_TERMS.filter((term) => lower.includes(term));
    if (found.length) {
      safe = false;
      notes.push(
        `Observation "${obs.id}" contains prohibited terms: ${found.join(', ')}`,
      );
    }
  });

  if (safe) {
    notes.push('All observations are within allowed visual description scope.');
  }

  return { safe, notes };
}
