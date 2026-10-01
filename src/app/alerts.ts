// Alert framework shared by every Phase 1 alert source (weather, air quality,
// fire, barometer, battery, home-safety kit).
//
// Two hard rules, both enforced by tests:
//
//   1. Alert WORDING is content. It is never written here. Every alert message,
//      advisory and reminder is read from a validated content pack. When a pack
//      is missing/unreviewed the alert is "unavailable", never a guess.
//   2. Only TRUSTED data raises an alert. A weather/air/fire alert must carry a
//      source that is on the trusted list for its kind, and the fire/smoke/CO
//      kinds may only come from a real alarm or a trusted feed — never a phone
//      guess.
//
// This module is pure so it can be unit tested without a DOM or network.

import { validateContentPack, type ContentPackMeta } from './contentPack.ts';

export type AlertKind =
  | 'weather'      // heat index, rain, storm, national warnings
  | 'air_quality'  // AQI, harmattan/dust
  | 'fire'         // NASA FIRMS / fire service
  | 'disease'      // rainy-season malaria/cholera reminders
  | 'barometer'    // phone barometer reading
  | 'battery'      // phone battery-temperature warning
  | 'home_safety'; // Bluetooth kit: temperature, smoke, CO (real alarms only)

export type AlertSeverity = 'info' | 'advisory' | 'warning' | 'danger';

/** Where an alert's data came from. Only trusted sources may raise fire/smoke/CO. */
export type AlertSource =
  | 'trusted_feed'     // an official/verified data feed (weather service, FIRMS, AQI)
  | 'device_sensor'    // an on-device sensor (barometer, battery thermometer)
  | 'paired_alarm'     // a real smoke/CO/temperature alarm paired over Bluetooth
  | 'phone_guess';     // NEVER allowed to raise fire/smoke/CO

export interface AlertRule {
  id: string;
  kind: AlertKind;
  /** Human-readable pack wording; the ONLY place message text may live. */
  message: string;
  severity: AlertSeverity;
  /** Sources allowed to raise this rule. */
  allowedSources: AlertSource[];
  /** Optional plain next-step wording from the same reviewed pack. */
  advice?: string;
}

export interface SessionAlert {
  id: string;
  kind: AlertKind;
  severity: AlertSeverity;
  message: string;
  advice?: string;
  source: AlertSource;
  /** Provenance of the pack the wording came from. */
  reviewedBy: ContentPackMeta;
  raisedAt: string;
}

export type PanelState =
  | { status: 'ok'; alerts: SessionAlert[] }
  | { status: 'unavailable'; reason: string };

// The trusted-source policy. Fire, smoke and CO are the dangerous ones: they may
// only be raised by a trusted feed or a real paired alarm. A phone "guess" is
// never trusted for them.
export const KIND_TRUSTED_SOURCES: Record<AlertKind, AlertSource[]> = {
  weather: ['trusted_feed'],
  air_quality: ['trusted_feed'],
  fire: ['trusted_feed', 'paired_alarm'],
  disease: ['trusted_feed'],
  barometer: ['device_sensor'],
  battery: ['device_sensor'],
  home_safety: ['paired_alarm', 'device_sensor'],
};

const NEVER_GUESS_KINDS: AlertKind[] = ['fire', 'home_safety'];

const ALL_SOURCES: AlertSource[] = ['trusted_feed', 'device_sensor', 'paired_alarm', 'phone_guess'];

function isValidRule(value: unknown): value is AlertRule {
  if (!value || typeof value !== 'object') return false;
  const r = value as Record<string, unknown>;
  if (typeof r.id !== 'string' || !r.id.trim()) return false;
  if (typeof r.kind !== 'string') return false;
  if (!(r.kind in KIND_TRUSTED_SOURCES)) return false;
  if (typeof r.message !== 'string' || !r.message.trim()) return false;
  if (typeof r.severity !== 'string') return false;
  if (!Array.isArray(r.allowedSources) || r.allowedSources.length === 0) return false;
  return r.allowedSources.every(s => typeof s === 'string' && (ALL_SOURCES as string[]).includes(s));
}

/** Validate a raw alert pack: shared meta plus an `entries` array of alert rules. */
export function loadAlertPack(raw: unknown, options: { production?: boolean } = {}) {
  const validated = validateContentPack<unknown[]>(raw, {
    production: options.production,
    label: 'alert pack',
  });
  if (validated.ok === false) return { ok: false as const, reason: validated.reason };

  const rules: AlertRule[] = [];
  for (const entry of validated.pack.entries) {
    if (!isValidRule(entry)) {
      return { ok: false as const, reason: 'alert pack contains an invalid rule entry' };
    }
    rules.push(entry);
  }
  return { ok: true as const, pack: { meta: validated.pack.meta, rules } };
}

/** True when a source may raise this kind — the fire/smoke/CO guard. */
export function isSourceTrusted(kind: AlertKind, source: AlertSource): boolean {
  const trusted = KIND_TRUSTED_SOURCES[kind] ?? [];
  if (source === 'phone_guess') return false;
  if (NEVER_GUESS_KINDS.includes(kind) && source !== 'trusted_feed' && source !== 'paired_alarm') return false;
  return trusted.includes(source);
}

/**
 * Raise a session alert from a rule, given the source that triggered it.
 * Returns null when the source is not trusted for that kind, so a phone guess
 * can never be turned into a fire/smoke/CO warning.
 */
export function raiseAlert(
  rule: AlertRule,
  source: AlertSource,
  meta: ContentPackMeta,
  now: Date = new Date(),
): SessionAlert | null {
  const allowedByRule = rule.allowedSources.includes(source);
  if (!allowedByRule || !isSourceTrusted(rule.kind, source)) return null;
  return {
    id: rule.id,
    kind: rule.kind,
    severity: rule.severity,
    message: rule.message,
    advice: rule.advice,
    source,
    reviewedBy: meta,
    raisedAt: now.toISOString(),
  };
}

/**
 * Build the panel state for a set of triggered rules. When the pack is missing
 * or unreviewed the panel is "unavailable" (fail safe), never blank and never a
 * reassuring all-clear.
 */
export function buildAlertPanel(
  rawPack: unknown,
  triggered: { ruleId: string; source: AlertSource }[],
  options: { production?: boolean; now?: Date } = {},
): PanelState {
  const loaded = loadAlertPack(rawPack, { production: options.production });
  if (loaded.ok === false) {
    return { status: 'unavailable', reason: 'alerts are not available: no approved alert pack is loaded' };
  }
  const alerts: SessionAlert[] = [];
  for (const t of triggered) {
    const rule = loaded.pack.rules.find(r => r.id === t.ruleId);
    if (!rule) continue;
    const alert = raiseAlert(rule, t.source, loaded.pack.meta, options.now);
    if (alert) alerts.push(alert);
  }
  return { status: 'ok', alerts };
}
