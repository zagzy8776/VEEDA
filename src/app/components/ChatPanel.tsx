import { motion, AnimatePresence } from 'motion/react';
import { X, Send, Sparkles } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';
import { apiFetch } from '../api';
import type { Vitals, Analysis } from '../useVedaApp';

const C = { teal: '#2DD4A4', text: '#E2F4F0', muted: '#5A7A72', border: 'rgba(255,255,255,0.09)' };

interface Msg { id: number; role: 'user' | 'assistant'; content: string; }

const SUGGESTIONS = ['How are my vitals?', 'Am I drinking enough water?', 'What should I focus on today?'];

export function ChatPanel({ open, onClose, vitals, analysis, wellnessScore, saveBiometric }: {
  open: boolean; onClose: () => void;
  vitals: Vitals; analysis: Analysis | null; wellnessScore: number | null;
  saveBiometric: (type: string, value: number, unit: string) => Promise<void>;
}) {
  const [messages, setMessages] = useState<Msg[]>([{
    id: 0, role: 'assistant',
    content: `Hello! I'm VEDA, your wellness intelligence assistant. ${wellnessScore !== null ? `Your wellness score is ${wellnessScore}.` : 'Start measuring your vitals to get a wellness score.'} How can I help you?`,
  }]);
  const [input, setInput] = useState('');
  const [typing, setTyping] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => { if (open) endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, open]);

  async function send(text?: string) {
    const content = (text ?? input).trim();
    if (!content) return;
    setInput('');
    setMessages(m => [...m, { id: Date.now(), role: 'user', content }]);
    setTyping(true);
    const d = await apiFetch<{ conversationReply?: string; reply?: string }>('/api/wellness-event', {
      method: 'POST',
      body: JSON.stringify({ eventType: 'chat', message: content, vitals, analysis, wellnessScore }),
    });
    const reply = d?.conversationReply || d?.reply || buildLocalReply(content, vitals, wellnessScore);
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
            style={{ position: 'fixed', bottom: 0, left: '50%', transform: 'translateX(-50%)', width: '100%', maxWidth: 390, height: '82vh', display: 'flex', flexDirection: 'column', background: 'rgba(9,14,26,0.98)', borderRadius: '24px 24px 0 0', zIndex: 600, overflow: 'hidden', border: '0.5px solid rgba(255,255,255,0.1)', borderBottom: 'none', boxShadow: '0 -20px 60px rgba(0,0,0,0.6)' }}>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 20px 14px', borderBottom: `0.5px solid ${C.border}`, flexShrink: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 36, height: 36, borderRadius: 12, background: 'linear-gradient(135deg,rgba(45,212,164,0.2),rgba(55,138,221,0.15))', border: '0.5px solid rgba(45,212,164,0.2)', display: 'grid', placeItems: 'center', color: C.teal }}>
                  <Sparkles size={16} strokeWidth={2} />
                </div>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: C.text }}>VEDA Chat</div>
                  <div style={{ fontSize: 11, color: C.teal }}>Wellness intelligence · Live vitals context</div>
                </div>
              </div>
              <button onClick={onClose} style={{ width: 34, height: 34, borderRadius: 10, background: 'rgba(255,255,255,0.07)', border: 'none', cursor: 'pointer', display: 'grid', placeItems: 'center', color: C.muted }}>
                <X size={16} />
              </button>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '16px 16px 8px', display: 'flex', flexDirection: 'column', gap: 12, scrollbarWidth: 'none' }}>
              {messages.map(msg => (
                <motion.div key={msg.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                  style={{ alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start', maxWidth: '86%', padding: '10px 14px', borderRadius: msg.role === 'user' ? '16px 16px 4px 16px' : '16px 16px 16px 4px', background: msg.role === 'user' ? 'rgba(45,212,164,0.14)' : '#111827', border: `0.5px solid ${msg.role === 'user' ? 'rgba(45,212,164,0.25)' : 'rgba(255,255,255,0.07)'}`, fontSize: 13, color: C.text, lineHeight: 1.55 }}>
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

            {messages.length <= 2 && (
              <div style={{ padding: '0 16px 8px', display: 'flex', gap: 6, flexWrap: 'wrap', flexShrink: 0 }}>
                {SUGGESTIONS.map(s => (
                  <button key={s} onClick={() => send(s)} style={{ padding: '6px 12px', background: 'rgba(45,212,164,0.08)', border: '0.5px solid rgba(45,212,164,0.2)', borderRadius: 20, color: C.teal, fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>{s}</button>
                ))}
              </div>
            )}

            <div style={{ display: 'flex', gap: 10, padding: '12px 16px 20px', borderTop: `0.5px solid ${C.border}`, flexShrink: 0 }}>
              <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && send()} placeholder="Type a message..."
                style={{ flex: 1, padding: '10px 14px', background: '#111827', border: '0.5px solid rgba(255,255,255,0.08)', borderRadius: 14, color: C.text, fontSize: 13, outline: 'none' }} />
              <motion.button whileTap={{ scale: 0.92 }} onClick={() => send()} style={{ width: 42, height: 42, borderRadius: 14, background: C.teal, border: 'none', cursor: 'pointer', display: 'grid', placeItems: 'center', color: '#04342C', flexShrink: 0 }}>
                <Send size={17} strokeWidth={2.2} />
              </motion.button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

function buildLocalReply(msg: string, vitals: Vitals, score: number | null): string {
  const m = msg.toLowerCase();
  if (m.includes('heart') || m.includes('bpm')) return vitals.heartRate ? `Your heart rate is ${vitals.heartRate} bpm — ${vitals.heartRate > 100 ? 'slightly elevated, consider resting.' : vitals.heartRate < 60 ? 'below average resting, monitor closely.' : 'within normal resting range (60–100 bpm). Good shape!'}` : 'No heart rate measured yet. Go to Vitals to measure it.';
  if (m.includes('water') || m.includes('hydrat')) return vitals.hydration ? `Your hydration is at ${vitals.hydration}%. ${vitals.hydration < 50 ? 'You need to drink more water now.' : vitals.hydration < 80 ? 'Getting there — keep drinking.' : 'Great hydration level!'}` : 'No hydration logged yet. Tap +250ml or +500ml in Vitals.';
  if (m.includes('score') || m.includes('wellness')) return score !== null ? `Your wellness score is ${score}. ${score >= 80 ? 'Excellent — keep it up!' : score >= 60 ? 'Good, with room to improve. Focus on hydration and rest.' : 'Needs attention. Check your vitals and rest.'}` : 'No vitals measured yet — your score will calculate once you measure.';
  if (m.includes('focus') || m.includes('today')) return 'Based on your current data: 1. Measure your heart rate and breathing. 2. Log your water intake. 3. Enter your temperature if you have a thermometer.';
  return 'I am analyzing your wellness data. For personalized medical advice, always consult a qualified healthcare professional. What would you like to know about your vitals?';
}
