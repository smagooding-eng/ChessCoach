import React, { useEffect, useState } from 'react';
import { X } from 'lucide-react';
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

// ── Animation (same style as the splash screen) ───────────────────────────
// A short rank of three board squares with a king standing on it.
// Win: the opponent's king wobbles and topples onto the next square; on
// impact the card shakes, the square flashes green, a green ring spreads
// across the board and sparks fly. Loss: your own king topples, with a
// muted red flash, ring and a puff of dust. Draw: a white and a black king
// slide in and stand side by side. The title, how it ended, the rating
// change (counting up) and the buttons follow once the king has landed.
const HIT = 0.9; // seconds until the falling king lands
const GO_CSS = `
.go-scrim { animation: goScrim .3s ease-out both; }
@keyframes goScrim { from { opacity: 0; } to { opacity: 1; } }
.go-card { animation: goCard .45s cubic-bezier(.2,1.2,.35,1) both; }
@keyframes goCard { 0% { opacity: 0; transform: translateY(22px) scale(.92); } 100% { opacity: 1; transform: none; } }
.go-svg { display: block; width: 100%; height: auto; overflow: visible; }
.go-svg * { transform-box: fill-box; }
.go-shake { animation: goShake .26s linear ${HIT}s 1; }
@keyframes goShake { 0%,100% { transform: translate(0,0); } 20% { transform: translate(-3px,2px); } 40% { transform: translate(3px,-2px); } 60% { transform: translate(-2px,1px); } 80% { transform: translate(1px,-1px); } }
.go-board { opacity: 0; animation: goFade .3s ease-out .05s forwards; }
@keyframes goFade { to { opacity: 1; } }
.go-flash { opacity: 0; animation: goFlash .8s ease-out ${HIT}s forwards; }
@keyframes goFlash { 0% { opacity: .9; } 100% { opacity: .2; } }
.go-glow { opacity: 0; transform-origin: 50% 50%; animation: goGlowIn .6s ease-out ${HIT + 0.05}s forwards, goGlowPulse 2.4s ease-in-out ${HIT + 0.65}s infinite; }
@keyframes goGlowIn { from { opacity: 0; transform: scale(.6); } to { opacity: .6; transform: scale(1); } }
@keyframes goGlowPulse { 0%,100% { opacity: .6; } 50% { opacity: .28; } }
.go-ring { opacity: 0; transform-origin: 50% 50%; animation: goRing .6s cubic-bezier(.1,.7,.3,1) ${HIT}s forwards; }
.go-ring2 { opacity: 0; transform-origin: 50% 50%; animation: goRing .8s cubic-bezier(.1,.7,.3,1) ${HIT + 0.12}s forwards; }
@keyframes goRing { 0% { opacity: .95; transform: scale(.12); } 100% { opacity: 0; transform: scale(1); } }
.go-pop { opacity: 0; transform-origin: 50% 50%; animation: goPop .32s ease-out ${HIT}s forwards; }
@keyframes goPop { 0% { opacity: .9; transform: scale(.2); } 100% { opacity: 0; transform: scale(1.4); } }
.go-spark { opacity: 0; transform-origin: 50% 50%; animation: goSpark .6s cubic-bezier(.1,.8,.3,1) calc(${HIT}s + var(--d, 0s)) forwards; }
@keyframes goSpark { 0% { opacity: 1; transform: translate(0,0) rotate(0) scale(1); } 100% { opacity: 0; transform: translate(var(--dx), var(--dy)) rotate(var(--r, 0deg)) scale(.4); } }
/* the falling king: in, wobble, topple onto its side, bounce */
.go-fall { transform-origin: 100% 100%; animation: goFall 1.2s linear .1s both; }
@keyframes goFall {
  0% { opacity: 0; transform: translateY(-10px) rotate(0); animation-timing-function: cubic-bezier(.3,.7,.4,1); }
  10% { opacity: 1; transform: translateY(0) rotate(0); animation-timing-function: ease-in-out; }
  20% { transform: rotate(-6deg); animation-timing-function: ease-in-out; }
  29% { transform: rotate(4deg); animation-timing-function: ease-in-out; }
  36% { transform: rotate(-2deg); animation-timing-function: cubic-bezier(.55,0,.9,.45); }
  67% { transform: rotate(90deg); animation-timing-function: cubic-bezier(.2,.6,.4,1); }
  76% { transform: rotate(80deg); animation-timing-function: cubic-bezier(.6,0,.8,.6); }
  84% { transform: rotate(90deg); animation-timing-function: ease-out; }
  90% { transform: rotate(87deg); }
  100% { transform: rotate(90deg); }
}
.go-fshadow { transform-origin: 50% 50%; animation: goFShadow 1.2s linear .1s both; }
@keyframes goFShadow { 0%, 36% { transform: translateX(0) scaleX(1); opacity: .5; } 67%, 100% { transform: translateX(38px) scaleX(1.8); opacity: .6; } }
/* draw: the kings slide in and settle side by side */
.go-kl { animation: goFromL .7s cubic-bezier(.2,1.25,.4,1) .1s both; }
.go-kr { animation: goFromR .7s cubic-bezier(.2,1.25,.4,1) .1s both; }
@keyframes goFromL { from { opacity: 0; transform: translateX(-50px); } to { opacity: 1; transform: none; } }
@keyframes goFromR { from { opacity: 0; transform: translateX(50px); } to { opacity: 1; transform: none; } }
.go-draw .go-flash, .go-draw .go-ring, .go-draw .go-ring2, .go-draw .go-glow, .go-draw .go-pop { animation-delay: .62s, 1.3s; }
/* text and buttons */
.go-in { animation: goIn .45s cubic-bezier(.2,.9,.3,1) var(--at, 0s) both; }
@keyframes goIn { from { opacity: 0; transform: translateY(10px); filter: blur(3px); } to { opacity: 1; transform: none; filter: none; } }
.go-actions > * { animation: goIn .4s cubic-bezier(.2,.9,.3,1) both; }
.go-actions > *:nth-child(1) { animation-delay: var(--a1, 1.15s); }
.go-actions > *:nth-child(2) { animation-delay: calc(var(--a1, 1.15s) + .1s); }
.go-actions > *:nth-child(3) { animation-delay: calc(var(--a1, 1.15s) + .2s); }
@media (prefers-reduced-motion: reduce) {
  .go-scrim, .go-card, .go-shake, .go-board, .go-flash, .go-glow, .go-ring, .go-ring2, .go-pop, .go-spark, .go-fall, .go-fshadow, .go-kl, .go-kr, .go-in, .go-actions > * { animation: none !important; }
  .go-ring, .go-ring2, .go-pop, .go-spark { display: none; }
  .go-board { opacity: 1; } .go-flash { opacity: .2; } .go-glow { opacity: .5; }
  .go-fall { transform: rotate(90deg); } .go-fshadow { transform: translateX(38px) scaleX(1.8); }
}
`;

