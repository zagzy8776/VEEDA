// Vision provider/model allowlist — ONLY list providers/models that ACTUALLY support image input.
// This list is empty by design until a verified vision-capable provider is configured.
// NEVER add a text-only model here. Never fake vision support.
//
// VisionCapabilityState:
// - AVAILABLE: a validated vision-capable provider+model is configured and ready
// - NOT_CONFIGURED: no vision-capable provider configured (current safe default)
// - UNSUPPORTED_MODEL: configured model does not support images
// - PROVIDER_UNAVAILABLE: provider configured but unreachable/down
// - PERMISSION_DENIED: camera/media permission denied
// - PROCESSING: image is being processed
// - FAILED: vision processing failed (must not fabricate results)

export type VisionCapabilityState =
  | 'AVAILABLE'
  | 'NOT_CONFIGURED'
  | 'UNSUPPORTED_MODEL'
  | 'PROVIDER_UNAVAILABLE'
  | 'PERMISSION_DENIED'
  | 'PROCESSING'
  | 'FAILED';

export interface VisionProviderEntry {
  providerName: string;
  model: string;
  /** Must be true only if the provider/model actually accepts image_url/image parts. */
  supportsImageInput: true;
  /** API format for image input (e.g., 'openai_vision'). */
  imageFormat: 'openai_vision';
}

const VISION_ALLOWLIST: VisionProviderEntry[] = [
  // Intentionally empty — no validated vision-capable provider is configured.
  // To activate real vision, add a verified entry AND set the matching API key
  // in the backend .env. The allowlist alone is NOT sufficient: the backend
  // must also have a working key, checked at runtime via /api/vision/status.
  //
  // Example entry for OpenAI gpt-4o (vision-capable). Set OPENAI_API_KEY in .env.
  // { providerName: 'openai', model: 'gpt-4o', supportsImageInput: true, imageFormat: 'openai_vision' },
];

export function getVisionAllowlist(): readonly VisionProviderEntry[] {
  return VISION_ALLOWLIST;
}

export function isVisionCapableProvider(providerName: string, model: string): boolean {
  const name = providerName.trim().toLowerCase();
  const m = model.trim();
  return VISION_ALLOWLIST.some(
    (entry) => entry.providerName.toLowerCase() === name && entry.model === m && entry.supportsImageInput === true,
  );
}

export function resolveVisionState(params: {
  hasVisionProvider: boolean;
  providerName?: string | null;
  model?: string | null;
  permissionDenied?: boolean;
  processing?: boolean;
  failed?: boolean;
  providerDown?: boolean;
}): VisionCapabilityState {
  if (params.processing) return 'PROCESSING';
  if (params.failed) return 'FAILED';
  if (params.permissionDenied) return 'PERMISSION_DENIED';
  if (params.providerDown) return 'PROVIDER_UNAVAILABLE';
  if (!params.hasVisionProvider) return 'NOT_CONFIGURED';

  if (params.providerName && params.model) {
    if (isVisionCapableProvider(params.providerName, params.model)) {
      return 'AVAILABLE';
    }
    return 'UNSUPPORTED_MODEL';
  }
  // Provider exists but not in allowlist — do NOT guess, treat as unsupported
  return 'UNSUPPORTED_MODEL';
}

export function visionStateLabel(state: VisionCapabilityState): string {
  switch (state) {
    case 'AVAILABLE':
      return 'Vision available (validated)';
    case 'NOT_CONFIGURED':
      return 'No validated vision model configured';
    case 'UNSUPPORTED_MODEL':
      return 'Configured model does not support images';
    case 'PROVIDER_UNAVAILABLE':
      return 'Vision provider unavailable';
    case 'PERMISSION_DENIED':
      return 'Camera permission denied';
    case 'PROCESSING':
      return 'Processing image';
    case 'FAILED':
      return 'Vision processing failed';
  }
}
