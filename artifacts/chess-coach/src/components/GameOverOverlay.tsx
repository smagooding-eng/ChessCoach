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

// ── Animation ──────────────────────────────────────────────────────────────
// Win: the opponent's king wobbles and topples over (the old resign
// gesture), then a green shock ring and a burst of confetti. Loss: your own
// king topples, with a muted red ring on landing. Draw: a white and a black king slide in and
// meet in the middle. Then the title, how it ended, the rating change (it
// counts up) and the buttons follow one after another.
const GO_CSS = `
.go-scrim { animation: goScrim .35s ease-out both; }
@keyframes goScrim { from { opacity: 0; backdrop-filter: blur(0); } to { opacity: 1; backdrop-filter: blur(2px); } }
.go-card { animation: goCard .5s cubic-bezier(.2,1.2,.35,1) both; }
@keyframes goCard { 0% { opacity: 0; transform: translateY(26px) scale(.9); } 100% { opacity: 1; transform: none; } }
.go-stage { position: relative; height: 92px; display: grid; place-items: center; }
.go-glow { position: absolute; width: 120px; height: 120px; border-radius: 50%; filter: blur(18px); opacity: .32; animation: goGlow .8s ease-out .1s both; }
@keyframes goGlow { from { opacity: 0; transform: scale(.4); } to { opacity: .32; transform: scale(1); } }
.go-ring { position: absolute; width: 70px; height: 70px; border-radius: 50%; border: 3px solid; opacity: 0; }
.go-ring.r1 { animation: goRing .9s cubic-bezier(.1,.7,.3,1) var(--ring-at, .35s) both; }
.go-ring.r2 { animation: goRing 1.1s cubic-bezier(.1,.7,.3,1) calc(var(--ring-at, .35s) + .14s) both; }
@keyframes goRing { 0% { opacity: .9; transform: scale(.3); } 100% { opacity: 0; transform: scale(1.9); } }
.go-king { width: 56px; height: 74px; overflow: visible; position: relative; }
.go-king * { transform-box: fill-box; }
.go-bit { position: absolute; left: 50%; top: 50%; width: 7px; height: 11px; border-radius: 2px; opacity: 0;
  animation: goBit 1.25s cubic-bezier(.15,.7,.35,1) calc(1s + var(--d)) both; }
@keyframes goBit {
  0% { opacity: 1; transform: translate(-50%,-50%) rotate(0) scale(.6); }
  70% { opacity: 1; }
  100% { opacity: 0; transform: translate(calc(-50% + var(--x)), calc(-50% + var(--y))) rotate(var(--r)) scale(1); }
}
/* win and loss: a king wobbles, topples, thud */
.go-win .go-king, .go-loss .go-king { transform-origin: 85% 100%; animation: goTopple 1.05s cubic-bezier(.5,0,.6,1) .15s both; }
@keyframes goTopple {
  0% { opacity: 0; transform: translateY(-6px) rotate(0); }
  12% { opacity: 1; transform: rotate(0); }
  24% { transform: rotate(-7deg); }
  36% { transform: rotate(5deg); }
  46% { transform: translateX(0) rotate(-3deg); }
  80% { transform: translateX(-38px) rotate(88deg); }
  88% { transform: translateX(-38px) rotate(80deg); }
  94% { transform: translateX(-38px) rotate(90deg); }
  100% { transform: translateX(-38px) rotate(90deg); }
}
.go-win, .go-loss { --ring-at: 1s; }
.go-dust { position: absolute; bottom: 14px; width: 6px; height: 6px; border-radius: 50%; background: rgba(255,255,255,.5); opacity: 0;
  animation: goDust .6s ease-out 1.02s both; }
@keyframes goDust { 0% { opacity: .8; transform: translate(0,0) scale(.6); } 100% { opacity: 0; transform: translate(var(--x), -10px) scale(1.3); } }
/* draw: two kings meet */
.go-draw .go-kl { animation: goFromL .7s cubic-bezier(.2,1.2,.4,1) .1s both; }
.go-draw .go-kr { animation: goFromR .7s cubic-bezier(.2,1.2,.4,1) .1s both; }
@keyframes goFromL { from { opacity: 0; transform: translateX(-46px) rotate(-12deg); } to { opacity: 1; transform: translateX(0) rotate(6deg); } }
@keyframes goFromR { from { opacity: 0; transform: translateX(46px) rotate(12deg); } to { opacity: 1; transform: translateX(0) rotate(-6deg); } }
.go-draw { --ring-at: .62s; }
/* text and buttons */
.go-in { animation: goIn .45s cubic-bezier(.2,.9,.3,1) var(--at, 0s) both; }
@keyframes goIn { from { opacity: 0; transform: translateY(10px); filter: blur(3px); } to { opacity: 1; transform: none; filter: none; } }
.go-actions > * { animation: goIn .4s cubic-bezier(.2,.9,.3,1) both; }
.go-actions > *:nth-child(1) { animation-delay: .75s; }
.go-actions > *:nth-child(2) { animation-delay: .85s; }
.go-actions > *:nth-child(3) { animation-delay: .95s; }
.go-win .go-actions > *:nth-child(1), .go-loss .go-actions > *:nth-child(1) { animation-delay: 1.15s; }
.go-win .go-actions > *:nth-child(2), .go-loss .go-actions > *:nth-child(2) { animation-delay: 1.25s; }
.go-win .go-actions > *:nth-child(3), .go-loss .go-actions > *:nth-child(3) { animation-delay: 1.35s; }
@media (prefers-reduced-motion: reduce) {
  .go-scrim, .go-card, .go-glow, .go-ring, .go-king, .go-kl, .go-kr, .go-bit, .go-dust, .go-in, .go-actions > * { animation: none !important; }
  .go-ring, .go-bit, .go-dust { display: none; }
  .go-win .go-king, .go-loss .go-king { transform: translateX(-38px) rotate(90deg); }
}
`;

