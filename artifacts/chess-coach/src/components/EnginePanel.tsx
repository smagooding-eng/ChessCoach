// The on-device engine (lib/deviceEngine.ts) for any board: an on/off switch, the evaluation,
// the top 3 lines and a "Show threat" button. Arrows for the board come back via onArrows.
import { useEffect, useRef, useState } from 'react';
import { Cpu, Eye, Loader2 } from 'lucide-react';
import { analyse, engineSupported, formatScore, pvToSan, scoreCp, stopEngine, threatFen, type EngineResult } from '@/lib/deviceEngine';
import { EvalBar } from '@/components/GameStatusStrip';
import { RD } from '@/lib/redesignTheme';

export type BoardArrow = { from: string; to: string; color?: string };
const ARROW = ['rgba(129,182,76,0.9)', 'rgba(129,182,76,0.55)', 'rgba(129,182,76,0.35)'];
const THREAT = 'rgba(220,67,67,0.85)';
const KEY = 'cs_engine_on';

export function useEngineOn(defaultOn = true): [boolean, (v: boolean) => void] {
  const [on, setOn] = useState<boolean>(() => {
    try { const v = localStorage.getItem(KEY); return v == null ? defaultOn : v === '1'; } catch { return defaultOn; }
  });
  const set = (v: boolean) => { setOn(v); try { localStorage.setItem(KEY, v ? '1' : '0'); } catch { /* storage off */ } };
  return [on, set];
}

/** Streams the engine's analysis of `fen` while `enabled`. */
export function useDeviceAnalysis(fen: string | null | undefined, enabled: boolean, opts: { depth?: number; multiPv?: number } = {}) {
  const [res, setRes] = useState<EngineResult | null>(null);
  const [busy, setBusy] = useState(false);
  const { depth = 20, multiPv = 3 } = opts;
  useEffect(() => {
    if (!enabled || !fen || !engineSupported()) { setRes(null); setBusy(false); return undefined; }
    let live = true;
    setRes(null); setBusy(true);
    analyse(fen, { depth, multiPv, onUpdate: (r) => { if (live) setRes(r); } })
      .then((r) => { if (live) { if (r.lines.length) setRes(r); setBusy(false); } })
      .catch(() => { if (live) setBusy(false); });
    return () => { live = false; };
  }, [fen, enabled, depth, multiPv]);
  useEffect(() => () => stopEngine(), []);
  return { res, busy };
}

export function EnginePanel({ fen, onArrows, defaultOn = true, depth = 20, onMoveClick, className = '' }: {
  fen: string;
  onArrows?: (a: BoardArrow[]) => void;
  defaultOn?: boolean;
  depth?: number;
  /** tap a line's first move (e.g. to play it on an analysis board) */
  onMoveClick?: (uci: string) => void;
  className?: string;
}) {
  const [on, setOn] = useEngineOn(defaultOn);
  const [showThreat, setShowThreat] = useState(false);
  const tf = showThreat ? threatFen(fen) : null;
  const { res, busy } = useDeviceAnalysis(tf ?? fen, on, { depth: tf ? 14 : depth, multiPv: tf ? 1 : 3 });
  useEffect(() => { setShowThreat(false); }, [fen]);

  const lines = res?.lines ?? [];
  const arrowsKey = useRef('');
  useEffect(() => {
    if (!onArrows) return;
    const a: BoardArrow[] = !on ? [] : tf
      ? (lines[0]?.pv[0] ? [{ from: lines[0].pv[0].slice(0, 2), to: lines[0].pv[0].slice(2, 4), color: THREAT }] : [])
      : lines.slice(0, 3).filter((l) => l.pv[0]).map((l, i) => ({ from: l.pv[0].slice(0, 2), to: l.pv[0].slice(2, 4), color: ARROW[i] }));
    const k = JSON.stringify(a);
    if (k !== arrowsKey.current) { arrowsKey.current = k; onArrows(a); }
  }, [lines, on, tf, onArrows]);

  if (!engineSupported()) return null;
  const top = tf ? null : lines[0];
  const threatSan = tf && lines[0] ? pvToSan(tf, lines[0].pv, 3) : [];

  return (
    <div className={`rounded-2xl p-3 ${className}`} style={{ background: RD.cardSolid, border: `1px solid ${RD.border}`, color: RD.text }}>
      <div className="flex items-center gap-2">
        <Cpu size={15} className="shrink-0 text-muted-foreground" />
        <span className="text-[12.5px] font-bold">Engine</span>
        {on && !tf && top && <span className="font-mono text-[13px] font-black tabular-nums">{formatScore(top)}</span>}
        {on && busy && <Loader2 size={13} className="animate-spin text-muted-foreground" />}
        {on && res?.depth ? <span className="text-[11px] text-muted-foreground">depth {res.depth}</span> : null}
        <div className="ml-auto flex items-center gap-1.5">
          {on && (
            <button type="button" onClick={() => setShowThreat((v) => !v)} disabled={!threatFen(fen)}
              className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11.5px] font-bold disabled:opacity-40"
              style={{ background: showThreat ? 'rgba(220,67,67,.18)' : 'rgba(255,255,255,.06)', color: showThreat ? '#ff9da2' : undefined }}>
              <Eye size={12} /> {showThreat ? 'Hide threat' : 'Show threat'}
            </button>
          )}
          <button type="button" role="switch" aria-checked={on} aria-label="Engine on or off" onClick={() => setOn(!on)}
            className="relative h-5 w-9 rounded-full transition-colors" style={{ background: on ? '#81b64c' : 'rgba(255,255,255,.15)' }}>
            <span className="absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all" style={{ left: on ? 18 : 2 }} />
          </button>
        </div>
      </div>
      {!on ? (
        <p className="mt-2 text-[12px] text-muted-foreground">Engine off: work the position out yourself, then switch it on to check.</p>
      ) : tf ? (
        <p className="mt-2 text-[12.5px]">
          <span className="font-bold" style={{ color: '#ff9da2' }}>Threat: </span>
          {threatSan.length ? <>the opponent wants <b>{threatSan[0]}</b>{threatSan.length > 1 && <span className="text-muted-foreground"> ({threatSan.slice(1).join(' ')})</span>}</> : busy ? 'looking…' : 'no clear threat'}
        </p>
      ) : (
        <>
          {top && <div className="mt-2"><EvalBar fen={fen} cp={scoreCp(top)} /></div>}
          <div className="mt-2 space-y-1">
            {lines.slice(0, 3).map((l, i) => {
              const san = pvToSan(fen, l.pv, 8);
              return (
                <div key={l.multipv} className="flex items-baseline gap-2 text-[12.5px]">
                  <span className="w-12 shrink-0 font-mono font-bold tabular-nums" style={{ color: i === 0 ? '#81b64c' : undefined }}>{formatScore(l)}</span>
                  <span className="min-w-0 truncate">
                    {onMoveClick && l.pv[0]
                      ? <button type="button" onClick={() => onMoveClick(l.pv[0])} className="font-bold underline-offset-2 hover:underline">{san[0]}</button>
                      : <b>{san[0]}</b>}
                    <span className="text-muted-foreground"> {san.slice(1).join(' ')}</span>
                  </span>
                </div>
              );
            })}
            {!lines.length && <p className="text-[12px] text-muted-foreground">{busy ? 'Thinking…' : 'No moves: the game is over.'}</p>}
          </div>
        </>
      )}
    </div>
  );
}
