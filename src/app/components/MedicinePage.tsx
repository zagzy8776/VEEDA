import { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import {
  AUTHENTICITY_PHOTO_NOTE,
  buildBeforeTakingGate,
  concernsFor,
  createMedicationPlan,
  dosesDueFor,
  adherenceSummary,
  deriveMedicineUiState,
  medicineUiStateLabel,
  parseMedicineLabel,
  recordDose,
  type DrugKnowledgeResult,
  type InteractionAssessment,
  type MedicationPlan,
  type MedicineLabel,
  type MedicineUiState,
  type PackageAnalysis,
} from '../medicineIntelligence';
import { recognizePackageImage } from '../medicineOcr';
import { assessMedicineInteractions, lookupMedicineKnowledge } from '../medicineApi';
import {
  fieldDisplay,
  knownField,
  loadPatientHealthContext,
  noneField,
  savePatientHealthContext,
  unknownField,
  type PatientHealthContext,
} from '../patientHealthContext';
import { listAdherence, listPlans, saveAdherence, savePlan } from '../medicines';
import { buildReminderIcs, reminderFilename, type Frequency } from '../medicationIcs';
import { CONSENT_ITEMS, CONSENT_VERSION, hasConsent, recordConsent } from '../consent';
import { expiryStatus } from '../foodSafety';
import { syncConsentRecord } from '../api';

const C = { teal: '#2DD4A4', text: '#E2F4F0', muted: '#5A7A72', card: 'rgba(13,21,37,0.96)', border: 'rgba(255,255,255,0.1)', warn: '#EF9F27' };

const FREQUENCIES: { id: Frequency; label: string }[] = [
  { id: 'daily', label: 'Every day' },
  { id: 'twice_daily', label: 'Twice a day' },
  { id: 'weekly', label: 'Every week' },
];

function today(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function timesFromFrequency(times: string[], frequency: Frequency): string[] {
  if (frequency === 'twice_daily' && times.length) return [times[0], '20:00'];
  return times;
}

function uiStateColor(state: MedicineUiState): string {
  if (state === 'professional_review_recommended' || state === 'unable_to_verify') return C.warn;
  if (state === 'verified_drug_information') return C.teal;
  return C.warn;
}

export function MedicinePage({ open, onClose, userId, age }: { open: boolean; onClose: () => void; userId: string; age?: number }) {
  const [consented, setConsented] = useState(false);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [text, setText] = useState('');
  const [ocrProgress, setOcrProgress] = useState<number | null>(null);
  const [ocrUncertain, setOcrUncertain] = useState(false);
  const [uncertainFields, setUncertainFields] = useState<Array<keyof MedicineLabel>>([]);
  const [draftLabel, setDraftLabel] = useState<MedicineLabel | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [analysis, setAnalysis] = useState<PackageAnalysis | null>(null);
  const [knowledge, setKnowledge] = useState<DrugKnowledgeResult | null>(null);
  const [interactions, setInteractions] = useState<InteractionAssessment | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [name, setName] = useState('');
  const [time, setTime] = useState('08:00');
  const [frequency, setFrequency] = useState<Frequency>('daily');
  const [plans, setPlans] = useState<MedicationPlan[]>([]);
  const [adherence, setAdherence] = useState<ReturnType<typeof listAdherence>>([]);
  const [patient, setPatient] = useState<PatientHealthContext>(() => loadPatientHealthContext(userId));
  const [allergyInput, setAllergyInput] = useState('');
  const [conditionInput, setConditionInput] = useState('');
  const [medInput, setMedInput] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const cameraItem = CONSENT_ITEMS.find(item => item.feature === 'camera_sensor');
  const consentedNow = consented || hasConsent(window.localStorage, userId, 'camera_sensor');

  useEffect(() => {
    if (!open) return;
    setPlans(listPlans(userId));
    setAdherence(listAdherence(userId));
    setPatient(loadPatientHealthContext(userId));
  }, [open, userId]);

  if (!open) return null;

  function grantCameraConsent() {
    recordConsent(window.localStorage, userId, 'camera_sensor');
    void syncConsentRecord('camera_sensor', CONSENT_VERSION, true);
    setConsented(true);
  }

  function onPickPhoto(file: File | undefined) {
    if (!file) return;
    if (photoUrl) URL.revokeObjectURL(photoUrl);
    setPhotoUrl(URL.createObjectURL(file));
    setPhotoFile(file);
    setConfirmed(false);
    setKnowledge(null);
    setInteractions(null);
    setAnalysis(null);
  }

  async function runOcr() {
    if (!photoFile) return;
    setError('');
    setBusy(true);
    setOcrProgress(0);
    try {
      const result = await recognizePackageImage(photoFile, { onProgress: p => setOcrProgress(p) });
      setText(result.rawText);
      setDraftLabel(result.label);
      setOcrUncertain(result.uncertain);
      setUncertainFields(result.uncertainFields);
      setConfirmed(false);
      if (!result.rawText.trim()) {
        setError('No text could be read from the photo. Type what the package says, or try a clearer picture.');
      }
    } catch {
      setError('On-device reading failed. Type what the package says below — the photo was not uploaded.');
    } finally {
      setBusy(false);
      setOcrProgress(null);
    }
  }

  function parseTyped() {
    setError('');
    const label = parseMedicineLabel(text);
    setDraftLabel(label);
    setOcrUncertain(!label.name || !label.strength);
    setUncertainFields([
      ...(!label.name ? ['name' as const] : []),
      ...(!label.strength ? ['strength' as const] : []),
      ...(label.form === 'unknown' ? ['form' as const] : []),
      ...(!label.batch ? ['batch' as const] : []),
      ...(!label.expiry ? ['expiry' as const] : []),
    ]);
    setConfirmed(false);
    setKnowledge(null);
    setInteractions(null);
  }

  function updateDraft<K extends keyof MedicineLabel>(key: K, value: MedicineLabel[K]) {
    if (!draftLabel) return;
    setDraftLabel({ ...draftLabel, [key]: value });
    setUncertainFields(prev => prev.filter(f => f !== key));
  }

  async function confirmAndLookup() {
    if (!draftLabel?.name?.trim()) {
      setError('Confirm the medicine name before looking it up. Do not guess.');
      return;
    }
    setError('');
    setBusy(true);
    setConfirmed(true);
    const label = { ...draftLabel, name: draftLabel.name.trim() };
    const status = expiryStatus(label.expiry);
    const base: PackageAnalysis = {
      label,
      expiryStatus: status,
      concerns: concernsFor(label, status),
      authenticity: {
        verdict: 'unverified',
        note: 'Package authenticity is separate from drug-name identity.',
      },
    };
    setAnalysis(base);
    setName(label.name ?? '');

    const lookup = await lookupMedicineKnowledge({
      name: label.name!,
      strength: label.strength,
      batch: label.batch,
    });
    if (lookup.offline) {
      setKnowledge(null);
      setError('No internet — drug knowledge lookup skipped. Package photo stayed on this device.');
    } else if (lookup.data) {
      setKnowledge(lookup.data);
    } else {
      setKnowledge(null);
      if (lookup.status === 429) setError('Lookup rate-limited. Try again shortly — this is not a safe result.');
      else if (lookup.status >= 500 || lookup.status === 0) setError('Drug knowledge service unavailable.');
    }

    const ctx = loadPatientHealthContext(userId);
    setPatient(ctx);
    const inter = await assessMedicineInteractions({
      newMedicine: label.name!,
      patient: ctx,
      age: age ?? null,
    });
    setInteractions(inter.data);
    setBusy(false);
  }

  function persistPatient(next: PatientHealthContext) {
    setPatient(next);
    savePatientHealthContext(userId, next);
  }

  function addReminder() {
    setError('');
    try {
      const generatedAt = new Date().toISOString();
      const chosenTimes = timesFromFrequency([time], frequency);
      const ics = buildReminderIcs({ medicationName: name, time, frequency, generatedAt, uid: `med-${generatedAt}` });
      const blob = new Blob([ics], { type: 'text/calendar' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = reminderFilename(generatedAt);
      a.click();
      URL.revokeObjectURL(url);

      const plan = createMedicationPlan({
        id: `plan-${generatedAt}`,
        label: name,
        times: chosenTimes,
        startDate: today(),
        createdAt: generatedAt,
      });
      if (savePlan(userId, plan)) setPlans(listPlans(userId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create the reminder.');
    }
  }

  function markTaken(plan: MedicationPlan, doseId: string) {
    const next = recordDose(adherence, { planId: plan.id, doseId, date: today(), taken: true, recordedAt: new Date().toISOString() });
    saveAdherence(userId, next);
    setAdherence(next);
  }

  const gate = analysis
    ? buildBeforeTakingGate({
        label: analysis.label,
        context: {
          allergies: patient.allergies,
          conditions: patient.conditions,
          currentMedicines: patient.currentMedicines,
          pregnantOrBreastfeeding: patient.pregnantOrBreastfeeding,
          isChild: typeof age === 'number' && age < 16,
        },
        interactions: interactions
          ? interactions.state === 'checked'
            ? { state: 'checked', findings: interactions.findings, note: interactions.note }
            : { state: 'unavailable', note: interactions.note }
          : undefined,
      })
    : null;

  const uiState = deriveMedicineUiState({
    knowledge,
    interactions,
    patient,
    labelConfirmed: confirmed,
  });

  const fieldBorder = (key: keyof MedicineLabel) =>
    uncertainFields.includes(key) ? `1px solid ${C.warn}` : `0.5px solid ${C.border}`;

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 2000, background: 'rgba(0,0,0,0.72)', display: 'grid', placeItems: 'center', padding: 16 }}>
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
        style={{ width: '100%', maxWidth: 380, maxHeight: '88vh', overflowY: 'auto', background: C.card, border: `1px solid ${C.border}`, borderRadius: 20, padding: 18, color: C.text }}>
        <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 4 }}>Medicine scanner</div>
        <div style={{ fontSize: 11, color: C.warn, lineHeight: 1.5, marginBottom: 12 }}>{AUTHENTICITY_PHOTO_NOTE}</div>

        {!consentedNow ? (
          <>
            <div style={{ fontSize: 12, lineHeight: 1.5, marginBottom: 12 }}>{cameraItem?.body}</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" onClick={onClose} style={{ flex: 1, padding: 12, borderRadius: 12, border: `1px solid ${C.border}`, background: 'transparent', color: C.text, cursor: 'pointer' }}>Close</button>
              <button type="button" onClick={grantCameraConsent} style={{ flex: 1, padding: 12, borderRadius: 12, border: 0, background: C.teal, color: '#04342C', fontWeight: 800, cursor: 'pointer' }}>I understand, continue</button>
            </div>
          </>
        ) : (
          <>
            <button type="button" onClick={() => fileRef.current?.click()} style={{ width: '100%', padding: 12, borderRadius: 12, border: `1px solid ${C.border}`, background: 'rgba(45,212,164,0.08)', color: C.teal, fontWeight: 700, cursor: 'pointer', marginBottom: 8 }}>
              Take or choose a photo of the package
            </button>
            <input ref={fileRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={e => onPickPhoto(e.target.files?.[0])} />
            {photoUrl && <img src={photoUrl} alt="Medicine package" style={{ width: '100%', borderRadius: 12, marginBottom: 10, border: `1px solid ${C.border}` }} />}
            {photoFile && (
              <button type="button" disabled={busy} onClick={() => void runOcr()} style={{ width: '100%', padding: 11, borderRadius: 12, border: 0, background: C.teal, color: '#04342C', fontWeight: 800, cursor: 'pointer', marginBottom: 10 }}>
                {ocrProgress != null ? `Reading on device… ${Math.round(ocrProgress * 100)}%` : busy ? 'Working…' : 'Read text from photo (on device)'}
              </button>
            )}
            <div style={{ fontSize: 11, color: C.muted, lineHeight: 1.5, marginBottom: 8 }}>
              Photos stay on this device unless you choose a feature that needs an upload. You can also type the package text.
            </div>

            <label style={{ display: 'block', fontSize: 12, color: C.muted, marginBottom: 4 }}>What the package says</label>
            <textarea value={text} onChange={e => setText(e.target.value)} rows={4} placeholder={'Name\nStrength\nManufacturer\nBatch\nExpiry'}
              style={{ width: '100%', padding: '10px 12px', background: '#0A1220', border: `0.5px solid ${C.border}`, borderRadius: 10, color: C.text, fontSize: 13, outline: 'none', marginBottom: 10, boxSizing: 'border-box', resize: 'vertical' }} />
            <button type="button" onClick={parseTyped} disabled={!text.trim()} style={{ width: '100%', padding: 11, borderRadius: 12, border: 0, background: text.trim() ? 'rgba(45,212,164,0.2)' : 'rgba(255,255,255,0.08)', color: text.trim() ? C.teal : C.muted, fontWeight: 800, cursor: 'pointer', marginBottom: 12 }}>
              Parse typed text
            </button>

            {draftLabel && (
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, marginBottom: 6 }}>CONFIRM FIELDS{ocrUncertain ? ' · uncertain — fix before lookup' : ''}</div>
                {([
                  ['name', 'Name'],
                  ['strength', 'Strength'],
                  ['manufacturer', 'Manufacturer'],
                  ['batch', 'Batch'],
                  ['expiry', 'Expiry (YYYY-MM-DD)'],
                ] as Array<[keyof MedicineLabel, string]>).map(([key, label]) => (
                  <div key={key} style={{ marginBottom: 8 }}>
                    <label style={{ fontSize: 11, color: uncertainFields.includes(key) ? C.warn : C.muted }}>{label}{uncertainFields.includes(key) ? ' · needs confirmation' : ''}</label>
                    <input
                      value={(draftLabel[key] as string | null) ?? ''}
                      onChange={e => updateDraft(key, (e.target.value.trim() || null) as MedicineLabel[typeof key])}
                      style={{ width: '100%', padding: '8px 10px', background: '#0A1220', border: fieldBorder(key), borderRadius: 8, color: C.text, fontSize: 13, outline: 'none', boxSizing: 'border-box', marginTop: 4 }}
                    />
                  </div>
                ))}
                <div style={{ fontSize: 11, color: C.muted, marginBottom: 8 }}>Form: {draftLabel.form}</div>
                <button type="button" disabled={busy || !draftLabel.name?.trim()} onClick={() => void confirmAndLookup()} style={{ width: '100%', padding: 11, borderRadius: 12, border: 0, background: draftLabel.name?.trim() ? C.teal : 'rgba(255,255,255,0.08)', color: draftLabel.name?.trim() ? '#04342C' : C.muted, fontWeight: 800, cursor: 'pointer' }}>
                  {busy ? 'Looking up…' : 'Confirm and look up drug knowledge'}
                </button>
              </div>
            )}

            {confirmed && (
              <div style={{ marginBottom: 12, padding: 10, borderRadius: 10, border: `1px solid ${uiStateColor(uiState)}`, background: 'rgba(239,159,39,0.08)' }}>
                <div style={{ fontSize: 12, fontWeight: 800, color: uiStateColor(uiState), marginBottom: 6 }}>{medicineUiStateLabel(uiState)}</div>
                <div style={{ fontSize: 11, lineHeight: 1.5, color: C.text }}>
                  Drug identity and package authenticity are different. A match in OpenFDA/RxNorm does not prove this pack is genuine.
                </div>
              </div>
            )}

            {knowledge && (
              <div style={{ marginBottom: 12, fontSize: 11, lineHeight: 1.5 }}>
                <div style={{ fontWeight: 700, color: C.muted, marginBottom: 4 }}>DRUG KNOWLEDGE</div>
                <div>Identity match: {knowledge.identity_match ? 'yes' : 'no'}</div>
                <div>Active ingredient: {knowledge.active_ingredient ?? 'not resolved'}</div>
                <div>Drug information: {knowledge.drug_information_available ? 'available' : 'unavailable'}</div>
                <div>Interaction source: {knowledge.interaction_information_available ? 'available' : 'unavailable'}</div>
                <div>Regulatory: {knowledge.regulatory_verification.state} — {knowledge.regulatory_verification.note}</div>
                <div>Physical authenticity: {knowledge.physical_authenticity.state} — {knowledge.physical_authenticity.note}</div>
                <div style={{ marginTop: 4, color: C.muted }}>{knowledge.note}</div>
              </div>
            )}

            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, marginBottom: 6 }}>YOUR HEALTH CONTEXT</div>
              <div style={{ fontSize: 11, color: C.muted, marginBottom: 8 }}>Unknown is not the same as none. Tell VEEDA before interaction checks.</div>
              <div style={{ fontSize: 11, marginBottom: 4 }}>Allergies: {fieldDisplay(patient.allergies)}</div>
              <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                <input value={allergyInput} onChange={e => setAllergyInput(e.target.value)} placeholder="e.g. penicillin" style={{ flex: 1, padding: 8, borderRadius: 8, border: `0.5px solid ${C.border}`, background: '#0A1220', color: C.text, fontSize: 12 }} />
                <button type="button" onClick={() => { persistPatient({ ...patient, allergies: knownField([...(patient.allergies.status === 'known' ? patient.allergies.values : []), allergyInput]) }); setAllergyInput(''); }} style={{ padding: '8px 10px', borderRadius: 8, border: 0, background: 'rgba(45,212,164,0.2)', color: C.teal, fontSize: 11, fontWeight: 700 }}>Add</button>
                <button type="button" onClick={() => persistPatient({ ...patient, allergies: noneField() })} style={{ padding: '8px 10px', borderRadius: 8, border: `1px solid ${C.border}`, background: 'transparent', color: C.muted, fontSize: 11 }}>None</button>
              </div>
              <div style={{ fontSize: 11, marginBottom: 4 }}>Conditions: {fieldDisplay(patient.conditions)}</div>
              <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                <input value={conditionInput} onChange={e => setConditionInput(e.target.value)} placeholder="e.g. asthma" style={{ flex: 1, padding: 8, borderRadius: 8, border: `0.5px solid ${C.border}`, background: '#0A1220', color: C.text, fontSize: 12 }} />
                <button type="button" onClick={() => { persistPatient({ ...patient, conditions: knownField([...(patient.conditions.status === 'known' ? patient.conditions.values : []), conditionInput]) }); setConditionInput(''); }} style={{ padding: '8px 10px', borderRadius: 8, border: 0, background: 'rgba(45,212,164,0.2)', color: C.teal, fontSize: 11, fontWeight: 700 }}>Add</button>
                <button type="button" onClick={() => persistPatient({ ...patient, conditions: noneField() })} style={{ padding: '8px 10px', borderRadius: 8, border: `1px solid ${C.border}`, background: 'transparent', color: C.muted, fontSize: 11 }}>None</button>
              </div>
              <div style={{ fontSize: 11, marginBottom: 4 }}>Current medicines: {fieldDisplay(patient.currentMedicines)}</div>
              <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                <input value={medInput} onChange={e => setMedInput(e.target.value)} placeholder="other medicine" style={{ flex: 1, padding: 8, borderRadius: 8, border: `0.5px solid ${C.border}`, background: '#0A1220', color: C.text, fontSize: 12 }} />
                <button type="button" onClick={() => { persistPatient({ ...patient, currentMedicines: knownField([...(patient.currentMedicines.status === 'known' ? patient.currentMedicines.values : []), medInput]) }); setMedInput(''); }} style={{ padding: '8px 10px', borderRadius: 8, border: 0, background: 'rgba(45,212,164,0.2)', color: C.teal, fontSize: 11, fontWeight: 700 }}>Add</button>
                <button type="button" onClick={() => persistPatient({ ...patient, currentMedicines: noneField() })} style={{ padding: '8px 10px', borderRadius: 8, border: `1px solid ${C.border}`, background: 'transparent', color: C.muted, fontSize: 11 }}>None</button>
              </div>
              {patient.allergies.status === 'unknown' && (
                <button type="button" onClick={() => persistPatient({ ...patient, allergies: unknownField() })} style={{ display: 'none' }} aria-hidden />
              )}
              {confirmed && (
                <button type="button" disabled={busy} onClick={() => void confirmAndLookup()} style={{ width: '100%', padding: 10, borderRadius: 10, border: `1px solid ${C.border}`, background: 'transparent', color: C.teal, fontWeight: 700, cursor: 'pointer', marginTop: 4 }}>
                  Re-check with updated context
                </button>
              )}
            </div>

            {interactions && (
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, marginBottom: 6 }}>INTERACTION ASSESSMENT</div>
                <div style={{ fontSize: 11, lineHeight: 1.5, marginBottom: 6 }}>{interactions.note}</div>
                <div style={{ fontSize: 11, color: C.warn, marginBottom: 6 }}>Never treat “no pairs found” as safe.</div>
                {interactions.findings.map(f => (
                  <div key={f.id} style={{ fontSize: 11, lineHeight: 1.5, marginBottom: 4, color: f.severity === 'serious' ? C.warn : C.text }}>
                    [{f.severity}] {f.text}
                  </div>
                ))}
              </div>
            )}

            {analysis && (
              <div style={{ marginBottom: 12 }}>
                {analysis.concerns.map(concern => (
                  <div key={concern.id} style={{ fontSize: 11, color: C.warn, marginTop: 6, lineHeight: 1.5 }}>{concern.text}</div>
                ))}
              </div>
            )}

            {gate && (
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, marginBottom: 6 }}>BEFORE YOU TAKE IT — ASK</div>
                {gate.flags.map(flag => <div key={flag} style={{ fontSize: 11, color: C.warn, lineHeight: 1.5, marginBottom: 4 }}>{flag}</div>)}
                {gate.questions.map(question => <div key={question} style={{ fontSize: 11, color: C.text, lineHeight: 1.5, marginBottom: 4 }}>• {question}</div>)}
              </div>
            )}

            <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, marginBottom: 6 }}>REMINDER</div>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="Morning tablet" style={{ width: '100%', padding: '9px 12px', background: '#0A1220', border: `0.5px solid ${C.border}`, borderRadius: 10, color: C.text, fontSize: 13, outline: 'none', marginBottom: 8, boxSizing: 'border-box' }} />
            <input type="time" value={time} onChange={e => setTime(e.target.value)} style={{ width: '100%', padding: '9px 12px', background: '#0A1220', border: `0.5px solid ${C.border}`, borderRadius: 10, color: C.text, fontSize: 13, outline: 'none', marginBottom: 8, boxSizing: 'border-box' }} />
            <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
              {FREQUENCIES.map(f => (
                <button type="button" key={f.id} onClick={() => setFrequency(f.id)} style={{ flex: 1, padding: '8px 6px', borderRadius: 10, border: 'none', background: frequency === f.id ? C.teal : 'rgba(255,255,255,0.07)', color: frequency === f.id ? '#04342C' : C.muted, fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>{f.label}</button>
              ))}
            </div>
            <button type="button" onClick={addReminder} style={{ width: '100%', padding: 11, borderRadius: 12, border: 0, background: C.teal, color: '#04342C', fontWeight: 800, cursor: 'pointer', marginBottom: 14 }}>Add to calendar</button>

            {plans.length > 0 && (
              <>
                <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, marginBottom: 6 }}>TODAY</div>
                {plans.map(plan => {
                  const dues = dosesDueFor(plan, today(), adherence, new Date());
                  const summary = adherenceSummary(plan, adherence);
                  return (
                    <div key={plan.id} style={{ border: `0.5px solid ${C.border}`, borderRadius: 12, padding: 10, marginBottom: 8 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>{plan.label}</div>
                      {dues.map(dose => {
                        const taken = adherence.some(r => r.planId === plan.id && r.doseId === dose.id && r.date === today() && r.taken);
                        return (
                          <div key={dose.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12, padding: '4px 0' }}>
                            <span style={{ color: dose.overdue ? C.warn : C.muted }}>{dose.time}{dose.overdue ? ' · overdue' : ''}</span>
                            <button type="button" onClick={() => markTaken(plan, dose.id)} disabled={taken} style={{ padding: '4px 10px', borderRadius: 8, border: 0, background: taken ? 'rgba(45,212,164,0.2)' : 'rgba(255,255,255,0.1)', color: taken ? C.teal : C.text, fontSize: 11, cursor: taken ? 'default' : 'pointer' }}>{taken ? 'Taken' : 'Mark taken'}</button>
                          </div>
                        );
                      })}
                      <div style={{ fontSize: 10, color: C.muted, marginTop: 4 }}>
                        {summary.rate == null ? 'No doses recorded yet.' : `Recorded ${summary.taken}/${summary.scheduled} doses.`}
                      </div>
                    </div>
                  );
                })}
              </>
            )}

            {error && <div style={{ color: C.warn, fontSize: 11, marginBottom: 8 }}>{error}</div>}

            <button type="button" onClick={onClose} style={{ width: '100%', padding: 12, borderRadius: 12, border: `1px solid ${C.border}`, background: 'transparent', color: C.text, cursor: 'pointer' }}>Close</button>
            <div style={{ fontSize: 10, color: C.muted, marginTop: 10, lineHeight: 1.5 }}>
              Stored on this device only. VEEDA does not give dosing advice. Drug-database identity is not package authenticity.
            </div>
          </>
        )}
      </motion.div>
    </div>
  );
}
