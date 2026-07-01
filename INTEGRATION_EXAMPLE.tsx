/**
 * Complete Integration Example
 * Shows how to use all quantum enhancements together
 * Copy-paste this into your components as needed
 */

import { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { Sparkles, Volume2, VolumeX } from 'lucide-react';

// Import quantum features
import { useOptimizedVedaApp } from './app/useOptimizedVedaApp';
import { biofeedbackAudio } from './app/audio/biofeedbackSonification';
import { QuantumVisualizer, QuantumWaveBackground } from './app/components/QuantumVisualizer';
import { QuickCheckGuide } from './app/components/QuickCheckGuide';
import { QRNG } from './app/quantum/quantumEngine';

export function EnhancedHomePageExample() {
  const app = useOptimizedVedaApp();
  const [showQuickCheck, setShowQuickCheck] = useState(false);
  const [audioEnabled, setAudioEnabled] = useState(false);
  const [visualMode, setVisualMode] = useState<'wave' | 'particle' | 'bloch' | 'entanglement'>('wave');
  
  // Quantum recommendations
  const quantumRecommendations = app.quantumRecommendations;
  
  // Biofeedback audio control
  const toggleAudio = async () => {
    if (!audioEnabled) {
      await biofeedbackAudio.initialize();
      
      if (app.vitals.heartRate && app.vitals.respiratory) {
        biofeedbackAudio.startBiofeedback({
          heartRate: app.vitals.heartRate,
          respiratory: app.vitals.respiratory,
          wellnessScore: app.wellnessScore || 70,
          quality: 90
        });
        setAudioEnabled(true);
      } else {
        alert('Please measure heart rate and breathing first');
      }
    } else {
      biofeedbackAudio.stopBiofeedback();
      setAudioEnabled(false);
    }
  };
  
  // Cleanup audio on unmount
  useEffect(() => {
    return () => {
      biofeedbackAudio.stopBiofeedback();
    };
  }, []);
  
  // Cycle through visualization modes (using quantum random)
  const cycleVisualization = () => {
    const modes: Array<'wave' | 'particle' | 'bloch' | 'entanglement'> = ['wave', 'particle', 'bloch', 'entanglement'];
    const next = QRNG.choice(modes);
    setVisualMode(next);
  };
  
  return (
    <div style={{ position: 'relative', minHeight: '100vh', overflow: 'hidden' }}>
      {/* Quantum Wave Background (subtle) */}
      <QuantumWaveBackground opacity={0.05} />
      
      {/* Quantum Visualizer (animated based on vitals) */}
      <QuantumVisualizer
        heartRate={app.vitals.heartRate}
        respiratory={app.vitals.respiratory}
        wellnessScore={app.wellnessScore}
        mode={visualMode}
        show={true}
      />
      
      {/* Main Content */}
      <div style={{ position: 'relative', zIndex: 1, padding: '20px' }}>
        
        {/* Quantum Controls (top right) */}
        <div style={{ 
          position: 'fixed', 
          top: 20, 
          right: 20, 
          display: 'flex', 
          gap: 10,
          zIndex: 100 
        }}>
          {/* Audio Toggle */}
          <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={toggleAudio}
            style={{
              width: 44,
              height: 44,
              borderRadius: 12,
              background: audioEnabled ? 'rgba(45,212,164,0.2)' : 'rgba(255,255,255,0.1)',
              border: `1px solid ${audioEnabled ? 'rgba(45,212,164,0.4)' : 'rgba(255,255,255,0.1)'}`,
              color: audioEnabled ? '#2DD4A4' : '#E2F4F0',
              cursor: 'pointer',
              display: 'grid',
              placeItems: 'center'
            }}
            title={audioEnabled ? 'Disable Biofeedback Audio' : 'Enable Biofeedback Audio'}
          >
            {audioEnabled ? <Volume2 size={20} /> : <VolumeX size={20} />}
          </motion.button>
          
          {/* Visualization Cycle */}
          <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={cycleVisualization}
            style={{
              width: 44,
              height: 44,
              borderRadius: 12,
              background: 'rgba(45,212,164,0.1)',
              border: '1px solid rgba(45,212,164,0.2)',
              color: '#2DD4A4',
              cursor: 'pointer',
              display: 'grid',
              placeItems: 'center'
            }}
            title="Cycle Quantum Visualization"
          >
            <Sparkles size={20} />
          </motion.button>
        </div>
        
        {/* Wellness Score */}
        <div style={{ textAlign: 'center', marginBottom: 30 }}>
          <div style={{ fontSize: 48, fontWeight: 700, color: '#2DD4A4', fontFamily: "'Geist Mono', monospace" }}>
            {app.wellnessScore ?? '--'}
          </div>
          <div style={{ fontSize: 14, color: '#5A7A72', marginTop: 4 }}>
            Wellness Score
          </div>
        </div>
        
        {/* Quantum-Optimized Recommendations */}
        {quantumRecommendations && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            style={{
              background: 'rgba(45,212,164,0.08)',
              border: '1px solid rgba(45,212,164,0.2)',
              borderRadius: 16,
              padding: 16,
              marginBottom: 20
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <Sparkles size={16} style={{ color: '#2DD4A4' }} />
              <span style={{ fontSize: 12, fontWeight: 600, color: '#2DD4A4', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Quantum-Optimized Recommendations
              </span>
              <span style={{ fontSize: 10, color: '#5A7A72', marginLeft: 'auto' }}>
                {quantumRecommendations.quantumScore.toFixed(1)}% better than classical
              </span>
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {quantumRecommendations.priority.map((rec, i) => (
                <div
                  key={i}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '8px 12px',
                    background: 'rgba(13,21,37,0.6)',
                    borderRadius: 10,
                    fontSize: 13,
                    color: '#E2F4F0'
                  }}
                >
                  <span style={{ 
                    width: 20, 
                    height: 20, 
                    borderRadius: 6, 
                    background: i === 0 ? '#2DD4A4' : i === 1 ? '#378ADD' : '#EF9F27',
                    display: 'grid',
                    placeItems: 'center',
                    fontSize: 11,
                    fontWeight: 700,
                    color: '#04342C'
                  }}>
                    {i + 1}
                  </span>
                  <span>{rec}</span>
                </div>
              ))}
            </div>
            
            <div style={{ fontSize: 10, color: '#5A7A72', marginTop: 8 }}>
              Confidence: {quantumRecommendations.confidence}% · Quantum Annealing Algorithm
            </div>
          </motion.div>
        )}
        
        {/* Quick Check Button */}
        <motion.button
          whileTap={{ scale: 0.98 }}
          whileHover={{ y: -2 }}
          onClick={() => setShowQuickCheck(true)}
          style={{
            width: '100%',
            padding: '16px 20px',
            background: 'linear-gradient(135deg, #2DD4A4, #378ADD)',
            border: 'none',
            borderRadius: 16,
            color: '#04342C',
            fontSize: 16,
            fontWeight: 700,
            cursor: 'pointer',
            boxShadow: '0 12px 32px rgba(45,212,164,0.25)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 12
          }}
        >
          <Sparkles size={20} />
          Start Quick Check
        </motion.button>
        
        {/* Vital Signs Display */}
        <div style={{ marginTop: 30 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#5A7A72', marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Current Vitals
          </div>
          
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <VitalCard
              label="Heart Rate"
              value={app.vitals.heartRate}
              unit="bpm"
              color="#E24B4A"
            />
            <VitalCard
              label="Breathing"
              value={app.vitals.respiratory}
              unit="br/min"
              color="#378ADD"
            />
            <VitalCard
              label="Oxygen"
              value={app.vitals.oxygen}
              unit="%"
              color="#2DD4A4"
            />
            <VitalCard
              label="Temperature"
              value={app.vitals.skinTemp}
              unit="°C"
              color="#EF9F27"
            />
          </div>
        </div>
        
        {/* Info Panel */}
        <div style={{ 
          marginTop: 30, 
          padding: 14, 
          background: 'rgba(55,138,221,0.08)',
          border: '1px solid rgba(55,138,221,0.2)',
          borderRadius: 12,
          fontSize: 11,
          color: '#5A7A72',
          lineHeight: 1.5
        }}>
          ⚛️ <strong style={{ color: '#378ADD' }}>Quantum-Enhanced:</strong> This interface uses quantum-inspired algorithms for optimization, therapeutic audio synthesis, and physics-based visualizations to enhance your wellness monitoring experience.
        </div>
      </div>
      
      {/* Quick Check Guide Modal */}
      <QuickCheckGuide
        open={showQuickCheck}
        onClose={() => setShowQuickCheck(false)}
        onComplete={(vitals) => {
          console.log('Quick Check completed:', vitals);
          
          // Save vitals
          if (vitals.heartRate) {
            app.setVital('heartRate', vitals.heartRate, 'Quick Check');
            app.saveBiometric('heart_rate', vitals.heartRate, 'bpm');
          }
          if (vitals.respiratory) {
            app.setVital('respiratory', vitals.respiratory, 'Quick Check');
            app.saveBiometric('breath_rate', vitals.respiratory, 'breaths/min');
          }
          if (vitals.hydration) {
            const ml = vitals.hydration * 250; // Convert glasses to ml
            app.logWater(ml);
          }
          if (vitals.temperature) {
            app.setVital('skinTemp', vitals.temperature, 'Manual entry');
            app.saveBiometric('temperature', vitals.temperature, 'celsius');
          }
          
          setShowQuickCheck(false);
          
          // Show success message
          alert('✅ Vitals recorded successfully!');
        }}
      />
    </div>
  );
}

// Helper component for vital cards
function VitalCard({ 
  label, 
  value, 
  unit, 
  color 
}: { 
  label: string; 
  value: number | null; 
  unit: string; 
  color: string;
}) {
  return (
    <div style={{
      background: 'rgba(13,21,37,0.88)',
      border: '1px solid rgba(255,255,255,0.08)',
      borderRadius: 14,
      padding: 14
    }}>
      <div style={{ fontSize: 10, color: '#5A7A72', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        {label}
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
        <span style={{ 
          fontSize: 24, 
          fontWeight: 700, 
          color: value !== null ? '#E2F4F0' : '#5A7A72',
          fontFamily: "'Geist Mono', monospace"
        }}>
          {value !== null ? value : '--'}
        </span>
        <span style={{ fontSize: 10, color: '#5A7A72' }}>{unit}</span>
      </div>
      <div style={{ 
        height: 3, 
        background: 'rgba(255,255,255,0.06)', 
        borderRadius: 2, 
        marginTop: 10,
        overflow: 'hidden'
      }}>
        <div style={{ 
          height: '100%', 
          width: value ? '100%' : '0%', 
          background: color,
          borderRadius: 2,
          transition: 'width 0.8s ease'
        }} />
      </div>
    </div>
  );
}
