import { motion, AnimatePresence } from 'motion/react';
import { X, Send, Sparkles } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';
import { apiFetch } from '../api';
import type { Vitals, Analysis, Profile } from '../useVedaApp';

const C = { teal: '#2DD4A4', text: '#E2F4F0', muted: '#5A7A72', border: 'rgba(255,255,255,0.09)' };

interface Msg { id: number; role: 'user' | 'assistant'; content: string; }

const SUGGESTIONS = [
  'How are my vitals?',
  'Am I drinking enough water?',
  'What should I focus on today?',
  'Is my heart rate normal?',
  'How was my sleep?',
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
    content: `Hi ${name}! I'm VEDA, your wellness assistant. ${wellnessScore !== null ? `Your current wellness score is **${wellnessScore}**.` : 'Measure your vitals to get a wellness score.'} How can I help you right now?`,
  }]);
  const [input, setInput] = useState('');
  const [typing, setTyping] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  // Update greeting when profile/score changes
  useEffect(() => {
    setMessages([{
      id: 0, role: 'assistant',
      content: `Hi ${name}! I'm VEDA, your wellness assistant. ${wellnessScore !== null ? `Your current wellness score is ${wellnessScore}.` : 'Measure your vitals to get a wellness score.'} How can I help you right now?`,
    }]);
  }, [name]);

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

    const reply = d?.conversationReply || d?.reply || buildReply(content, vitals, wellnessScore, name);
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
                  <div style={{ fontSize: 15, fontWeight: 700, color: C.text }}>VEDA Chat</div>
                  <div style={{ fontSize: 11, color: C.teal }}>
                    {wellnessScore !== null ? `Score: ${wellnessScore} · ` : ''}{analysis?.riskLevel ?? 'Monitoring'}
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
              <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && !typing && send()} placeholder="Ask VEDA anything..."
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

function buildReply(msg: string, vitals: Vitals, score: number | null, name: string): string {
  const m = msg.toLowerCase();
  if (m.includes('heart') || m.includes('bpm') || m.includes('pulse')) {
    if (!vitals.heartRate) return `No heart rate measured yet, ${name}. Go to Vitals → tap Heart Rate to measure with your camera.`;
    const hr = vitals.heartRate;
    if (hr > 120) return `${name}, your heart rate is ${hr} bpm. That is higher than the usual resting range. Rest, breathe slowly, and seek urgent medical help if you feel unwell or it stays high.`;
    if (hr > 100) return `Your heart rate is ${hr} bpm — slightly elevated. Try sitting quietly and taking slow deep breaths for 5 minutes.`;
    if (hr < 50) return `Your heart rate is ${hr} bpm — lower than normal. This could be athletic fitness or could need attention. Monitor closely.`;
    return `Your heart rate is ${hr} bpm. That is within the typical resting range of 60-100 bpm.`;
  }
  if (m.includes('breath') || m.includes('breathing') || m.includes('respiratory')) {
    if (!vitals.respiratory) return `No breath rate measured yet. Go to Vitals → tap Breath Rate and breathe normally near your microphone.`;
    const br = vitals.respiratory;
    if (br > 24) return `Your breathing rate is ${br} br/min — elevated. Sit upright, breathe slowly through your nose. If breathing feels difficult, seek medical help immediately.`;
    if (br < 8) return `Your breathing rate is ${br} br/min — unusually low. Ensure you're not hyperventilating. Monitor closely.`;
    return `Your breathing rate is ${br} br/min — normal range is 12–20. You're breathing well, ${name}.`;
  }
  if (m.includes('water') || m.includes('hydrat')) {
    if (!vitals.hydration) return `No hydration logged yet today. Go to Vitals and tap +250ml or +500ml every time you drink.`;
    return `Your hydration is at ${vitals.hydration}%. ${vitals.hydration < 50 ? 'You need water urgently — drink at least 500ml now.' : vitals.hydration < 75 ? 'Keep going — try to reach 100% before end of day.' : `Great job staying hydrated, ${name}!`}`;
  }
  if (m.includes('score') || m.includes('wellness')) {
    if (score === null) return `No wellness score yet, ${name}. Measure at least one vital to calculate your score.`;
    return `Your wellness score is ${score}/100. ${score >= 80 ? 'Excellent condition! Keep up your healthy habits.' : score >= 60 ? 'Good condition with room to improve. Focus on hydration and rest.' : 'Your body needs attention. Rest, hydrate, and consider seeking medical advice if symptoms persist.'}`;
  }
  if (m.includes('temperature') || m.includes('fever') || m.includes('temp')) {
    if (!vitals.skinTemp) return `No temperature logged yet. Go to Vitals → enter your temperature manually.`;
    const t = vitals.skinTemp;
    if (t >= 38.5) return `⚠ Your temperature is ${t}°C — that's a fever. Rest, stay hydrated, and seek medical attention if it rises above 39°C or if you have other symptoms.`;
    if (t > 37.5) return `Your temperature is ${t}°C — slightly elevated. Monitor it and rest.`;
    return `Your temperature is ${t}°C — within normal range (36.1–37.2°C).`;
  }
  if (m.includes('sleep')) {
    return `Sleep data helps VEDA track your recovery. Use the Sleep/Wake buttons in Vitals to log your sleep sessions.`;
  }
  if (m.includes('step') || m.includes('walk')) {
    return `Steps are tracked automatically using your phone's motion sensor while you carry it.`;
  }
  if (m.includes('emergency') || m.includes('help') || m.includes('urgent')) {
    return `If this is an emergency, go to the Map tab and tap the red Emergency SOS button to call ${EMERGENCY_NUMBER} immediately. Your location will be used to find nearby hospitals.`;
  }
  if (m.includes('focus') || m.includes('today') || m.includes('improve')) {
    const tips = [];
    if (!vitals.heartRate) tips.push('Measure your heart rate');
    if (!vitals.respiratory) tips.push('Check your breathing rate');
    if ((vitals.hydration ?? 0) < 75) tips.push('Drink more water');
    if (!vitals.skinTemp) tips.push('Log your temperature');
    if (!tips.length) return `You're doing great, ${name}! All vitals are tracked. Keep logging throughout the day for accurate trend data.`;
    return `Here's what to focus on today, ${name}:\n${tips.map((t, i) => `${i + 1}. ${t}`).join('\n')}`;
  }
  return `I'm here to help you monitor your wellness, ${name}. Ask me about your heart rate, breathing, hydration, temperature, or sleep. For medical emergencies, use the SOS button on the Map tab.`;
}
