/**
 * Quantum State Visualizer Component
 * Shows wave functions, qubits, and entanglement
 * Subtle, therapeutic animations tied to vital signs
 */

import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';

interface QuantumVisualizerProps {
  heartRate?: number | null;
  respiratory?: number | null;
  wellnessScore?: number | null;
  show?: boolean;
  mode?: 'wave' | 'particle' | 'bloch' | 'entanglement';
}

export function QuantumVisualizer({
  heartRate = 70,
  respiratory = 16,
  wellnessScore = 75,
  show = true,
  mode = 'wave'
}: QuantumVisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>(0);
  const phaseRef = useRef<number>(0);
  
  useEffect(() => {
    if (!show || !canvasRef.current) return;
    
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    // Set canvas size
    canvas.width = canvas.offsetWidth * window.devicePixelRatio;
    canvas.height = canvas.offsetHeight * window.devicePixelRatio;
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
    
    const width = canvas.offsetWidth;
    const height = canvas.offsetHeight;
    
    const animate = () => {
      ctx.clearRect(0, 0, width, height);
      
      phaseRef.current += 0.02;
      
      if (mode === 'wave') {
        drawWaveFunction(ctx, width, height, heartRate || 70, phaseRef.current);
      } else if (mode === 'particle') {
        drawParticleField(ctx, width, height, wellnessScore || 75, phaseRef.current);
      } else if (mode === 'bloch') {
        drawBlochSphere(ctx, width, height, respiratory || 16, phaseRef.current);
      } else if (mode === 'entanglement') {
        drawEntanglement(ctx, width, height, heartRate || 70, respiratory || 16, phaseRef.current);
      }
      
      animationRef.current = requestAnimationFrame(animate);
    };
    
    animate();
    
    return () => {
      cancelAnimationFrame(animationRef.current);
    };
  }, [show, mode, heartRate, respiratory, wellnessScore]);
  
  if (!show) return null;
  
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        zIndex: 0
      }}
    >
      <canvas
        ref={canvasRef}
        style={{
          width: '100%',
          height: '100%',
          opacity: 0.15
        }}
      />
    </motion.div>
  );
}

/**
 * Draw Schrödinger wave function
 * Frequency modulated by heart rate
 */
