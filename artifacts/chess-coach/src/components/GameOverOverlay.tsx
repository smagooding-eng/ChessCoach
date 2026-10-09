import React, { useEffect, useState } from 'react';
import { Trophy, Handshake, Frown, X } from 'lucide-react';
import { CLOCK } from '@/components/ClockPad';

export type GameOutcome = 'win' | 'loss' | 'draw';

/** Human wording for how a game ended, from the player's point of view. */
export function describeEnding(termination: string | undefined, outcome: GameOutcome): string {
  const t = termination ?? '';
  switch (t) {
    case 'checkmate': return 'by checkmate';
    case 'resignation': return outcome === 'win' ? 'Opponent resigned' : 'You resigned';
    case 'timeout': return outcome === 'win' ? 'Opponent ran out of time' : outcome === 'loss' ? 'You ran out of time' : 'on time';
    case 'abandoned': return outcome === 'win' ? 'Opponent abandoned the game' : 'You left the game for too long';
    case 'stalemate': return 'by stalemate';
    case 'draw_agreement': return 'by agreement';
    case 'draw_repetition': return 'by repetition';
    case 'draw_50': return 'by the 50-move rule';
    case 'draw_insufficient': return 'insufficient material';
    default: return t ? t.replace(/_/g, ' ') : '';
  }
}

/**
 * Result card that drops onto the board when a game ends: You Won / You Lost /
 * Draw, how it ended, rating change, and the next actions (Rematch etc.).
 * Can be closed to look at the final position; a small "Result" chip brings
 * it back.
 */
export function GameOverOverlay({
  outcome, title: titleOverride, subtitle, ratingDelta, actions, delayMs = 0, gameKey,
}: {
  outcome: GameOutcome;
  /** Replaces "You Won!" etc. (e.g. "White wins!" in two-player local games). */
  title?: string;
  subtitle?: string;
  ratingDelta?: number | null;
  actions?: React.ReactNode;
  /** Wait before showing (lets the checkmate animation play first). */
  delayMs?: number;
  /** Changes per game so a new game shows the card again. */
  gameKey: string;
}) {
  const [shown, setShown] = useState(delayMs === 0);
  const [closed, setClosed] = useState(false);
  useEffect(() => {
    setClosed(false);
    if (delayMs === 0) { setShown(true); return; }
    setShown(false);
    const t = setTimeout(() => setShown(true), delayMs);
    return () => clearTimeout(t);
  }, [gameKey, delayMs]);

  if (!shown) return null;

  const title = titleOverride ?? (outcome === 'win' ? 'You Won!' : outcome === 'loss' ? 'You Lost' : 'Draw');
  const accent = outcome === 'win' ? CLOCK.on : outcome === 'loss' ? CLOCK.low : CLOCK.off;
  const Icon = outcome === 'win' ? Trophy : outcome === 'loss' ? Frown : Handshake;

  if (closed) {
    return (
      <button type="button" onClick={() => setClosed(false)}
        className="absolute left-1/2 top-2 -translate-x-1/2 rounded-full px-3 py-1.5 text-[12px] font-black shadow-lg"
        style={{ background: accent, color: '#fff' }}>
        {title} · Show result
      </button>
    );
  }

  return (
    <div className="absolute inset-0 flex items-center justify-center rounded-[10px] p-4"
      style={{ background: 'rgba(0,0,0,.45)', animation: 'cs-fade-in .25s ease-out' }}>
      <style>{'@keyframes cs-fade-in{from{opacity:0}to{opacity:1}}@keyframes cs-pop-in{from{opacity:0;transform:translateY(10px) scale(.96)}to{opacity:1;transform:none}}'}</style>
      <div className="relative w-full max-w-[300px] overflow-hidden rounded-2xl text-center shadow-2xl"
        style={{ background: CLOCK.strip, animation: 'cs-pop-in .3s ease-out' }}>
        <button type="button" onClick={() => setClosed(true)} aria-label="Close"
          className="absolute right-2 top-2 z-10 rounded-full p-1.5" style={{ color: 'rgba(255,255,255,.8)', background: 'rgba(0,0,0,.2)' }}>
          <X size={16} />
        </button>
        <div className="px-5 pb-4 pt-5" style={{ background: accent }}>
          <Icon className="mx-auto mb-1.5" size={30} color="#fff" />
          <p className="text-[28px] font-black leading-none text-white">{title}</p>
          {subtitle && <p className="mt-1.5 text-[13px] font-bold first-letter:uppercase" style={{ color: 'rgba(255,255,255,.85)' }}>{subtitle}</p>}
        </div>
        <div className="space-y-3 px-4 py-4">
          {typeof ratingDelta === 'number' && ratingDelta !== 0 && (
            <p className="text-[15px] font-black" style={{ color: ratingDelta > 0 ? CLOCK.on : CLOCK.low }}>
              {ratingDelta > 0 ? '+' : ''}{ratingDelta} ELO
            </p>
          )}
          {actions && <div className="flex flex-col gap-2">{actions}</div>}
        </div>
      </div>
    </div>
  );
}

/** Button styles for the overlay's actions. */
export function OverlayButton({ children, onClick, primary, disabled }: { children: React.ReactNode; onClick?: () => void; primary?: boolean; disabled?: boolean }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled}
      className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl px-4 py-2.5 text-[13px] font-black transition-transform active:scale-[0.98] disabled:opacity-60"
      style={primary ? { background: CLOCK.on, color: '#fff' } : { background: 'rgba(255,255,255,.08)', color: '#EDEDED', border: '1px solid rgba(255,255,255,.1)' }}>
      {children}
    </button>
  );
}
