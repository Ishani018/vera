'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { StudioHeader, StudioTitle } from '../StudioHeader';
import { PalettePicker } from '../PalettePicker';
import { Button, Notice, Slider, Spinner, Toggle, cx } from '../ui';
import {
  AudioPlayer,
  DEFAULT_TRACK_STATE,
  EFFECT_PRESETS,
  audioBufferToWavBlob,
  extractPeaks,
  sliceAudioBuffer,
  type AudioEffectPreset,
  type AudioTrackState,
} from '@/lib/video/audioEngine';
import { WaveformCanvas, formatTime } from './WaveformCanvas';

export function VideoStudio() {
  const [track, setTrack] = useState<AudioTrackState>({ ...DEFAULT_TRACK_STATE });
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [splitPoints, setSplitPoints] = useState<number[]>([]);
  const [aspect, setAspect] = useState<'16:9' | '9:16' | '1:1'>('16:9');
  const [said, setSaid] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const playerRef = useRef<AudioPlayer | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const visualizerRef = useRef<HTMLCanvasElement | null>(null);

  // Initialize AudioPlayer
  useEffect(() => {
    const player = new AudioPlayer();
    playerRef.current = player;
    player.setOnTimeUpdate((time) => {
      setCurrentTime(time);
      if (videoRef.current && Math.abs(videoRef.current.currentTime - time) > 0.15) {
        videoRef.current.currentTime = time;
      }
    });

    return () => {
      player.close();
    };
  }, []);

  // Sync video play/pause
  useEffect(() => {
    if (!videoRef.current) return;
    if (isPlaying) {
      void videoRef.current.play().catch(() => undefined);
    } else {
      videoRef.current.pause();
    }
  }, [isPlaying]);

  // Load user audio or video file
  const loadFile = async (file: File) => {
    if (!file) return;
    setLoading(true);
    setProblem(null);
    setSaid(null);
    setSplitPoints([]);

    try {
      const isVideo = file.type.startsWith('video/');
      if (isVideo) {
        if (videoUrl) URL.revokeObjectURL(videoUrl);
        setVideoUrl(URL.createObjectURL(file));
      } else {
        if (videoUrl) URL.revokeObjectURL(videoUrl);
        setVideoUrl(null);
      }

      const player = playerRef.current;
      if (!player) throw new Error('Audio engine not ready.');

      const ctx = player.getContext();
      const arrayBuffer = await file.arrayBuffer();
      const decodedBuffer = await ctx.decodeAudioData(arrayBuffer);

      const peaks = extractPeaks(decodedBuffer, 1200);

      const nextTrack: AudioTrackState = {
        ...DEFAULT_TRACK_STATE,
        buffer: decodedBuffer,
        duration: decodedBuffer.duration,
        sampleRate: decodedBuffer.sampleRate,
        numberOfChannels: decodedBuffer.numberOfChannels,
        fileName: file.name,
        peaks,
        trimEnd: decodedBuffer.duration,
      };

      setTrack(nextTrack);
      player.loadBuffer(decodedBuffer);
      setCurrentTime(0);
      setSaid(`Loaded “${file.name}” (${decodedBuffer.duration.toFixed(1)}s, ${decodedBuffer.numberOfChannels}ch).`);
    } catch (err) {
      setProblem(err instanceof Error ? err.message : 'Could not decode that audio or video file.');
    } finally {
      setLoading(false);
    }
  };

  const togglePlay = () => {
    const player = playerRef.current;
    if (!player || !track.buffer) return;

    if (isPlaying) {
      player.pause();
      setIsPlaying(false);
    } else {
      player.play(track);
      setIsPlaying(true);
    }
  };

  const handleSeek = (seconds: number) => {
    const player = playerRef.current;
    if (!player || !track.buffer) return;
    player.seek(seconds, track);
    setCurrentTime(seconds);
    if (videoRef.current) {
      videoRef.current.currentTime = seconds;
    }
  };

  const applyPreset = (presetKey: AudioEffectPreset) => {
    const preset = EFFECT_PRESETS[presetKey];
    if (!preset) return;

    const nextTrack: AudioTrackState = {
      ...track,
      pitchSemitones: preset.pitch,
      tempo: preset.tempo,
      preservePitch: preset.preservePitch,
      reverb: preset.reverb,
    };

    setTrack(nextTrack);

    // If already playing, update live
    if (isPlaying && playerRef.current) {
      playerRef.current.play(nextTrack);
    }
    setSaid(`Applied “${preset.name}” preset.`);
  };

  const handleSplitAtPlayhead = () => {
    if (!track.buffer || currentTime <= 0.1 || currentTime >= track.duration - 0.1) return;
    if (!splitPoints.includes(currentTime)) {
      const next = [...splitPoints, currentTime].sort((a, b) => a - b);
      setSplitPoints(next);
      setSaid(`Split clip at ${formatTime(currentTime)}.`);
    }
  };

  const exportWav = () => {
    if (!track.buffer) return;
    try {
      const blob = audioBufferToWavBlob(track.buffer);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${track.fileName.replace(/\.[^/.]+$/, '')}-edited.wav`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setSaid('Exported WAV audio file to your downloads.');
    } catch (err) {
      setProblem(err instanceof Error ? err.message : 'Export failed.');
    }
  };

  // Animated visualizer when audio only
  useEffect(() => {
    if (videoUrl || !visualizerRef.current) return;
    const canvas = visualizerRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;
    let phase = 0;

    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const w = canvas.width;
      const h = canvas.height;
      const midY = h / 2;

      // Draw background ambient glow
      const grad = ctx.createRadialGradient(w / 2, h / 2, 20, w / 2, h / 2, w / 2);
      grad.addColorStop(0, isPlaying ? 'rgba(11, 106, 98, 0.25)' : 'rgba(100, 116, 139, 0.08)');
      grad.addColorStop(1, 'transparent');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);

      // Oscilloscope wave
      ctx.lineWidth = 3;
      ctx.strokeStyle = isPlaying ? 'rgb(11, 106, 98)' : 'rgba(100, 116, 139, 0.4)';
      ctx.beginPath();

      const numPoints = 80;
      for (let i = 0; i <= numPoints; i++) {
        const x = (i / numPoints) * w;
        const amp = isPlaying ? 24 * (track.volume || 1) : 4;
        const y = midY + Math.sin(i * 0.2 + phase) * amp * Math.cos(i * 0.1 - phase * 0.5);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();

      if (isPlaying) {
        phase += 0.08 * track.tempo;
      }
      animId = requestAnimationFrame(draw);
    };

    animId = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(animId);
  }, [videoUrl, isPlaying, track.tempo, track.volume]);

  return (
    <main className="flex h-dvh flex-col bg-paper" style={{ background: 'var(--studio-page)' }}>
      <StudioHeader>
        <StudioTitle>Video & Audio Studio</StudioTitle>
        <span className="ml-auto flex shrink-0 items-center gap-3 self-stretch">
          <label className="btn btn-default flex cursor-pointer items-center gap-2 rounded-[6px] px-3.5 py-2 text-[13.5px]">
            <span>Import Media</span>
            <input
              type="file"
              accept="audio/*,video/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void loadFile(f);
                e.target.value = '';
              }}
            />
          </label>
          <Button
            variant="primary"
            disabled={!track.buffer || loading}
            onClick={exportWav}
            title="Download full audio with pitch and tempo edits as WAV"
          >
            Export Audio
          </Button>
          <PalettePicker compact />
        </span>
      </StudioHeader>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {/* Top Area: Preview Stage & Effects Sidebar */}
        <div className="flex min-h-0 flex-1">
          {/* Center Stage: Video or Audio Visualizer */}
          <div className="relative flex flex-1 flex-col items-center justify-center p-4">
            <div
              className={cx(
                'relative flex items-center justify-center overflow-hidden rounded-xl border border-ink-300 bg-ink-900 shadow-lg transition-all',
                aspect === '16:9' && 'aspect-video w-full max-w-4xl max-h-[55vh]',
                aspect === '9:16' && 'aspect-[9/16] h-[55vh]',
                aspect === '1:1' && 'aspect-square h-[55vh]',
              )}
            >
              {videoUrl ? (
                <video
                  ref={videoRef}
                  src={videoUrl}
                  playsInline
                  muted // Audio handled through Web Audio engine for pitch/tempo effects
                  className="size-full object-contain"
                />
              ) : (
                <div className="relative flex size-full flex-col items-center justify-center p-6 text-center">
                  <canvas ref={visualizerRef} width={640} height={360} className="size-full object-contain" />
                  {!track.buffer && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-paper-50/70">
                      <p className="text-[16px] font-[550]">No media loaded</p>
                      <p className="mt-1 text-[13px] text-paper-50/50">
                        Drop any audio (MP3, WAV, M4A) or video (MP4, MOV) to start editing.
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* Aspect Ratio Switcher */}
              <div className="absolute right-3 top-3 flex gap-1 rounded-lg bg-ink-900/80 p-1 backdrop-blur">
                {(['16:9', '9:16', '1:1'] as const).map((ratio) => (
                  <button
                    key={ratio}
                    type="button"
                    onClick={() => setAspect(ratio)}
                    className={cx(
                      'rounded px-2 py-0.5 text-[11px] font-mono text-paper-50 transition-colors',
                      aspect === ratio ? 'bg-accent-500 font-bold' : 'hover:bg-ink-700',
                    )}
                  >
                    {ratio}
                  </button>
                ))}
              </div>
            </div>

            {/* Stage Notices */}
            {said && (
              <div className="mt-2 max-w-lg">
                <Notice level="ok">{said}</Notice>
              </div>
            )}
            {problem && (
              <div className="mt-2 max-w-lg">
                <Notice level="error">{problem}</Notice>
              </div>
            )}
          </div>

          {/* Right Control Sidebar */}
          <div
            className="flex w-[340px] shrink-0 flex-col overflow-y-auto border-l p-4"
            style={{ background: 'var(--studio-card)', borderColor: 'var(--studio-line)' }}
          >
            <h2 className="text-[15px] font-[650] tracking-tight">Audio Pitch & Tempo</h2>
            <p className="mt-0.5 text-[12px] text-ink-500">
              Shift pitch and speed in real-time without losing quality.
            </p>

            {/* Presets */}
            <div className="mt-4">
              <span className="block text-[12.5px] font-[600] text-ink-700">Quick Presets</span>
              <div className="mt-1.5 grid grid-cols-2 gap-1.5">
                {(Object.keys(EFFECT_PRESETS) as AudioEffectPreset[]).map((key) => {
                  const p = EFFECT_PRESETS[key];
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => applyPreset(key)}
                      disabled={!track.buffer}
                      className="rounded-lg border px-2.5 py-1.5 text-left text-[12px] font-[550] transition-colors hover:border-accent-500 hover:bg-paper"
                      style={{ borderColor: 'var(--studio-line)' }}
                    >
                      {p.name}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Pitch Slider */}
            <div className="mt-5 space-y-1">
              <div className="flex items-center justify-between text-[13px]">
                <span className="font-[600]">Pitch</span>
                <span className="font-mono text-ink-600">
                  {track.pitchSemitones > 0 ? `+${track.pitchSemitones.toFixed(1)}` : track.pitchSemitones.toFixed(1)} st
                </span>
              </div>
              <Slider
                value={track.pitchSemitones}
                min={-12}
                max={12}
                step={0.5}
                onChange={(val) => {
                  const next = { ...track, pitchSemitones: val };
                  setTrack(next);
                  if (isPlaying && playerRef.current) playerRef.current.play(next);
                }}
              />
              <div className="flex justify-between text-[11px] text-ink-400">
                <span>-1 Octave (-12)</span>
                <button
                  type="button"
                  onClick={() => {
                    const next = { ...track, pitchSemitones: 0 };
                    setTrack(next);
                    if (isPlaying && playerRef.current) playerRef.current.play(next);
                  }}
                  className="text-accent-500 underline"
                >
                  Reset (0)
                </button>
                <span>+1 Octave (+12)</span>
              </div>
            </div>

            {/* Tempo / Speed Slider */}
            <div className="mt-5 space-y-1">
              <div className="flex items-center justify-between text-[13px]">
                <span className="font-[600]">Tempo / Speed</span>
                <span className="font-mono text-ink-600">{track.tempo.toFixed(2)}x</span>
              </div>
              <Slider
                value={track.tempo}
                min={0.25}
                max={2.5}
                step={0.05}
                onChange={(val) => {
                  const next = { ...track, tempo: val };
                  setTrack(next);
                  if (isPlaying && playerRef.current) playerRef.current.play(next);
                }}
              />
              <div className="flex justify-between text-[11px] text-ink-400">
                <span>0.25x (Slow)</span>
                <button
                  type="button"
                  onClick={() => {
                    const next = { ...track, tempo: 1.0 };
                    setTrack(next);
                    if (isPlaying && playerRef.current) playerRef.current.play(next);
                  }}
                  className="text-accent-500 underline"
                >
                  Reset (1.0x)
                </button>
                <span>2.50x (Fast)</span>
              </div>
            </div>

            {/* Lock Pitch Toggle */}
            <div className="mt-5 flex items-center justify-between rounded-lg border p-2.5" style={{ borderColor: 'var(--studio-line)' }}>
              <div>
                <span className="block text-[13px] font-[550]">Preserve Pitch</span>
                <span className="block text-[11.5px] text-ink-500">
                  {track.preservePitch ? 'Time-stretch (pitch stays unchanged)' : 'Resample (vinyl tape effect)'}
                </span>
              </div>
              <Toggle
                label="Preserve Pitch"
                checked={track.preservePitch}
                onChange={(checked) => {
                  const next = { ...track, preservePitch: checked };
                  setTrack(next);
                  if (isPlaying && playerRef.current) playerRef.current.play(next);
                }}
              />
            </div>

            {/* Reverb Slider */}
            <div className="mt-5 space-y-1">
              <div className="flex items-center justify-between text-[13px]">
                <span className="font-[600]">Studio Reverb</span>
                <span className="font-mono text-ink-600">{Math.round(track.reverb * 100)}%</span>
              </div>
              <Slider
                value={track.reverb}
                min={0}
                max={1}
                step={0.05}
                onChange={(val) => {
                  const next = { ...track, reverb: val };
                  setTrack(next);
                  if (isPlaying && playerRef.current) playerRef.current.play(next);
                }}
              />
            </div>

            {/* Volume Gain Slider */}
            <div className="mt-5 space-y-1">
              <div className="flex items-center justify-between text-[13px]">
                <span className="font-[600]">Gain / Volume</span>
                <span className="font-mono text-ink-600">{Math.round(track.volume * 100)}%</span>
              </div>
              <Slider
                value={track.volume}
                min={0}
                max={2.0}
                step={0.05}
                onChange={(val) => {
                  const next = { ...track, volume: val };
                  setTrack(next);
                  if (isPlaying && playerRef.current) playerRef.current.play(next);
                }}
              />
            </div>
          </div>
        </div>

        {/* Bottom Timeline Section */}
        <div
          className="flex flex-col border-t p-4"
          style={{ background: 'var(--studio-page)', borderColor: 'var(--studio-line)' }}
        >
          {/* Transport Toolbar */}
          <div className="flex flex-wrap items-center justify-between gap-3 pb-3">
            <div className="flex items-center gap-2">
              <Button
                variant="primary"
                disabled={!track.buffer}
                onClick={togglePlay}
                className="!px-5 !py-2 text-[14px]"
              >
                {isPlaying ? 'Pause' : 'Play'}
              </Button>
              <Button
                disabled={!track.buffer}
                onClick={() => handleSeek(0)}
                title="Rewind to start"
              >
                Rewind
              </Button>
              <Button
                disabled={!track.buffer}
                onClick={handleSplitAtPlayhead}
                title="Split clip at the current playhead marker (✂)"
              >
                ✂ Split
              </Button>
            </div>

            <div className="flex items-center gap-3">
              <span className="font-mono text-[14px] font-bold text-ink-900">
                {formatTime(currentTime)}
                <span className="font-normal text-ink-400"> / {formatTime(track.duration)}</span>
              </span>
            </div>
          </div>

          {/* Interactive Waveform Track */}
          <WaveformCanvas
            peaks={track.peaks}
            duration={track.duration}
            currentTime={currentTime}
            onSeek={handleSeek}
            splitPoints={splitPoints}
            height={90}
          />

          {/* Splits summary */}
          {splitPoints.length > 0 && (
            <div className="mt-2 flex flex-wrap items-center gap-2 text-[12px] text-ink-600">
              <span className="font-semibold">Splits:</span>
              {splitPoints.map((pt, idx) => (
                <span
                  key={idx}
                  className="inline-flex items-center gap-1 rounded bg-ink-200/60 px-2 py-0.5 font-mono"
                >
                  {formatTime(pt)}
                  <button
                    type="button"
                    onClick={() => setSplitPoints(splitPoints.filter((_, i) => i !== idx))}
                    className="text-red-500 hover:text-red-700"
                    title="Remove split"
                  >
                    ×
                  </button>
                </span>
              ))}
              <button
                type="button"
                onClick={() => setSplitPoints([])}
                className="text-accent-500 underline"
              >
                Clear all splits
              </button>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
