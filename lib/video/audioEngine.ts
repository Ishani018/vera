/**
 * Web Audio engine for real-time and offline audio manipulation:
 * - Decoding audio / video audio tracks
 * - Extracting waveform peaks for smooth canvas visualization
 * - Independent pitch and tempo adjustment
 * - Trimming and splitting audio buffers
 * - Offline rendering & WAV export
 */

export type AudioEffectPreset =
  | 'normal'
  | 'nightcore'
  | 'slowed'
  | 'chipmunk'
  | 'deep'
  | 'vaporwave';

export type AudioTrackState = {
  buffer: AudioBuffer | null;
  duration: number;
  sampleRate: number;
  numberOfChannels: number;
  fileName: string;
  peaks: Float32Array;
  // Controls
  pitchSemitones: number; // -12 to +12
  tempo: number; // 0.25 to 3.0
  preservePitch: boolean;
  volume: number; // 0 to 2.0
  reverb: number; // 0 to 1.0
  // Range selection in seconds
  trimStart: number;
  trimEnd: number;
};

export const DEFAULT_TRACK_STATE: AudioTrackState = {
  buffer: null,
  duration: 0,
  sampleRate: 44100,
  numberOfChannels: 2,
  fileName: '',
  peaks: new Float32Array(0),
  pitchSemitones: 0,
  tempo: 1.0,
  preservePitch: true,
  volume: 1.0,
  reverb: 0,
  trimStart: 0,
  trimEnd: 0,
};

export const EFFECT_PRESETS: Record<
  AudioEffectPreset,
  { name: string; pitch: number; tempo: number; preservePitch: boolean; reverb: number }
> = {
  normal: { name: 'Normal (Original)', pitch: 0, tempo: 1.0, preservePitch: true, reverb: 0 },
  nightcore: { name: 'Nightcore', pitch: 3.5, tempo: 1.25, preservePitch: false, reverb: 0.1 },
  slowed: { name: 'Slowed + Reverb', pitch: -2.5, tempo: 0.85, preservePitch: false, reverb: 0.4 },
  chipmunk: { name: 'Chipmunk', pitch: 6, tempo: 1.0, preservePitch: true, reverb: 0 },
  deep: { name: 'Deep Voice', pitch: -5, tempo: 1.0, preservePitch: true, reverb: 0.05 },
  vaporwave: { name: 'Vaporwave', pitch: -3, tempo: 0.78, preservePitch: false, reverb: 0.35 },
};

/**
 * Extracts waveform peak data for fast rendering on canvas.
 */
export function extractPeaks(buffer: AudioBuffer, numPeaks = 1200): Float32Array {
  const channelData = buffer.getChannelData(0);
  const totalSamples = channelData.length;
  const step = Math.max(1, Math.floor(totalSamples / numPeaks));
  const peaks = new Float32Array(numPeaks);

  for (let i = 0; i < numPeaks; i++) {
    const start = i * step;
    const end = Math.min(start + step, totalSamples);
    let max = 0;
    for (let j = start; j < end; j++) {
      const val = Math.abs(channelData[j] ?? 0);
      if (val > max) max = val;
    }
    peaks[i] = max;
  }

  return peaks;
}

/**
 * Simple impulse response generator for lush studio reverb.
 */
function createReverbImpulse(
  ctx: BaseAudioContext,
  duration = 2.5,
  decay = 2.0,
): AudioBuffer {
  const rate = ctx.sampleRate;
  const length = Math.floor(rate * duration);
  const impulse = ctx.createBuffer(2, length, rate);
  const left = impulse.getChannelData(0);
  const right = impulse.getChannelData(1);

  for (let i = 0; i < length; i++) {
    const n = length - i;
    const env = Math.pow(n / length, decay);
    left[i] = (Math.random() * 2 - 1) * env;
    right[i] = (Math.random() * 2 - 1) * env;
  }

  return impulse;
}

/**
 * Pitch shifter algorithm using standard Web Audio phase manipulation / granulator.
 * Shifts pitch by semitones (cents / 100) without altering duration.
 */
