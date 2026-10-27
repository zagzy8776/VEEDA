// On-device package OCR via Tesseract.js.
//
// Images never leave the device here. Low-confidence words are marked uncertain;
// callers must not guess missing fields — ask the user to confirm or type them.

import { parseMedicineLabel, type MedicineLabel } from './medicineIntelligence.ts';

export interface OcrWord {
  text: string;
  confidence: number;
}

export interface OcrResult {
  rawText: string;
  meanConfidence: number;
  words: OcrWord[];
  /** True when overall OCR quality is too low to trust without confirmation. */
  uncertain: boolean;
  label: MedicineLabel;
  /** Field keys that should be highlighted for user confirmation. */
  uncertainFields: Array<keyof MedicineLabel>;
}

const MEAN_CONFIDENCE_FLOOR = 65;
const WORD_CONFIDENCE_FLOOR = 55;

export function assessOcrUncertainty(
  rawText: string,
  meanConfidence: number,
  words: OcrWord[],
): Pick<OcrResult, 'uncertain' | 'label' | 'uncertainFields'> {
  const label = parseMedicineLabel(rawText);
  const uncertainFields: Array<keyof MedicineLabel> = [];
  const lowWords = words.filter(w => w.confidence < WORD_CONFIDENCE_FLOOR && w.text.trim().length > 1);
  const overallUncertain = meanConfidence < MEAN_CONFIDENCE_FLOOR || rawText.trim().length < 6;

  if (!label.name || overallUncertain || lowWords.some(w => label.name && w.text.toLowerCase().includes(label.name.split(/\s+/)[0].toLowerCase()))) {
    if (!label.name || overallUncertain) uncertainFields.push('name');
  }
  if (!label.strength || overallUncertain) uncertainFields.push('strength');
  if (label.form === 'unknown' || overallUncertain) uncertainFields.push('form');
  if (!label.manufacturer) uncertainFields.push('manufacturer');
  if (!label.batch) uncertainFields.push('batch');
  if (!label.expiry || overallUncertain) uncertainFields.push('expiry');

  // Deduplicate while preserving order.
  const unique = [...new Set(uncertainFields)];
  return {
    uncertain: overallUncertain || unique.includes('name') || unique.includes('strength'),
    label,
    uncertainFields: unique,
  };
}

/**
 * Run Tesseract on an image File/Blob. Dynamic-import keeps the OCR chunk
 * off the critical path until the user picks a package photo.
 */
export async function recognizePackageImage(
  image: File | Blob | string,
  options?: { onProgress?: (progress: number) => void },
): Promise<OcrResult> {
  const Tesseract = await import('tesseract.js');
  const result = await Tesseract.recognize(image, 'eng', {
    logger: (m: { status?: string; progress?: number }) => {
      if (m.status === 'recognizing text' && typeof m.progress === 'number') {
        options?.onProgress?.(m.progress);
      }
    },
  });

  const data = result.data as {
    text?: string;
    confidence?: number;
    words?: Array<{ text?: string; confidence?: number }>;
  };
  const rawText = String(data.text ?? '').trim();
  const meanConfidence = typeof data.confidence === 'number' ? data.confidence : 0;
  const words: OcrWord[] = (data.words ?? [])
    .filter(w => typeof w.text === 'string')
    .map(w => ({ text: String(w.text), confidence: typeof w.confidence === 'number' ? w.confidence : 0 }));

  const assessed = assessOcrUncertainty(rawText, meanConfidence, words);
  return {
    rawText,
    meanConfidence,
    words,
    ...assessed,
  };
}
