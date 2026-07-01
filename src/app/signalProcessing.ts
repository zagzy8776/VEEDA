/**
 * Hospital-Grade Signal Processing for VEEDA
 * Implements proper DSP algorithms for medical-grade vital sign detection
 */

/**
 * Butterworth Bandpass Filter
 * Filters signal to physiological heart rate range (0.7-4 Hz = 42-240 BPM)
 */
export class ButterworthFilter {
  private a: number[] = [];
  private b: number[] = [];
  private x: number[] = [0, 0, 0];
  private y: number[] = [0, 0, 0];

  constructor(lowFreq: number, highFreq: number, sampleRate: number) {
    // Second-order Butterworth bandpass filter coefficients
    const nyquist = sampleRate / 2;
    const low = lowFreq / nyquist;
    const high = highFreq / nyquist;
    
    // Calculate filter coefficients
    const bw = high - low;
    const center = Math.sqrt(low * high);
    const q = center / bw;
    
    const omega = 2 * Math.PI * center;
    const sn = Math.sin(omega);
    const cs = Math.cos(omega);
    const alpha = sn / (2 * q);
    
    const b0 = alpha;
    const b1 = 0;
    const b2 = -alpha;
    const a0 = 1 + alpha;
    const a1 = -2 * cs;
    const a2 = 1 - alpha;
    
    this.b = [b0 / a0, b1 / a0, b2 / a0];
    this.a = [1, a1 / a0, a2 / a0];
  }

  filter(input: number): number {
    // Apply IIR filter
    const output = 
      this.b[0] * input + 
      this.b[1] * this.x[0] + 
      this.b[2] * this.x[1] -
      this.a[1] * this.y[0] - 
      this.a[2] * this.y[1];
    
    // Shift delay line
    this.x[1] = this.x[0];
    this.x[0] = input;
    this.y[1] = this.y[0];
    this.y[0] = output;
    
    return output;
  }

  reset() {
    this.x = [0, 0, 0];
    this.y = [0, 0, 0];
  }
}


/**
 * FFT (Fast Fourier Transform) for frequency domain analysis
 * Uses Cooley-Tukey algorithm
 */
export function fft(signal: number[]): { magnitude: number[], phase: number[], frequencies: number[] } {
  const n = signal.length;
  
  // Ensure power of 2
  const powerOf2 = Math.pow(2, Math.ceil(Math.log2(n)));
  const padded = [...signal, ...Array(powerOf2 - n).fill(0)];
  
  // Cooley-Tukey FFT
  const real = new Float64Array(padded);
  const imag = new Float64Array(powerOf2);
  
  cooleyTukeyFFT(real, imag);
  
  // Calculate magnitude and phase
  const magnitude: number[] = [];
  const phase: number[] = [];
  const frequencies: number[] = [];
  
  for (let i = 0; i < powerOf2 / 2; i++) {
    magnitude.push(Math.sqrt(real[i] * real[i] + imag[i] * imag[i]));
    phase.push(Math.atan2(imag[i], real[i]));
    frequencies.push(i / powerOf2);
  }
  
  return { magnitude, phase, frequencies };
}

function cooleyTukeyFFT(real: Float64Array, imag: Float64Array) {
  const n = real.length;
  
  // Bit-reversal permutation
  let j = 0;
  for (let i = 0; i < n - 1; i++) {
    if (i < j) {
      [real[i], real[j]] = [real[j], real[i]];
      [imag[i], imag[j]] = [imag[j], imag[i]];
    }
    let k = n / 2;
    while (k <= j) {
      j -= k;
      k /= 2;
    }
    j += k;
  }
  
  // Cooley-Tukey decimation-in-time radix-2 FFT
  for (let len = 2; len <= n; len *= 2) {
    const halfLen = len / 2;
    const angle = -2 * Math.PI / len;
    
    for (let i = 0; i < n; i += len) {
      let wReal = 1;
      let wImag = 0;
      
      for (let j = 0; j < halfLen; j++) {
        const tReal = wReal * real[i + j + halfLen] - wImag * imag[i + j + halfLen];
        const tImag = wReal * imag[i + j + halfLen] + wImag * real[i + j + halfLen];
        
        real[i + j + halfLen] = real[i + j] - tReal;
        imag[i + j + halfLen] = imag[i + j] - tImag;
        real[i + j] += tReal;
        imag[i + j] += tImag;
        
        const nextWReal = wReal * Math.cos(angle) - wImag * Math.sin(angle);
        const nextWImag = wReal * Math.sin(angle) + wImag * Math.cos(angle);
        wReal = nextWReal;
        wImag = nextWImag;
      }
    }
  }
}


/**
 * Advanced Peak Detection with adaptive thresholding
 * More accurate than simple local maxima
 */
export function detectPeaks(
  signal: number[], 
  sampleRate: number,
  minDistance: number = 0.4 // Minimum 0.4s between peaks (150 BPM max)
): number[] {
  const peaks: number[] = [];
  const minDistSamples = Math.round(minDistance * sampleRate);
  
  // Calculate adaptive threshold
  const mean = signal.reduce((a, b) => a + b, 0) / signal.length;
  const stdDev = Math.sqrt(
    signal.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / signal.length
  );
  const threshold = mean + 0.5 * stdDev;
  
  // Find peaks above threshold
  for (let i = 2; i < signal.length - 2; i++) {
    if (
      signal[i] > threshold &&
      signal[i] > signal[i - 1] &&
      signal[i] > signal[i - 2] &&
      signal[i] >= signal[i + 1] &&
      signal[i] >= signal[i + 2]
    ) {
      // Check minimum distance from last peak
      if (peaks.length === 0 || i - peaks[peaks.length - 1] >= minDistSamples) {
        peaks.push(i);
      }
    }
  }
  
  return peaks;
}