function drawWaveFunction(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  heartRate: number,
  phase: number
) {
  const centerY = height / 2;
  const frequency = (heartRate / 60) * 0.5; // Heart rate affects frequency
  const amplitude = height * 0.15;
  
  ctx.strokeStyle = 'rgba(45, 212, 164, 0.6)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  
  for (let x = 0; x < width; x++) {
    const t = x / width;
    // Quantum wave function: ψ(x,t) = A·sin(kx - ωt)
    const y = centerY + amplitude * Math.sin(frequency * Math.PI * 8 * t - phase);
    
    if (x === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  }
  
  ctx.stroke();
  
  // Probability density |ψ|²
  ctx.fillStyle = 'rgba(45, 212, 164, 0.1)';
  ctx.beginPath();
  ctx.moveTo(0, centerY);
  
  for (let x = 0; x < width; x++) {
    const t = x / width;
    const y = centerY + amplitude * Math.sin(frequency * Math.PI * 8 * t - phase);
    ctx.lineTo(x, y);
  }
  
  ctx.lineTo(width, centerY);
  ctx.closePath();
  ctx.fill();
}

/**
 * Draw quantum particle field
 * Particle density reflects wellness
 */
function drawParticleField(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  wellnessScore: number,
  phase: number
) {
  const particleCount = Math.floor(20 + (wellnessScore / 100) * 30);
  const color = wellnessScore >= 80 ? '45, 212, 164' : wellnessScore >= 60 ? '55, 138, 221' : '239, 159, 39';
  
  for (let i = 0; i < particleCount; i++) {
    const angle = (i / particleCount) * Math.PI * 2 + phase;
    const radius = 50 + (wellnessScore / 100) * 100;
    const x = width / 2 + Math.cos(angle) * radius;
    const y = height / 2 + Math.sin(angle) * radius;
    
    // Particle size varies with wellness
    const size = 2 + (wellnessScore / 100) * 3;
    
    // Quantum uncertainty - particles have fuzzy position
    const fuzzX = Math.sin(phase * 3 + i) * 5;
    const fuzzY = Math.cos(phase * 3 + i) * 5;
    
    ctx.fillStyle = `rgba(${color}, ${0.6 + Math.sin(phase + i) * 0.3})`;
    ctx.beginPath();
    ctx.arc(x + fuzzX, y + fuzzY, size, 0, Math.PI * 2);
    ctx.fill();
  }
}


/**
 * Draw Bloch sphere (qubit state visualization)
 * Rotation speed tied to respiratory rate
 */
function drawBlochSphere(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  respiratory: number,
  phase: number
) {
  const centerX = width / 2;
  const centerY = height / 2;
  const radius = Math.min(width, height) * 0.3;
  
  // Sphere outline
  ctx.strokeStyle = 'rgba(45, 212, 164, 0.3)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
  ctx.stroke();
  
  // Axes
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
  ctx.lineWidth = 1;
  
  // X axis
  ctx.beginPath();
  ctx.moveTo(centerX - radius, centerY);
  ctx.lineTo(centerX + radius, centerY);
  ctx.stroke();
  
  // Y axis
  ctx.beginPath();
  ctx.moveTo(centerX, centerY - radius);
  ctx.lineTo(centerX, centerY + radius);
  ctx.stroke();
  
  // Qubit state vector (rotates with breathing)
  const rotationSpeed = (respiratory / 16) * 0.5;
  const theta = phase * rotationSpeed;
  const phi = phase * rotationSpeed * 1.5;
  
  // Convert spherical to Cartesian
  const x = centerX + radius * Math.sin(theta) * Math.cos(phi) * 0.8;
  const y = centerY + radius * Math.sin(theta) * Math.sin(phi) * 0.8;
  
  // Draw state vector
  ctx.strokeStyle = 'rgba(45, 212, 164, 0.8)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(centerX, centerY);
  ctx.lineTo(x, y);
  ctx.stroke();
  
  // State point
  ctx.fillStyle = 'rgba(45, 212, 164, 0.9)';
  ctx.beginPath();
  ctx.arc(x, y, 4, 0, Math.PI * 2);
  ctx.fill();
}

/**
 * Draw quantum entanglement between two particles
 * Correlation strength reflects vital sign coherence
 */
function drawEntanglement(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  heartRate: number,
  respiratory: number,
  phase: number
) {
  const centerY = height / 2;
  const particle1X = width * 0.3;
  const particle2X = width * 0.7;
  
  // Calculate entanglement strength (coherence between vitals)
  const idealHRRRRatio = 4.5; // Ideal heart rate to respiratory rate ratio
  const actualRatio = heartRate / respiratory;
  const coherence = 1 - Math.min(1, Math.abs(actualRatio - idealHRRRRatio) / idealHRRRRatio);
  
  // Particle 1 (heart)
  const p1Y = centerY + Math.sin(phase * (heartRate / 60)) * 40;
  ctx.fillStyle = 'rgba(226, 75, 74, 0.8)';
  ctx.beginPath();
  ctx.arc(particle1X, p1Y, 8, 0, Math.PI * 2);
  ctx.fill();
  
  // Particle 2 (breathing) - entangled motion
  const p2Y = centerY + Math.sin(phase * (respiratory / 16) + coherence * Math.PI) * 40;
  ctx.fillStyle = 'rgba(55, 138, 221, 0.8)';
  ctx.beginPath();
  ctx.arc(particle2X, p2Y, 8, 0, Math.PI * 2);
  ctx.fill();
  
  // Entanglement field (stronger when coherent)
  const connectionStrength = coherence;
  ctx.strokeStyle = `rgba(45, 212, 164, ${connectionStrength * 0.5})`;
  ctx.lineWidth = 2;
  
  // Draw wave-like connection
  ctx.beginPath();
  ctx.moveTo(particle1X, p1Y);
  
  const segments = 20;
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const x = particle1X + (particle2X - particle1X) * t;
    const midY = p1Y + (p2Y - p1Y) * t;
    const wave = Math.sin(t * Math.PI * 4 + phase) * 10 * connectionStrength;
    ctx.lineTo(x, midY + wave);
  }
  
  ctx.stroke();
  
  // Glow effect for strong entanglement
  if (coherence > 0.7) {
    ctx.shadowColor = 'rgba(45, 212, 164, 0.6)';
    ctx.shadowBlur = 20;
    ctx.beginPath();
    ctx.arc(width / 2, centerY, 30, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(45, 212, 164, ${(coherence - 0.7) * 0.3})`;
    ctx.fill();
    ctx.shadowBlur = 0;
  }
}

/**
 * Simple wave pattern for background
 */
export function QuantumWaveBackground({ opacity = 0.05 }: { opacity?: number }) {
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        background: `
          radial-gradient(circle at 20% 30%, rgba(45,212,164,${opacity}) 0%, transparent 50%),
          radial-gradient(circle at 80% 70%, rgba(55,138,221,${opacity}) 0%, transparent 50%),
          radial-gradient(circle at 50% 50%, rgba(45,212,164,${opacity * 0.5}) 0%, transparent 60%)
        `,
        pointerEvents: 'none',
        zIndex: 0
      }}
    />
  );
}
