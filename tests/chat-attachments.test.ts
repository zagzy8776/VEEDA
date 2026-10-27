import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_CHAT_DOCUMENT_BYTES,
  MAX_CHAT_IMAGE_BYTES,
  cameraFailureKind,
  formatAttachmentSize,
  shouldUseNativeCamera,
  validateChatDocument,
  validateChatImage,
} from '../src/app/chatAttachments.ts';

test('chat images accept JPEG, PNG and WebP within 10 MB', () => {
  for (const type of ['image/jpeg', 'image/png', 'image/webp']) {
    assert.deepEqual(validateChatImage({ name: 'photo', type, size: 1024 }), { ok: true, kind: 'image' });
  }
});

test('chat images reject unsupported and oversized files', () => {
  assert.equal(validateChatImage({ name: 'animation.gif', type: 'image/gif', size: 1024 }).ok, false);
  const result = validateChatImage({ name: 'large.jpg', type: 'image/jpeg', size: MAX_CHAT_IMAGE_BYTES + 1 });
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.error, /10 MB/);
});

test('documents allow PDF metadata but reject unsupported and oversized documents', () => {
  assert.deepEqual(validateChatDocument({ name: 'report.pdf', type: 'application/pdf', size: 2048 }), { ok: true, kind: 'document' });
  assert.equal(validateChatDocument({ name: 'notes.docx', type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', size: 2048 }).ok, false);
  assert.equal(validateChatDocument({ name: 'large.pdf', type: 'application/pdf', size: MAX_CHAT_DOCUMENT_BYTES + 1 }).ok, false);
});

test('attachment metadata formats size for the preview', () => {
  assert.equal(formatAttachmentSize(512), '512 B');
  assert.equal(formatAttachmentSize(1536), '1.5 KB');
  assert.equal(formatAttachmentSize(2 * 1024 * 1024), '2.0 MB');
});

test('mobile devices prefer native capture and desktop prefers explicit webcam', () => {
  assert.equal(shouldUseNativeCamera({ maxTouchPoints: 1, userAgent: 'iPhone' }), true);
  assert.equal(shouldUseNativeCamera({ maxTouchPoints: 0, userAgent: 'Desktop' }), false);
  assert.equal(shouldUseNativeCamera({ maxTouchPoints: 0, userAgent: 'Desktop' }, true), true);
});

test('camera permission denial is distinguished from other camera errors', () => {
  assert.equal(cameraFailureKind({ name: 'NotAllowedError' }), 'denied');
  assert.equal(cameraFailureKind({ name: 'SecurityError' }), 'denied');
  assert.equal(cameraFailureKind({ name: 'NotReadableError' }), 'error');
});
