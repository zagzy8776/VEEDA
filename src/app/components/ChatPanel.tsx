import { motion, AnimatePresence } from 'motion/react';
import { X, Send, Sparkles } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';
import { apiFetch } from '../api';
import type { Vitals, Analysis, Profile } from '../useVedaApp';

const C = { teal: '#2DD4A4', text: '#E2F4F0', muted: '#5A7A72', border: 'rgba(255,255,255,0.09)' };

interface Msg { id: number; role: 'user' | 'assistant'; content: string; }

const SUGGESTIONS = [
  'Summarize current clinical risk',
  'Explain the NEWS2 score',
  'Review oxygenation trend',
  'Assess sepsis risk',
  'How is recovery trending?',
];

const EMERGENCY_NUMBER = import.meta.env.VITE_EMERGENCY_NUMBER || '112';

export function ChatPanel({ open, onClose, vitals, analysis, wellnessScore, profile, saveBiometric }: {
  open: boolean; onClose: () => void;
  vitals: Vitals; analysis: Analysis | null; wellnessScore: number | null;
  profile: Profile | null;
  saveBiometric: (type: string, value: number, unit: string) => Promise<void>;
}) {
  const name = profile?.name || 'there';
  const [messages, setMessages] = useState<Msg[]>([{
    id: 0, role: 'assistant',
    content: `VEEDA Clinical Decision Support active. ${analysis?.clinicalScores?.news2 ? `Current NEWS2: ${analysis.clinicalScores.news2.total}.` : 'NEWS2 pending complete observations.'} Submit a clinical question or review current risk.`,
  }]);
  const [input, setInput] = useState('');
  const [typing, setTyping] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  // Update greeting when profile/score changes
  useEffect(() => {
    setMessages([{
      id: 0, role: 'assistant',
      content: `VEEDA Clinical Decision Support active. ${analysis?.clinicalScores?.news2 ? `Current NEWS2: ${analysis.clinicalScores.news2.total}.` : 'NEWS2 pending complete observations.'} Submit a clinical question or review current risk.`,
    }]);
  }, [name, analysis?.clinicalScores?.news2?.total]);

  useEffect(() => { if (open) endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, open]);

  async function send(text?: string) {
    const content = (text ?? input).trim();
    if (!content) return;
    setInput('');
    setMessages(m => [...m, { id: Date.now(), role: 'user', content }]);
    setTyping(true);

    const d = await apiFetch<{ conversationReply?: string; reply?: string }>('/api/wellness-event', {
      method: 'POST',
      body: JSON.stringify({
        eventType: 'chat',
        message: content,
        vitals,
        analysis,
        wellnessScore,
        profile: { name: profile?.name, age: profile?.age, weight: profile?.weight },
      }),
    });

    const reply = d?.conversationReply || d?.reply || buildReply(content, vitals, analysis);
    setMessages(m => [...m, { id: Date.now() + 1, role: 'assistant', content: reply }]);
    setTyping(false);
  }

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)', zIndex: 500 }} />
          <motion.div initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'spring', damping: 30, stiffness: 320 }}
            style={{ position: 'fixed', bottom: 0, left: '50%', transform: 'translateX(-50%)', width: '100%', maxWidth: 390, height: 'min(82dvh, 680px)', maxHeight: 'calc(100dvh - 12px)', display: 'flex', flexDirection: 'column', background: 'rgba(9,14,26,0.98)', borderRadius: '24px 24px 0 0', zIndex: 600, overflow: 'hidden', border: '0.5px solid rgba(255,255,255,0.1)', borderBottom: 'none', boxShadow: '0 -20px 60px rgba(0,0,0,0.6)' }}>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 20px 14px', borderBottom: `0.5px solid ${C.border}`, flexShrink: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 36, height: 36, borderRadius: 12, background: 'linear-gradient(135deg,rgba(45,212,164,0.2),rgba(55,138,221,0.15))', border: '0.5px solid rgba(45,212,164,0.2)', display: 'grid', placeItems: 'center', color: C.teal }}>
                  <Sparkles size={16} strokeWidth={2} />
                </div>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: C.text }}>Clinical Support</div>
                  <div style={{ fontSize: 11, color: C.teal }}>
                    {analysis?.clinicalScores?.news2 ? `NEWS2: ${analysis.clinicalScores.news2.total} · ` : ''}{analysis?.riskLevel ?? 'Monitoring'}
                  </div>
                </div>
              </div>
              <button onClick={onClose} style={{ width: 34, height: 34, borderRadius: 10, background: 'rgba(255,255,255,0.07)', border: 'none', cursor: 'pointer', display: 'grid', placeItems: 'center', color: C.muted }}>
                <X size={16} />
              </button>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '16px 16px 8px', display: 'flex', flexDirection: 'column', gap: 12, scrollbarWidth: 'none' }}>
              {messages.map(msg => (
                <motion.div key={msg.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                  style={{ alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start', maxWidth: '88%', padding: '10px 14px', borderRadius: msg.role === 'user' ? '16px 16px 4px 16px' : '16px 16px 16px 4px', background: msg.role === 'user' ? 'rgba(45,212,164,0.14)' : '#111827', border: `0.5px solid ${msg.role === 'user' ? 'rgba(45,212,164,0.25)' : 'rgba(255,255,255,0.07)'}`, fontSize: 13, color: C.text, lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>
                  {msg.content}
                </motion.div>
              ))}
              {typing && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                  style={{ alignSelf: 'flex-start', padding: '10px 14px', borderRadius: '16px 16px 16px 4px', background: '#111827', border: '0.5px solid rgba(255,255,255,0.07)', display: 'flex', gap: 4, alignItems: 'center' }}>
                  {[0, 1, 2].map(i => (
                    <motion.div key={i} animate={{ y: [0, -4, 0] }} transition={{ duration: 0.6, repeat: Infinity, delay: i * 0.15 }}
                      style={{ width: 6, height: 6, borderRadius: '50%', background: C.teal }} />
                  ))}
                </motion.div>
              )}
              <div ref={endRef} />
            </div>

            {/* Always show suggestions */}
            <div style={{ padding: '6px 16px 8px', display: 'flex', gap: 6, overflowX: 'auto', scrollbarWidth: 'none', flexShrink: 0 }}>
              {SUGGESTIONS.map(s => (
                <button key={s} onClick={() => send(s)}
                  style={{ flexShrink: 0, padding: '6px 12px', background: 'rgba(45,212,164,0.08)', border: '0.5px solid rgba(45,212,164,0.2)', borderRadius: 20, color: C.teal, fontSize: 11, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                  {s}
                </button>
              ))}
            </div>

            <div style={{ display: 'flex', gap: 10, padding: '10px 16px calc(20px + env(safe-area-inset-bottom))', borderTop: `0.5px solid ${C.border}`, flexShrink: 0 }}>
              <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && !typing && send()} placeholder="Ask about NEWS2, qSOFA, trends..."
                style={{ flex: 1, padding: '10px 14px', background: '#111827', border: '0.5px solid rgba(255,255,255,0.08)', borderRadius: 14, color: C.text, fontSize: 16, outline: 'none', minWidth: 0 }} />
              <motion.button whileTap={{ scale: 0.92 }} onClick={() => send()} disabled={typing}
                style={{ width: 42, height: 42, borderRadius: 14, background: typing ? 'rgba(45,212,164,0.3)' : C.teal, border: 'none', cursor: typing ? 'default' : 'pointer', display: 'grid', placeItems: 'center', color: '#04342C', flexShrink: 0 }}>
                <Send size={17} strokeWidth={2.2} />
              </motion.button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

function buildReply(msg: string, vitals: Vitals, analysis: Analysis | null): string {
  const m = msg.toLowerCase();
  const news2 = analysis?.clinicalScores?.news2;
  const qsofa = analysis?.clinicalScores?.qsofa;
  const scoreLine = news2
    ? `NEWS2 ${news2.total}: ${news2.urgency?.action || 'Use local escalation protocol.'}`
    : 'NEWS2 pending complete clinical observations.';
  const qsofaLine = qsofa ? `qSOFA ${qsofa.total}${qsofa.sepsisRiskFlag ? ': sepsis risk trigger present.' : ': no qSOFA sepsis trigger.'}` : 'qSOFA pending.';
  if (m.includes('heart') || m.includes('bpm') || m.includes('pulse')) {
    if (!vitals.heartRate) return `${scoreLine}\nHeart rate is not recorded in the current observation set.`;
    const hr = vitals.heartRate;
    return `${scoreLine}\nCurrent heart rate: ${hr} beats/min. Interpret against NEWS2 heart-rate component and current clinical context.`;
  }
  if (m.includes('breath') || m.includes('breathing') || m.includes('respiratory')) {
    return `${scoreLine}\nCurrent respiratory rate: ${vitals.respiratory ?? 'not recorded'} /min. Respiratory rate is also a qSOFA parameter. ${qsofaLine}`;
  }
  if (m.includes('score') || m.includes('news') || m.includes('risk')) {
    return `${scoreLine}\n${qsofaLine}`;
  }
  if (m.includes('temperature') || m.includes('fever') || m.includes('temp')) {
    return `${scoreLine}\nCurrent temperature: ${vitals.skinTemp ?? 'not recorded'} Cel. Review NEWS2 temperature component.`;
  }
  if (m.includes('emergency') || m.includes('help') || m.includes('urgent')) {
    return `${scoreLine}\nIf immediate escalation is required, activate emergency workflow or call ${EMERGENCY_NUMBER}.`;
  }
  return `${scoreLine}\n${qsofaLine}`;
}
