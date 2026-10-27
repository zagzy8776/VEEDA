import { motion, AnimatePresence } from 'motion/react';
import { X, Send } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';
import { apiFetchDetailed, getActor } from '../api';
import { resolveEmergencyNumber } from '../emergencyNumber';
import { converse, createDialogueState, type DialogueResult } from '../dialogueEngine';
import type { Vitals, Analysis, Profile, Location } from '../useVedaApp';

const C = { teal: '#2DD4A4', text: '#E2F4F0', muted: '#5A7A72', border: 'rgba(255,255,255,0.09)' };

interface Msg { id: number; role: 'user' | 'assistant'; content: string }

export function ChatPanel({ open, onClose, vitals, analysis, adultScoresAllowed = true, subjectLabel, location, profile }: {
  open: boolean; onClose: () => void; vitals: Vitals; analysis: Analysis | null; wellnessScore: number | null; profile: Profile | null;
  adultScoresAllowed?: boolean; subjectLabel?: string; location?: Location | null;
}) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const dialogueRef = useRef(createDialogueState());
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open || messages.length) return;
    setMessages([{ id: Date.now(), role: 'assistant', content: 'VEEDA Clinical Support. What brings you in today?' }]);
  }, [open, messages.length]);

  useEffect(() => {
    if (!open) return;
    const list = scrollRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [messages, open]);

  async function enhanceWithProvider(content: string, local: DialogueResult, replyId: number, history: Array<{ role: 'user' | 'assistant'; content: string }>) {
    try {
      const actor = getActor();
      const ai = await apiFetchDetailed<{ conversationReply: string; source?: string }>('/api/ai-chat', {
        method: 'POST',
        body: JSON.stringify({
          message: content,
          vitals,
          analysis,
          patient_id: actor.patientId,
          history,
          subject: { adultScoresAllowed, label: subjectLabel ?? null },
          localGuidance: local.reply,
          clientProfile: profile ? {
            name: (profile as any).name || (profile as any).displayName || null,
            age: (profile as any).age ?? null,
            sex: (profile as any).sex || (profile as any).gender || null,
            conditions: (profile as any).conditions || null,
            allergies: (profile as any).allergies || null,
          } : null,
        }),
      });
      const enhanced = ai.data?.source === 'ai' ? ai.data.conversationReply?.trim() : null;
      if (enhanced) {
        setMessages(current => current.map(msg => msg.id === replyId ? { ...msg, content: enhanced } : msg));
        return;
      }
      setMessages(current => current.map(msg => msg.id === replyId
        ? { ...msg, content: `${local.reply}\n\n(AI enhancement unavailable — offline support reply.)` }
        : msg));
    } catch {
      setMessages(current => current.map(msg => msg.id === replyId
        ? { ...msg, content: `${local.reply}\n\n(AI chat could not be reached.)` }
        : msg));
    }
  }

  function send(text?: string) {
    const content = (text ?? input).trim();
    if (!content) return;
    setInput('');
    const history = messages.slice(-6).map(m => ({ role: m.role, content: m.content.slice(0, 600) }));
    const local = converse(dialogueRef.current, content, {
      vitals,
      analysis,
      adultScoresAllowed,
      subjectLabel: subjectLabel ?? null,
      now: new Date(),
      emergencyNumber: resolveEmergencyNumber(),
    });
    dialogueRef.current = local.state;
    const base = Date.now();
    const userMsgId = base;
    const replyId = base + 1;
    setMessages(current => [...current,
      { id: userMsgId, role: 'user', content },
      { id: replyId, role: 'assistant', content: local.urgent ? local.reply : '…' },
    ]);
    if (!local.urgent) void enhanceWithProvider(content, local, replyId, history);
  }

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 500 }} />
          <motion.div initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
            style={{ position: 'fixed', left: 0, right: 0, bottom: 0, maxHeight: '88dvh', background: '#0B1A18', borderTopLeftRadius: 20, borderTopRightRadius: 20, zIndex: 501, display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', borderBottom: `1px solid ${C.border}` }}>
              <div>
                <div style={{ color: C.text, fontWeight: 700, fontSize: 15 }}>Clinical Support</div>
                <div style={{ color: C.teal, fontSize: 11 }}>Monitoring</div>
              </div>
              <button type="button" onClick={onClose} style={{ background: 'transparent', border: 'none', color: C.muted }}><X size={20} /></button>
            </div>
            <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
              {messages.map(m => (
                <div key={m.id} style={{ alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start', maxWidth: '88%', background: m.role === 'user' ? C.teal : 'rgba(255,255,255,0.06)', color: m.role === 'user' ? '#04342C' : C.text, padding: '10px 12px', borderRadius: 14, fontSize: 14, whiteSpace: 'pre-wrap' }}>
                  {m.content}
                </div>
              ))}
            </div>
            <div style={{ padding: 12, borderTop: `1px solid ${C.border}`, display: 'flex', gap: 8 }}>
              <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') send(); }}
                placeholder="Ask VEEDA about your health…"
                style={{ flex: 1, background: 'rgba(255,255,255,0.06)', border: `1px solid ${C.border}`, borderRadius: 12, padding: '12px 14px', color: C.text, outline: 'none' }} />
              <button type="button" onClick={() => send()} style={{ width: 44, height: 44, borderRadius: 12, border: 'none', background: C.teal, color: '#04342C' }}><Send size={18} /></button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
