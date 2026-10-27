// Medicine knowledge proxy — OpenFDA + NIH RxNorm.
//
// Identity in a public drug database does NOT prove a physical package is
// authentic. Regulatory verification (e.g. NAFDAC) is a separate pluggable
// pathway via NAFDAC_VERIFY_URL / REGULATORY_VERIFY_URL.

import { Router } from 'express';
import rateLimit from 'express-rate-limit';

const router = Router();

const medicineLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 60,
  keyGenerator: (req) => `user:${req.user?.id ?? 'anon'}`,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  handler: (_req, res) => res.status(429).json({ error: 'Too many medicine lookup requests' }),
});

router.use(medicineLimiter);

const OPENFDA_LABEL = 'https://api.fda.gov/drug/label.json';
const RXNORM_FIND = 'https://rxnav.nlm.nih.gov/REST/rxcui.json';
const RXNORM_APPROX = 'https://rxnav.nlm.nih.gov/REST/approximateTerm.json';
const RXNORM_INTERACT = 'https://rxnav.nlm.nih.gov/REST/interaction/list.json';
const RXNORM_PROPERTIES = 'https://rxnav.nlm.nih.gov/REST/rxcui';

const FETCH_TIMEOUT_MS = 12_000;

async function fetchJson(url, init = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    const text = await response.text();
    let body = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      return { ok: false, status: response.status, error: 'malformed_response', body: null };
    }
    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        error: response.status === 429 ? 'rate_limited' : 'upstream_error',
        body,
      };
    }
    return { ok: true, status: response.status, error: null, body };
  } catch (err) {
    const aborted = err?.name === 'AbortError';
    return { ok: false, status: 0, error: aborted ? 'timeout' : 'network_error', body: null };
  } finally {
    clearTimeout(timer);
  }
}

async function resolveRxcui(name) {
  const exact = await fetchJson(`${RXNORM_FIND}?name=${encodeURIComponent(name)}`);
  if (exact.ok) {
    const id = exact.body?.idGroup?.rxnormId?.[0];
    if (id) return { rxcui: String(id), match: 'exact', error: null };
  } else if (exact.error === 'timeout' || exact.error === 'network_error' || exact.error === 'rate_limited') {
    return { rxcui: null, match: null, error: exact.error };
  }

  const approx = await fetchJson(`${RXNORM_APPROX}?term=${encodeURIComponent(name)}&maxEntries=1`);
  if (!approx.ok) {
    return { rxcui: null, match: null, error: approx.error };
  }
  const candidate = approx.body?.approximateGroup?.candidate?.[0];
  const rxcui = candidate?.rxcui ? String(candidate.rxcui) : null;
  return { rxcui, match: rxcui ? 'approximate' : null, error: null };
}

async function rxcuiName(rxcui) {
  const result = await fetchJson(`${RXNORM_PROPERTIES}/${encodeURIComponent(rxcui)}/properties.json`);
  if (!result.ok) return null;
  return result.body?.properties?.name ?? null;
}

async function openFdaLookup(name) {
  const query = `openfda.brand_name:"${name}"+openfda.generic_name:"${name}"`;
  const url = `${OPENFDA_LABEL}?search=${encodeURIComponent(query)}&limit=1`;
  // OpenFDA uses a different search encoding; prefer unencoded + in search param style they document.
  const alt = `${OPENFDA_LABEL}?search=openfda.brand_name:"${encodeURIComponent(name)}"+openfda.generic_name:"${encodeURIComponent(name)}"&limit=1`;
  let result = await fetchJson(alt);
  if (!result.ok && result.status === 404) {
    return { found: false, error: null, record: null };
  }
  if (!result.ok) {
    // Retry simpler brand-only search.
    result = await fetchJson(`${OPENFDA_LABEL}?search=openfda.brand_name:${encodeURIComponent(name)}&limit=1`);
  }
  if (!result.ok) {
    if (result.status === 404) return { found: false, error: null, record: null };
    return { found: false, error: result.error, record: null };
  }
  const row = result.body?.results?.[0];
  if (!row) return { found: false, error: null, record: null };
  const openfda = row.openfda || {};
  return {
    found: true,
    error: null,
    record: {
      brandNames: openfda.brand_name ?? [],
      genericNames: openfda.generic_name ?? [],
      substanceNames: openfda.substance_name ?? [],
      manufacturerNames: openfda.manufacturer_name ?? [],
      productType: openfda.product_type?.[0] ?? null,
      route: openfda.route ?? [],
    },
  };
}

/**
 * GET /api/medicine/lookup?name=Amoxicillin&strength=500%20mg
 */
