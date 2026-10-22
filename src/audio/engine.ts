// AudioContext ownership, buses and shared effect sends. Created only after a user gesture.

export class AudioEngine {
  ctx: AudioContext;
  master: GainNode;
  musicBus: GainNode;
  sfxBus: GainNode;
  reverb: ConvolverNode;
  reverbIn: GainNode;
  delayIn: GainNode;
  delay: DelayNode;
  musicFilter: BiquadFilterNode;
  noise: AudioBuffer;
  private musicVol = 0.8;
  private sfxVol = 0.8;
  private meter: AnalyserNode;
  private meterBuf = new Float32Array(1024);

  level(): number {
    this.meter.getFloatTimeDomainData(this.meterBuf);
    let s = 0;
    for (const v of this.meterBuf) s += v * v;
    return Math.sqrt(s / this.meterBuf.length);
  }

  constructor() {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.ctx = new Ctx({ latencyHint: 'interactive' });
    const ctx = this.ctx;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.knee.value = 8;
    comp.ratio.value = 4;
    comp.attack.value = 0.004;
    comp.release.value = 0.18;
    this.master = ctx.createGain();
    this.master.gain.value = 0.9;
    this.master.connect(comp).connect(ctx.destination);
    this.meter = ctx.createAnalyser();
    this.meter.fftSize = 1024;
    comp.connect(this.meter);

    this.musicFilter = ctx.createBiquadFilter();
    this.musicFilter.type = 'lowpass';
    this.musicFilter.frequency.value = 20000;
    this.musicFilter.Q.value = 0.7;
    this.musicBus = ctx.createGain();
    this.musicBus.connect(this.musicFilter).connect(this.master);
    this.sfxBus = ctx.createGain();
    this.sfxBus.connect(this.master);

    this.reverb = ctx.createConvolver();
    this.reverb.buffer = this.impulse(2.2, 2.6);
    this.reverbIn = ctx.createGain();
    this.reverbIn.gain.value = 0.32;
    this.reverbIn.connect(this.reverb).connect(this.master);

    // tempo-free ping-pong-ish delay: the musical "echo" colour used by the echo's sounds and leads
    this.delayIn = ctx.createGain();
    this.delayIn.gain.value = 0.5;
    this.delay = ctx.createDelay(2);
    this.delay.delayTime.value = 0.375;
    const fb = ctx.createGain();
    fb.gain.value = 0.38;
    const tone = ctx.createBiquadFilter();
    tone.type = 'lowpass';
    tone.frequency.value = 2600;
    this.delayIn.connect(this.delay);
    this.delay.connect(tone).connect(fb).connect(this.delay);
    tone.connect(this.master);

    const len = ctx.sampleRate * 2;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    let s = 12345;
    for (let i = 0; i < len; i++) {
      s = (s * 1103515245 + 12345) >>> 0;
      d[i] = (s / 4294967296) * 2 - 1;
    }
    this.applyVolumes();
  }

  private impulse(seconds: number, decay: number): AudioBuffer {
    const rate = this.ctx.sampleRate;
    const len = Math.floor(rate * seconds);
    const buf = this.ctx.createBuffer(2, len, rate);
    let s = 987654;
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) {
        s = (s * 1664525 + 1013904223) >>> 0;
        d[i] = ((s / 4294967296) * 2 - 1) * Math.pow(1 - i / len, decay);
      }
    }
    return buf;
  }

  setVolumes(music: number, sfx: number): void {
    this.musicVol = music;
    this.sfxVol = sfx;
    this.applyVolumes();
  }

  private applyVolumes(): void {
    const t = this.ctx.currentTime;
    // perceptual curve
    this.musicBus.gain.setTargetAtTime(Math.pow(this.musicVol, 1.6) * 0.75, t, 0.03);
    this.sfxBus.gain.setTargetAtTime(Math.pow(this.sfxVol, 1.6) * 0.9, t, 0.03);
  }

  setDelayTime(spb: number): void {
    this.delay.delayTime.setTargetAtTime(Math.min(1.9, spb * 0.75), this.ctx.currentTime, 0.05);
  }

  /** Brief muffled dip when the player is hurt. */
  duck(): void {
    const f = this.musicFilter.frequency;
    const t = this.ctx.currentTime;
    f.cancelScheduledValues(t);
    f.setValueAtTime(f.value, t);
    f.exponentialRampToValueAtTime(600, t + 0.03);
    f.exponentialRampToValueAtTime(20000, t + 0.5);
  }

  /** Context time currently audible at performance time `perf` (ms). */
  heardTime(perf: number = performance.now()): number {
    const ctx = this.ctx;
    const ts = ctx.getOutputTimestamp?.();
    if (ts && ts.performanceTime && ts.contextTime) return ts.contextTime + (perf - ts.performanceTime) / 1000;
    const lat = (ctx.outputLatency || 0) + (ctx.baseLatency || 0);
    return ctx.currentTime - lat + (perf - performance.now()) / 1000;
  }

  async resume(): Promise<void> {
    if (this.ctx.state !== 'running') await this.ctx.resume();
  }
}
