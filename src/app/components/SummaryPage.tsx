import { useMemo, useState } from 'react';
import { motion } from 'motion/react';
import {
  SOURCE_LABEL,
  buildHealthSummaryHtml,
  summaryFilename,
  type SectionId,
  type SummarySection,
} from '../healthSummary';
import { CONSENT_ITEMS, CONSENT_VERSION, hasConsent, recordConsent, type ConsentFeature } from '../consent';
import { syncConsentRecord } from '../api';

const C = { teal: '#2DD4A4', text: '#E2F4F0', muted: '#5A7A72', card: 'rgba(13,21,37,0.96)', border: 'rgba(255,255,255,0.1)' };

const SECTION_LABELS: Record<SectionId, string> = {
  vitals: 'Vitals',
  bp_glucose: 'Blood pressure and glucose',
  medications: 'Medications',
  notes: 'Notes',
};

const CONSENT_FEATURE: ConsentFeature = 'shareable_summary';

interface SummaryPageProps {
  open: boolean;
  onClose: () => void;
  userId: string;
  sections: SummarySection[];
}

export function SummaryPage({ open, onClose, userId, sections }: SummaryPageProps) {
  const [chosen, setChosen] = useState<SectionId[]>(() => sections.filter(s => s.values.length > 0).map(s => s.id));
  const [consented, setConsented] = useState(false);

  const consentItem = CONSENT_ITEMS.find(item => item.feature === CONSENT_FEATURE);
  const available = useMemo(() => sections.filter(s => s.values.length > 0), [sections]);

  if (!open) return null;

  function grantConsent() {
    recordConsent(window.localStorage, userId, CONSENT_FEATURE);
    void syncConsentRecord(CONSENT_FEATURE, CONSENT_VERSION, true);
    setConsented(true);
  }

  function toggle(id: SectionId) {
    setChosen(prev => (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]));
  }

  function createPdf() {
    const generatedAt = new Date().toISOString();
    const html = buildHealthSummaryHtml({ generatedAt, sections }, chosen);
    const win = window.open('', '_blank');
    if (!win) return;
    win.document.write(html);
    win.document.close();
    win.document.title = summaryFilename(generatedAt).replace('.pdf', '');
    win.focus();
    win.print();
  }

  const consentedNow = consented || hasConsent(window.localStorage, userId, CONSENT_FEATURE);

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 2000, background: 'rgba(0,0,0,0.72)', display: 'grid', placeItems: 'center', padding: 20 }}>
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
        style={{ width: '100%', maxWidth: 360, maxHeight: '86vh', overflowY: 'auto', background: C.card, border: `1px solid ${C.border}`, borderRadius: 20, padding: 20, color: C.text }}>
        <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 4 }}>Shareable health summary</div>
        <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.5, marginBottom: 14 }}>
          This summary is created on your device. Nothing is uploaded until you share the file yourself.
        </div>

        {!consentedNow ? (
          <>
            <div style={{ fontSize: 13, lineHeight: 1.5, marginBottom: 14 }}>{consentItem?.body}</div>
            <button onClick={grantConsent} style={{ width: '100%', padding: 12, borderRadius: 12, border: 0, background: C.teal, color: '#04342C', fontWeight: 800, cursor: 'pointer' }}>
              I understand, continue
            </button>
          </>
        ) : (
          <>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: C.muted, marginBottom: 8 }}>
              Choose sections
            </div>
            {available.length === 0 && (
              <div style={{ fontSize: 12, color: C.muted, marginBottom: 12 }}>You have no recorded readings to include yet.</div>
            )}
            {available.map(section => (
              <label key={section.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderBottom: `0.5px solid ${C.border}`, fontSize: 13 }}>
                <input type="checkbox" checked={chosen.includes(section.id)} onChange={() => toggle(section.id)} />
                <span style={{ flex: 1 }}>{SECTION_LABELS[section.id]}</span>
                <span style={{ color: C.muted, fontSize: 11 }}>
                  {section.values.map(v => SOURCE_LABEL[v.source]).filter((v, i, a) => a.indexOf(v) === i).join(', ')}
                </span>
              </label>
            ))}
            <div style={{ fontSize: 11, color: C.muted, marginTop: 12, lineHeight: 1.5 }}>
              The file is titled “Self-recorded health summary” and states it is not a diagnosis. It is saved with a neutral filename and shows a generated-on date.
            </div>
          </>
        )}

        <div style={{ display: 'flex', gap: 8, marginTop: 18 }}>
          <button onClick={onClose} style={{ flex: 1, padding: 12, borderRadius: 12, border: `1px solid ${C.border}`, background: 'transparent', color: C.text, cursor: 'pointer' }}>
            Close
          </button>
          {consentedNow && (
            <button onClick={createPdf} disabled={chosen.length === 0}
              style={{ flex: 1, padding: 12, borderRadius: 12, border: 0, background: chosen.length ? C.teal : 'rgba(255,255,255,0.1)', color: chosen.length ? '#04342C' : C.muted, fontWeight: 800, cursor: chosen.length ? 'pointer' : 'not-allowed' }}>
              Create PDF
            </button>
          )}
        </div>
      </motion.div>
    </div>
  );
}
