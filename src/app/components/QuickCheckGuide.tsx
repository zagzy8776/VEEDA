/**
 * Quick Check Self-Guided Vitals Component
 * Helps patients measure their vitals step-by-step
 * Simple, clear, non-scary interface for hospital use
 */

import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Heart, Wind, Droplet, Thermometer, X, CheckCircle, ArrowRight, ArrowLeft } from 'lucide-react';

const C = { teal: '#2DD4A4', blue: '#378ADD', red: '#E24B4A', text: '#E2F4F0', muted: '#5A7A72', card: 'rgba(13,21,37,0.95)' };

interface QuickCheckGuideProps {
  open: boolean;
  onClose: () => void;
  onComplete: (vitals: {
    heartRate?: number;
    respiratory?: number;
    hydration?: number;
    temperature?: number;
  }) => void;
}

interface CheckStep {
  id: string;
  icon: any;
  color: string;
  title: string;
  instruction: string;
  tips: string[];
  inputType: 'measure' | 'number' | 'skip';
}

const STEPS: CheckStep[] = [
  {
    id: 'heartRate',
    icon: Heart,
    color: C.red,
    title: 'Heart Rate',
    instruction: 'Let\'s measure your heart rate using the camera',
    tips: [
      'Place fingertip firmly over rear camera',
      'Hold completely still for 30 seconds',
      'Ensure good lighting',
      'Breathe normally'
    ],
    inputType: 'measure'
  },
  {
    id: 'respiratory',
    icon: Wind,
    color: C.blue,
    title: 'Breathing Rate',
    instruction: 'Now let\'s check your breathing',
    tips: [
      'Hold phone 6-10cm from your face',
      'Breathe slowly and naturally',
      'Stay in a quiet place',
      'This takes 30 seconds'
    ],
    inputType: 'measure'
  },
  {
    id: 'hydration',
    icon: Droplet,
    color: C.blue,
    title: 'Hydration',
    instruction: 'How much water have you had today?',
    tips: [
      'Count glasses (250ml each)',
      'Include tea, coffee, juice',
      'Don\'t include alcohol',
      'Aim for 8-10 glasses daily'
    ],
    inputType: 'number'
  },
  {
    id: 'temperature',
    icon: Thermometer,
    color: C.teal,
    title: 'Temperature',
    instruction: 'Do you know your temperature?',
    tips: [
      'Use a thermometer if available',
      'Normal range: 36.1-37.2°C',
      'Skip if you don\'t have one',
      'Nurses can check this for you'
    ],
    inputType: 'number'
  }
];

