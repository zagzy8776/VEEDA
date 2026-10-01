// Connection to care (Phase 7): find a lab/pharmacy, book a doctor.
//
// Both are gated. Prices and stock come ONLY from a configured partner source; with
// none configured the search returns "unknown" for every field. Booking is disabled
// until a care partner is configured. Nothing here invents a price, a stock level,
// a clinician, or an appointment.

import { resolveFlag, type FlagContext } from './featureFlags.ts';

export interface CarePlace {
  id: string;
  name: string;
  kind: 'lab' | 'pharmacy';
  address?: string;
  /** Present only when a configured partner supplied them. */
  prices?: { label: string; amount: string }[];
  stock?: { label: string; inStock: boolean }[];
  source: 'partner' | 'unknown';
}

export interface PartnerCareSource {
  endpoint: string;
  fetchImpl?: typeof fetch;
}

/**
 * Search labs/pharmacies. The map/list position is the only thing available without
 * a partner; prices and stock are dropped unless the configured partner returns them.
 */
export async function findCare(
  query: string,
  source: PartnerCareSource,
  places: CarePlace[] = [],
): Promise<CarePlace[]> {
  if (!source.endpoint || !source.fetchImpl) {
    // No partner: return the places but strip any prices/stock and mark the source.
    return places.map(p => ({ id: p.id, name: p.name, kind: p.kind, address: p.address, source: 'unknown' as const }));
  }
  try {
    const response = await source.fetchImpl(`${source.endpoint}?q=${encodeURIComponent(query)}`);
    if (!response.ok) return places.map(p => ({ ...p, prices: undefined, stock: undefined, source: 'unknown' as const }));
    const data = await response.json() as { places?: CarePlace[] };
    return (Array.isArray(data.places) ? data.places : []).map(p => ({ ...p, source: 'partner' as const }));
  } catch {
    return places.map(p => ({ ...p, prices: undefined, stock: undefined, source: 'unknown' as const }));
  }
}

export interface BookingState {
  available: boolean;
  reason: string;
}

/** Booking is available only when the care-partner flag is on (which needs a partner). */
export function bookingState(ctx: FlagContext): BookingState {
  const flag = resolveFlag('carePartnerBooking', ctx);
  return {
    available: flag.enabled,
    reason: flag.enabled
      ? 'enabled'
      : 'Booking a real doctor is not available yet: no care partner is configured.',
  };
}