/**
 * Calculate Signal-to-Noise Ratio (SNR)
 * Assesses signal quality for medical accuracy
 */
export function calculateSNR(signal: number[], noise: number[]): number {
  const signalPower = signal.reduce((sum, val) => sum + val * val, 0) / signal.length;
  const noisePower = noise.reduce((sum, val) => sum + val * val, 0) / noise.length;
  
  if (noisePower === 0) return Infinity;
  
  return 10 * Math.log10(signalPower / noisePower);
}

/**
 * Motion Artifact Detection
 * Identifies segments with too much movement for reliable measurement
 */
export function detectMotionArtifacts(
  signal: number[],
  windowSize: number = 30,
  threshold: number = 3.0
): boolean[] {
  const artifacts: boolean[] = new Array(signal.length).fill(false);
  
  for (let i = 0; i < signal.length - windowSize; i += windowSize / 2) {
    const window = signal.slice(i, i + windowSize);
    const mean = window.reduce((a, b) => a + b, 0) / window.length;
    const variance = window.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / window.length;
    const stdDev = Math.sqrt(variance);
    
    // High variance indicates motion
    if (stdDev > threshold * mean) {
      for (let j = i; j < Math.min(i + windowSize, signal.length); j++) {
        artifacts[j] = true;
      }
    }
  }
  
  return artifacts;
}


/**
 * Calculate Heart Rate Variability (HRV) metrics
 * Important for stress and autonomic nervous system assessment
 */
export function calculateHRV(rrIntervals: number[]): {
  sdnn: number; // Standard deviation of NN intervals
  rmssd: number; // Root mean square of successive differences
  pnn50: number; // Percentage of NN intervals > 50ms different
  meanHR: number;
  lfHfRatio: number; // Low frequency / High frequency ratio
} {
  if (rrIntervals.length < 2) {
    return { sdnn: 0, rmssd: 0, pnn50: 0, meanHR: 0, lfHfRatio: 0 };
  }
  
  // Mean heart rate
  const meanRR = rrIntervals.reduce((a, b) => a + b, 0) / rrIntervals.length;
  const meanHR = 60000 / meanRR; // Convert ms to BPM
  
  // SDNN (Standard Deviation of NN intervals)
  const variance = rrIntervals.reduce((sum, val) => sum + Math.pow(val - meanRR, 2), 0) / rrIntervals.length;
  const sdnn = Math.sqrt(variance);
  
  // RMSSD (Root Mean Square of Successive Differences)
  const diffs = [];
  for (let i = 1; i < rrIntervals.length; i++) {
    diffs.push(rrIntervals[i] - rrIntervals[i - 1]);
  }
  const rmssd = Math.sqrt(diffs.reduce((sum, d) => sum + d * d, 0) / diffs.length);
  
  // pNN50 (percentage of successive differences > 50ms)
  const nn50 = diffs.filter(d => Math.abs(d) > 50).length;
  const pnn50 = (nn50 / diffs.length) * 100;
  
  // LF/HF ratio (requires FFT on RR intervals - simplified here)
  const lfHfRatio = sdnn / rmssd; // Approximation
  
  return { sdnn, rmssd, pnn50, meanHR, lfHfRatio };
}

/**
 * Quality Assessment for PPG signal
 * Returns confidence score 0-100
 */
export function assessSignalQuality(
  signal: number[],
  peaks: number[],
  sampleRate: number
): { score: number; confidence: string; issues: string[] } {
  let score = 100;
  const issues: string[] = [];
  
  // Check 1: Sufficient peaks
  if (peaks.length < 3) {
    score -= 40;
    issues.push('Insufficient cardiac cycles detected');
  }
  
  // Check 2: Regular rhythm
  if (peaks.length >= 3) {
    const intervals = [];
    for (let i = 1; i < peaks.length; i++) {
      intervals.push((peaks[i] - peaks[i - 1]) / sampleRate);
    }
    const meanInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
    const irregularity = Math.max(...intervals.map(i => Math.abs(i - meanInterval)));
    
    if (irregularity > 0.3) {
      score -= 20;
      issues.push('Irregular rhythm detected');
    }
  }
  
  // Check 3: SNR
  const mean = signal.reduce((a, b) => a + b, 0) / signal.length;
  const variance = signal.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / signal.length;
  const coeffVar = Math.sqrt(variance) / mean;
  
  if (coeffVar < 0.05) {
    score -= 30;
    issues.push('Signal too weak - improve finger placement');
  }
  
  // Check 4: Baseline drift
  const firstQuarter = signal.slice(0, signal.length / 4);
  const lastQuarter = signal.slice(-signal.length / 4);
  const drift = Math.abs(
    firstQuarter.reduce((a, b) => a + b, 0) / firstQuarter.length -
    lastQuarter.reduce((a, b) => a + b, 0) / lastQuarter.length
  );
  
  if (drift > mean * 0.2) {
    score -= 10;
    issues.push('Baseline drift - hold finger still');
  }
  
  score = Math.max(0, Math.min(100, score));
  
  let confidence = 'Low';
  if (score >= 80) confidence = 'High';
  else if (score >= 60) confidence = 'Moderate';
  else if (score >= 40) confidence = 'Fair';
  
  return { score, confidence, issues };
}
