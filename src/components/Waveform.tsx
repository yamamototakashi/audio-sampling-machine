import { useEffect, useMemo, useRef, useState } from 'react';
import { computeWaveformPeaks } from '../audio/SampleProcessor';

interface Props {
  pcm: Float32Array;
  trimStart: number; // frames
  trimEnd: number;   // frames
  onChangeTrim: (start: number, end: number) => void;
  height?: number;
}

/**
 * Touch-friendly waveform with two draggable handles for trim points.
 * Renders peaks to a canvas (resizes on container width).
 */
export function Waveform({ pcm, trimStart, trimEnd, onChangeTrim, height = 120 }: Props) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [width, setWidth] = useState(320);
  const [drag, setDrag] = useState<'start' | 'end' | null>(null);

  // Track container width so the canvas reflows on rotation / layout shifts.
  useEffect(() => {
    if (!wrapRef.current) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width ?? 320;
      setWidth(Math.max(160, Math.floor(w)));
    });
    ro.observe(wrapRef.current);
    return () => ro.disconnect();
  }, []);

  const peaks = useMemo(() => computeWaveformPeaks(pcm, width), [pcm, width]);

  // Paint
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    const ctx = canvas.getContext('2d')!;
    ctx.scale(dpr, dpr);

    // Background
    const grad = ctx.createLinearGradient(0, 0, 0, height);
    grad.addColorStop(0, '#1a1c20');
    grad.addColorStop(1, '#0e0f12');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);

    // Center line
    ctx.strokeStyle = '#2a2c31';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, height / 2);
    ctx.lineTo(width, height / 2);
    ctx.stroke();

    // Selection band
    const selStart = (trimStart / pcm.length) * width;
    const selEnd = (trimEnd / pcm.length) * width;
    ctx.fillStyle = 'rgba(120, 220, 235, 0.07)';
    ctx.fillRect(selStart, 0, selEnd - selStart, height);

    // Peaks
    ctx.fillStyle = '#7fe6f2';
    for (let i = 0; i < width; i++) {
      const mn = peaks[i * 2];
      const mx = peaks[i * 2 + 1];
      const y1 = (1 - (mx + 1) / 2) * height;
      const y2 = (1 - (mn + 1) / 2) * height;
      const inSel = i >= selStart && i <= selEnd;
      ctx.fillStyle = inSel ? '#9fefff' : '#3a6770';
      ctx.fillRect(i, y1, 1, Math.max(1, y2 - y1));
    }

    // Handles
    ctx.fillStyle = '#cfeef6';
    ctx.fillRect(selStart - 1, 0, 2, height);
    ctx.fillRect(selEnd - 1, 0, 2, height);
  }, [peaks, width, height, trimStart, trimEnd, pcm.length]);

  const xToFrame = (x: number) => {
    const r = canvasRef.current!.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (x - r.left) / r.width));
    return Math.floor(ratio * pcm.length);
  };

  const onPointerDown = (e: React.PointerEvent) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    const f = xToFrame(e.clientX);
    // Pick whichever handle is closer.
    const dStart = Math.abs(f - trimStart);
    const dEnd = Math.abs(f - trimEnd);
    setDrag(dStart < dEnd ? 'start' : 'end');
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag) return;
    const f = xToFrame(e.clientX);
    if (drag === 'start') onChangeTrim(Math.min(f, trimEnd - 64), trimEnd);
    else onChangeTrim(trimStart, Math.max(f, trimStart + 64));
  };
  const onPointerUp = () => setDrag(null);

  return (
    <div ref={wrapRef} className="wave-wrap">
      <canvas
        ref={canvasRef}
        className="wave-canvas"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      />
    </div>
  );
}
