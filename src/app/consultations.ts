import type { ConsultationRecord } from './symptomIntake';

// Symptom-intake summaries are device-only records (same class as the
// caregivers and profile logs): they must be per-user keyed and live in the
// logout clear set, so the next person on a shared phone never sees them.

export function consultationsStorageKey(userId: string): string {
  return `veda_consultations_${userId}`;
}

export function saveConsultation(userId: string, record: ConsultationRecord): boolean {
  try {
    const key = consultationsStorageKey(userId);
    const existing = listConsultations(userId);
    localStorage.setItem(key, JSON.stringify([record, ...existing].slice(0, 50)));
    return true;
  } catch {
    return false;
  }
}

export function listConsultations(userId: string): ConsultationRecord[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(consultationsStorageKey(userId)) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
