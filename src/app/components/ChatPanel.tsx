import { motion, AnimatePresence } from 'motion/react';
import { X, Send, Sparkles, Plus, Camera, Image as ImageIcon, FileText, Trash2 } from 'lucide-react';
import { Fragment, useState, useRef, useEffect, type ReactNode } from 'react';
import { apiFetchDetailed, getActor, getCurrentUser, LOCAL_USER_ID } from '../api';
import { emergencyHelpLine, resolveEmergencyNumber } from '../emergencyNumber';
import { CHILD_NOT_VALIDATED_NOTE } from '../dependents';
import { INTAKE_STEPS, answerIntake, createIntakeSession, buildConsultationRecord, type IntakeSession, type ConsultationRecord } from '../symptomIntake';
import { converse, createDialogueState, dailyCheckIn, type DialogueResult, type NearbyCare } from '../dialogueEngine';
import { saveConsultation } from '../consultations';
import { ConsultationSheet } from './ConsultationSheet';
import { recognizePackageImage } from '../medicineOcr';
import { buildRegistry } from '../modelRegistry';
import { imageVisionState, fetchVisionStatus } from '../sensorContext';
import { buildVisionAnalyzePayload } from '../visionRequest';
import { formatAttachmentSize, shouldUseNativeCamera, validateChatDocument, validateChatImage } from '../chatAttachments';
import { ChatCameraCapture } from './ChatCameraCapture';
import type { Vitals, Analysis, Profile, Location } from '../useVedaApp';
const VISION_REGISTRY = buildRegistry([]);
const VISION_LOCAL = imageVisionState(VISION_REGISTRY);
const IMAGE_NOTE = 'A photo can be read for text on this device, but VEEDA has no validated vision model to interpret what is in it. Photos are not proof of authenticity.';
const IMAGE_DISABLED_NOTE = 'Attach a photo is not available on this device.';
type VisionStatus = ReturnType<typeof imageVisionState> & { providers?: Array<{ name: string; model: string }> };
const VISION_INITIAL: VisionStatus = { ...VISION_LOCAL, providers: undefined };

const C = { teal: '#2DD4A4', text: '#E2F4F0', muted: '#5A7A72', border: 'rgba(255,255,255,0.09)' };
interface Msg {
  id: number;
  role: 'user' | 'assistant';
  content: string;
  imageUrl?: string;
  document?: { name: string; type: string; size: number };
  actions?: { kind: 'consultation'; record: ConsultationRecord };
}
interface PendingImage { file: File; imageUrl: string; ocrText: string; ocrUncertain: boolean; }
interface PendingDocument { file: File; }
interface NearbyPlace { name: string; type?: string; category?: string; distM?: number; phone?: string | null; }
const SUGGESTIONS = ['How are my readings?', 'Talk about a symptom', 'Review my medicines', 'Report a symptom'];

