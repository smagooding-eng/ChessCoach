import React from 'react';
import { Check, X, Hand } from 'lucide-react';

// The chess-clock look shared by every game board (bots, live, daily, local,
// puzzles): flat panels, huge bold digits. The side that's "on" is green with
// white digits, the other is grey with dark digits, and a dark strip holds the
// small controls -- like a physical / app chess clock.
export const CLOCK = {
  on: '#81B64C',
  onText: '#FFFFFF',
  onSub: 'rgba(255,255,255,.78)',
  off: '#8A8A88',
  offText: '#2B2B2B',
  offSub: 'rgba(43,43,43,.7)',
  strip: '#302D2B',
  stripIcon: '#A9A6A2',
  low: '#E5484D',
} as const;

export interface ClockFaceData {
  name?: string; text: string; active: boolean; low?: boolean; moves?: number;
  /** Urgent line on the clock, e.g. an abandonment countdown ("Away · 0:24"). */
  alert?: string;
}

/** One clock panel. Tapping it calls onTap (used for "tap your clock to confirm"). */
export function ClockPanel({
  face, onTap, hint, size = 'md', className = '', style,
}: {
  face: ClockFaceData;
  onTap?: () => void;
  hint?: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  style?: React.CSSProperties;
}) {
  const on = face.active;
  const digits = size === 'lg' ? 'text-[56px]' : size === 'md' ? 'text-[34px]' : 'text-[24px]';
  const cls = `relative flex flex-col items-center justify-center overflow-hidden rounded-2xl px-3 py-3 text-center ${onTap ? 'transition-transform active:scale-[0.98]' : ''} ${className}`;
  const st: React.CSSProperties = { background: on ? CLOCK.on : CLOCK.off, ...style };
  const inner = (
    <>
      {face.name && (
        <span className="absolute left-3 top-2 max-w-[70%] truncate text-left text-[11px] font-bold" style={{ color: on ? CLOCK.onSub : CLOCK.offSub }}>{face.name}</span>
      )}
      {typeof face.moves === 'number' && (
        <span className="absolute right-3 top-2 text-[11px] font-bold" style={{ color: on ? CLOCK.onSub : CLOCK.offSub }}>Moves: {face.moves}</span>
      )}
      <span className={`font-sans font-black tabular-nums leading-none ${digits}`}
        style={{ color: face.low ? CLOCK.low : on ? CLOCK.onText : CLOCK.offText, letterSpacing: '-0.02em' }}>
        {face.text}
      </span>
      {face.alert && (
        <span className="mt-2 inline-flex animate-pulse items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-black uppercase tracking-wider"
          style={{ background: CLOCK.low, color: '#fff' }}>
          {face.alert}
        </span>
      )}
      {hint && (
        <span className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-extrabold uppercase tracking-wider" style={{ color: on ? CLOCK.onSub : CLOCK.offSub }}>
          <Hand size={12} /> {hint}
        </span>
      )}
    </>
  );
  return onTap
    ? <button type="button" onClick={onTap} className={cls} style={st}>{inner}</button>
    : <div className={cls} style={st}>{inner}</div>;
}

/** Under-the-board Confirm Move control (phones, and boards without a side
 *  clock): a dark strip with Cancel, and a big green "clock" you tap to play
 *  the move. Shows your time on it when the game has one. */
export function ConfirmPad({
  onConfirm, onCancel, busy, time, className = '',
}: {
  onConfirm: () => void;
  onCancel: () => void;
  busy?: boolean;
  time?: string;
  className?: string;
}) {
  return (
    <div className={`flex h-[68px] overflow-hidden rounded-2xl ${className}`} style={{ opacity: busy ? 0.6 : 1 }}>
      <button type="button" onClick={onCancel} disabled={busy}
        className="flex w-[30%] flex-col items-center justify-center gap-0.5 transition-transform active:scale-[0.97]"
        style={{ background: CLOCK.strip, color: CLOCK.stripIcon }} aria-label="Cancel move">
        <X size={22} strokeWidth={2.6} />
        <span className="text-[10.5px] font-extrabold uppercase tracking-wider">Cancel</span>
      </button>
      <button type="button" onClick={onConfirm} disabled={busy}
        className="flex flex-1 flex-col items-center justify-center transition-transform active:scale-[0.99]"
        style={{ background: CLOCK.on, color: CLOCK.onText }} aria-label="Confirm move">
        {time ? (
          <>
            <span className="font-black tabular-nums text-[28px] leading-none">{time}</span>
            <span className="mt-1 inline-flex items-center gap-1 text-[10.5px] font-extrabold uppercase tracking-wider" style={{ color: CLOCK.onSub }}>
              <Check size={12} strokeWidth={3} /> Tap to confirm
            </span>
          </>
        ) : (
          <span className="inline-flex items-center gap-2 text-[20px] font-black tracking-wide">
            <Check size={22} strokeWidth={3} /> {busy ? 'Playing…' : 'CONFIRM'}
          </span>
        )}
      </button>
    </div>
  );
}
