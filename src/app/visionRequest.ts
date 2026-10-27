export interface VisionAnalyzePayload {
  image: { data: string; mimeType: string; ocrText?: string };
  message: string;
  history: Array<{ role: 'user' | 'assistant'; content: string }>;
}

/** Keep the user's question primary; OCR is separate supporting evidence. */
export function buildVisionAnalyzePayload(params: {
  base64: string;
  mimeType: string;
  ocrText?: string;
  question: string;
  history?: Array<{ role: 'user' | 'assistant'; content: string }>;
}): VisionAnalyzePayload {
  return {
    image: {
      data: params.base64,
      mimeType: params.mimeType,
      ...(params.ocrText?.trim() ? { ocrText: params.ocrText.trim() } : {}),
    },
    message: params.question,
    history: params.history ?? [],
  };
}