// King drawn like the splash pieces: base at (0,0), about 78 tall.
const KING_PATH = 'M-22,0 L22,0 L22,-7 L18,-10 L18,-14 L13,-17 L9,-42 L14,-45 L14,-50 L9,-52 Q15,-60 6,-64 L3,-64 L3,-67 L8,-67 L8,-72 L3,-72 L3,-78 L-3,-78 L-3,-72 L-8,-72 L-8,-67 L-3,-67 L-3,-64 L-6,-64 Q-15,-60 -9,-52 L-14,-50 L-14,-45 L-9,-42 L-13,-17 L-18,-14 L-18,-10 L-22,-7 Z';
function King({ light }: { light: boolean }) {
  const line = light ? '#1a1a19' : '#e5e5e0';
  return (
    <>
      <path d={KING_PATH} fill={`url(#${light ? 'goWhite' : 'goBlack'})`} stroke={line} strokeWidth="2" strokeLinejoin="round" />
      <path d="M-9,-42 L9,-42 M-13,-17 L13,-17 M-18,-10 L18,-10 M-9,-52 L9,-52" stroke={line} strokeOpacity=".28" strokeWidth="1.2" />
      <path d="M-6,-38 L-8,-21" stroke="#fff" strokeOpacity={light ? '.85' : '.16'} strokeWidth="2.5" strokeLinecap="round" />
    </>
  );
}

const SPARKS = [
  [-58, -30, 2.2], [56, -36, 1.8], [-30, -58, 1.6], [28, -60, 2], [-70, -6, 1.5], [70, -4, 1.5], [-8, -72, 1.3], [14, -66, 1.7],
];
const CONFETTI = Array.from({ length: 14 }, (_, i) => {
  const a = Math.PI + (i / 13) * Math.PI; // fan upwards
  const d = 50 + (i % 3) * 18;
  return { dx: Math.round(Math.cos(a) * d), dy: Math.round(Math.sin(a) * d * 0.9) - 8, r: (i % 2 ? 1 : -1) * (160 + i * 31), d: (i % 4) * 0.025, c: ['#81B64C', '#E8B447', '#F5F7F6', '#A5D46A'][i % 4] };
});

