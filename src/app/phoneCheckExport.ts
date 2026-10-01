// Validation trace export for phone checks (Phase 5).
//
// A capture is exported as a plain CSV so a validated laboratory can later judge
// it. This NEVER contains a VEEDA result — only the raw trace and the capture
// metadata — so the export is honest even while every check is "not yet validated".
//
// The export is opt-in: `isPhoneCheckExportEnabled()` must be true (the existing
// research flag) and the caller must have the user's consent.

import { isRppgResearchEnabled } from './rppgResearchExport.ts';

export interface TraceFrame {
  /** Milliseconds since capture start. */
  tMs: number;
  /** Channel values, e.g. { r, g, b } or { lum }. */
  channels: Record<string, number>;
}

export const PHONE_CHECK_EXPORT_HEADER_NOTE =
  'Raw capture trace for validation only. This file contains no VEEDA result and no diagnosis.';

/** True when research export is enabled for this build. */
export function isPhoneCheckExportEnabled(): boolean {
  return isRppgResearchEnabled();
}

/**
 * Build a CSV of a capture trace. Column order is t_ms first, then the sorted
 * channel keys, so the file is stable for a validation pipeline.
 */
export function buildTraceCsv(checkId: string, frames: readonly TraceFrame[]): string {
  const channelKeys = Array.from(
    new Set(frames.flatMap(f => Object.keys(f.channels))),
  ).sort();
  const header = `# check=${checkId}\n# ${PHONE_CHECK_EXPORT_HEADER_NOTE}\nt_ms,${channelKeys.join(',')}`;
  const rows = frames.map(f => [
    f.tMs,
    ...channelKeys.map(k => (typeof f.channels[k] === 'number' ? f.channels[k] : '')),
  ].join(','));
  return [header, ...rows].join('\n');
}

/** Trigger a browser download of the trace CSV. No-op when export is disabled. */
export function downloadTraceCsv(checkId: string, frames: readonly TraceFrame[]): void {
  if (!isPhoneCheckExportEnabled()) return;
  const blob = new Blob([buildTraceCsv(checkId, frames)], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `veeda-${checkId}-trace.csv`;
  link.click();
  URL.revokeObjectURL(url);
}
