// Food safety (Phase 4).
//
// Five pieces, all fail-safe:
//
//   1. NAFDAC / barcode lookup — a CLIENT over a configured partner source. With
//      no source configured every lookup returns "unknown"; it never guesses a
//      product is safe or unsafe.
//   2. Label reading (OCR capture) — the capture + expiry PARSING ship now; the
//      OCR model itself is a registry slot (not validated => no reading).
//   3. Spoilage detection — a DISABLED registry slot; there is no model.
//   4. Crowd reports — user reports are clearly labelled UNVERIFIED, go through
//      moderation, and carry abuse controls + privacy rules.
//   5. Chemical test-strip guidance — the UI and pack interpretation ship; the
//      colour charts/thresholds come from a pack.

import { lookupModel, notValidatedLabel, type ModelRegistry } from './modelRegistry.ts';
import { validateContentPack, type ContentPackMeta } from './contentPack.ts';

export type ProductVerdict = 'unknown' | 'registered' | 'not_found' | 'recalled';

export interface ProductLookup {
  verdict: ProductVerdict;
  /** Only present when a configured source returned it. */
  name?: string;
  authority?: string;
  /** Plain explanation for the user. */
  note: string;
}

export interface PartnerSource {
  /** The configured partner endpoint/id, or empty when none is configured. */
  endpoint: string;
  /** The caller-supplied fetch, so this stays testable and dependency-free. */
  fetchImpl?: typeof fetch;
}

/**
 * Look up a barcode/NAFDAC number. With no configured partner source it returns
 * "unknown" — never a made-up registration status.
 */
export async function lookupProduct(code: string, source: PartnerSource): Promise<ProductLookup> {
  if (!source.endpoint || !source.fetchImpl) {
    return { verdict: 'unknown', note: 'No product-data source is configured, so this product is unknown.' };
  }
  try {
    const response = await source.fetchImpl(`${source.endpoint}?code=${encodeURIComponent(code)}`);
    if (!response.ok) {
      return { verdict: 'unknown', note: 'The product-data source did not answer, so this product is unknown.' };
    }
    const data = await response.json() as Partial<ProductLookup> & { verdict?: string };
    const allowed: ProductVerdict[] = ['unknown', 'registered', 'not_found', 'recalled'];
    const verdict = allowed.includes(data.verdict as ProductVerdict) ? data.verdict as ProductVerdict : 'unknown';
    return { verdict, name: data.name, authority: data.authority, note: 'From the configured product-data source.' };
  } catch {
    return { verdict: 'unknown', note: 'The product-data source could not be reached, so this product is unknown.' };
  }
}

/** Parse an expiry date from OCR'd label text. Returns an ISO date or null. */
export function parseExpiry(text: string): string | null {
  const iso = text.match(/(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (iso) return `${iso[1]}-${iso[2].padStart(2, '0')}-${iso[3].padStart(2, '0')}`;
  const monthYear = text.match(/\b(\d{1,2})[-/.](\d{4})\b/);
  if (monthYear) {
    const month = Number(monthYear[1]);
    if (month >= 1 && month <= 12) {
      // Only month + year are shown, so the day is not knowable; return the first
      // of the month and let the caller present it as month/year.
      return `${monthYear[2]}-${String(month).padStart(2, '0')}-01`;
    }
  }
  return null;
}

export type ExpiryStatus = 'expired' | 'soon' | 'ok' | 'unknown';

/** Classify an expiry date. The "soon" window is configuration, not clinical. */
export function expiryStatus(expiry: string | null, soonDays = 30, now: Date = new Date()): ExpiryStatus {
  if (!expiry) return 'unknown';
  const time = Date.parse(expiry);
  if (Number.isNaN(time)) return 'unknown';
  const days = Math.floor((time - now.getTime()) / 86_400_000);
  if (days < 0) return 'expired';
  if (days <= soonDays) return 'soon';
  return 'ok';
}

/** The spoilage-detection slot. There is no model, so this is always disabled. */
export function spoilageState(registry: ModelRegistry) {
  const look = lookupModel(registry, 'spoilage');
  if (!look.available) return { available: false as const, label: notValidatedLabel() };
  return { available: true as const, version: look.version };
}

export interface CrowdReport {
  id: string;
  /** Free-text the user typed. Never presented as verified. */
  text: string;
  reportedAt: string;
  /** Moderation state. Only 'approved' reports are shown to others. */
  moderation: 'pending' | 'approved' | 'rejected';
}

/** The mandatory label on every crowd report. */
export const CROWD_REPORT_LABEL = 'Unverified — reported by another user, not checked by VEEDA.';

/** Only approved reports are visible, and each carries the unverified label. */
export function visibleCrowdReports(reports: CrowdReport[]): CrowdReport[] {
  return reports.filter(r => r.moderation === 'approved');
}

/**
 * Abuse controls: a simple per-user rate gate. Configuration, not content, so it
 * protects the crowd-report feature from spam without inventing anything.
 */
export function maySubmitReport(recent: string[], now: Date, minIntervalMs = 60_000): boolean {
  if (recent.length === 0) return true;
  const last = Math.max(...recent.map(t => Date.parse(t)).filter(t => !Number.isNaN(t)));
  return Number.isNaN(last) ? true : now.getTime() - last >= minIntervalMs;
}

/** Test-strip guidance: the chart/thresholds come from a pack, never here. */
export interface StripGuidance {
  meta: ContentPackMeta;
  entries: { id: string; colour: string; meaning: string }[];
}

export function loadStripGuidance(raw: unknown, options: { production?: boolean } = {}) {
  const base = validateContentPack<unknown[]>(raw, { production: options.production, label: 'test-strip pack' });
  if (base.ok === false) return { ok: false as const, reason: base.reason };
  const entries: StripGuidance['entries'] = [];
  for (const entry of base.pack.entries) {
    const e = entry as Record<string, unknown>;
    if (typeof e?.id !== 'string' || typeof e?.colour !== 'string' || typeof e?.meaning !== 'string') {
      return { ok: false as const, reason: 'test-strip pack contains an invalid entry' };
    }
    entries.push({ id: e.id, colour: e.colour, meaning: e.meaning });
  }
  return { ok: true as const, pack: { meta: base.pack.meta, entries } };
}
