// Feature flags for capabilities that must NEVER be silently on.
//
// Anything that can cause harm if it is enabled without the outside data it
// needs (a licensed drug database, a staffed clinician review queue, a verified
// hotline, a validated model, a configured care partner) is gated here. The rule
// is simple and enforced by tests:
//
//   - In PRODUCTION every gated flag DEFAULTS TO OFF, no matter what.
//   - A flag can only be turned on in production when the caller supplies BOTH
//     an explicit "on" value AND a non-empty `configured` proof (the thing that
//     makes it safe). A missing proof means the flag stays off and the feature
//     shows a plain "not available" state.
//   - In development a flag may be on by default so the framework can be
//     exercised, and the UI must still label the feature clearly.
//
// This module is pure (no React, no storage) so it is trivial to unit test and
// impossible to bypass by forgetting to read an env var in one place.

export type FeatureFlag =
  | 'prescribing'          // Tiered prescription structure — OFF until a licensed drug DB + review queue + scope doc exist.
  | 'mentalHealthCrisis'   // Crisis referral — OFF until a reviewed pack with verified numbers exists.
  | 'carePartnerBooking'   // Booking a real clinician — OFF until a partner is configured.
  | 'partnerPricesStock'   // Lab/pharmacy prices and stock — OFF until a partner source is configured.
  | 'modelInference'       // Any trained-model output (Phase 5 checks) — OFF until a validated model + thresholds exist.
  | 'clinicianReviewQueue'; // Server review queue — OFF until roles/SLA are staffed.

export interface FlagContext {
  /** True in a production build/deployment. */
  production: boolean;
  /**
   * Proof that the outside data the feature needs is actually configured, e.g.
   * a partner id, a reviewed pack id, a validated model version. An empty/absent
   * value means "not configured" and forces the flag off in production.
   */
  configured?: boolean | string | null;
  /** Explicit override (e.g. from an env var). Only "on" can enable. */
  requested?: boolean;
}

export type FlagState = { enabled: boolean; reason: string };

function isConfigured(value: FlagContext['configured']): boolean {
  if (value == null) return false;
  if (typeof value === 'boolean') return value;
  return value.trim() !== '';
}

/**
 * Resolve a flag. Fails safe: production requires an explicit "on" request AND a
 * configuration proof; anything else resolves to disabled with a plain reason.
 */
export function resolveFlag(_flag: FeatureFlag, ctx: FlagContext): FlagState {
  if (ctx.production) {
    if (!isConfigured(ctx.configured)) {
      return { enabled: false, reason: 'not available: the required data source is not configured' };
    }
    if (ctx.requested !== true) {
      return { enabled: false, reason: 'not available: this feature is switched off on this deployment' };
    }
    return { enabled: true, reason: 'enabled' };
  }
  // Development: allow the framework to run, but never claim it is production-ready.
  const enabled = ctx.requested !== false && isConfigured(ctx.configured);
  return {
    enabled,
    reason: enabled ? 'enabled (development only)' : 'not available: not configured',
  };
}

/**
 * Build a context from a Vite build-time env object. A flag is only "requested"
 * when the env variable is exactly the string 'true'; any other value leaves it
 * off. `production` follows the standard Vite/MODE signal.
 */
export function flagContextFromEnv(
  env: Record<string, string | undefined> | undefined,
  configured?: FlagContext['configured'],
): FlagContext {
  const e = env ?? {};
  return {
    production: e.MODE === 'production' || e.PROD === 'true' || e.PROD === '1',
    requested: e.VITE_ENABLE_GATED_FEATURES === 'true',
    configured,
  };
}

/** A plain, non-diagnostic message a UI can show whenever a gated feature is off. */
export function unavailableMessage(state: FlagState): string {
  return `This feature is not available yet. ${state.reason}. If you feel unwell, get medical help.`;
}
