// Medicine intelligence: on-device store.
//
// Medication plans and adherence records are device-only, per-user records —
// the same class as consultations and profile logs — so they are keyed by user
// id and live in the logout clear set. The next person on a shared phone must
// never see them. Nothing here is uploaded.

import type { AdherenceRecord, MedicationPlan } from './medicineIntelligence.ts';

export function medicationPlansStorageKey(userId: string): string {
  return `veda_med_plans_${userId}`;
}

export function adherenceStorageKey(userId: string): string {
  return `veda_med_adherence_${userId}`;
}

export function listPlans(userId: string): MedicationPlan[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(medicationPlansStorageKey(userId)) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function savePlan(userId: string, plan: MedicationPlan): boolean {
  try {
    const others = listPlans(userId).filter(existing => existing.id !== plan.id);
    localStorage.setItem(medicationPlansStorageKey(userId), JSON.stringify([...others, plan]));
    return true;
  } catch {
    return false;
  }
}

export function removePlan(userId: string, planId: string): boolean {
  try {
    localStorage.setItem(
      medicationPlansStorageKey(userId),
      JSON.stringify(listPlans(userId).filter(plan => plan.id !== planId)),
    );
    return true;
  } catch {
    return false;
  }
}

export function listAdherence(userId: string): AdherenceRecord[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(adherenceStorageKey(userId)) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveAdherence(userId: string, records: AdherenceRecord[]): boolean {
  try {
    localStorage.setItem(adherenceStorageKey(userId), JSON.stringify(records));
    return true;
  } catch {
    return false;
  }
}
