import { motion } from 'motion/react';
import { useState } from 'react';
import { Activity, User, Weight, Ruler, ChevronRight } from 'lucide-react';

const C = { teal: '#2DD4A4', text: '#E2F4F0', muted: '#5A7A72', card: 'rgba(13,21,37,0.88)', border: 'rgba(255,255,255,0.08)', amber: '#EF9F27' };

interface OnboardingProps {
  onComplete: (name: string, age: number, weight: number, height: number, sex: string) => void;
}

export function Onboarding({ onComplete }: OnboardingProps) {
  const [step, setStep] = useState(0);
  const [name, setName] = useState('');
  const [age, setAge] = useState('');
  const [weight, setWeight] = useState('');
  const [height, setHeight] = useState('');
  const [sex, setSex] = useState('male');

  function next() {
    if (step === 0 && !name.trim()) return;
    if (step < 2) { setStep(s => s + 1); return; }
    onComplete(name.trim(), parseInt(age) || 25, parseFloat(weight) || 70, parseFloat(height) || 170, sex);
  }

  const inp = { width: '100%', padding: '14px 16px', background: 'rgba(10,18,32,0.9)', border: `1px solid ${C.border}`, borderRadius: 14, color: C.text, fontSize: 16, outline: 'none', marginTop: 8 };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'radial-gradient(circle at 18% 10%, rgba(45,212,164,0.18), transparent 30%), radial-gradient(circle at 86% 16%, rgba(55,138,221,0.16), transparent 28%), #07101D', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: 24 }}>
      <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} style={{ width: '100%', maxWidth: 360 }}>

        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <div style={{ width: 64, height: 64, borderRadius: 22, background: 'linear-gradient(180deg,rgba(45,212,164,0.2),rgba(45,212,164,0.06))', border: '1px solid rgba(45,212,164,0.25)', display: 'grid', placeItems: 'center', color: C.teal, margin: '0 auto 16px' }}>
            <Activity size={30} strokeWidth={2} />
          </div>
          <div style={{ fontSize: 28, fontWeight: 800, color: C.text, letterSpacing: '-0.02em' }}><span style={{ color: C.teal }}>V</span>EDA</div>
          <div style={{ fontSize: 13, color: C.muted, marginTop: 4 }}>Wellness Intelligence</div>
        </div>

        {/* Step indicators */}
        <div style={{ display: 'flex', gap: 6, justifyContent: 'center', marginBottom: 32 }}>
          {[0, 1, 2].map(i => (
            <div key={i} style={{ height: 4, width: i === step ? 24 : 8, borderRadius: 2, background: i <= step ? C.teal : 'rgba(255,255,255,0.1)', transition: 'all 0.3s' }} />
          ))}
        </div>

        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 24, padding: 28 }}>

          {step === 0 && (
            <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
                <User size={20} style={{ color: C.teal }} />
                <div style={{ fontSize: 18, fontWeight: 700, color: C.text }}>What's your name?</div>
              </div>
              <p style={{ fontSize: 13, color: C.muted, marginBottom: 16, lineHeight: 1.5 }}>
                VEDA will use this to personalise your wellness experience.
              </p>
              <input autoFocus value={name} onChange={e => setName(e.target.value)} onKeyDown={e => e.key === 'Enter' && next()}
                placeholder="Your first name" style={inp} />
            </motion.div>
          )}

          {step === 1 && (
            <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
                <User size={20} style={{ color: C.teal }} />
                <div style={{ fontSize: 18, fontWeight: 700, color: C.text }}>About you</div>
              </div>
              <p style={{ fontSize: 13, color: C.muted, marginBottom: 16, lineHeight: 1.5 }}>Used to calculate your hydration target and wellness score accurately.</p>
              <label style={{ fontSize: 12, color: C.muted, fontWeight: 600 }}>Age</label>
              <input type="number" value={age} onChange={e => setAge(e.target.value)} placeholder="e.g. 28" style={inp} />
              <label style={{ fontSize: 12, color: C.muted, fontWeight: 600, marginTop: 14, display: 'block' }}>Biological sex</label>
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                {['male', 'female', 'other'].map(s => (
                  <button key={s} onClick={() => setSex(s)} style={{ flex: 1, padding: '10px', borderRadius: 10, border: 'none', background: sex === s ? C.teal : 'rgba(255,255,255,0.07)', color: sex === s ? '#04342C' : C.muted, fontSize: 12, fontWeight: 700, cursor: 'pointer', textTransform: 'capitalize', transition: 'all 0.2s' }}>{s}</button>
                ))}
              </div>
            </motion.div>
          )}

          {step === 2 && (
            <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
                <Weight size={20} style={{ color: C.teal }} />
                <div style={{ fontSize: 18, fontWeight: 700, color: C.text }}>Body metrics</div>
              </div>
              <p style={{ fontSize: 13, color: C.muted, marginBottom: 16, lineHeight: 1.5 }}>Helps VEDA set your hydration and step goals accurately.</p>
              <label style={{ fontSize: 12, color: C.muted, fontWeight: 600 }}>Weight (kg)</label>
              <input type="number" value={weight} onChange={e => setWeight(e.target.value)} placeholder="e.g. 75" style={inp} />
              <label style={{ fontSize: 12, color: C.muted, fontWeight: 600, marginTop: 14, display: 'block' }}>Height (cm)</label>
              <input type="number" value={height} onChange={e => setHeight(e.target.value)} placeholder="e.g. 178" style={{ ...inp, marginTop: 8 }} />
            </motion.div>
          )}

          <motion.button whileTap={{ scale: 0.97 }} onClick={next}
            style={{ width: '100%', marginTop: 24, padding: '14px', background: `linear-gradient(135deg,${C.teal},#1fb391)`, color: '#04342C', borderRadius: 14, border: 'none', fontSize: 15, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            {step < 2 ? 'Continue' : "Let's go"} <ChevronRight size={16} strokeWidth={2.5} />
          </motion.button>

          {step > 0 && (
            <button onClick={() => setStep(s => s - 1)} style={{ width: '100%', marginTop: 10, padding: '10px', background: 'none', border: 'none', color: C.muted, fontSize: 13, cursor: 'pointer' }}>Back</button>
          )}
        </div>

        <div style={{ textAlign: 'center', marginTop: 20, fontSize: 11, color: C.muted, lineHeight: 1.5 }}>
          VEDA is a wellness monitoring tool. Not a medical device.<br />Always consult a doctor for medical advice.
        </div>
      </motion.div>
    </div>
  );
}
