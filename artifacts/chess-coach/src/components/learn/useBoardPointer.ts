// Shared tap-or-drag input for the learning boards (Beginner Path and
// Chess for Kids). Either way works everywhere: tap a piece then tap a
// square, or press on a piece and drag it to the square.

import { useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import { FILES } from '@/lib/kids/levels';

export interface DragState { from: string; x: number; y: number; moved: boolean }

export function useBoardPointer(opts: {
  canDrag?: (sq: string) => boolean;
  onTap?: (sq: string) => void;
  onDrop?: (from: string, to: string) => void;
}) {
  const box = useRef<HTMLDivElement | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const start = useRef<{ x: number; y: number; sq: string } | null>(null);
  const lastPointer = useRef(0);

  const squareAt = (clientX: number, clientY: number): string | null => {
    const el = box.current;
    if (!el) return null;
    // Prefer the square element actually under the finger, so what you touch
    // is exactly what registers; fall back to the board geometry.
    try {
      const hit = document.elementFromPoint(clientX, clientY)?.closest('[data-sq]') as HTMLElement | null;
      if (hit && el.contains(hit) && hit.dataset.sq) return hit.dataset.sq;
    } catch { /* ignore */ }
    const r = el.getBoundingClientRect();
    const fx = Math.floor(((clientX - r.left) / r.width) * 8);
    const fy = Math.floor(((clientY - r.top) / r.height) * 8);
    if (fx < 0 || fx > 7 || fy < 0 || fy > 7) return null;
    return FILES[fx] + String(8 - fy);
  };
  const local = (clientX: number, clientY: number) => {
    const r = box.current!.getBoundingClientRect();
    return { x: clientX - r.left, y: clientY - r.top };
  };

  const onPointerDown = (e: RPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    const sq = squareAt(e.clientX, e.clientY);
    if (!sq) return;
    start.current = { x: e.clientX, y: e.clientY, sq };
    if (opts.canDrag?.(sq) && opts.onDrop) {
      try { (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId); } catch { /* ignore */ }
      setDrag({ from: sq, ...local(e.clientX, e.clientY), moved: false });
    }
  };
  const onPointerMove = (e: RPointerEvent<HTMLDivElement>) => {
    if (!drag || !start.current) return;
    const moved = drag.moved || Math.hypot(e.clientX - start.current.x, e.clientY - start.current.y) > 8;
    setDrag({ ...drag, ...local(e.clientX, e.clientY), moved });
  };
  const onPointerUp = (e: RPointerEvent<HTMLDivElement>) => {
    const s = start.current;
    start.current = null;
    lastPointer.current = Date.now();
    const d = drag;
    setDrag(null);
    if (!s) return;
    const sq = d?.moved ? squareAt(e.clientX, e.clientY) : s.sq; // a tap counts where it started
    if (d?.moved) {
      if (sq && sq !== d.from) opts.onDrop?.(d.from, sq);
      else if (sq === d.from) opts.onTap?.(sq); // dropped back where it started: just select it
      return;
    }
    if (sq) opts.onTap?.(sq);
  };
  const onPointerCancel = () => { start.current = null; setDrag(null); };

  return {
    box, drag,
    handlers: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel },
    /** Keyboard activation of a square button (pointer taps are handled above). */
    keyTap: (sq: string, detail: number) => { if (detail === 0 && Date.now() - lastPointer.current > 700) opts.onTap?.(sq); },
  };
}
