// Opt-in research export for rPPG validation.
//
// This is OFF by default and is NOT shown to normal users. It exists so queued
// researchers can capture the exact RGB traces the estimator consumes and feed
// them to backend/tools/validate-rppg.mjs (see
// backend/tools/README-rppg-validation.md and docs/RPPG_VALIDATION_PROTOCOL.md).
//
// Privacy guarantees, enforced by construction:
//   - No video or images are stored or uploaded — only averaged R/G/B numbers.
//   - No name, email, account id, or device id is ever written to the file.
//   - The CSV is built in memory and offered as a local download; it is never
//     sent to a server. The file stays on the device until the person shares it.
//   - A consent notice must be acknowledged before any file is created.
//
// The CSV builder is a pure function so it can be unit-tested without a DOM.

export interface RgbSample { r: number; g: number; b: number; }

export const RPPG_CSV_HEADER = 't_ms,r,g,b';

// Compile-time flag. Unset/unknown => disabled. Vite inlines VITE_* at build.
export function isRppgResearchEnabled(): boolean {
  try {
    const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env;
    return env?.VITE_RPPG_RESEARCH === '1';
  } catch {
    return false;
  }
}

// Rounds to a stable, compact number of decimals without scientific notation so
// the file is byte-comparable across platforms and matches the harness reader.
function fmt(n: number): string {
  if (!Number.isFinite(n)) return '0';
  return (Math.round(n * 1000) / 1000).toString();
}

/**
 * Build the research CSV for a captured trace.
 *
 * Format matches backend/tools/README-rppg-validation.md:
 *   header row: t_ms,r,g,b
 *   one row per frame with milliseconds since capture start and the mean
 *   channel values (0-255) for that frame.
 *
 * No identifiers of any kind are included — only the numeric trace.
 */
export function buildRppgCsv(rgb: readonly RgbSample[], timestamps: readonly number[]): string {
  const n = Math.min(rgb.length, timestamps.length);
  const lines: string[] = [RPPG_CSV_HEADER];
  // Normalise timestamps to start at 0 ms (relative), which the harness and the
  // estimator both expect; absolute epoch values are irrelevant to the analysis.
  const base = n > 0 ? timestamps[0] : 0;
  for (let i = 0; i < n; i++) {
    const t = Math.round(timestamps[i] - base);
    const s = rgb[i];
    lines.push(`${t},${fmt(s.r)},${fmt(s.g)},${fmt(s.b)}`);
  }
  return lines.join('\n') + '\n';
}

// The exact consent text the UI must display and the user must acknowledge
// before a file is created. Kept here so the UI and tests share one source.
export const RPPG_EXPORT_CONSENT =
  'This saves a text file of camera colour numbers (red, green, blue per frame) to your device. ' +
  'It contains no video, no images, and no name or account details. ' +
  'Nothing is uploaded — the file stays on your device until you choose to share it. ' +
  'Use it only for approved research.';

/**
 * Build the CSV and trigger a local browser download. Nothing is uploaded.
 * Callers MUST have shown RPPG_EXPORT_CONSENT and received acknowledgement first.
 */
export function downloadRppgCsv(rgb: readonly RgbSample[], timestamps: readonly number[]): void {
  const csv = buildRppgCsv(rgb, timestamps);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  // Timestamp-based name only — no subject/account identifier.
  a.download = `rppg-trace-${new Date().toISOString().replace(/[:.]/g, '-')}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
