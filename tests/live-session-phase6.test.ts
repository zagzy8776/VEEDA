import test from 'node:test';
import assert from 'node:assert/strict';
import {
  startSession, setCamera, setMic, setRecording, endSession,
  inUseIndicator, isCapturing, loadStrokeScreen,
} from '../src/app/liveSession.ts';
import {
  loadLanguagePack, translate, browserSupportsLanguage, SUPPORTED_LANGUAGES,
} from '../src/app/languagePacks.ts';

const meta = {
  id: 'x', version: '1.0.0', reviewer: 'Dr. Test', reviewerCredential: 'Physician',
  reviewDate: '2026-01-01', region: 'NG', clinicallyReviewed: true,
};

test('a new session never records and starts with devices off', () => {
  const s = startSession('self_check', true);
  assert.equal(s.recording, false);
  assert.equal(s.cameraOn, false);
  assert.equal(s.micOn, false);
  assert.equal(isCapturing(s), false);
});

test('turning on the camera shows the in-use indicator and counts as capturing', () => {
  let s = startSession('self_check', true);
  s = setCamera(s, true);
  assert.equal(inUseIndicator(s), 'Camera is on');
  assert.equal(isCapturing(s), true);
  s = setMic(s, true);
  assert.equal(inUseIndicator(s), 'Camera and microphone are on');
});

test('without session consent the devices cannot be turned on', () => {
  let s = startSession('self_check', false);
  s = setCamera(s, true);
  s = setMic(s, true);
  assert.equal(s.cameraOn, false);
  assert.equal(s.micOn, false);
  assert.equal(inUseIndicator(s), null);
});

test('recording only turns on when explicitly opted in, and ends with the session', () => {
  let s = startSession('caregiver_remote', true);
  s = setCamera(s, true);
  assert.equal(s.recording, false);
  s = setRecording(s, true);
  assert.equal(s.recording, true);
  s = endSession(s);
  assert.equal(s.recording, false);
  assert.equal(isCapturing(s), false);
  assert.equal(inUseIndicator(s), null);
});

test('the stroke screen steps come only from a reviewed pack', () => {
  assert.equal(loadStrokeScreen(null, { production: true }).ok, false);
  const ok = loadStrokeScreen({ ...meta, entries: [{ steps: [{ id: 's1', prompt: 'p', instruction: 'i' }] }] });
  assert.equal(ok.ok, true);
  if (ok.ok) assert.equal(ok.screen.steps[0].instruction, 'i');
  const bad = loadStrokeScreen({ ...meta, entries: [{ steps: [{ id: 's1', prompt: 'p' }] }] });
  assert.equal(bad.ok, false);
});

test('the language pack is validated and falls back to English, never blank', () => {
  const english = { greeting: 'Hello' };
  const bad = loadLanguagePack({ ...meta, entries: [{ code: 'pcm', strings: { greeting: 1 } }] });
  assert.equal(bad.ok, false);

  const good = loadLanguagePack({ ...meta, entries: [{ code: 'pcm', strings: { greeting: 'How you dey' } }] });
  assert.equal(good.ok, true);
  assert.equal(translate(good, 'pcm', 'greeting', english), 'How you dey');
  assert.equal(translate(good, 'yo', 'greeting', english), 'Hello'); // no Yoruba -> English
  assert.equal(translate(bad, 'pcm', 'greeting', english), 'Hello'); // invalid pack -> English
  assert.equal(translate(bad, 'pcm', 'missing', english), 'missing'); // never blank
});

test('browser language support is checked against available voices', () => {
  assert.equal(browserSupportsLanguage('ig', ['en-US', 'ig-NG']), true);
  assert.equal(browserSupportsLanguage('yo', ['en-US']), false);
  assert.ok(SUPPORTED_LANGUAGES.some(l => l.code === 'ha'));
});
