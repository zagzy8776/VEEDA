/**
 * Quantum Biofeedback Sonification System
 * Converts vital signs and quantum states into therapeutic audio
 * Uses Tone.js for procedural sound synthesis
 */

import * as Tone from 'tone';

/**
 * Therapeutic audio engine for biofeedback
 * Helps patients understand their vitals through sound
 */
export class BiofeedbackSonification {
  private heartSynth: Tone.MembraneSynth | null = null;
  private breathSynth: Tone.Synth | null = null;
  private ambientSynth: Tone.PolySynth | null = null;
  private quantumOsc: Tone.Oscillator | null = null;
  private filter: Tone.Filter | null = null;
  private reverb: Tone.Reverb | null = null;
  private isInitialized = false;
  private isPlaying = false;
  
  /**
   * Initialize audio context (must be called after user interaction)
   */
  async initialize() {
    if (this.isInitialized) return;
    
    await Tone.start();
    
    // Create reverb for spacious therapeutic sound
    this.reverb = new Tone.Reverb({
      decay: 4,
      wet: 0.3
    }).toDestination();
    
    // Filter for shaping overall tonality
    this.filter = new Tone.Filter({
      type: 'lowpass',
      frequency: 2000,
      Q: 1
    }).connect(this.reverb);
    
    // Heart beat synth (warm, pulsing)
    this.heartSynth = new Tone.MembraneSynth({
      pitchDecay: 0.05,
      octaves: 4,
      oscillator: { type: 'sine' },
      envelope: {
        attack: 0.001,
        decay: 0.4,
        sustain: 0.01,
        release: 0.3,
        attackCurve: 'exponential'
      }
    }).connect(this.filter);
    
    // Breathing synth (smooth, wave-like)
    this.breathSynth = new Tone.Synth({
      oscillator: { type: 'sine' },
      envelope: {
        attack: 2,
        decay: 0.1,
        sustain: 0.8,
        release: 3
      }
    }).connect(this.filter);
    
    // Ambient wellness synth (calming background)
    this.ambientSynth = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: 'sine' },
      envelope: {
        attack: 1,
        decay: 0,
        sustain: 1,
        release: 2
      }
    }).connect(this.filter);
    
    // Quantum oscillator (represents superposition states)
    this.quantumOsc = new Tone.Oscillator({
      frequency: 174, // Healing frequency (Solfeggio)
      type: 'sine',
      volume: -20
    }).connect(this.filter);
    
    this.isInitialized = true;
  }

  
  /**
   * Sonify heart rate - each beat triggers a sound
   * Frequency and timbre reflect heart rate health
   */
  playHeartBeat(bpm: number, quality: number = 100) {
    if (!this.isInitialized || !this.heartSynth) return;
    
    // Convert BPM to interval
    const interval = 60 / bpm;
    
    // Base frequency based on health (lower BPM = lower pitch)
    const baseFreq = 40 + (bpm - 60) * 0.5; // 40-140 Hz range
    
    // Quality affects timbre (poor quality = harsher sound)
    const octaves = 2 + (quality / 100) * 2; // 2-4 octaves
    this.heartSynth.octaves = octaves;
    
    // Play beat
    this.heartSynth.triggerAttackRelease(baseFreq, '8n');
    
    // Schedule next beat
    if (this.isPlaying) {
      setTimeout(() => this.playHeartBeat(bpm, quality), interval * 1000);
    }
  }
  
  /**
   * Sonify breathing - smooth oscillations
   * Rate and depth reflect respiratory health
   */
  playBreathCycle(breathsPerMin: number, depth: number = 1) {
    if (!this.isInitialized || !this.breathSynth) return;
    
    const cycleDuration = 60 / breathsPerMin;
    const inhaleTime = cycleDuration * 0.4;
    const exhaleTime = cycleDuration * 0.6;
    
    // Frequency reflects respiratory rate (slower = lower)
    const baseNote = breathsPerMin < 12 ? 'C3' : breathsPerMin < 20 ? 'E3' : 'G3';
    
    // Inhale (rising pitch)
    this.breathSynth.triggerAttack(baseNote);
    
    setTimeout(() => {
      // Exhale (falling pitch)
      this.breathSynth?.triggerRelease();
      
      if (this.isPlaying) {
        setTimeout(() => this.playBreathCycle(breathsPerMin, depth), exhaleTime * 1000);
      }
    }, inhaleTime * 1000);
  }
  
  /**
   * Create ambient wellness soundscape based on overall health
   * Uses pentatonic scale for therapeutic quality
   */
  playWellnessAmbient(wellnessScore: number) {
    if (!this.isInitialized || !this.ambientSynth) return;
    
    // Pentatonic scale (always sounds harmonious)
    const scales = {
      low: ['C3', 'D3', 'E3', 'G3', 'A3'],      // Concern
      medium: ['E3', 'F#3', 'G#3', 'B3', 'C#4'], // Stable
      high: ['G3', 'A3', 'B3', 'D4', 'E4']       // Excellent
    };
    
    const scale = wellnessScore >= 80 ? scales.high : wellnessScore >= 60 ? scales.medium : scales.low;
    
    // Play arpeggiated chord progression
    const chord = [scale[0], scale[2], scale[4]];
    this.ambientSynth.triggerAttackRelease(chord, '2n');
    
    // Continue ambient sound
    if (this.isPlaying) {
      setTimeout(() => this.playWellnessAmbient(wellnessScore), 4000);
    }
  }
  
  /**
   * Quantum state sonification - represents superposition and entanglement
   * Creates ethereal, evolving soundscape
   */
  playQuantumState(phase: number, entanglement: number = 0.5) {
    if (!this.isInitialized || !this.quantumOsc) return;
    
    // Modulate frequency based on quantum phase
    const baseFreq = 174; // Solfeggio healing frequency
    const modulation = Math.sin(phase * Math.PI * 2) * 20 * entanglement;
    this.quantumOsc.frequency.rampTo(baseFreq + modulation, 0.5);
    
    // Update filter based on entanglement
    if (this.filter) {
      this.filter.frequency.rampTo(1000 + entanglement * 3000, 1);
    }
  }
  
  /**
   * Start complete biofeedback sonification
   */
  async startBiofeedback(vitals: {
    heartRate: number;
    respiratory: number;
    wellnessScore: number;
    quality?: number;
  }) {
    if (!this.isInitialized) {
      await this.initialize();
    }
    
    this.isPlaying = true;
    
    // Start quantum oscillator
    this.quantumOsc?.start();
    
    // Start heart beat
    this.playHeartBeat(vitals.heartRate, vitals.quality || 100);
    
    // Start breathing
    setTimeout(() => {
      this.playBreathCycle(vitals.respiratory);
    }, 500);
    
    // Start ambient
    setTimeout(() => {
      this.playWellnessAmbient(vitals.wellnessScore);
    }, 1000);
    
    // Animate quantum state
    let phase = 0;
    const quantumInterval = setInterval(() => {
      if (!this.isPlaying) {
        clearInterval(quantumInterval);
        return;
      }
      phase += 0.01;
      const entanglement = (vitals.wellnessScore / 100) * 0.7 + 0.3;
      this.playQuantumState(phase, entanglement);
    }, 50);
  }
  
  /**
   * Stop all sonification
   */
  stopBiofeedback() {
    this.isPlaying = false;
    
    // Fade out and stop all synths
    if (this.heartSynth) {
      this.heartSynth.volume.rampTo(-60, 1);
    }
    if (this.breathSynth) {
      this.breathSynth.triggerRelease();
    }
    if (this.ambientSynth) {
      this.ambientSynth.releaseAll();
    }
    if (this.quantumOsc) {
      this.quantumOsc.stop('+1');
    }
  }
  
  /**
   * Play alert sound for concerning vitals
   */
  playAlert(severity: 'low' | 'medium' | 'high') {
    if (!this.isInitialized || !this.ambientSynth) return;
    
    const alerts = {
      low: ['E4', 'G4'],
      medium: ['F4', 'A4', 'F4'],
      high: ['G4', 'C5', 'G4', 'C5']
    };
    
    const notes = alerts[severity];
    notes.forEach((note, i) => {
      setTimeout(() => {
        this.ambientSynth?.triggerAttackRelease(note, '16n');
      }, i * 200);
    });
  }
  
  /**
   * Cleanup resources
   */
  dispose() {
    this.stopBiofeedback();
    this.heartSynth?.dispose();
    this.breathSynth?.dispose();
    this.ambientSynth?.dispose();
    this.quantumOsc?.dispose();
    this.filter?.dispose();
    this.reverb?.dispose();
    this.isInitialized = false;
  }
}

// Singleton instance
export const biofeedbackAudio = new BiofeedbackSonification();
