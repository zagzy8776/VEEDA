import test from 'node:test';
import assert from 'node:assert/strict';
import { chatSheetBounds, providerChatReply } from '../src/app/chatPresentation.ts';

test('AI statements without a question mark replace local guidance', () => {
  assert.equal(providerChatReply({ source: 'ai', conversationReply: '  Here is your summary.  ' }), 'Here is your summary.');
  assert.equal(providerChatReply({ source: 'local', conversationReply: 'Local guidance?' }), null);
  assert.equal(providerChatReply({ source: 'ai', conversationReply: ' ' }), null);
  assert.equal(providerChatReply(null), null);
});

test('sheet stays inside the visible viewport as the keyboard opens, pans and closes', () => {
  for (const viewport of [{ top: 0, height: 844 }, { top: 0, height: 400 }, { top: 115, height: 360 }, { top: 0, height: 844 }]) {
    const bounds = chatSheetBounds(viewport);
    assert.ok(bounds.top >= viewport.top);
    assert.ok(bounds.height > 0 && bounds.height <= 680);
    assert.equal(bounds.top + bounds.height, viewport.top + viewport.height);
  }
});
