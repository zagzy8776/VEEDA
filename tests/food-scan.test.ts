import test from 'node:test';
import assert from 'node:assert/strict';
import {
  FOOD_PHOTO_NOTE,
  foodRecognitionState,
  foodSafetyFlags,
  foodScanQuestions,
  parseIngredientList,
  type FoodObservation,
} from '../src/app/foodScan.ts';
import { buildRegistry } from '../src/app/modelRegistry.ts';

const BASE: FoodObservation = { description: '', ingredients: [] };

test('food recognition reports not-validated because no model is registered', () => {
  const state = foodRecognitionState(buildRegistry([]));
  assert.equal(state.available, false);
  assert.match(state.label, /not yet validated/i);
  // The photo caveat never claims a photo can prove a food is safe.
  assert.match(FOOD_PHOTO_NOTE, /cannot tell you whether food is safe/);
});

test('an ingredient list splits on commas, semicolons, and new lines', () => {
  assert.deepEqual(parseIngredientList('rice, tomato; chicken\noil'), ['rice', 'tomato', 'chicken', 'oil']);
  assert.deepEqual(parseIngredientList('  ,  '), []);
});

test('an empty description makes the scan ask what the food is, and it always asks something', () => {
  const questions = foodScanQuestions(BASE);
  assert.match(questions[0], /What is it you are about to eat/);
  assert.ok(questions.length > 1);

  const answered: FoodObservation = {
    description: 'Jollof rice', ingredients: ['rice', 'tomato'], portion: 'medium',
    preparation: 'cooked today', symptoms: ['none'],
  };
  const rest = foodScanQuestions(answered);
  assert.equal(rest.length, 1);
  assert.match(rest[0], /condition or taking a medicine/);
});

test('spoilage, undercooking, and packaging each raise a supported food-safety flag', () => {
  const spoilt = foodSafetyFlags({ ...BASE, description: 'stew', preparation: 'it smelt off and sat out overnight' });
  assert.ok(spoilt.some(flag => flag.id === 'spoilage'));

  const raw = foodSafetyFlags({ ...BASE, description: 'grilled chicken', preparation: 'it was still pink inside' });
  assert.ok(raw.some(flag => flag.id === 'undercooked'));

  const packaged = foodSafetyFlags({ ...BASE, description: 'yoghurt', packaged: true });
  assert.ok(packaged.some(flag => flag.id === 'packaged_date'));

  // A plainly described, freshly cooked meal raises nothing.
  assert.deepEqual(foodSafetyFlags({ ...BASE, description: 'rice and beans', preparation: 'cooked today, eaten within an hour' }), []);
});

test('symptoms after eating are separated into urgent allergy and ordinary illness', () => {
  const urgent = foodSafetyFlags({ ...BASE, description: 'groundnut soup', symptoms: ['swelling', 'trouble breathing'] });
  const severe = urgent.find(flag => flag.id === 'allergic_reaction');
  assert.equal(severe?.urgent, true);
  assert.match(severe!.text, /emergency help now/);

  const ordinary = foodSafetyFlags({ ...BASE, description: 'rice', symptoms: ['stomach pain'] });
  const illness = ordinary.find(flag => flag.id === 'symptoms_after_eating');
  assert.equal(illness?.urgent, undefined);
  assert.match(illness!.text, /get medical help/);
});
