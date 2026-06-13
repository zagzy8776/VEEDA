import { motion, AnimatePresence } from 'motion/react';
import { X, Send, Bot, Sparkles } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';

const C = {
  teal: '#2DD4A4',
  text: '#E2F4F0',
  muted: '#5A7A72',
  card: 'rgba(10,15,28,0.97)',
  border: 'rgba(255,255,255,0.09)',
};

interface Message {
  id: number;
  role: 'user' | 'assistant';
  content: string;
}

const initialMessages: Message[] = [
  {
    id: 0,
    role: 'assistant',
    content: 'Hello! I\'m VEDA, your wellness intelligence assistant. Your wellness score is 82 — looking solid today! Your hydration is at 72%, and your heart rate is steady at 72 bpm. How can I help you?',
  },
];

const suggestions = [
  'How\'s my heart rate today?',
  'Am I drinking enough water?',
  'What should I focus on?',
];

function getBotReply(msg: string): string {
  const m = msg.toLowerCase();
  if (m.includes('heart') || m.includes('bpm')) return 'Your heart rate is 72 bpm, which is perfectly within the normal resting range of 60–100 bpm. Good shape!';
  if (m.includes('water') || m.includes('hydrat')) return 'You\'ve had 1.8L today — 72% of your 2.5L target. Try to drink another 700ml before the end of the day. A glass now would be great!';
  if (m.includes('sleep')) return 'Your last recorded sleep was 7.4 hours. The recommended range is 7–9 hours, so you\'re doing well. Keep that bedtime consistent!';
  if (m.includes('stress') || m.includes('breathing')) return 'Try box breathing: inhale 4 counts, hold 4, exhale 4, hold 4. Repeat for 2 minutes. This activates your parasympathetic system.';
  if (m.includes('score') || m.includes('wellness')) return 'Your wellness score is 82 — above average! This is based on your hydration log, step count, and measured vitals. Keep it up!';
  if (m.includes('focus') || m.includes('today')) return 'Based on your current data: 1. Drink 700ml more water. 2. Take a 10-minute walk to reach your step goal. 3. Consider measuring your heart rate after rest.';
  return 'I\'m analyzing your vitals and patterns. For personalized medical advice, always consult a qualified healthcare professional. Is there anything specific about your wellness data I can help with?';
}

export function ChatPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [input, setInput] = useState('');
  const [typing, setTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, open]);

  function send(text?: string) {
    const content = text ?? input.trim();
    if (!content) return;
    setInput('');
    const userMsg: Message = { id: Date.now(), role: 'user', content };
    setMessages(m => [...m, userMsg]);
    setTyping(true);
    setTimeout(() => {
      const reply: Message = { id: Date.now() + 1, role: 'assistant', content: getBotReply(content) };
      setMessages(m => [...m, reply]);
      setTyping(false);
    }, 1200 + Math.random() * 600);
  }

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(0,0,0,0.55)',
              backdropFilter: 'blur(4px)',
              zIndex: 500,
            }}
          />

          {/* Panel */}
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 320 }}
            style={{
              position: 'fixed',
              bottom: 0,
              left: '50%',
              transform: 'translateX(-50%)',
              width: '100%',
              maxWidth: 390,
              height: '82vh',
              display: 'flex',
              flexDirection: 'column',
              background: 'rgba(9,14,26,0.98)',
              borderRadius: '24px 24px 0 0',
              zIndex: 600,
              overflow: 'hidden',
              border: '0.5px solid rgba(255,255,255,0.1)',
              borderBottom: 'none',
              boxShadow: '0 -20px 60px rgba(0,0,0,0.6)',
            }}
          >
            {/* Header */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '18px 20px 14px',
              borderBottom: `0.5px solid ${C.border}`,
              flexShrink: 0,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{
                  width: 36,
                  height: 36,
                  borderRadius: 12,
                  background: 'linear-gradient(135deg, rgba(45,212,164,0.2), rgba(55,138,221,0.15))',
                  border: '0.5px solid rgba(45,212,164,0.2)',
                  display: 'grid',
                  placeItems: 'center',
                  color: C.teal,
                }}>
                  <Sparkles size={16} strokeWidth={2} />
                </div>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: C.text }}>VEDA Chat</div>
                  <div style={{ fontSize: 11, color: C.teal }}>Wellness intelligence</div>
                </div>
              </div>
              <button
                onClick={onClose}
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 10,
                  background: 'rgba(255,255,255,0.07)',
                  border: 'none',
                  cursor: 'pointer',
                  display: 'grid',
                  placeItems: 'center',
                  color: C.muted,
                }}
              >
                <X size={16} />
              </button>
            </div>

            {/* Messages */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '16px 16px 8px', display: 'flex', flexDirection: 'column', gap: 12, scrollbarWidth: 'none' }}>
              {messages.map(msg => (
                <motion.div
                  key={msg.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  style={{
                    alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
                    maxWidth: '86%',
                    padding: '10px 14px',
                    borderRadius: msg.role === 'user' ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                    background: msg.role === 'user'
                      ? 'rgba(45,212,164,0.14)'
                      : '#111827',
                    border: `0.5px solid ${msg.role === 'user' ? 'rgba(45,212,164,0.25)' : 'rgba(255,255,255,0.07)'}`,
                    fontSize: 13,
                    color: C.text,
                    lineHeight: 1.55,
                  }}
                >
                  {msg.content}
                </motion.div>
              ))}

              {typing && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  style={{
                    alignSelf: 'flex-start',
                    padding: '10px 14px',
                    borderRadius: '16px 16px 16px 4px',
                    background: '#111827',
                    border: '0.5px solid rgba(255,255,255,0.07)',
                    display: 'flex',
                    gap: 4,
                    alignItems: 'center',
                  }}
                >
                  {[0, 1, 2].map(i => (
                    <motion.div
                      key={i}
                      animate={{ y: [0, -4, 0] }}
                      transition={{ duration: 0.6, repeat: Infinity, delay: i * 0.15 }}
                      style={{ width: 6, height: 6, borderRadius: '50%', background: C.teal }}
                    />
                  ))}
                </motion.div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* Suggestions */}
            {messages.length <= 2 && (
              <div style={{ padding: '0 16px 8px', display: 'flex', gap: 6, flexWrap: 'wrap', flexShrink: 0 }}>
                {suggestions.map(s => (
                  <button
                    key={s}
                    onClick={() => send(s)}
                    style={{
                      padding: '6px 12px',
                      background: 'rgba(45,212,164,0.08)',
                      border: '0.5px solid rgba(45,212,164,0.2)',
                      borderRadius: 20,
                      color: C.teal,
                      fontSize: 11,
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}

            {/* Input */}
            <div style={{
              display: 'flex',
              gap: 10,
              padding: '12px 16px 20px',
              borderTop: `0.5px solid ${C.border}`,
              flexShrink: 0,
            }}>
              <input
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && send()}
                placeholder="Type a message..."
                style={{
                  flex: 1,
                  padding: '10px 14px',
                  background: '#111827',
                  border: '0.5px solid rgba(255,255,255,0.08)',
                  borderRadius: 14,
                  color: C.text,
                  fontSize: 13,
                  outline: 'none',
                }}
              />
              <motion.button
                whileTap={{ scale: 0.92 }}
                onClick={() => send()}
                style={{
                  width: 42,
                  height: 42,
                  borderRadius: 14,
                  background: C.teal,
                  border: 'none',
                  cursor: 'pointer',
                  display: 'grid',
                  placeItems: 'center',
                  color: '#04342C',
                  flexShrink: 0,
                }}
              >
                <Send size={17} strokeWidth={2.2} />
              </motion.button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
