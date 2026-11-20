import React from 'react';
import { Check, X, Hand } from 'lucide-react';
import { useSettingsOptional } from '@/context/SettingsContext';
import { playClockClick } from '@/lib/sounds';

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
// Seconds left on a clock string like "4:32", "1:02:10" or "0:07.4" (null if not a time).
function secondsOf(t?: string): number | null {
  if (!t || !/^\d+(:\d{1,2}){1,2}(\.\d+)?$/.test(t.trim())) return null;
  return t.trim().split(':').reduce((acc, part) => acc * 60 + parseFloat(part), 0);
}

/**
 * Confirm Move: a chess-clock rocker lever seen from above. Your side (green) is raised,
 * so it's a touch bigger with a wide shadow; Cancel is the low end. Tapping either side
 * clicks like a real clock; Confirm rocks the lever down first. Amber under 20s, red under 10s.
 */
export function ConfirmPad({
  onConfirm, onCancel, busy, time, san, idle, className = '',
}: {
  /** No move waiting yet: the lever sits pressed down and dimmed, and taps do nothing. */
  idle?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  busy?: boolean;
  time?: string;
  /** The move waiting to be played, e.g. "Nf3". */
  san?: string;
  className?: string;
}) {
  const settings = useSettingsOptional();
  const ref = React.useRef<HTMLDivElement>(null);
  const [w, setW] = React.useState(360);
  const [pressed, setPressed] = React.useState(false);
  React.useLayoutEffect(() => {
    const el = ref.current; if (!el) return;
    const set = () => setW(Math.max(220, Math.round(el.getBoundingClientRect().width)));
    set();
    const ro = new ResizeObserver(set); ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const click = () => { if (settings?.soundEnabled !== false) playClockClick(); };
  const confirm = () => {
    if (busy || pressed || idle) return;
    click(); setPressed(true);
    window.setTimeout(() => { onConfirm(); setPressed(false); }, 110);
  };
  const cancel = () => { if (busy || idle) return; click(); onCancel(); };

  const secs = secondsOf(time);
  const tone = secs == null ? 'go' : secs < 10 ? 'red' : secs < 20 ? 'amber' : 'go';
  const up = !pressed && !idle;              // is your (green) side raised?
  const H = 68, C = 31, R = 11;
  const W = w - 12, X0 = 6;                  // lever inside the clock plate
  const P = Math.round(Math.min(W * 0.3, 130)), SEAM = 12;
  const lo = 21.5, hi = 25;                  // half-height: pressed end / raised end
  const hL = up ? lo : hi, hR = up ? hi : lo;
  const outline = (dx: number, dy0: number, dy1: number) => {
    const tl = C - hL + dy0, tr = C - hR + dy1, bl = C + hL + dy0, br = C + hR + dy1;
    const yt = (x: number) => tl + (tr - tl) * x / W, yb = (x: number) => bl + (br - bl) * x / W;
    const x = (v: number) => (X0 + dx + v).toFixed(1);
    return `M${x(R)},${yt(R).toFixed(1)} L${x(W - R)},${yt(W - R).toFixed(1)} Q${x(W)},${tr} ${x(W)},${tr + R} L${x(W)},${br - R} Q${x(W)},${br} ${x(W - R)},${yb(W - R).toFixed(1)} L${x(R)},${yb(R).toFixed(1)} Q${x(0)},${bl} ${x(0)},${bl - R} L${x(0)},${tl + R} Q${x(0)},${tl} ${x(R)},${yt(R).toFixed(1)}Z`;
  };
  const shadow = up ? outline(2, 1.5, 9) : outline(2, 9, 1.5);
  const [g1, g2] = tone === 'red' ? ['#B8302A', '#E2483E'] : tone === 'amber' ? ['#C98222', '#EDAA45']
    : up ? ['#78AD46', '#A2D86A'] : ['#6C9C3F', '#557E30'];
  const [k1, k2] = up ? ['#1C2224', '#2A3133'] : ['#3B4345', '#2B3234'];
  const ink = tone === 'red' ? '#FFFFFF' : '#06110A';
  const gx = X0 + P + SEAM, mid = (gx + X0 + W) / 2;
  const id = React.useId().replace(/:/g, '');
  const timeSize = Math.min(30, Math.max(22, w * 0.075)) * ((time?.length ?? 0) > 5 ? 0.78 : 1);

  return (
    <div ref={ref} className={`${/\b(absolute|fixed)\b/.test(className) ? '' : 'relative '}h-[68px] select-none ${className}`} style={{ opacity: busy ? 0.6 : idle ? 0.5 : 1, transition: 'opacity .15s' }}>
      <svg width={w} height={H} viewBox={`0 0 ${w} ${H}`} className="absolute inset-0" aria-hidden="true">
        <defs>
          <clipPath id={`c${id}`}><path d={outline(0, 0, 0)} /></clipPath>
          <linearGradient id={`g${id}`} x1="0" x2="1"><stop offset="0" stopColor={g1} /><stop offset="1" stopColor={g2} /></linearGradient>
          <linearGradient id={`k${id}`} x1="0" x2="1"><stop offset="0" stopColor={k1} /><stop offset="1" stopColor={k2} /></linearGradient>
          <linearGradient id={`h${id}`} x1={up ? 0 : 1} x2={up ? 1 : 0}><stop offset="0" stopColor="#fff" stopOpacity="0" /><stop offset="1" stopColor="#fff" stopOpacity=".35" /></linearGradient>
          <radialGradient id={`p${id}`} cx=".35" cy=".35"><stop offset="0" stopColor="#EEF1F2" /><stop offset="1" stopColor="#7D8587" /></radialGradient>
          <filter id={`b${id}`} x="-5%" y="-40%" width="110%" height="180%"><feGaussianBlur stdDeviation="1.8" /></filter>
        </defs>
        <rect x="0.5" y="0.5" width={w - 1} height={H - 1} rx="16" fill="#0E1213" stroke="rgba(255,255,255,.07)" />
        <path d={shadow} fill="#000" opacity=".85" filter={`url(#b${id})`} />
        <g clipPath={`url(#c${id})`}>
          <rect x={X0} y="0" width={P} height={H} fill={`url(#k${id})`} />
          <rect x={X0 + P} y="0" width={SEAM} height={H} fill="#0A0E0F" />
          <rect x={gx} y="0" width={X0 + W - gx} height={H} fill={`url(#g${id})`} />
          <path d={`M${X0},${C - hL + 1.2} L${X0 + W},${C - hR + 1.2}`} stroke={`url(#h${id})`} strokeWidth="2.4" />
          <path d={`M${X0},${C + hL - 2} L${X0 + W},${C + hR - 2}`} stroke="rgba(0,0,0,.25)" strokeWidth="4" />
        </g>
        <circle cx={X0 + P + SEAM / 2} cy={C} r="4.5" fill={`url(#p${id})`} />
        <text x={X0 + P / 2} y={C + 4.5} textAnchor="middle" fontWeight="900" fontSize="12" letterSpacing=".8" fill="#C9CFCD">✕ CANCEL</text>
        {time ? (
          <g fill={ink} fontWeight="900" opacity={up ? 1 : 0.8}>
            <text x={gx + 14} y={C + timeSize * 0.36} fontSize={timeSize} style={{ fontVariantNumeric: 'tabular-nums' }}>{time}</text>
            <text x={X0 + W - 14} y={C - 4} textAnchor="end" fontSize="9" letterSpacing="1" opacity=".75">{idle ? 'CONFIRM MOVES ON' : pressed ? 'PLAYED' : busy ? 'PLAYING…' : 'TAP TO PLAY'}</text>
            <text x={X0 + W - 14} y={C + 13} textAnchor="end" fontSize="16">{idle ? 'Make a move' : san ? `${san} ✓` : 'Confirm ✓'}</text>
          </g>
        ) : (
          <text x={mid} y={C + 7} textAnchor="middle" fill={ink} fontWeight="900" fontSize="19" opacity={up ? 1 : 0.8}>
            {idle ? 'Make a move' : busy ? 'Playing…' : san ? `✓ Play ${san}` : '✓ Confirm'}
          </text>
        )}
      </svg>
      <button type="button" onClick={cancel} disabled={busy || idle} aria-label="Cancel move" className="absolute inset-y-0 left-0" style={{ width: X0 + P + SEAM / 2 }} />
      <button type="button" onClick={confirm} disabled={busy || idle} aria-label={san ? `Confirm ${san}` : 'Confirm move'} className="absolute inset-y-0 right-0" style={{ left: X0 + P + SEAM / 2 }} />
    </div>
  );
}
