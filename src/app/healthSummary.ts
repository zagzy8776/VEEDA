// On-device health summary export.
//
// This module builds a self-contained printable HTML document from the user's
// own readings. It contains NO diagnosis, NO category labels, and no medical
// advice. Every value carries its source (camera estimate vs typed in) and the
// document states plainly that it is self-recorded. The user chooses which
// sections to include. Generation is pure and testable; converting to PDF is a
// browser print (Save as PDF), so nothing leaves the device.

export type SectionId = 'vitals' | 'bp_glucose' | 'medications' | 'notes';

export interface SummaryValue {
  label: string;
  /** Already-formatted display string, e.g. "72 bpm" or "128/82 mmHg". */
  value: string;
  /** Where the number came from. */
  source: 'camera_estimate' | 'typed_in' | 'device' | 'unknown';
  /** ISO timestamp of the reading, when known. */
  recordedAt?: string | null;
}

export interface SummarySection {
  id: SectionId;
  title: string;
  values: SummaryValue[];
}

export interface HealthSummaryInput {
  /** ISO timestamp for the "generated on" line. */
  generatedAt: string;
  sections: SummarySection[];
}

export const SUMMARY_HEADLINE = 'Self-recorded health summary';
export const SUMMARY_DISCLAIMER =
  'These readings were recorded by the person themselves using this app. This is not a diagnosis and not a medical record. It has not been checked by a clinician.';

export const SOURCE_LABEL: Record<SummaryValue['source'], string> = {
  camera_estimate: 'Camera estimate',
  typed_in: 'Typed in',
  device: 'Device',
  unknown: 'Source not recorded',
};

// Only include sections the user explicitly selected, and never emit a section
// that has no values (an empty heading would imply data we do not have).
export function selectSections(sections: SummarySection[], chosen: SectionId[]): SummarySection[] {
  return sections.filter((section) => chosen.includes(section.id) && section.values.length > 0);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toISOString().slice(0, 10);
}

/**
 * A neutral, date-stamped filename with no personal name and no health terms,
 * so a saved file does not reveal who it belongs to or what it contains.
 */
export function summaryFilename(generatedAt: string): string {
  return `health-summary-${formatDate(generatedAt)}.pdf`;
}

function renderValue(value: SummaryValue): string {
  const source = SOURCE_LABEL[value.source] ?? SOURCE_LABEL.unknown;
  const when = value.recordedAt ? formatDate(value.recordedAt) : null;
  const meta = when ? `${source} · ${when}` : source;
  return `<li><span class="v">${escapeHtml(value.value)}</span> <span class="l">${escapeHtml(value.label)}</span><span class="s">${escapeHtml(meta)}</span></li>`;
}

export function buildHealthSummaryHtml(input: HealthSummaryInput, chosen: SectionId[]): string {
  const sections = selectSections(input.sections, chosen);
  const body = sections
    .map(
      (section) =>
        `<section><h2>${escapeHtml(section.title)}</h2><ul>${section.values.map(renderValue).join('')}</ul></section>`,
    )
    .join('');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(SUMMARY_HEADLINE)}</title>
<style>
  body { font-family: system-ui, sans-serif; margin: 32px; color: #111; }
  h1 { font-size: 20px; margin: 0 0 4px; }
  h2 { font-size: 15px; margin: 20px 0 8px; }
  .disclaimer { background: #f2f2f2; border: 1px solid #ccc; padding: 10px 12px; font-size: 12px; line-height: 1.5; }
  .meta { color: #555; font-size: 12px; margin: 6px 0 0; }
  ul { list-style: none; padding: 0; margin: 0; }
  li { padding: 6px 0; border-bottom: 1px solid #eee; font-size: 13px; }
  .v { font-weight: 600; }
  .l { color: #333; }
  .s { display: block; color: #666; font-size: 11px; margin-top: 2px; }
</style>
</head>
<body>
  <h1>${escapeHtml(SUMMARY_HEADLINE)}</h1>
  <p class="meta">Generated on ${escapeHtml(formatDate(input.generatedAt))}</p>
  <p class="disclaimer">${escapeHtml(SUMMARY_DISCLAIMER)}</p>
  ${body || '<p class="meta">No sections were selected.</p>'}
</body>
</html>`;
}
