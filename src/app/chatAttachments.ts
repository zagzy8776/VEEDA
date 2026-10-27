export const MAX_CHAT_IMAGE_BYTES = 10 * 1024 * 1024;
export const MAX_CHAT_DOCUMENT_BYTES = 10 * 1024 * 1024;
export const CHAT_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export const CHAT_DOCUMENT_TYPES = ['application/pdf'] as const;

type FileLike = { name: string; type: string; size: number };

export type AttachmentValidation =
  | { ok: true; kind: 'image' | 'document' }
  | { ok: false; error: string };

export function validateChatImage(file: FileLike): AttachmentValidation {
  if (!CHAT_IMAGE_TYPES.includes(file.type as typeof CHAT_IMAGE_TYPES[number])) {
    return { ok: false, error: 'Choose a JPEG, PNG, or WebP image.' };
  }
  if (file.size <= 0) return { ok: false, error: 'The selected image is empty.' };
  if (file.size > MAX_CHAT_IMAGE_BYTES) return { ok: false, error: 'Image is too large. Maximum size is 10 MB.' };
  return { ok: true, kind: 'image' };
}

export function validateChatDocument(file: FileLike): AttachmentValidation {
  if (!CHAT_DOCUMENT_TYPES.includes(file.type as typeof CHAT_DOCUMENT_TYPES[number])) {
    return { ok: false, error: 'Only PDF documents are currently supported for selection.' };
  }
  if (file.size <= 0) return { ok: false, error: 'The selected document is empty.' };
  if (file.size > MAX_CHAT_DOCUMENT_BYTES) return { ok: false, error: 'Document is too large. Maximum size is 10 MB.' };
  return { ok: true, kind: 'document' };
}

export function formatAttachmentSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function shouldUseNativeCamera(nav: Pick<Navigator, 'maxTouchPoints' | 'userAgent'>, coarsePointer = false): boolean {
  return coarsePointer || nav.maxTouchPoints > 0 || /Android|iPhone|iPad|iPod/i.test(nav.userAgent);
}

export function cameraFailureKind(error: { name?: string } | null | undefined): 'denied' | 'error' {
  return error?.name === 'NotAllowedError' || error?.name === 'SecurityError' ? 'denied' : 'error';
}
