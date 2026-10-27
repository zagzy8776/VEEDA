import test from 'node:test';
import assert from 'node:assert/strict';
import { buildVisionAnalyzePayload } from '../src/app/visionRequest.ts';

test('vision request preserves the exact typed question and image separately from OCR', () => {
  const question = 'What medicine is this, and what is it used for?';
  const payload = buildVisionAnalyzePayload({
    base64: 'real-image-base64',
    mimeType: 'image/jpeg',
    ocrText: 'PARACETAMOL 500 mg',
    question,
    history: [{ role: 'assistant', content: 'Earlier context' }],
  });

  assert.equal(payload.message, question);
  assert.equal(payload.image.data, 'real-image-base64');
  assert.equal(payload.image.mimeType, 'image/jpeg');
  assert.equal(payload.image.ocrText, 'PARACETAMOL 500 mg');
  assert.deepEqual(payload.history, [{ role: 'assistant', content: 'Earlier context' }]);
  assert.doesNotMatch(payload.message, /PARACETAMOL/);
});