function KingShape({ light }: { light: boolean }) {
  const fill = light ? '#F5F2EA' : '#1C1C1B';
  const line = light ? '#2A2723' : '#D9D6CF';
  return (
    <>
      <defs>
        <linearGradient id={light ? 'goKL' : 'goKD'} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={light ? '#FFFFFF' : '#3A3A37'} /><stop offset="1" stopColor={fill} />
        </linearGradient>
      </defs>
      <path d="M27,2 h6 v6 h6 v6 h-6 v5 a10,10 0 0 1 3,19 l4,22 h6 a3,3 0 0 1 3,3 v5 a3,3 0 0 1 -3,3 h-42 a3,3 0 0 1 -3,-3 v-5 a3,3 0 0 1 3,-3 h6 l4,-22 a10,10 0 0 1 3,-19 v-5 h-6 v-6 h6 z"
        fill={`url(#${light ? 'goKL' : 'goKD'})`} stroke={line} strokeWidth="2" strokeLinejoin="round" />
      <path d="M21,38 h18 M17,60 h26" stroke={line} strokeOpacity=".35" strokeWidth="1.6" />
    </>
  );
}

const BITS = Array.from({ length: 16 }, (_, i) => {
  const a = (i / 16) * Math.PI * 2 + (i % 2 ? 0.2 : -0.1);
  const dist = 62 + (i % 4) * 14;
  return {
    x: `${Math.round(Math.cos(a) * dist)}px`, y: `${Math.round(Math.sin(a) * dist * 0.75 - 10)}px`,
    r: `${(i % 2 ? 1 : -1) * (180 + i * 37)}deg`, d: `${(i % 5) * 0.03}s`,
    c: ['#81B64C', '#E8B447', '#F5F7F6', '#A5D46A'][i % 4],
  };
});

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
  const accent = outcome === 'win' ? '#81B64C' : outcome === 'loss' ? '#E5484D' : '#B9C2BF';
  // text follows the animation: the loss waits for the king to land
  const t0 = outcome === 'draw' ? 0.5 : 0.95;
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
      style={{ background: 'rgba(0,0,0,.5)' }}>
      <style>{GO_CSS}</style>
      <div className="go-card relative w-full max-w-[300px] overflow-hidden rounded-[20px] text-center"
        style={{ background: 'linear-gradient(180deg, #172123 0%, #0F1718 100%)', border: '1px solid rgba(255,255,255,.09)', boxShadow: '0 30px 60px -20px rgba(0,0,0,.8)' }}>
        <button type="button" onClick={() => setClosed(true)} aria-label="Close"
          className="absolute right-2.5 top-2.5 z-10 rounded-full p-1.5" style={{ color: 'rgba(255,255,255,.75)', background: 'rgba(255,255,255,.07)' }}>
          <X size={16} />
        </button>

        <div className="go-stage mt-4" aria-hidden="true">
          <span className="go-glow" style={{ background: accent }} />
          <span className="go-ring r1" style={{ borderColor: accent }} />
          {outcome === 'win' && <span className="go-ring r2" style={{ borderColor: accent }} />}
          {outcome === 'draw' && <span className="go-ring r2" style={{ borderColor: accent }} />}
          {outcome === 'win' && BITS.map((b, i) => (
            <span key={i} className="go-bit" style={{ background: b.c, ['--x' as string]: b.x, ['--y' as string]: b.y, ['--r' as string]: b.r, ['--d' as string]: b.d }} />
          ))}
          {outcome === 'draw' ? (
            <span className="flex items-end gap-1">
              <svg className="go-king go-kl" viewBox="0 0 60 74" style={{ width: 44, height: 58 }}><KingShape light /></svg>
              <svg className="go-king go-kr" viewBox="0 0 60 74" style={{ width: 44, height: 58 }}><KingShape light={false} /></svg>
            </span>
          ) : (
            <svg className="go-king" viewBox="0 0 60 74"><KingShape light={fallingLight} /></svg>
          )}
          {outcome !== 'draw' && [-1, 1, 1.6].map((x, i) => (
            <span key={i} className="go-dust" style={{ left: `calc(50% + ${x * 18}px)`, ['--x' as string]: `${x * 16}px` }} />
          ))}
        </div>

        <div className="px-5 pb-1 pt-2">
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
        {actions && <div className="go-actions flex flex-col gap-2 px-4 pb-4 pt-3">{actions}</div>}
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
