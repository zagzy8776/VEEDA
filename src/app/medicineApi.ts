// Frontend client for /api/medicine/* — credentials stay on the server.

import { apiFetchDetailed } from './api.ts';
import type { DrugKnowledgeResult, InteractionAssessment, InteractionFinding } from './medicineIntelligence.ts';
import type { PatientHealthContext } from './patientHealthContext.ts';

export async function lookupMedicineKnowledge(input: {
  name: string;
  strength?: string | null;
  batch?: string | null;
}): Promise<{ ok: boolean; status: number; data: DrugKnowledgeResult | null; offline: boolean }> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return { ok: false, status: 0, data: null, offline: true };
  }
  const params = new URLSearchParams({ name: input.name });
  if (input.strength) params.set('strength', input.strength);
  if (input.batch) params.set('code', input.batch);
  const result = await apiFetchDetailed<DrugKnowledgeResult>(`/api/medicine/lookup?${params}`);
  return { ok: result.ok, status: result.status, data: result.data, offline: false };
}

export async function assessMedicineInteractions(input: {
  newMedicine: string;
  patient: PatientHealthContext;
  age?: number | null;
}): Promise<{ ok: boolean; status: number; data: InteractionAssessment | null; offline: boolean }> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return {
      ok: false,
      status: 0,
      data: {
        state: 'unavailable',
        findings: [],
        note: 'No internet connection — interactions were not checked.',
        ui_state: 'interaction_information_unavailable',
        safe: false,
      },
      offline: true,
    };
  }

  const medicines = [
    input.newMedicine,
    ...(input.patient.currentMedicines.status === 'known' ? input.patient.currentMedicines.values : []),
  ];

  const result = await apiFetchDetailed<{
    state?: string;
    findings?: InteractionFinding[];
    note?: string;
    ui_state?: string;
    safe?: boolean;
    error?: string;
  }>('/api/medicine/interactions', {
    method: 'POST',
    body: JSON.stringify({
      medicines,
      allergies: input.patient.allergies.status === 'known' ? input.patient.allergies.values : [],
      conditions: input.patient.conditions.status === 'known' ? input.patient.conditions.values : [],
      allergiesStatus: input.patient.allergies.status,
      conditionsStatus: input.patient.conditions.status,
      currentMedicinesStatus: input.patient.currentMedicines.status,
      age: input.age ?? null,
    }),
  });

  if (!result.ok || !result.data) {
    const unavailable: InteractionAssessment = {
      state: 'unavailable',
      findings: [],
      note: result.status === 429
        ? 'Medicine lookup is rate-limited right now. Ask a pharmacist; this is not a safe result.'
        : 'Drug knowledge sources did not answer. Interactions were not checked.',
      ui_state: 'interaction_information_unavailable',
      safe: false,
    };
    return { ok: false, status: result.status, data: unavailable, offline: false };
  }

  const state = result.data.state === 'checked' || result.data.state === 'insufficient_information'
    ? result.data.state
    : 'unavailable';

  return {
    ok: true,
    status: result.status,
    data: {
      state,
      findings: Array.isArray(result.data.findings) ? result.data.findings : [],
      note: result.data.note ?? '',
      ui_state: (result.data.ui_state as InteractionAssessment['ui_state']) ?? 'interaction_information_unavailable',
      safe: false,
    },
    offline: false,
  };
}