export function ChatPanel({ open, onClose, vitals, analysis, adultScoresAllowed = true, subjectLabel, location, profile }: {
  open: boolean; onClose: () => void; vitals: Vitals; analysis: Analysis | null; wellnessScore: number | null; profile: Profile | null;
  /** False for a child or unknown age: NEWS2/qSOFA must not be shown. */
  adultScoresAllowed?: boolean;
  /** The selected subject's name, for the "not validated" note. */
  subjectLabel?: string;
  /** Device position, used to name mapped hospitals and pharmacies. */
  location?: Location | null;
}) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [intake, setIntake] = useState<IntakeSession | null>(null);
  const [viewRecord, setViewRecord] = useState<ConsultationRecord | null>(null);
  const [nearbyCare, setNearbyCare] = useState<NearbyCare | undefined>(undefined);
  const [attachBusy, setAttachBusy] = useState(false);
  const [pendingImage, setPendingImage] = useState<PendingImage | null>(null);
  const [pendingDocument, setPendingDocument] = useState<PendingDocument | null>(null);
  const [attachmentMenuOpen, setAttachmentMenuOpen] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [attachmentError, setAttachmentError] = useState('');
  const endRef = useRef<HTMLDivElement>(null);
  const photoRef = useRef<HTMLInputElement>(null);
  const cameraFileRef = useRef<HTMLInputElement>(null);
  const documentRef = useRef<HTMLInputElement>(null);
  const dialogueRef = useRef(createDialogueState());
  const [vision, setVision] = useState<VisionStatus>(VISION_INITIAL);
  const [viewport, setViewport] = useState<{ height: number; top: number } | null>(null);
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Runtime check: ask backend whether a vision-capable provider with a key exists.
  // Never trusts the local allowlist alone (prevents false claims of vision support).
  useEffect(() => {
    let cancelled = false;
    void fetchVisionStatus().then((status) => {
      if (!cancelled) setVision(status as VisionStatus);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // The profile targets only frame a daily question; the dialogue engine never
  // states them as an instruction or scores the answer against them.
  const dailyGoals = { waterTarget: profile?.waterTarget, stepGoal: profile?.stepGoal };

  // Load mapped hospitals/pharmacies once per position so an emergency or
  // "where am I" turn can name the nearest ones without a network call at the
  // moment of need. Failure just leaves the care line out — the reply still
  // stands, which is what keeps the conversation working with no providers.
  useEffect(() => {
    if (!open || location?.lat == null || location?.lng == null) return;
    let cancelled = false;
    void apiFetchDetailed<{ places?: NearbyPlace[]; hospitals?: NearbyPlace[] }>(
      `/api/map/nearby?lat=${location.lat}&lng=${location.lng}&radiusMeters=5000`,
    ).then(result => {
      if (cancelled || !result.data) return;
      const all = [...(result.data.hospitals ?? []), ...(result.data.places ?? [])];
      const isPharmacy = (p: NearbyPlace) => p.type === 'pharmacy' || p.category === 'pharmacy';
      const byDistance = (a: NearbyPlace, b: NearbyPlace) => (a.distM ?? Infinity) - (b.distM ?? Infinity);
      const toPlace = (p: NearbyPlace) => ({ name: p.name, distM: p.distM, phone: p.phone ?? null });
      setNearbyCare({
        hospitals: all.filter(p => !isPharmacy(p) && ['hospital', 'clinic', 'doctors'].includes(p.type ?? '')).sort(byDistance).slice(0, 3).map(toPlace),
        pharmacies: all.filter(isPharmacy).sort(byDistance).slice(0, 3).map(toPlace),
      });
    });
    return () => { cancelled = true; };
  }, [open, location?.lat, location?.lng]);

  useEffect(() => {
    if (!open || messages.length) return;
    const intro = adultScoresAllowed
      ? `I’m here with you${analysis?.clinicalScores?.news2 ? `, and I can see the current NEWS2 is ${analysis.clinicalScores.news2.total}` : ''}. We can talk through symptoms, medicines, how you feel, or your readings. ${dailyCheckIn(new Date(), dailyGoals)}`
      : `${childNote()} What symptoms or changes have you noticed?`;
    setMessages([{ id: Date.now(), role: 'assistant', content: intro }]);
  }, [open, messages.length, analysis?.clinicalScores?.news2, adultScoresAllowed, dailyGoals.waterTarget, dailyGoals.stepGoal]);

  function childNote(): string {
    const who = subjectLabel ? `${subjectLabel}: ` : '';
    return `${who}${CHILD_NOT_VALIDATED_NOTE}. NEWS2 and qSOFA are adult tools, so no score is shown for this profile.`;
  }

  // iOS Safari resizes its visual viewport independently of the layout viewport.
  // Position the sheet within the visible area without moving the page behind it.
  useEffect(() => {
    if (!open) { setViewport(null); setKeyboardOpen(false); return; }
    const visual = window.visualViewport;
    const update = () => {
      if (!visual) { setViewport(null); return; }
      const keyboardVisible = visual.height < window.innerHeight * 0.78;
      setKeyboardOpen(keyboardVisible);
      setViewport({ height: visual.height, top: visual.offsetTop });
    };
    update();
    visual?.addEventListener('resize', update);
    visual?.addEventListener('scroll', update);
    window.addEventListener('orientationchange', update);
    return () => {
      visual?.removeEventListener('resize', update);
      visual?.removeEventListener('scroll', update);
      window.removeEventListener('orientationchange', update);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const list = scrollRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [messages, open]);

  useEffect(() => {
    if (!attachmentMenuOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') setAttachmentMenuOpen(false); };
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [attachmentMenuOpen]);

  function startIntake() {
    setIntake(createIntakeSession());
    setMessages(m => [...m,
      { id: Date.now(), role: 'user', content: 'Report a symptom' },
      { id: Date.now() + 1, role: 'assistant', content: `Okay — I'll ask a few short questions and prepare a summary you can show a doctor. This is not a diagnosis; answer in your own words.\n\n${INTAKE_STEPS[0].question}` },
    ]);
  }

  function handleIntakeAnswer(content: string) {
    const session = intake!;
    setMessages(m => [...m, { id: Date.now(), role: 'user', content }]);
    const result = answerIntake(session, content);
    setIntake(result.session.done ? null : result.session);
    if (!result.completed) {
      setMessages(m => [...m, { id: Date.now() + 1, role: 'assistant', content: result.nextQuestion! }]);
      return;
    }
    if (!result.session.redFlag && /^(stop|cancel|quit)$/i.test(content.trim())) {
      setMessages(m => [...m, { id: Date.now() + 1, role: 'assistant', content: 'Okay, I stopped the symptom questions and saved nothing. Tap "Report a symptom" any time to start again.' }]);
      return;
    }
    const userId = getCurrentUser()?.id ?? LOCAL_USER_ID;
    const record = buildConsultationRecord({ session: result.session, subjectLabel: subjectLabel ?? null, adultScoresAllowed, vitals, analysis });
    const saved = saveConsultation(userId, record);
    const number = resolveEmergencyNumber();
    const redLine = result.redFlag
      ? `You reported ${result.redFlag}. If this is happening right now, get medical help now${number ? ` or call ${number}` : emergencyHelpLine()}.\n\n`
      : '';
    setMessages(m => [...m, {
      id: Date.now() + 1,
      role: 'assistant',
      content: `${redLine}I put everything into a symptom summary you can show a doctor. It is not a diagnosis.`,
      actions: saved ? { kind: 'consultation', record } : undefined,
    }]);
  }

  async function enhanceWithProvider(content: string, local: DialogueResult, replyId: number, history: Array<{ role: 'user' | 'assistant'; content: string }>) {
    try {
      const actor = getActor();
      const ai = await apiFetchDetailed<{ conversationReply: string; source?: string }>('/api/ai-chat', {
        method: 'POST',
        body: JSON.stringify({
          message: content, vitals, analysis, patient_id: actor.patientId, history,
          subject: { adultScoresAllowed, label: subjectLabel ?? null },
          localGuidance: local.reply,
        }),
      });
      if (ai.status === 429) {
        setMessages(current => current.map(msg => msg.id === replyId
          ? { ...msg, content: `${msg.content}\n\nEnhanced AI replies are at their limit; this local conversation remains available.` }
          : msg));
        return;
      }
      const enhanced = ai.data?.source === 'ai' ? ai.data.conversationReply?.trim() : null;
      if (enhanced) {
        setMessages(current => current.map(msg => msg.id === replyId ? { ...msg, content: enhanced } : msg));
        return;
      }
      const reason = ai.status === 401 ? 'Please sign in to enable AI chat.'
        : ai.status === 403 ? 'AI chat access was denied.'
        : ai.status === 0 ? 'The AI server could not be reached.'
        : ai.data?.source === 'local' || ai.data?.source === 'rule' ? 'The configured AI providers did not return a response.'
        : `AI chat was unavailable${ai.status ? ` (HTTP ${ai.status})` : ''}.`;
      setMessages(current => current.map(msg => msg.id === replyId
        ? { ...msg, content: `${local.reply}\n\n${reason} This is an offline support response, not a live AI answer.` }
        : msg));
    } catch {
      setMessages(current => current.map(msg => msg.id === replyId
        ? { ...msg, content: `${local.reply}\n\nAI chat could not be reached. This is an offline support response.` }
        : msg));
    }
  }

  async function onAttachFile(file: File | undefined) {
    if (!file) return;
    const validation = validateChatImage(file);
    if (!validation.ok) { setAttachmentError(validation.error); return; }
    setAttachmentError('');
    setAttachBusy(true);
    const imageUrl = URL.createObjectURL(file);
    try {
      const ocr = await recognizePackageImage(file);
      if (pendingImage) URL.revokeObjectURL(pendingImage.imageUrl);
      setPendingImage({ file, imageUrl, ocrText: ocr.rawText.trim().slice(0, 1200), ocrUncertain: ocr.uncertain });
      setPendingDocument(null);
    } catch {
      if (pendingImage) URL.revokeObjectURL(pendingImage.imageUrl);
      setPendingImage({ file, imageUrl, ocrText: '', ocrUncertain: true });
      setPendingDocument(null);
    } finally {
      setAttachBusy(false);
      if (photoRef.current) photoRef.current.value = '';
      if (cameraFileRef.current) cameraFileRef.current.value = '';
    }
  }

  function onAttachDocument(file: File | undefined) {
    if (!file) return;
    const validation = validateChatDocument(file);
    if (!validation.ok) { setAttachmentError(validation.error); return; }
    setAttachmentError('');
    if (pendingImage) URL.revokeObjectURL(pendingImage.imageUrl);
    setPendingImage(null);
    setPendingDocument({ file });
    if (documentRef.current) documentRef.current.value = '';
  }

  function removeAttachment() {
    if (pendingImage) URL.revokeObjectURL(pendingImage.imageUrl);
    setPendingImage(null);
    setPendingDocument(null);
    setAttachmentError('');
  }

  function takePhoto() {
    setAttachmentMenuOpen(false);
    const native = shouldUseNativeCamera(navigator, window.matchMedia?.('(pointer: coarse)').matches === true);
    if (native || !navigator.mediaDevices?.getUserMedia) cameraFileRef.current?.click();
    else setCameraOpen(true);
  }

  async function sendAttachedImage(question: string, attachment: PendingImage) {
    setAttachBusy(true);
    const history = messages.slice(-6).map(m => ({ role: m.role, content: m.content.slice(0, 600) }));
    const ocrSupplement = attachment.ocrText
      ? `\n\nOn-device OCR supplement${attachment.ocrUncertain ? ' (uncertain; confirm against the image)' : ''}:\n${attachment.ocrText}`
      : '';
    const localContent = `${question}${ocrSupplement}`;
    setMessages(current => [...current, { id: Date.now(), role: 'user', content: question, imageUrl: attachment.imageUrl }]);
    try {
      const local = converse(dialogueRef.current, localContent, {
             vitals, analysis, adultScoresAllowed, subjectLabel: subjectLabel ?? null,
             now: new Date(), emergencyNumber: resolveEmergencyNumber(),
             nearbyCare, dailyGoals,
      });
      dialogueRef.current = local.state;
      const replyId = Date.now() + 1;
      const noVisionNote = `${IMAGE_NOTE} For a full package check (confirm fields, drug knowledge, interactions), open Medicine from Profile.`;
      let assist = vision.available ? local.reply : `${local.reply}\n\n${noVisionNote}`;
      if (vision.available) {
        try {
          const base64 = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve((reader.result as string).split(',')[1]);
            reader.onerror = () => reject(reader.error);
            reader.readAsDataURL(attachment.file);
          });
          const payload = buildVisionAnalyzePayload({
            base64,
            mimeType: attachment.file.type,
            ocrText: attachment.ocrText,
            question,
            history,
          });
          const visionResp = await apiFetchDetailed<any>('/vision/analyze', {
            method: 'POST',
            body: JSON.stringify(payload),
          });
              if (visionResp.data?.visionReply) {
                const { parseVisionResponseText, formatVisionReportForChat } = await import('../visionObservation');
                const { guardObservations } = await import('../visionSafetyGuard');
                const parsed = parseVisionResponseText(visionResp.data.visionReply, { type: 'vision', provider: visionResp.data?.provider, model: visionResp.data?.model });
                const guard = guardObservations(parsed.observations);
                const visionNote = guard.safe ? '' : `\n\nSafety note: ${guard.notes.join(' ')}`;
                const formatted = formatVisionReportForChat(parsed);
            assist = `${formatted}${visionNote}`;
              } else if (visionResp.data?.visionState === 'FAILED') {
            assist = `${local.reply}\n\n${visionResp.data.visionNote || 'Vision processing failed. Please try again or describe the image manually.'}`;
              } else if (visionResp.data?.ocrText || visionResp.data?.source === 'ocr') {
            assist = `${local.reply}\n\nI couldn't send this image to a vision model, but I ran text recognition.\n\n${visionResp.data?.ocrText ? `Detected text:\n${visionResp.data.ocrText}` : ''}`;
              }
        }
        catch {
          assist = `${local.reply}\n\nVision request failed. Falling back to text/OCR. ${attachment.ocrText ? `Detected text:\n${attachment.ocrText}` : 'Describe the image manually.'}`;
        }
      }
      setMessages(current => [...current, { id: replyId, role: 'assistant', content: assist }]);
    } finally {
      setAttachBusy(false);
    }
  }

  function send(text?: string) {
    const content = (text ?? input).trim();
    if (pendingImage) {
      const question = content || 'What is visible in this image?';
      const attachment = pendingImage;
      setInput('');
      setPendingImage(null);
      void sendAttachedImage(question, attachment);
      return;
    }
    if (pendingDocument) {
      const document = pendingDocument.file;
      const question = content || 'Analyze this document.';
      setInput('');
      setPendingDocument(null);
      setMessages(current => [...current,
        { id: Date.now(), role: 'user', content: question, document: { name: document.name, type: document.type, size: document.size } },
        { id: Date.now() + 1, role: 'assistant', content: 'Document analysis is not available yet. This PDF was not uploaded or analyzed. You can paste the relevant text into the chat.' },
      ]);
      return;
    }
    if (!content) return;
    setInput('');
    if (intake) { handleIntakeAnswer(content); return; }
    const history = messages.slice(-6).map(m => ({ role: m.role, content: m.content.slice(0, 600) }));
    const local = converse(dialogueRef.current, content, {
      vitals, analysis, adultScoresAllowed, subjectLabel: subjectLabel ?? null,
      now: new Date(), emergencyNumber: resolveEmergencyNumber(),
      nearbyCare, dailyGoals,
    });
    dialogueRef.current = local.state;
    const replyId = Date.now() + 1;
    setMessages(current => [...current,
      { id: Date.now(), role: 'user', content },
      { id: replyId, role: 'assistant', content: local.urgent ? local.reply : 'VEEDA is thinking…' },
    ]);
    if (!local.urgent) void enhanceWithProvider(content, local, replyId, history);
  }

  return <AnimatePresence>{open && <><motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)', zIndex: 500 }} /><motion.div initial={{ y: '100%', x: '-50%' }} animate={{ y: 0, x: '-50%' }} exit={{ y: '100%', x: '-50%' }} style={{ position: 'fixed', top: viewport ? viewport.top + (keyboardOpen ? 0 : Math.max(0, viewport.height - Math.min(viewport.height * 0.92, 760))) : undefined, bottom: viewport ? undefined : 0, left: '50%', width: '100%', maxWidth: 390, height: viewport ? (keyboardOpen ? viewport.height : Math.min(viewport.height * 0.92, 760)) : 'min(92dvh, 760px)', maxHeight: viewport ? viewport.height : 'calc(100dvh - 12px)', display: 'flex', flexDirection: 'column', background: 'rgba(9,14,26,0.98)', borderRadius: '24px 24px 0 0', zIndex: 600, overflow: 'hidden', border: '0.5px solid rgba(255,255,255,0.1)', borderBottom: 'none' }}>
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: keyboardOpen ? '10px 16px' : '18px 20px 14px', flexShrink: 0, borderBottom: `0.5px solid ${C.border}` }}><div style={{ display: 'flex', alignItems: 'center', gap: 10 }}><div style={{ width: 36, height: 36, borderRadius: 12, background: 'linear-gradient(135deg,rgba(45,212,164,0.2),rgba(55,138,221,0.15))', display: 'grid', placeItems: 'center', color: C.teal }}><Sparkles size={16} /></div><div><div style={{ fontSize: 15, fontWeight: 700, color: C.text }}>Clinical Support</div><div style={{ fontSize: 11, color: C.teal }}>{adultScoresAllowed && analysis?.clinicalScores?.news2 ? `NEWS2: ${analysis.clinicalScores.news2.total} · ` : ''}{adultScoresAllowed ? (analysis?.riskLevel ?? 'Monitoring') : CHILD_NOT_VALIDATED_NOTE}</div></div></div><button onClick={onClose} style={{ width: 34, height: 34, borderRadius: 10, background: 'rgba(255,255,255,0.07)', border: 'none', color: C.muted }}><X size={16} /></button></div>
    <div ref={scrollRef} style={{ flex: 1, minHeight: 0, overflowY: 'auto', overscrollBehavior: 'contain', WebkitOverflowScrolling: 'touch', padding: '16px 16px 8px', display: 'flex', flexDirection: 'column', gap: 12, scrollbarWidth: 'none' }}>{messages.map(msg => <Fragment key={msg.id}><motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} style={{ alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start', maxWidth: '88%', padding: '10px 14px', borderRadius: msg.role === 'user' ? '16px 16px 4px 16px' : '16px 16px 16px 4px', background: msg.role === 'user' ? 'rgba(45,212,164,0.14)' : 'var(--secondary)', border: `0.5px solid ${msg.role === 'user' ? 'rgba(45,212,164,0.25)' : 'var(--border)'}`, fontSize: 13, color: 'var(--foreground)', lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>{msg.imageUrl && <img src={msg.imageUrl} alt="Attached" style={{ width: '100%', borderRadius: 10, marginBottom: 8, border: '0.5px solid var(--border)', display: 'block' }} />}{msg.document && <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8, padding: 8, borderRadius: 10, background: 'var(--muted)' }}><FileText size={18} /><span style={{ minWidth: 0 }}><strong style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis' }}>{msg.document.name}</strong><small>{msg.document.type} · {formatAttachmentSize(msg.document.size)}</small></span></div>}{msg.content}</motion.div>{msg.actions?.kind === 'consultation' && <button onClick={() => setViewRecord(msg.actions!.record)} style={{ alignSelf: 'flex-start', margin: '-4px 0 0 14px', padding: '6px 12px', background: 'rgba(45,212,164,0.12)', border: '0.5px solid rgba(45,212,164,0.3)', borderRadius: 12, color: C.teal, fontSize: 12, fontWeight: 700 }}>Open summary for the doctor</button>}</Fragment>)}<div ref={endRef} /></div>
    {!keyboardOpen && <div style={{ padding: '6px 16px 8px', display: 'flex', gap: 6, overflowX: 'auto', scrollbarWidth: 'none' }}>{SUGGESTIONS.map(s => <button key={s} onClick={() => (s === 'Report a symptom' ? startIntake() : send(s))} style={{ flexShrink: 0, padding: '6px 12px', background: 'rgba(45,212,164,0.08)', border: '0.5px solid rgba(45,212,164,0.2)', borderRadius: 20, color: C.teal, fontSize: 11, fontWeight: 600 }}>{s}</button>)}</div>}
    {(pendingImage || pendingDocument) && <div style={{ padding: '8px 16px 0' }}>
      {pendingImage && <div style={{ position: 'relative', width: 82, height: 82 }}><img src={pendingImage.imageUrl} alt="Photo ready to send" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 14, border: '1px solid var(--border)' }} /><button type="button" onClick={removeAttachment} aria-label="Remove attached photo" style={{ position: 'absolute', top: -7, right: -7, width: 28, height: 28, borderRadius: '50%', border: '1px solid var(--border)', background: 'var(--popover)', color: 'var(--popover-foreground)', display: 'grid', placeItems: 'center' }}><X size={14} /></button></div>}
      {pendingDocument && <div style={{ display: 'flex', gap: 10, alignItems: 'center', padding: 10, borderRadius: 14, background: 'var(--secondary)', border: '1px solid var(--border)' }}><FileText size={22} color={C.teal} /><div style={{ flex: 1, minWidth: 0 }}><strong style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--foreground)', fontSize: 12 }}>{pendingDocument.file.name}</strong><span style={{ color: 'var(--muted-foreground)', fontSize: 11 }}>{pendingDocument.file.type} · {formatAttachmentSize(pendingDocument.file.size)}</span><span style={{ display: 'block', color: '#E4A84B', fontSize: 10 }}>Document analysis unavailable — file will not be uploaded.</span></div><button type="button" onClick={removeAttachment} aria-label="Remove attached document" style={{ border: 0, background: 'transparent', color: 'var(--muted-foreground)', padding: 8 }}><Trash2 size={17} /></button></div>}
    </div>}
    {attachmentError && <div role="alert" style={{ padding: '6px 16px 0', color: '#E24B4A', fontSize: 11 }}>{attachmentError}</div>}
    <div style={{ position: 'relative', display: 'flex', gap: 8, padding: keyboardOpen ? '8px 12px 8px' : '10px 16px calc(20px + env(safe-area-inset-bottom))', borderTop: `0.5px solid ${C.border}`, alignItems: 'center' }}>
      <input ref={cameraFileRef} type="file" accept="image/jpeg,image/png,image/webp" capture="environment" style={{ display: 'none' }} onChange={e => void onAttachFile(e.target.files?.[0])} />
      <input ref={photoRef} type="file" accept="image/jpeg,image/png,image/webp" style={{ display: 'none' }} onChange={e => void onAttachFile(e.target.files?.[0])} />
      <input ref={documentRef} type="file" accept="application/pdf,.pdf" style={{ display: 'none' }} onChange={e => onAttachDocument(e.target.files?.[0])} />
      <AnimatePresence>{attachmentMenuOpen && <><button type="button" aria-label="Close attachment menu" onClick={() => setAttachmentMenuOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 1, border: 0, background: 'transparent' }} /><motion.div role="menu" aria-label="Add attachment" initial={{ opacity: 0, y: 8, scale: .98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 8, scale: .98 }} style={{ position: 'absolute', left: 16, bottom: 'calc(100% - 2px)', zIndex: 2, width: 230, padding: 7, borderRadius: 17, background: 'var(--popover)', color: 'var(--popover-foreground)', border: '1px solid var(--border)', boxShadow: '0 16px 48px rgba(0,0,0,.32)' }}>
        <AttachmentMenuItem icon={<Camera size={19} />} label="Take a photo" onClick={takePhoto} />
        <AttachmentMenuItem icon={<ImageIcon size={19} />} label="Upload photos" onClick={() => { setAttachmentMenuOpen(false); photoRef.current?.click(); }} />
        <AttachmentMenuItem icon={<FileText size={19} />} label="Upload documents" detail="PDF · analysis unavailable" onClick={() => { setAttachmentMenuOpen(false); documentRef.current?.click(); }} />
      </motion.div></>}</AnimatePresence>
      <motion.button type="button" aria-haspopup="menu" aria-expanded={attachmentMenuOpen} aria-label="Add attachment" whileTap={{ scale: .92 }} disabled={attachBusy || !!intake} onClick={() => setAttachmentMenuOpen(open => !open)} style={{ width: 42, height: 42, flexShrink: 0, borderRadius: '50%', background: 'var(--secondary)', border: '1px solid var(--border)', display: 'grid', placeItems: 'center', color: attachBusy ? C.muted : 'var(--secondary-foreground)', cursor: attachBusy || intake ? 'default' : 'pointer' }}><Plus size={20} /></motion.button>
      <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && send()} placeholder={intake ? 'Type your answer, or "skip" / "stop"' : attachBusy ? 'Reading photo on device…' : pendingImage ? 'Ask a question about this photo…' : 'Ask VEEDA about your health…'} style={{ flex: 1, padding: '10px 14px', background: '#111827', border: '0.5px solid rgba(255,255,255,0.08)', borderRadius: 14, color: C.text, fontSize: 16, outline: 'none', minWidth: 0 }} />
      <motion.button whileTap={{ scale: .92 }} onClick={() => send()} style={{ width: 42, height: 42, borderRadius: 14, background: C.teal, border: 'none', display: 'grid', placeItems: 'center', color: '#04342C' }}><Send size={17} /></motion.button>
    </div>
    <ChatCameraCapture open={cameraOpen} onClose={() => setCameraOpen(false)} onCapture={file => void onAttachFile(file)} onFallback={() => { setCameraOpen(false); cameraFileRef.current?.click(); }} />
    <AnimatePresence>{viewRecord && <ConsultationSheet record={viewRecord} onClose={() => setViewRecord(null)} />}</AnimatePresence>
  </motion.div></>}</AnimatePresence>;
}

function AttachmentMenuItem({ icon, label, detail, onClick }: { icon: ReactNode; label: string; detail?: string; onClick: () => void }) {
  return <button type="button" role="menuitem" onClick={onClick} style={{ width: '100%', minHeight: 48, padding: '8px 10px', display: 'flex', gap: 11, alignItems: 'center', textAlign: 'left', border: 0, borderRadius: 12, background: 'transparent', color: 'var(--popover-foreground)', cursor: 'pointer' }}><span style={{ width: 32, height: 32, borderRadius: 10, display: 'grid', placeItems: 'center', background: 'var(--muted)', color: 'var(--primary)' }}>{icon}</span><span><strong style={{ display: 'block', fontSize: 13 }}>{label}</strong>{detail && <small style={{ display: 'block', color: 'var(--muted-foreground)', fontSize: 10 }}>{detail}</small>}</span></button>;
}
