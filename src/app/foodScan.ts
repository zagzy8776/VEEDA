// Food and camera scan.
//
// A photo is another input channel, never a verdict. VEEDA ships NO food
// recognition model, so a photo alone can never identify what is on the plate.
// Instead the scan turns the user's own words into observations and asks a
// short, adaptive set of questions. The only statements made about safety are
// general food-safety precautions (storage, cooking, spoilage) phrased as
// questions or guidance — never a diagnosis, and never a claim that a photo
// proved anything.
//
// Pure module; no network, no storage, so it is fully unit-testable.

import { lookupModel, notValidatedLabel, type ModelRegistry } from './modelRegistry.ts';

/** The caveat shown wherever a food photo is taken. */
export const FOOD_PHOTO_NOTE =
  'A photo alone cannot tell you whether food is safe to eat. VEEDA does not identify foods from photos unless a validated model is registered.';

/** The closing line when a possible food-safety problem is described. */
export const WHEN_IN_DOUBT_NOTE = 'When in doubt, throw it out — and tell me if you feel unwell after eating.';

/** How the food-recognition slot resolves. Always not-validated until a model ships. */
export function foodRecognitionState(registry: ModelRegistry) {
  const look = lookupModel(registry, 'food_recognition');
  if (!look.available) return { available: false as const, label: notValidatedLabel() };
  return { available: true as const, version: look.version };
}

export interface FoodObservation {
  /** What the user said the food is, in their own words. */
  description: string;
  /** Ingredients the user listed. */
  ingredients: string[];
  /** Portion, if the user described one. */
  portion?: string | null;
  /** Free text about storage, cooking, or a package date. */
  preparation?: string | null;
  /** Symptoms the user reported after eating. */
  symptoms?: string[];
  /** Whether the item came from a package. */
  packaged?: boolean;
}

export interface FoodFlag {
  id: string;
  text: string;
  /** True when this needs emergency help now, not just caution. */
  urgent?: boolean;
}

/** Split a typed ingredient list into items. Empty pieces are dropped. */
export function parseIngredientList(text: string): string[] {
  return text
    .split(/[,\n;]+/)
    .map(item => item.trim())
    .filter(Boolean);
}

const SEVERE_ALLERGY = /\b(swell\w*|hives|throat|breath\w*|anaphyla\w*|lips?\s+(?:swell|tingl))\b/i;
const ANY_SYMPTOM = /\b(vomit\w*|diarrh\w*|nausea|stomach\s+pain|cramps?|rash|fever|dizz\w*)\b/i;
const SPOILAGE = /\b(off|smell\w*|slimy|sour|mouldy|moldy|fizzy|rancid|discolou?red|left\s+out|overnight|sat\s+out|room\s+temperature)\b/i;
const RAW = /\b(raw|undercooked|under-cooked|rare|pink\s+inside|not\s+cooked|runny|uncooked)\b/i;
const ANIMAL = /\b(meat|chicken|beef|pork|fish|seafood|prawn|shrimp|egg|eggs|milk|dairy|cheese|yoghurt|yogurt|rice)\b/i;
const REHEAT = /\b(reheat\w*|leftovers?|microwave\w*)\b/i;

/**
 * General food-safety precautions drawn from what the user described. These are
 * standard food-hygiene statements, not clinical findings, and none of them is
 * asserted unless the user's own words support it.
 */
export function foodSafetyFlags(observation: FoodObservation): FoodFlag[] {
  const text = [observation.description, observation.preparation ?? '', ...(observation.symptoms ?? [])].join(' ');
  const ingredients = observation.ingredients.join(' ');
  const flags: FoodFlag[] = [];

  const symptoms = (observation.symptoms ?? []).join(' ');
  if (SEVERE_ALLERGY.test(symptoms)) {
    flags.push({
      id: 'allergic_reaction',
      urgent: true,
      text: 'You described swelling, hives, or trouble breathing after eating. That can be a severe allergic reaction — get emergency help now.',
    });
  } else if (ANY_SYMPTOM.test(symptoms)) {
    flags.push({
      id: 'symptoms_after_eating',
      text: 'You described symptoms after eating. If you have vomiting, diarrhoea, or severe stomach pain, get medical help and keep drinking fluids.',
    });
  }

  if (SPOILAGE.test(text)) {
    flags.push({
      id: 'spoilage',
      text: 'You noticed something off about it — a smell, slime, mould, or that it sat out. It is safer not to eat it.',
    });
  }

  if (RAW.test(text) && ANIMAL.test(`${text} ${ingredients}`)) {
    flags.push({
      id: 'undercooked',
      text: 'Undercooked meat, eggs, or seafood can carry bacteria. If it was not fully cooked through, it is safer not to eat it.',
    });
  }

  if (REHEAT.test(text)) {
    flags.push({
      id: 'reheated',
      text: 'Food reheated more than once, or leftovers kept too long, raise the risk. Reheat thoroughly until steaming, or discard.',
    });
  }

  if (observation.packaged) {
    flags.push({
      id: 'packaged_date',
      text: 'Check the printed date and the packaging for damage. If the date has passed, or the pack is swollen or torn, do not eat it.',
    });
  }

  return flags;
}

/**
 * The next question to ask, given what is still unknown. The first one returned
 * is the one to ask now; the rest are queued. It always returns at least one, so
 * the scan never runs out of things to ask.
 */
export function foodScanQuestions(observation: FoodObservation): string[] {
  const questions: string[] = [];
  if (!observation.description.trim()) {
    questions.push('What is it you are about to eat, or have just eaten?');
  }
  if (observation.ingredients.length === 0) {
    questions.push('What is in it? List the main ingredients, separated by commas.');
  }
  if (!observation.portion) {
    questions.push('About how much of it did you have — a small, medium, or large portion?');
  }
  if (!observation.preparation) {
    questions.push('How was it cooked or stored, and when? If it came from a package, what date is printed on it?');
  }
  if (!observation.symptoms || observation.symptoms.length === 0) {
    questions.push('Have you noticed any symptoms — stomach pain, vomiting, diarrhoea, or a rash — since eating?');
  }
  questions.push('Are you managing a condition or taking a medicine that this meal could affect?');
  return questions;
}
