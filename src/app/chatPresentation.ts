/** Keep the sheet above the software keyboard, including Safari viewport panning. */
export function chatSheetBounds(viewport: { top: number; height: number }) {
  const height = Math.max(0, Math.min(680, viewport.height - 12));
  return { top: viewport.top + viewport.height - height, height };
}

/** Provider provenance and nonempty content matter; punctuation does not. */
export function providerChatReply(data: { source?: string; conversationReply?: string } | null | undefined): string | null {
  return data?.source === 'ai' && typeof data.conversationReply === 'string'
    ? data.conversationReply.trim() || null : null;
}