router.get('/medicine/lookup', async (req, res) => {
  const name = String(req.query.name ?? '').trim();
  if (!name || name.length < 2) {
    return res.status(400).json({ error: 'name is required' });
  }

  const [rx, fda] = await Promise.all([resolveRxcui(name), openFdaLookup(name)]);

  if (rx.error && fda.error && !rx.rxcui && !fda.found) {
    const status = rx.error === 'rate_limited' || fda.error === 'rate_limited' ? 429 : 503;
    return res.status(status).json({
      error: rx.error || fda.error,
      identity_match: false,
      drug_information_available: false,
      interaction_information_available: false,
      regulatory_verification: { state: 'unavailable', authority: null, note: 'Drug knowledge sources could not be reached.' },
      physical_authenticity: {
        state: 'not_established',
        note: 'Finding a name in a drug database does not prove a physical package is authentic.',
      },
    });
  }

  const identity_match = Boolean(rx.rxcui || fda.found);
  let ingredientName = null;
  if (rx.rxcui) ingredientName = await rxcuiName(rx.rxcui);
  if (!ingredientName && fda.record?.genericNames?.[0]) ingredientName = fda.record.genericNames[0];
  if (!ingredientName && fda.record?.substanceNames?.[0]) ingredientName = fda.record.substanceNames[0];

  const regulatory = await regulatoryVerify(String(req.query.code ?? req.query.batch ?? '').trim());

  return res.json({
    query: { name, strength: req.query.strength ? String(req.query.strength) : null },
    identity_match,
    match_quality: rx.match ?? (fda.found ? 'openfda' : null),
    rxcui: rx.rxcui,
    active_ingredient: ingredientName,
    openfda: fda.found ? fda.record : null,
    drug_information_available: identity_match,
    interaction_information_available: Boolean(rx.rxcui),
    regulatory_verification: regulatory,
    physical_authenticity: {
      state: 'not_established',
      note: 'A known medicine name does not equal an authentic package. Official regulatory verification is required separately.',
    },
    note: identity_match
      ? 'Drug information was found in public knowledge sources. This does not verify the package in hand.'
      : 'No matching drug identity was found in OpenFDA/RxNorm. The medicine may be regional, misspelled, or unknown to these sources.',
  });
});

async function regulatoryVerify(code) {
  const endpoint = (process.env.NAFDAC_VERIFY_URL || process.env.REGULATORY_VERIFY_URL || '').trim();
  if (!code) {
    return {
      state: 'unavailable',
      authority: null,
      note: 'No registration or verification code was provided for regulatory check.',
    };
  }
  if (!endpoint) {
    return {
      state: 'unavailable',
      authority: null,
      note: 'No NAFDAC or official regulatory verification pathway is configured yet. Package authenticity stays unverified.',
    };
  }
  const result = await fetchJson(`${endpoint}${endpoint.includes('?') ? '&' : '?'}code=${encodeURIComponent(code)}`);
  if (!result.ok) {
    return {
      state: 'source_unavailable',
      authority: process.env.REGULATORY_AUTHORITY_NAME || 'regulatory',
      note: 'The regulatory verification service could not be reached.',
    };
  }
  const verdict = result.body?.verdict;
  const allowed = ['verified', 'not_found', 'recalled'];
  if (!allowed.includes(verdict)) {
    return {
      state: 'unavailable',
      authority: result.body?.authority ?? null,
      note: 'The regulatory service gave no usable answer.',
    };
  }
  return {
    state: verdict,
    authority: result.body?.authority ?? process.env.REGULATORY_AUTHORITY_NAME ?? 'regulatory',
    note: result.body?.note ?? `Regulatory check returned ${verdict}.`,
  };
}

/**
 * POST /api/medicine/interactions
 * Body: { medicines: string[], allergies?: string[] | null, conditions?: string[] | null,
 *         allergiesStatus?: 'unknown'|'none'|'known', conditionsStatus?: ...,
 *         currentMedicinesStatus?: ..., age?: number|null }
 */
