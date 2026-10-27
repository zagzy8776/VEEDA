// Structured visual observations — must only contain what is VISIBLE.
// Never infer diagnosis from observations. Confidence/uncertainty required.

export type ObservationType =
  | 'object'
  | 'subject'
  | 'readable_text'
  | 'visible_measurement'
  | 'visual_finding'
  | 'hypothesis'
  | 'other';

export interface VisualObservation {
  id: string;
  type: ObservationType;
  /** Plain description of what is visible — no diagnosis. */
  description: string;
  confidence: number; // 0-1
  uncertain: boolean;
  source: 'vision' | 'ocr';
  attachmentRef?: string;
  timestamp: string;
}

export type MeasurementSourceKind =
  | 'image_printed_text'
  | 'photograph_inference'
  | 'validated_device'
  | 'patient_reported';

export interface ObservedMeasurement {
  label: string;
  value: string;
  unit?: string;
  confidence: number;
  sourceKind: MeasurementSourceKind;
  clinicallyValidated: boolean;
}

export interface StructuredVisualReport {
  observations: VisualObservation[];
  /** Raw readable text extracted by vision/OCR if any. */
  readableText: string[];
  visibleMeasurements: ObservedMeasurement[];
  /** Uncertainty notes — must be explicit when confidence is low. */
  uncertainty: string[];
  /** Metadata about what processed the image. */
  processor: { type: 'vision' | 'ocr'; provider?: string; model?: string };
  attachmentRef?: string;
  timestamp: string;
}

function makeId(): string {
  return `vo_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function isHypothesis(line: string): boolean {
  const lower = line.toLowerCase();
  if (lower.startsWith('possible') || lower.startsWith('could be') || lower.startsWith('might be') || lower.startsWith('likely')) return true;
  if (lower.includes('explanation') || lower.includes('hypothesis')) return true;
  if (lower.includes('appears to be') || lower.includes('seems to be')) return true;
  return false;
}

function isReadableText(line: string): boolean {
  const lower = line.toLowerCase();
  if (lower.includes('text') && (lower.includes('read') || lower.includes('says') || lower.includes('label'))) return true;
  if (lower.match(/\b(label|expiry|exp|batch|lot|serial|barcode|manufacturer|ingredients|dosage|directions)\b/)) return true;
  if (/^[A-Z0-9][A-Z0-9\s\-\.,:()\/]{3,}$/.test(line) && line.length > 4) return true;
  if (lower.match(/\b(paracetamol|acetaminophen|ibuprofen|aspirin|mg|ml|tablet|capsule|batch|exp)\b/)) return true;
  return false;
}

function extractMeasurement(line: string): { label: string; value: string; unit?: string } | null {
  const m = line.match(/\b([a-zA-Z][a-zA-Z\s]{2,20})\s*:?\s*(\d+(?:\.\d+)?)\s*(mg|g|ml|mcg|iu|%|units?)\b/i);
  if (m) {
    return { label: m[1].trim(), value: m[2], unit: m[3].toLowerCase() };
  }
  return null;
}

export function parseVisionResponseText(text: string, processor?: { type: 'vision' | 'ocr'; provider?: string; model?: string }): StructuredVisualReport {
  const now = new Date().toISOString();
  const trimmed = typeof text === 'string' ? text.trim() : '';
  if (!trimmed) {
    return {
      observations: [],
      readableText: [],
      visibleMeasurements: [],
      uncertainty: ['No structured observations returned by vision processor.'],
      processor: processor || { type: 'vision' },
      timestamp: now,
    };
  }

  const lines = trimmed.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  const observations: VisualObservation[] = [];
  const readableText: string[] = [];
  const visibleMeasurements: ObservedMeasurement[] = [];
  const uncertainty: string[] = [];

  for (const line of lines) {
    if (line.length < 3) continue;

    // A numeric hypothesis remains an inference; never promote it to a visible
    // or clinically validated measurement merely because it contains a unit.
    if (isHypothesis(line)) {
      observations.push({
        id: makeId(),
        type: 'hypothesis',
        description: line,
        confidence: 0.3,
        uncertain: true,
        source: processor?.type || 'vision',
        timestamp: now,
      });
      uncertainty.push(`Hypothesis noted (not a direct observation): ${line}`);
      continue;
    }

    const measurement = extractMeasurement(line);
    if (measurement) {
      visibleMeasurements.push({
        ...measurement,
        confidence: 0.7,
        sourceKind: 'image_printed_text',
        clinicallyValidated: false,
      });
      readableText.push(line);
      observations.push({
        id: makeId(),
        type: 'visible_measurement',
        description: line,
        confidence: 0.7,
        uncertain: false,
        source: processor?.type || 'vision',
        timestamp: now,
      });
      continue;
    }

    if (isReadableText(line)) {
      readableText.push(line);
      observations.push({
        id: makeId(),
        type: 'readable_text',
        description: line,
        confidence: 0.75,
        uncertain: false,
        source: processor?.type || 'vision',
        timestamp: now,
      });
      continue;
    }

    observations.push({
      id: makeId(),
      type: 'visual_finding',
      description: line,
      confidence: 0.5,
      uncertain: true,
      source: processor?.type || 'vision',
      timestamp: now,
    });
  }

  if (observations.length === 0) {
    uncertainty.push('Unable to extract structured visible observations.');
  }

  return {
    observations,
    readableText,
    visibleMeasurements,
    uncertainty,
    processor: processor || { type: 'vision' },
    timestamp: now,
  };
}

export function formatVisionReportForChat(report: StructuredVisualReport): string {
  const parts: string[] = [];
  parts.push('I analyzed the image and can report only what is visible (no diagnosis):');

  const visibleFindings = report.observations.filter(o => o.type === 'visual_finding' || o.type === 'object' || o.type === 'subject');
  if (visibleFindings.length > 0) {
    parts.push('\nVisible findings:');
    for (const f of visibleFindings) {
      parts.push(`- ${f.description}`);
    }
  }

  if (report.readableText.length > 0) {
    parts.push('\nReadable text (transcribed):');
    for (const t of report.readableText) {
      parts.push(`- ${t}`);
    }
  }

  if (report.visibleMeasurements.length > 0) {
    parts.push('\nNumbers printed in the image (transcribed; not a validated device measurement):');
    for (const m of report.visibleMeasurements) {
      parts.push(`- ${m.label}: ${m.value}${m.unit ? ' ' + m.unit : ''}`);
    }
  }

  const hypotheses = report.observations.filter(o => o.type === 'hypothesis');
  if (hypotheses.length > 0) {
    parts.push('\nPossible explanations (hypotheses, not facts):');
    for (const h of hypotheses) {
      parts.push(`- ${h.description}`);
    }
  }

  if (report.uncertainty.length > 0) {
    parts.push('\nUncertainty:');
    for (const u of report.uncertainty.slice(0, 3)) {
      parts.push(`- ${u}`);
    }
  }

  if (report.processor?.provider && report.processor?.model) {
    parts.push(`\n(Source: ${report.processor.provider} / ${report.processor.model})`);
  }

  parts.push('\nIf you have a specific question about this image, tell me what you need to know. I cannot diagnose or prescribe.');
  return parts.join('\n');
}