export function QuickCheckGuide({ open, onClose, onComplete }: QuickCheckGuideProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [values, setValues] = useState<Record<string, number>>({});
  const [inputValue, setInputValue] = useState('');
  
  const step = STEPS[currentStep];
  const progress = ((currentStep + 1) / STEPS.length) * 100;
  
  const handleNext = () => {
    // Save value if entered
    if (inputValue) {
      setValues(prev => ({ ...prev, [step.id]: parseFloat(inputValue) }));
      setInputValue('');
    }
    
    if (currentStep < STEPS.length - 1) {
      setCurrentStep(prev => prev + 1);
    } else {
      // Complete
      onComplete(values);
      onClose();
      setCurrentStep(0);
      setValues({});
    }
  };
  
  const handleBack = () => {
    if (currentStep > 0) {
      setCurrentStep(prev => prev - 1);
    }
  };
  
  const handleSkip = () => {
    setInputValue('');
    handleNext();
  };
  
  if (!open) return null;
  
  return (
    <AnimatePresence>
      <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)', zIndex: 900, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.9, opacity: 0 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          style={{
            width: '100%',
            maxWidth: 390,
            background: C.card,
            borderRadius: 24,
            padding: '24px 20px',
            border: '1px solid rgba(255,255,255,0.1)',
            boxShadow: '0 20px 60px rgba(0,0,0,0.6)',
            margin: '0 20px'
          }}
        >
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
            <div>
              <div style={{ fontSize: 20, fontWeight: 700, color: C.text }}>Quick Check</div>
              <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>Step {currentStep + 1} of {STEPS.length}</div>
            </div>
            <button onClick={onClose} style={{ width: 34, height: 34, borderRadius: 10, background: 'rgba(255,255,255,0.07)', border: 'none', cursor: 'pointer', display: 'grid', placeItems: 'center', color: C.muted }}>
              <X size={16} />
            </button>
          </div>
          
          {/* Progress Bar */}
          <div style={{ height: 4, background: 'rgba(255,255,255,0.06)', borderRadius: 2, marginBottom: 24, overflow: 'hidden' }}>
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.3 }}
              style={{ height: '100%', background: `linear-gradient(90deg, ${step.color}, ${C.teal})`, borderRadius: 2 }}
            />
          </div>
          
          {/* Step Content */}
          <AnimatePresence mode="wait">
            <motion.div
              key={currentStep}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.2 }}
            >
              {/* Icon */}
              <div style={{ width: 60, height: 60, borderRadius: 16, background: `${step.color}14`, display: 'grid', placeItems: 'center', color: step.color, margin: '0 auto 16px' }}>
                <step.icon size={28} strokeWidth={2} />
              </div>
              
              {/* Title & Instruction */}
              <div style={{ textAlign: 'center', marginBottom: 20 }}>
                <div style={{ fontSize: 18, fontWeight: 600, color: C.text, marginBottom: 6 }}>{step.title}</div>
                <div style={{ fontSize: 14, color: C.muted, lineHeight: 1.5 }}>{step.instruction}</div>
              </div>
              
              {/* Tips */}
              <div style={{ background: 'rgba(45,212,164,0.08)', border: '1px solid rgba(45,212,164,0.2)', borderRadius: 12, padding: 14, marginBottom: 20 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: C.teal, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Quick Tips</div>
                {step.tips.map((tip, i) => (
                  <div key={i} style={{ fontSize: 13, color: C.text, marginBottom: 4, display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                    <span style={{ color: C.teal, fontSize: 18, lineHeight: 1 }}>•</span>
                    <span style={{ flex: 1, lineHeight: 1.4 }}>{tip}</span>
                  </div>
                ))}
              </div>
              
              {/* Input */}
              {step.inputType === 'number' && (
                <div style={{ marginBottom: 20 }}>
                  <input
                    type="number"
                    value={inputValue}
                    onChange={e => setInputValue(e.target.value)}
                    placeholder={step.id === 'hydration' ? 'Glasses (250ml)' : step.id === 'temperature' ? 'Temperature (°C)' : 'Value'}
                    style={{
                      width: '100%',
                      padding: '14px 16px',
                      background: '#111827',
                      border: '1px solid rgba(255,255,255,0.12)',
                      borderRadius: 12,
                      color: C.text,
                      fontSize: 16,
                      fontWeight: 500,
                      outline: 'none',
                      textAlign: 'center',
                      fontFamily: "'Geist Mono', monospace"
                    }}
                    onFocus={(e) => e.target.style.borderColor = step.color}
                    onBlur={(e) => e.target.style.borderColor = 'rgba(255,255,255,0.12)'}
                  />
                </div>
              )}
              
              {step.inputType === 'measure' && (
                <div style={{ padding: '20px 0', textAlign: 'center' }}>
                  <div style={{ fontSize: 13, color: C.muted, marginBottom: 12 }}>
                    You'll be guided through the measurement on the next screen
                  </div>
                </div>
              )}
            </motion.div>
          </AnimatePresence>
          
          {/* Buttons */}
          <div style={{ display: 'flex', gap: 10 }}>
            {currentStep > 0 && (
              <button
                onClick={handleBack}
                style={{
                  flex: 1,
                  padding: '12px 16px',
                  background: 'rgba(255,255,255,0.07)',
                  border: 'none',
                  borderRadius: 12,
                  color: C.text,
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8
                }}
              >
                <ArrowLeft size={16} />
                Back
              </button>
            )}
            
            <button
              onClick={handleSkip}
              style={{
                flex: 1,
                padding: '12px 16px',
                background: 'rgba(255,255,255,0.07)',
                border: 'none',
                borderRadius: 12,
                color: C.muted,
                fontSize: 14,
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              Skip
            </button>
            
            <button
              onClick={handleNext}
              disabled={step.inputType === 'number' && !inputValue}
              style={{
                flex: 2,
                padding: '12px 16px',
                background: inputValue || step.inputType !== 'number' ? `linear-gradient(135deg, ${step.color}, ${C.teal})` : 'rgba(255,255,255,0.1)',
                border: 'none',
                borderRadius: 12,
                color: inputValue || step.inputType !== 'number' ? '#04342C' : C.muted,
                fontSize: 14,
                fontWeight: 700,
                cursor: inputValue || step.inputType !== 'number' ? 'pointer' : 'not-allowed',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                boxShadow: inputValue || step.inputType !== 'number' ? `0 4px 16px ${step.color}40` : 'none'
              }}
            >
              {currentStep === STEPS.length - 1 ? (
                <>
                  <CheckCircle size={16} />
                  Complete
                </>
              ) : (
                <>
                  Next
                  <ArrowRight size={16} />
                </>
              )}
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