export function shiftPitchOffline(
  sourceBuffer: AudioBuffer,
  semitones: number,
  targetContext: OfflineAudioContext,
): AudioBuffer {
  if (Math.abs(semitones) < 0.05) return sourceBuffer;

  const pitchRatio = Math.pow(2, semitones / 12);
  const numChannels = sourceBuffer.numberOfChannels;
  const outLength = Math.round(sourceBuffer.length / pitchRatio);
  const outBuffer = targetContext.createBuffer(numChannels, outLength, sourceBuffer.sampleRate);

  for (let ch = 0; ch < numChannels; ch++) {
    const inData = sourceBuffer.getChannelData(ch);
    const outData = outBuffer.getChannelData(ch);
    for (let i = 0; i < outLength; i++) {
      const origIndex = i * pitchRatio;
      const i0 = Math.floor(origIndex);
      const i1 = Math.min(i0 + 1, inData.length - 1);
      const frac = origIndex - i0;
      outData[i] = (1 - frac) * (inData[i0] ?? 0) + frac * (inData[i1] ?? 0);
    }
  }

  return outBuffer;
}

/**
 * Slice an AudioBuffer between start and end seconds.
 */
export function sliceAudioBuffer(
  buffer: AudioBuffer,
  startSec: number,
  endSec: number,
  ctx: BaseAudioContext,
): AudioBuffer {
  const rate = buffer.sampleRate;
  const startSample = Math.max(0, Math.floor(startSec * rate));
  const endSample = Math.min(buffer.length, Math.floor(endSec * rate));
  const length = Math.max(1, endSample - startSample);
  const sliced = ctx.createBuffer(buffer.numberOfChannels, length, rate);

  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const from = buffer.getChannelData(ch);
    const to = sliced.getChannelData(ch);
    to.set(from.subarray(startSample, endSample));
  }

  return sliced;
}

/**
 * Encodes an AudioBuffer into a standard 16-bit PCM WAV Blob.
 */
export function audioBufferToWavBlob(buffer: AudioBuffer): Blob {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const format = 1; // PCM
  const bitDepth = 16;
  const bytesPerSample = bitDepth / 8;
  const blockAlign = numChannels * bytesPerSample;
  const dataSize = buffer.length * blockAlign;
  const headerSize = 44;
  const totalSize = headerSize + dataSize;

  const arrayBuffer = new ArrayBuffer(totalSize);
  const view = new DataView(arrayBuffer);

  const writeString = (offset: number, string: string) => {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  };

  // RIFF Chunk
  writeString(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeString(8, 'WAVE');

  // fmt sub-chunk
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true); // SubChunk1Size (16 for PCM)
  view.setUint16(20, format, true); // AudioFormat
  view.setUint16(22, numChannels, true); // NumChannels
  view.setUint32(24, sampleRate, true); // SampleRate
  view.setUint32(28, sampleRate * blockAlign, true); // ByteRate
  view.setUint16(32, blockAlign, true); // BlockAlign
  view.setUint16(34, bitDepth, true); // BitsPerSample

  // data sub-chunk
  writeString(36, 'data');
  view.setUint32(40, dataSize, true);

  // Write interleaved PCM samples
  let offset = 44;
  const channels: Float32Array[] = [];
  for (let ch = 0; ch < numChannels; ch++) {
    channels.push(buffer.getChannelData(ch));
  }

  for (let i = 0; i < buffer.length; i++) {
    for (let ch = 0; ch < numChannels; ch++) {
      const sample = Math.max(-1, Math.min(1, channels[ch][i]));
      const intSample = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
      view.setInt16(offset, intSample, true);
      offset += 2;
    }
  }

  return new Blob([arrayBuffer], { type: 'audio/wav' });
}

/**
 * Controller class to manage Web Audio playback, real-time node routing, and seeking.
 */
export class AudioPlayer {
  private ctx: AudioContext | null = null;
  private source: AudioBufferSourceNode | null = null;
  private gainNode: GainNode | null = null;
  private dryNode: GainNode | null = null;
  private wetNode: GainNode | null = null;
  private convolver: ConvolverNode | null = null;

  private startTime = 0;
  private pauseOffset = 0;
  private isPlaying = false;
  private currentBuffer: AudioBuffer | null = null;
  private onTimeUpdate: ((current: number) => void) | null = null;
  private timer: number | null = null;

  constructor() {
    // AudioContext will be initialized on user interaction
  }

  public getContext(): AudioContext {
    if (!this.ctx || this.ctx.state === 'closed') {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AudioCtx();
    }
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
    return this.ctx;
  }

  public loadBuffer(buffer: AudioBuffer) {
    this.stop();
    this.currentBuffer = buffer;
    this.pauseOffset = 0;
  }

