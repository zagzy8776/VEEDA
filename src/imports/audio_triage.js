const DEFAULT_OPTIONS = {
  silenceSeconds: 11,
  tachypneaBpm: 30,
  sampleMs: 250,
};

export class VedaAudioTriage {
  constructor(onAlert, options = {}) {
    this.onAlert = onAlert;
    this.options = { ...DEFAULT_OPTIONS, ...options };
    this.audioContext = null;
    this.analyser = null;
    this.stream = null;
    this.timer = null;
    this.noiseFloor = 0.015;
    this.lastActiveAt = Date.now();
    this.peaks = [];
    this.alertCooldownUntil = 0;
  }

  async start() {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error('Microphone API unavailable');
    }
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    this.audioContext = new AudioContext();
    const source = this.audioContext.createMediaStreamSource(this.stream);
    this.analyser = this.audioContext.createAnalyser();
    this.analyser.fftSize = 1024;
    source.connect(this.analyser);
    await this.calibrate();
    this.lastActiveAt = Date.now();
    this.timer = window.setInterval(() => this.tick(), this.options.sampleMs);
  }

  stop() {
    if (this.timer) window.clearInterval(this.timer);
    this.stream?.getTracks().forEach(track => track.stop());
    this.audioContext?.close();
    this.timer = null;
    this.stream = null;
    this.audioContext = null;
  }

  async calibrate() {
    const samples = [];
    for (let i = 0; i < 12; i++) {
      await new Promise(resolve => setTimeout(resolve, 250));
      samples.push(this.readRms());
    }
    const average = samples.reduce((sum, value) => sum + value, 0) / samples.length;
    this.noiseFloor = Math.max(0.012, average * 1.8);
  }

  tick() {
    const now = Date.now();
    const rms = this.readRms();
    const active = rms > this.noiseFloor;
    if (active) {
      this.lastActiveAt = now;
      if (!this.peaks.length || now - this.peaks[this.peaks.length - 1] > 900) this.peaks.push(now);
    }
    this.peaks = this.peaks.filter(timestamp => now - timestamp < 15000);
    if (now < this.alertCooldownUntil) return;

    const silenceSeconds = (now - this.lastActiveAt) / 1000;
    if (silenceSeconds >= this.options.silenceSeconds) {
      this.emit({ type: 'possible_apnea', breathsPerMinuteEstimate: 0, silenceDurationSeconds: Number(silenceSeconds.toFixed(1)), confidence: 'low_prototype' });
      return;
    }

    const bpmEstimate = Math.round(this.peaks.length * 4);
    if (bpmEstimate > this.options.tachypneaBpm) {
      this.emit({ type: 'possible_tachypnea', breathsPerMinuteEstimate: bpmEstimate, silenceDurationSeconds: 0, confidence: 'low_prototype' });
    }
  }

  emit(alert) {
    this.alertCooldownUntil = Date.now() + 20000;
    this.onAlert(alert);
  }

  readRms() {
    if (!this.analyser) return 0;
    const data = new Uint8Array(this.analyser.fftSize);
    this.analyser.getByteTimeDomainData(data);
    const sum = data.reduce((total, value) => {
      const normalized = (value - 128) / 128;
      return total + normalized * normalized;
    }, 0);
    return Math.sqrt(sum / data.length);
  }
}