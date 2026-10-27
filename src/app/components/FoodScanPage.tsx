import { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import {
  FOOD_PHOTO_NOTE,
  WHEN_IN_DOUBT_NOTE,
  foodRecognitionState,
  foodSafetyFlags,
  foodScanQuestions,
  parseIngredientList,
  type FoodObservation,
} from '../foodScan';
import { buildRegistry } from '../modelRegistry';
import { CONSENT_ITEMS, CONSENT_VERSION, hasConsent, recordConsent } from '../consent';
import { syncConsentRecord } from '../api';

const C = { teal: '#2DD4A4', text: '#E2F4F0', muted: '#5A7A72', card: 'rgba(13,21,37,0.96)', border: 'rgba(255,255,255,0.1)', warn: '#EF9F27' };

// VEEDA ships no model, so the recognition slot always reports not-validated.
const REGISTRY = buildRegistry([]);

export function FoodScanPage({ open, onClose, userId }: { open: boolean; onClose: () => void; userId: string }) {
  const [consented, setConsented] = useState(false);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [description, setDescription] = useState('');
  const [ingredients, setIngredients] = useState('');
  const [portion, setPortion] = useState('');
  const [preparation, setPreparation] = useState('');
  const [symptoms, setSymptoms] = useState('');
  const [packaged, setPackaged] = useState(false);
  const [observation, setObservation] = useState<FoodObservation | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const cameraItem = CONSENT_ITEMS.find(item => item.feature === 'camera_sensor');
  const consentedNow = consented || hasConsent(window.localStorage, userId, 'camera_sensor');
  const recognition = foodRecognitionState(REGISTRY);

  useEffect(() => {
    if (!open) return;
    setPhotoUrl(null);
    setObservation(null);
  }, [open]);

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
  }

  function scan() {
    setObservation({
      description: description.trim(),
      ingredients: parseIngredientList(ingredients),
      portion: portion.trim() || null,
      preparation: preparation.trim() || null,
      symptoms: parseIngredientList(symptoms),
      packaged,
    });
  }

  const flags = observation ? foodSafetyFlags(observation) : [];
  const questions = observation ? foodScanQuestions(observation) : [];

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 2000, background: 'rgba(0,0,0,0.72)', display: 'grid', placeItems: 'center', padding: 16 }}>
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
        style={{ width: '100%', maxWidth: 380, maxHeight: '88vh', overflowY: 'auto', background: C.card, border: `1px solid ${C.border}`, borderRadius: 20, padding: 18, color: C.text }}>
        <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 4 }}>Food scanner</div>
        <div style={{ fontSize: 11, color: C.warn, lineHeight: 1.5, marginBottom: 12 }}>{FOOD_PHOTO_NOTE}</div>

        {!consentedNow ? (
          <>
            <div style={{ fontSize: 12, lineHeight: 1.5, marginBottom: 12 }}>{cameraItem?.body}</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={onClose} style={{ flex: 1, padding: 12, borderRadius: 12, border: `1px solid ${C.border}`, background: 'transparent', color: C.text, cursor: 'pointer' }}>Close</button>
              <button onClick={grantCameraConsent} style={{ flex: 1, padding: 12, borderRadius: 12, border: 0, background: C.teal, color: '#04342C', fontWeight: 800, cursor: 'pointer' }}>I understand, continue</button>
            </div>
          </>
        ) : (
          <>
            <button onClick={() => fileRef.current?.click()} style={{ width: '100%', padding: 12, borderRadius: 12, border: `1px solid ${C.border}`, background: 'rgba(45,212,164,0.08)', color: C.teal, fontWeight: 700, cursor: 'pointer', marginBottom: 8 }}>
              Take or choose a photo of the food
            </button>
            <input ref={fileRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={e => onPickPhoto(e.target.files?.[0])} />
            {photoUrl && <img src={photoUrl} alt="Food" style={{ width: '100%', borderRadius: 12, marginBottom: 10, border: `1px solid ${C.border}` }} />}
            <div style={{ fontSize: 11, color: C.muted, lineHeight: 1.5, marginBottom: 10 }}>{recognition.label}</div>

            <label style={{ display: 'block', fontSize: 12, color: C.muted, marginBottom: 4 }}>What is it?</label>
            <input value={description} onChange={e => setDescription(e.target.value)} placeholder="Jollof rice with chicken"
              style={{ width: '100%', padding: '10px 12px', background: '#0A1220', border: `0.5px solid ${C.border}`, borderRadius: 10, color: C.text, fontSize: 13, outline: 'none', marginBottom: 10, boxSizing: 'border-box' }} />

            <label style={{ display: 'block', fontSize: 12, color: C.muted, marginBottom: 4 }}>Main ingredients</label>
            <textarea value={ingredients} onChange={e => setIngredients(e.target.value)} rows={2} placeholder="rice, tomato, chicken, oil"
              style={{ width: '100%', padding: '10px 12px', background: '#0A1220', border: `0.5px solid ${C.border}`, borderRadius: 10, color: C.text, fontSize: 13, outline: 'none', marginBottom: 10, boxSizing: 'border-box', resize: 'vertical' }} />

            <label style={{ display: 'block', fontSize: 12, color: C.muted, marginBottom: 4 }}>Portion</label>
            <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
              {['small', 'medium', 'large'].map(size => (
                <button key={size} onClick={() => setPortion(size)} style={{ flex: 1, padding: '8px 6px', borderRadius: 10, border: 'none', background: portion === size ? C.teal : 'rgba(255,255,255,0.07)', color: portion === size ? '#04342C' : C.muted, fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>{size}</button>
              ))}
            </div>

            <label style={{ display: 'block', fontSize: 12, color: C.muted, marginBottom: 4 }}>How stored, cooked, or the package date</label>
            <input value={preparation} onChange={e => setPreparation(e.target.value)} placeholder="Cooked today, eaten within an hour"
              style={{ width: '100%', padding: '10px 12px', background: '#0A1220', border: `0.5px solid ${C.border}`, borderRadius: 10, color: C.text, fontSize: 13, outline: 'none', marginBottom: 10, boxSizing: 'border-box' }} />

            <label style={{ display: 'block', fontSize: 12, color: C.muted, marginBottom: 4 }}>Any symptoms since eating (optional)</label>
            <input value={symptoms} onChange={e => setSymptoms(e.target.value)} placeholder="none, or stomach pain, rash"
              style={{ width: '100%', padding: '10px 12px', background: '#0A1220', border: `0.5px solid ${C.border}`, borderRadius: 10, color: C.text, fontSize: 13, outline: 'none', marginBottom: 10, boxSizing: 'border-box' }} />

            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: C.muted, marginBottom: 12 }}>
              <input type="checkbox" checked={packaged} onChange={e => setPackaged(e.target.checked)} />
              It came from a package
            </label>

            <button onClick={scan} disabled={!description.trim()} style={{ width: '100%', padding: 11, borderRadius: 12, border: 0, background: description.trim() ? C.teal : 'rgba(255,255,255,0.08)', color: description.trim() ? '#04342C' : C.muted, fontWeight: 800, cursor: 'pointer', marginBottom: 12 }}>
              Check this food
            </button>

            {observation && (
              <>
                {flags.length > 0 && (
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, marginBottom: 6 }}>SAFETY</div>
                    {flags.map(flag => (
                      <div key={flag.id} style={{ fontSize: 11, color: flag.urgent ? '#FF6B6B' : C.warn, lineHeight: 1.5, marginBottom: 4 }}>{flag.text}</div>
                    ))}
                    <div style={{ fontSize: 11, color: C.warn, lineHeight: 1.5, marginTop: 4 }}>{WHEN_IN_DOUBT_NOTE}</div>
                  </div>
                )}

                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, marginBottom: 6 }}>WHAT I STILL NEED TO ASK</div>
                  {questions.map(question => <div key={question} style={{ fontSize: 11, color: C.text, lineHeight: 1.5, marginBottom: 4 }}>• {question}</div>)}
                </div>
              </>
            )}

            <button onClick={onClose} style={{ width: '100%', padding: 12, borderRadius: 12, border: `1px solid ${C.border}`, background: 'transparent', color: C.text, cursor: 'pointer' }}>Close</button>
            <div style={{ fontSize: 10, color: C.muted, marginTop: 10, lineHeight: 1.5 }}>
              The photo stays on this device. This is general food-safety guidance, not a diagnosis, and it cannot tell you a food is safe.
            </div>
          </>
        )}
      </motion.div>
    </div>
  );
}