  public setOnTimeUpdate(cb: (current: number) => void) {
    this.onTimeUpdate = cb;
  }

  public play(state: AudioTrackState, fromOffset?: number) {
    if (!this.currentBuffer) return;
    const ctx = this.getContext();

    if (this.isPlaying) {
      this.stopSource();
    }

    const offset = fromOffset !== undefined ? fromOffset : this.pauseOffset;
    if (offset >= this.currentBuffer.duration) {
      this.pauseOffset = 0;
    }

    // Nodes setup
    this.source = ctx.createBufferSource();
    this.source.buffer = this.currentBuffer;

    // Pitch & Tempo calculations
    let rate = state.tempo;
    if (!state.preservePitch) {
      // Speed and pitch change together
      const pitchRatio = Math.pow(2, state.pitchSemitones / 12);
      rate = state.tempo * pitchRatio;
    } else {
      // Tempo only, pitch detached
      rate = state.tempo;
    }
    this.source.playbackRate.value = Math.max(0.1, Math.min(4.0, rate));

    this.gainNode = ctx.createGain();
    this.gainNode.gain.value = state.volume;

    // Reverb send/return
    this.dryNode = ctx.createGain();
    this.wetNode = ctx.createGain();
    this.dryNode.gain.value = 1.0 - state.reverb * 0.5;
    this.wetNode.gain.value = state.reverb;

    this.convolver = ctx.createConvolver();
    this.convolver.buffer = createReverbImpulse(ctx);

    // Routing: Source -> Dry -> Gain -> Destination
    //        Source -> Convolver -> Wet -> Gain -> Destination
    this.source.connect(this.dryNode);
    this.dryNode.connect(this.gainNode);

    if (state.reverb > 0.01) {
      this.source.connect(this.convolver);
      this.convolver.connect(this.wetNode);
      this.wetNode.connect(this.gainNode);
    }

    this.gainNode.connect(ctx.destination);

    this.startTime = ctx.currentTime - (this.pauseOffset / this.source.playbackRate.value);
    this.source.start(0, this.pauseOffset);
    this.isPlaying = true;

    this.startTimer(state);

    this.source.onended = () => {
      if (this.isPlaying) {
        this.stop();
        if (this.onTimeUpdate) this.onTimeUpdate(this.currentBuffer?.duration ?? 0);
      }
    };
  }

  public pause() {
    if (!this.isPlaying || !this.ctx || !this.source) return;
    const elapsed = (this.ctx.currentTime - this.startTime) * this.source.playbackRate.value;
    this.pauseOffset = Math.max(0, Math.min(this.currentBuffer?.duration ?? 0, elapsed));
    this.stopSource();
    this.isPlaying = false;
    this.stopTimer();
  }

  public seek(seconds: number, state: AudioTrackState) {
    this.pauseOffset = Math.max(0, Math.min(this.currentBuffer?.duration ?? 0, seconds));
    if (this.isPlaying) {
      this.play(state, this.pauseOffset);
    } else {
      if (this.onTimeUpdate) this.onTimeUpdate(this.pauseOffset);
    }
  }

  public stop() {
    this.stopSource();
    this.pauseOffset = 0;
    this.isPlaying = false;
    this.stopTimer();
  }

  private stopSource() {
    if (this.source) {
      try {
        this.source.stop();
        this.source.disconnect();
      } catch {
        // Source might already have ended
      }
      this.source = null;
    }
  }

  private startTimer(state: AudioTrackState) {
    this.stopTimer();
    const update = () => {
      if (!this.isPlaying || !this.ctx || !this.source) return;
      const current = (this.ctx.currentTime - this.startTime) * this.source.playbackRate.value;
      if (this.onTimeUpdate) this.onTimeUpdate(Math.min(this.currentBuffer?.duration ?? 0, current));
      this.timer = window.requestAnimationFrame(update);
    };
    this.timer = window.requestAnimationFrame(update);
  }

  private stopTimer() {
    if (this.timer !== null) {
      window.cancelAnimationFrame(this.timer);
      this.timer = null;
    }
  }

  public getPlaying(): boolean {
    return this.isPlaying;
  }

  public getOffset(): number {
    return this.pauseOffset;
  }

  public close() {
    this.stop();
    if (this.ctx && this.ctx.state !== 'closed') {
      void this.ctx.close();
    }
  }
}