function Stage({ outcome, fallingLight, accent }: { outcome: GameOutcome; fallingLight: boolean; accent: string }) {
  // the king stands on the middle square and falls onto the right-hand one
  const kx = 92, landX = 150;
  const fx = outcome === 'draw' ? 120 : landX;
  const flashX = outcome === 'draw' ? 90 : 150;
  return (
    <svg className="go-svg" viewBox="0 0 240 128" aria-hidden="true">
      <defs>
        <linearGradient id="goBlack" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#3a3a37" /><stop offset=".55" stopColor="#181817" /><stop offset="1" stopColor="#0a0a09" />
        </linearGradient>
        <linearGradient id="goWhite" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ffffff" /><stop offset=".6" stopColor="#e9e8e2" /><stop offset="1" stopColor="#bdbcb4" />
        </linearGradient>
        <radialGradient id="goPopFill"><stop offset="0" stopColor="#fff" stopOpacity=".95" /><stop offset=".5" stopColor={accent} stopOpacity=".45" /><stop offset="1" stopColor={accent} stopOpacity="0" /></radialGradient>
        <radialGradient id="goGlowFill"><stop offset="0" stopColor={accent} stopOpacity=".7" /><stop offset="1" stopColor={accent} stopOpacity="0" /></radialGradient>
      </defs>
      <g className="go-shake">
        <g className="go-board">
          <rect x="30" y="100" width="60" height="16" fill="#2b2b28" />
          <rect x="90" y="100" width="60" height="16" fill="#e9e8e2" />
          <rect x="150" y="100" width="60" height="16" fill="#2b2b28" />
          <rect className="go-flash" x={flashX} y="100" width="60" height="16" fill={accent} />
          <rect x="30" y="116" width="180" height="5" rx="1.5" fill="#0c0c0b" />
          <line x1="30" y1="100.5" x2="210" y2="100.5" stroke="#e5e5e0" strokeOpacity=".12" />
        </g>
        <ellipse className="go-glow" cx={fx} cy="100" rx="50" ry="12" fill="url(#goGlowFill)" />

        {outcome === 'draw' ? (
          <>
            <ellipse cx="100" cy="101" rx="20" ry="3.6" fill="#000" opacity=".5" />
            <ellipse cx="140" cy="101" rx="20" ry="3.6" fill="#000" opacity=".5" />
            <g transform="translate(100,100) scale(.9)"><g className="go-kl"><King light /></g></g>
            <g transform="translate(140,100) scale(.9)"><g className="go-kr"><King light={false} /></g></g>
          </>
        ) : (
          <>
            <ellipse className="go-fshadow" cx={kx + 22} cy="101" rx="22" ry="3.8" fill="#000" />
            <g transform={`translate(${kx},100)`}><g className="go-fall"><King light={fallingLight} /></g></g>
          </>
        )}

        <ellipse className="go-ring" cx={fx} cy="100" rx="66" ry="14" fill="none" stroke={accent} strokeWidth="2.5" />
        {outcome === 'win' && <ellipse className="go-ring2" cx={fx} cy="100" rx="96" ry="20" fill="none" stroke={accent} strokeWidth="1.5" />}
        {outcome !== 'draw' && (
          <g transform={`translate(${landX},92)`}>
            {SPARKS.map(([dx, dy, r], i) => (
              <circle key={i} className="go-spark" cx="0" cy="0" r={r}
                fill={outcome === 'win' ? (i % 2 ? accent : '#e5e5e0') : (i % 3 ? 'rgba(229,229,224,.55)' : accent)}
                style={{ ['--dx' as string]: `${outcome === 'win' ? dx : dx * 0.6}px`, ['--dy' as string]: `${outcome === 'win' ? dy : dy * 0.35}px` }} />
            ))}
            {outcome === 'win' && CONFETTI.map((c, i) => (
              <rect key={`c${i}`} className="go-spark" x="-2.5" y="-4" width="5" height="8" rx="1" fill={c.c}
                style={{ ['--dx' as string]: `${c.dx}px`, ['--dy' as string]: `${c.dy}px`, ['--r' as string]: `${c.r}deg`, ['--d' as string]: `${c.d}s` }} />
            ))}
          </g>
        )}
        <circle className="go-pop" cx={fx} cy="86" r="30" fill="url(#goPopFill)" />
      </g>
    </svg>
  );
}

