'use client';

import { useEffect, useRef, useState, type MouseEvent } from 'react';

export function formatTime(seconds: number): string {
  if (isNaN(seconds) || seconds < 0) return '00:00.0';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 10);
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${ms}`;
}

export function WaveformCanvas({
  peaks,
  duration,
  currentTime,
  onSeek,
  splitPoints = [],
  trimStart = 0,
  trimEnd = 0,
  className = '',
  height = 120,
}: {
  peaks: Float32Array;
  duration: number;
  currentTime: number;
  onSeek: (seconds: number) => void;
  splitPoints?: number[];
  trimStart?: number;
  trimEnd?: number;
  className?: string;
  height?: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [hoverTime, setHoverTime] = useState<number | null>(null);

  // Draw waveform
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const width = rect.width;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    // Background
    ctx.clearRect(0, 0, width, height);

    if (!peaks || peaks.length === 0 || duration <= 0) {
      // Empty placeholder waveform line
      ctx.strokeStyle = 'rgba(128, 128, 128, 0.2)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, height / 2);
      ctx.lineTo(width, height / 2);
      ctx.stroke();
      return;
    }

    const midY = height / 2;
    const maxBarHeight = height * 0.42;
    const numBars = Math.min(peaks.length, Math.floor(width / 2.5));
    const step = width / numBars;
    const barWidth = Math.max(1.5, step * 0.65);

    // Played percentage
    const progress = Math.max(0, Math.min(1, currentTime / duration));
    const playheadX = progress * width;

    // Draw bars
    for (let i = 0; i < numBars; i++) {
      const peakIndex = Math.floor((i / numBars) * peaks.length);
      const val = Math.max(0.04, peaks[peakIndex] ?? 0);
      const barH = val * maxBarHeight;
      const x = i * step;

      // Color: accent if before playhead, muted ink if after
      const isPlayed = x <= playheadX;
      ctx.fillStyle = isPlayed ? 'rgb(11, 106, 98)' : 'rgba(100, 116, 139, 0.45)';

      // Mirrored rounded bar
      ctx.beginPath();
      ctx.roundRect(x, midY - barH, barWidth, barH * 2, 1);
      ctx.fill();
    }

    // Split points
    for (const splitSec of splitPoints) {
      const splitX = (splitSec / duration) * width;
      ctx.strokeStyle = 'rgb(209, 67, 42)'; // Red marker
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 2]);
      ctx.beginPath();
      ctx.moveTo(splitX, 0);
      ctx.lineTo(splitX, height);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Playhead line
    ctx.strokeStyle = 'rgb(11, 106, 98)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(playheadX, 0);
    ctx.lineTo(playheadX, height);
    ctx.stroke();

    // Playhead handle knob
    ctx.fillStyle = 'rgb(11, 106, 98)';
    ctx.beginPath();
    ctx.arc(playheadX, 6, 5, 0, Math.PI * 2);
    ctx.fill();
  }, [peaks, duration, currentTime, splitPoints, height]);

  const getTimeFromEvent = (e: MouseEvent<HTMLDivElement>): number => {
    const container = containerRef.current;
    if (!container || duration <= 0) return 0;
    const rect = container.getBoundingClientRect();
    const x = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
    return (x / rect.width) * duration;
  };

  const handleMouseDown = (e: MouseEvent<HTMLDivElement>) => {
    setIsDragging(true);
    const time = getTimeFromEvent(e);
    onSeek(time);
  };

  const handleMouseMove = (e: MouseEvent<HTMLDivElement>) => {
    const time = getTimeFromEvent(e);
    setHoverTime(time);
    if (isDragging) {
      onSeek(time);
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleMouseLeave = () => {
    setIsDragging(false);
    setHoverTime(null);
  };

  return (
    <div
      ref={containerRef}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseLeave}
      className={`relative cursor-pointer select-none overflow-hidden rounded-lg border border-ink-200 bg-paper-50 transition-colors ${className}`}
      style={{ height }}
    >
      <canvas ref={canvasRef} className="block size-full" />

      {/* Hover time tooltip */}
      {hoverTime !== null && (
        <span
          className="pointer-events-none absolute top-1.5 -translate-x-1/2 rounded bg-ink-900/80 px-1.5 py-0.5 text-[10.5px] font-mono text-paper-50 backdrop-blur"
          style={{
            left: `${duration > 0 ? (hoverTime / duration) * 100 : 0}%`,
          }}
        >
          {formatTime(hoverTime)}
        </span>
      )}

      {/* Time display bottom right */}
      <span className="pointer-events-none absolute bottom-1 right-2 rounded bg-paper/70 px-1.5 py-0.5 font-mono text-[11px] text-ink-600">
        {formatTime(currentTime)} / {formatTime(duration)}
      </span>
    </div>
  );
}