router.post('/medicine/interactions', async (req, res) => {
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const medicines = Array.isArray(body.medicines)
    ? body.medicines.map((m) => String(m ?? '').trim()).filter(Boolean)
    : [];

  const allergiesStatus = body.allergiesStatus ?? (Array.isArray(body.allergies) ? 'known' : 'unknown');
  const conditionsStatus = body.conditionsStatus ?? (Array.isArray(body.conditions) ? 'known' : 'unknown');
  const currentMedicinesStatus = body.currentMedicinesStatus ?? 'known';

  if (allergiesStatus === 'unknown' || conditionsStatus === 'unknown' || currentMedicinesStatus === 'unknown') {
    return res.json({
      state: 'insufficient_information',
      findings: [],
      note: 'Allergies, conditions, or current medicines were not provided. Ask the user before assessing interactions.',
      ui_state: 'insufficient_patient_information',
    });
  }

  if (medicines.length < 1) {
    return res.json({
      state: 'insufficient_information',
      findings: [],
      note: 'No medicine identity was available to check.',
      ui_state: 'insufficient_patient_information',
    });
  }

  // Resolve all names to RXCUIs.
  const resolved = [];
  for (const name of medicines) {
    const r = await resolveRxcui(name);
    if (r.error === 'timeout' || r.error === 'network_error' || r.error === 'rate_limited') {
      return res.status(r.error === 'rate_limited' ? 429 : 503).json({
        state: 'unavailable',
        error: r.error,
        findings: [],
        note: 'Drug interaction sources could not be reached.',
        ui_state: 'interaction_information_unavailable',
      });
    }
    if (r.rxcui) resolved.push({ name, rxcui: r.rxcui });
  }

  if (resolved.length < 2) {
    // Single known drug — may still flag allergy name matches locally.
    const findings = allergyNameFindings(medicines[0], body.allergies);
    return res.json({
      state: findings.length ? 'checked' : 'insufficient_information',
      findings,
      note: resolved.length === 0
        ? 'Could not resolve medicines to RxNorm identifiers. Interaction evidence is unavailable.'
        : 'Need at least two identifiable medicines for a pairwise interaction check. Allergy name matching may still apply.',
      ui_state: findings.length ? 'professional_review_recommended' : 'interaction_information_unavailable',
      resolved,
    });
  }

  const rxcuis = resolved.map((r) => r.rxcui).join('+');
  const interact = await fetchJson(`${RXNORM_INTERACT}?rxcuis=${rxcuis}`);
  if (!interact.ok) {
    return res.status(interact.error === 'rate_limited' ? 429 : 503).json({
      state: 'unavailable',
      error: interact.error,
      findings: [],
      note: 'The interaction source did not answer, so interactions were not checked.',
      ui_state: 'interaction_information_unavailable',
    });
  }

  const findings = [];
  const groups = interact.body?.fullInteractionTypeGroup ?? [];
  for (const group of groups) {
    for (const itype of group.fullInteractionType ?? []) {
      for (const pair of itype.interactionPair ?? []) {
        const severity = mapSeverity(pair.severity);
        const description = String(pair.description ?? '').trim();
        if (!description) continue;
        findings.push({
          id: `rxnorm-${findings.length + 1}`,
          severity,
          text: description,
          source: group.sourceName ?? 'RxNorm',
        });
      }
    }
  }

  findings.push(...allergyNameFindings(medicines[0], body.allergies));

  const age = body.age == null ? null : Number(body.age);
  if (Number.isFinite(age) && age < 16) {
    findings.push({
      id: 'age-child',
      severity: 'caution',
      text: 'This profile is a child or under 16. Adult product information may not apply — a clinician must confirm suitability and dose.',
      source: 'patient_context',
    });
  }

  const hasSerious = findings.some((f) => f.severity === 'serious' || f.severity === 'caution');
  return res.json({
    state: 'checked',
    findings,
    note: findings.length === 0
      ? 'No interaction pairs were returned by the knowledge source. That is not a "safe" result — absence of evidence is not evidence of safety. Ask a pharmacist if unsure.'
      : 'Findings come from verified drug-knowledge sources (and allergy name matching). They are not a prescription decision.',
    ui_state: hasSerious || findings.length > 0 ? 'professional_review_recommended' : 'checked_no_pairs_found',
    // Explicit: never promote empty findings to "safe".
    safe: false,
    resolved,
  });
});

function mapSeverity(raw) {
  const value = String(raw ?? '').toLowerCase();
  if (value.includes('high') || value.includes('severe') || value.includes('contraindicated')) return 'serious';
  if (value.includes('moderate') || value.includes('n/a') || value === '') return 'caution';
  if (value.includes('low') || value.includes('minor')) return 'info';
  return 'caution';
}

function allergyNameFindings(medicineName, allergies) {
  if (!Array.isArray(allergies) || !medicineName) return [];
  const med = medicineName.toLowerCase();
  const findings = [];
  for (const allergy of allergies) {
    const a = String(allergy ?? '').trim().toLowerCase();
    if (!a || a.length < 3) continue;
    if (med.includes(a) || a.includes(med.split(/\s+/)[0])) {
      findings.push({
        id: `allergy-${a}`,
        severity: 'serious',
        text: `Recorded allergy "${allergy}" may relate to this medicine name. Do not take it until a pharmacist or clinician confirms.`,
        source: 'patient_allergy_match',
      });
    }
  }
  return findings;
}

/**
 * GET /api/medicine/regulatory?code=...
 * Pluggable NAFDAC / official pathway — does not use OpenFDA as authenticity proof.
 */
router.get('/medicine/regulatory', async (req, res) => {
  const code = String(req.query.code ?? '').trim();
  const result = await regulatoryVerify(code);
  return res.json({
    regulatory_verification: result,
    physical_authenticity: {
      state: result.state === 'verified' ? 'regulator_confirmed_code' : 'not_established',
      note: 'Regulatory code checks are separate from drug-name identity in OpenFDA/RxNorm.',
    },
  });
});

export default router;