/** Counts up to the rating change once the card is in. */
function CountUp({ to, at }: { to: number; at: number }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    let raf = 0;
    const start = performance.now() + at * 1000;
    const tick = (now: number) => {
      const t = Math.min(1, Math.max(0, (now - start) / 600));
      setN(Math.round(to * (1 - Math.pow(1 - t, 3))));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [to, at]);
  return <>{n > 0 ? '+' : ''}{n}</>;
}

/**
 * Result card that drops onto the board when a game ends: You Won / You Lost /
 * Draw, how it ended, rating change, and the next actions (Rematch etc.).
 * Can be closed to look at the final position; a small "Result" chip brings
 * it back.
 */
export function GameOverOverlay({
  outcome, title: titleOverride, subtitle, ratingDelta, actions, delayMs = 0, gameKey, yourColor = 'white',
}: {
  outcome: GameOutcome;
  /** Your side, so the falling king is the right colour (yours on a loss, the opponent's on a win). */
  yourColor?: 'white' | 'black';
  /** Replaces "You Won!" etc. (e.g. "White wins!" in two-player local games). */
  title?: string;
  subtitle?: string;
  ratingDelta?: number | null;
  actions?: React.ReactNode;
  /** Wait before showing (lets the last move land first). */
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
  const accent = outcome === 'win' ? '#81B64C' : outcome === 'loss' ? '#C9454A' : '#B9C2BF';
  // text follows the animation: it waits for the king to land
  const t0 = outcome === 'draw' ? 0.55 : HIT + 0.05;
  // the king that falls: the opponent's when you win, yours when you lose
  const fallingLight = outcome === 'win' ? yourColor === 'black' : yourColor === 'white';

  if (closed) {
    return (
      <button type="button" onClick={() => setClosed(false)}
        className="absolute left-1/2 top-2 inline-flex -translate-x-1/2 items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-black shadow-lg"
        style={{ background: 'rgba(18,27,29,.92)', color: '#F5F7F6', border: '1px solid rgba(255,255,255,.12)' }}>
        <span className="h-2 w-2 rounded-full" style={{ background: accent }} />
        {title} · Show result
      </button>
    );
  }

  return (
    <div key={gameKey} className={`go-scrim go-${outcome} absolute inset-0 flex items-center justify-center rounded-[10px] p-4`}
      style={{ background: 'rgba(0,0,0,.55)' }}>
      <style>{GO_CSS}</style>
      <div className="go-card relative w-full max-w-[310px] overflow-hidden rounded-[20px] text-center"
        style={{ background: 'linear-gradient(180deg, #141413 0%, #0c0c0b 100%)', border: '1px solid rgba(255,255,255,.09)', boxShadow: '0 30px 60px -20px rgba(0,0,0,.85)' }}>
        <button type="button" onClick={() => setClosed(true)} aria-label="Close"
          className="absolute right-2.5 top-2.5 z-10 rounded-full p-1.5" style={{ color: 'rgba(255,255,255,.75)', background: 'rgba(255,255,255,.07)' }}>
          <X size={16} />
        </button>

        <div className="px-3 pt-4"><Stage outcome={outcome} fallingLight={fallingLight} accent={accent} /></div>

        <div className="px-5 pb-1 pt-1">
          <p className="go-in text-[28px] font-black leading-none text-white" style={{ ['--at' as string]: `${t0}s`, letterSpacing: '-0.02em' }}>{title}</p>
          {subtitle && <p className="go-in mt-2 text-[13px] font-bold first-letter:uppercase" style={{ ['--at' as string]: `${t0 + 0.08}s`, color: '#9AA3A0' }}>{subtitle}</p>}
          {typeof ratingDelta === 'number' && ratingDelta !== 0 && (
            <p className="go-in mt-2.5 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[14px] font-black"
              style={{ ['--at' as string]: `${t0 + 0.16}s`, background: 'rgba(255,255,255,.07)', border: '1px solid rgba(255,255,255,.10)', color: '#F5F7F6' }}>
              <span className="h-2 w-2 rounded-full" style={{ background: ratingDelta > 0 ? '#81B64C' : '#E5484D' }} />
              <CountUp to={ratingDelta} at={t0 + 0.2} /> ELO
            </p>
          )}
        </div>
        {actions && <div className="go-actions flex flex-col gap-2 px-4 pb-4 pt-3" style={{ ['--a1' as string]: `${t0 + 0.25}s` }}>{actions}</div>}
        {!actions && <div className="h-4" />}
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
