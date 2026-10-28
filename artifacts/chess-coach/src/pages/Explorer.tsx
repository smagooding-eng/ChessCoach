import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Chess } from 'chess.js';
import { useLocation } from 'wouter';
import { ChevronLeft, ChevronRight, Copy, Check, FlipVertical2, RotateCcw, Swords, Cpu, Lightbulb, Camera } from 'lucide-react';
import { ChessBoard } from '@/components/ChessBoard';
import { RedesignHeader } from '@/components/RedesignHeader';
import { apiFetch } from '@/lib/api';
import { RD } from '@/lib/redesignTheme';

// Position explorer: make moves for both sides from any position. Pick up a
// piece and every square it can go to shows Stockfish's evaluation swing for
// that move: green keeps the evaluation (the best move is outlined), red gives
// some of it away. Opens at the start position from the dashboard, or at a
// scanned position from Scan Position (?fen=).

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

type EngineMove = { uci: string; san: string; from: string; to: string; cp: number | null; mate: number | null };
type Analysis = { fen: string; turn: 'w' | 'b'; depth: number; moves: EngineMove[] };
type Step = { fen: string; san: string | null; from?: string; to?: string };

/** Mover's-view score, with mates beyond any normal evaluation. */
const value = (m: EngineMove) => (m.mate != null ? (m.mate > 0 ? 100000 - m.mate : -100000 - m.mate) : (m.cp ?? -99999));
/** For swings: mates count as ±10 pawns so the numbers stay readable. */
const capped = (m: EngineMove) => (m.mate != null ? (m.mate > 0 ? 1000 : -1000) : Math.max(-1000, Math.min(1000, m.cp ?? 0)));
const fmt = (pawns: number) => `${pawns > 0 ? '+' : pawns < 0 ? '−' : ''}${Math.abs(pawns).toFixed(1)}`;
const keyOf = (fen: string) => fen.split(' ').slice(0, 4).join(' ');
const GREEN = '#5FA83A', RED = '#D9443F';

function readStart(): { fen: string; fromScan: boolean } {
  try {
    const q = new URLSearchParams(window.location.search);
    const f = q.get('fen');
    if (f) { new Chess(f); return { fen: f, fromScan: q.get('from') === 'scan' }; }
  } catch { /* fall back to the start position */ }
  return { fen: START, fromScan: false };
}

export function Explorer() {
  const [, navigate] = useLocation();
  const [{ fen: startFen, fromScan }] = useState(readStart);
  const [steps, setSteps] = useState<Step[]>([{ fen: startFen, san: null }]);
  const [at, setAt] = useState(0);                 // which step is on the board (earlier steps = undo, redo keeps the rest)
  const [flipped, setFlipped] = useState(() => startFen.split(' ')[1] === 'b');
  const [selected, setSelected] = useState<string | null>(null);
  const [show, setShow] = useState<'swing' | 'eval'>('swing');
  const [hint, setHint] = useState(false);
  const [copied, setCopied] = useState(false);
  const cache = useRef(new Map<string, Analysis>());
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const step = steps[at];
  const fen = step.fen;
  const chess = useMemo(() => { try { return new Chess(fen); } catch { return new Chess(); } }, [fen]);
  const turn = chess.turn();
  const over = chess.isGameOver();

  // Stockfish's score for every legal move here (once per position).
  useEffect(() => {
    setSelected(null);
    setError('');
    if (over) { setAnalysis(null); setLoading(false); return; }
    const hit = cache.current.get(keyOf(fen));
    if (hit) { setAnalysis(hit); setLoading(false); return; }
    setAnalysis(null);
    setLoading(true);
    const ctl = new AbortController();
    let tries = 0;
    const load = async () => {
      try {
        const r = await apiFetch('/api/explore/moves', {
          method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fen }), signal: ctl.signal,
        });
        const d = await r.json().catch(() => ({}));
        if (r.status === 503 && tries++ < 4) { setTimeout(() => { if (!ctl.signal.aborted) void load(); }, 1200); return; }
        if (!r.ok) throw new Error(d.error || 'The engine is unavailable right now.');
        cache.current.set(keyOf(fen), d as Analysis);
        if (!ctl.signal.aborted) { setAnalysis(d as Analysis); setLoading(false); }
      } catch (e) {
        if (ctl.signal.aborted) return;
        setError(e instanceof Error ? e.message : 'The engine is unavailable right now.');
        setLoading(false);
      }
    };
    void load();
    return () => ctl.abort();
  }, [fen, over]);

  const best = useMemo(() => {
    if (!analysis) return null;
    const scored = analysis.moves.filter(m => m.cp != null || m.mate != null);
    return scored.length ? scored.reduce((a, b) => (value(b) > value(a) ? b : a)) : null;
  }, [analysis]);

  // White's-view evaluation of the position (the best move's score).
  const evalWhite = best ? (best.mate != null ? null : (turn === 'w' ? 1 : -1) * (best.cp ?? 0) / 100) : null;
  const mateWhite = best?.mate != null ? (turn === 'w' ? best.mate : -best.mate) : null;

  // The labels for the picked-up piece's moves.
  const marks = useMemo(() => {
    if (!selected || over) return undefined;
    const out: Record<string, { text: string; color: string; tint?: string; strong?: boolean }> = {};
    const legal = chess.moves({ square: selected as never, verbose: true }) as { from: string; to: string; san: string; promotion?: string }[];
    if (!legal.length) return undefined;
    if (!analysis || !best) {
      for (const m of legal) out[m.to] = { text: loading ? '···' : '?', color: 'rgba(40,46,48,.9)' };
      return out;
    }
    // A promotion has several moves to one square: show the best of them.
    const byTo = new Map<string, EngineMove>();
    for (const m of analysis.moves) {
      if (m.from !== selected) continue;
      const prev = byTo.get(m.to);
      if (!prev || value(m) > value(prev)) byTo.set(m.to, m);
    }
    const bestCapped = capped(best);
    for (const m of legal) {
      const e = byTo.get(m.to);
      if (!e || (e.cp == null && e.mate == null)) { out[m.to] = { text: '?', color: 'rgba(40,46,48,.9)' }; continue; }
      const swing = (capped(e) - bestCapped) / 100;            // 0 for the best move, negative when it gives something away
      const isBest = e.uci === best.uci || value(e) >= value(best);
      const good = swing >= -0.3;
      const mag = Math.min(1, Math.abs(swing) / 3);
      let text: string;
      if (show === 'eval') {
        text = e.mate != null ? `${(turn === 'w' ? e.mate : -e.mate) > 0 ? '' : '−'}M${Math.abs(e.mate)}` : fmt((turn === 'w' ? 1 : -1) * (e.cp ?? 0) / 100);
      } else {
        text = e.mate != null && e.mate > 0 ? `M${e.mate}` : e.mate != null && e.mate < 0 ? `−M${Math.abs(e.mate)}` : isBest ? '0.0' : fmt(swing);
      }
      out[m.to] = good
        ? { text, color: GREEN, tint: `rgba(95,168,58,${isBest ? 0.55 : 0.32})`, strong: isBest }
        : { text, color: RED, tint: `rgba(217,68,63,${0.22 + mag * 0.4})` };
    }
    return out;
  }, [selected, analysis, best, chess, show, loading, over, turn]);

  const play = useCallback((san: string) => {
    try {
      const c = new Chess(fen);
      const m = c.move(san);
      if (!m) return;
      setSteps(prev => [...prev.slice(0, at + 1), { fen: c.fen(), san: m.san, from: m.from, to: m.to }]);
      setAt(a => a + 1);
    } catch { /* not legal here */ }
  }, [fen, at]);

  const undo = () => setAt(a => Math.max(0, a - 1));
  const redo = () => setAt(a => Math.min(steps.length - 1, a + 1));
  const reset = () => { setSteps([{ fen: startFen, san: null }]); setAt(0); };
  const copyFen = async () => { try { await navigator.clipboard.writeText(fen); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* ignore */ } };

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === 'ArrowLeft') setAt(a => Math.max(0, a - 1));
      if (e.key === 'ArrowRight') setAt(a => Math.min(steps.length - 1, a + 1));
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [steps.length]);

  const status = chess.isCheckmate() ? `Checkmate: ${turn === 'w' ? 'Black' : 'White'} wins`
    : chess.isStalemate() ? 'Stalemate: draw' : chess.isDraw() ? 'Draw' : null;
  const startMoveNo = Number(startFen.split(' ')[5] || 1);
  const startBlack = startFen.split(' ')[1] === 'b';
  const lineSteps = steps.slice(1);
  const evalPct = mateWhite != null ? (mateWhite > 0 ? 100 : 0) : evalWhite != null ? 50 + 50 * (2 / (1 + Math.exp(-0.368208 * evalWhite)) - 1) : 50;
  const card: React.CSSProperties = { background: RD.card, border: `1px solid ${RD.border}` };

  return (
    <div className="mx-auto w-full max-w-[1120px] px-3 pb-28 md:px-0 md:pb-10">
      <RedesignHeader dense title="Position Explorer" backHref={fromScan ? '/scan' : '/'}
        right={<button onClick={() => setFlipped(f => !f)} aria-label="Flip board" title="Flip board" className="grid h-9 w-9 place-items-center rounded-full"><FlipVertical2 size={19} /></button>} />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-3">
          {/* Evaluation */}
          <div className="rounded-[18px] px-4 py-3" style={card}>
            <div className="flex items-center gap-3">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[11px]" style={{ background: 'rgba(129,182,76,.16)' }}><Cpu className="h-[18px] w-[18px]" style={{ color: RD.green }} /></span>
              <div className="min-w-0 flex-1 leading-tight">
                <p className="text-[12px] font-bold" style={{ color: RD.muted }}>{status ? 'Game over' : `${turn === 'w' ? 'White' : 'Black'} to move`}{analysis?.depth ? ` · depth ${analysis.depth}` : ''}</p>
                <p className="truncate text-[17px] font-black" style={{ color: RD.text }}>
                  {status ?? (loading ? 'Stockfish is thinking…' : error ? 'Engine unavailable' : mateWhite != null ? `Mate in ${Math.abs(mateWhite)} for ${mateWhite > 0 ? 'White' : 'Black'}` : evalWhite != null ? (
                    <>{fmt(evalWhite)}<span className="ml-1.5 text-[12.5px] font-bold" style={{ color: RD.muted }}>{Math.abs(evalWhite) < 0.3 ? 'equal' : evalWhite > 0 ? 'White better' : 'Black better'}</span></>
                  ) : '—')}
                </p>
              </div>
              {best && !status && (
                <button onClick={() => setHint(h => !h)} className="flex shrink-0 items-center gap-1.5 rounded-[11px] px-3 py-2 text-[12.5px] font-extrabold" style={hint ? { background: RD.green, color: '#fff' } : { background: 'rgba(255,255,255,.06)', color: RD.text, border: `1px solid ${RD.border}` }}>
                  <Lightbulb className="h-4 w-4" />{hint ? best.san : 'Best move'}
                </button>
              )}
            </div>
            <div className="mt-2.5 h-2 overflow-hidden rounded-full" style={{ background: '#2B3032' }}>
              <div className="h-full rounded-full transition-all duration-500" style={{ width: `${evalPct}%`, background: '#E9E6DE' }} />
            </div>
            {error && <p className="mt-2 text-[12.5px]" style={{ color: '#FF7A80' }}>{error}</p>}
          </div>

          <div className="mx-auto w-full" style={{ maxWidth: 'min(100%, max(300px, calc(100dvh - 330px)))' }}>
            <ChessBoard
              fen={fen}
              flipped={flipped}
              practiceMode={!over}
              suppressConfirmMoves
              onMovePlayed={(san) => play(san)}
              lastMove={step.from && step.to ? { from: step.from, to: step.to } : null}
              onSelectSquare={setSelected}
              squareMarks={marks}
              arrows={hint && best ? [{ from: best.from, to: best.to, color: 'rgba(95,168,58,.85)' }] : undefined}
              maxWidthOverride="100%"
            />
          </div>

          {/* Controls */}
          <div className="grid grid-cols-4 gap-2">
            <button onClick={undo} disabled={at === 0} aria-label="Back" className="flex h-[46px] items-center justify-center rounded-[13px] disabled:opacity-30" style={{ ...card, color: RD.text }}><ChevronLeft className="h-6 w-6" /></button>
            <button onClick={redo} disabled={at >= steps.length - 1} aria-label="Forward" className="flex h-[46px] items-center justify-center rounded-[13px] disabled:opacity-30" style={{ ...card, color: RD.text }}><ChevronRight className="h-6 w-6" /></button>
            <button onClick={reset} disabled={steps.length === 1} className="flex h-[46px] items-center justify-center gap-1.5 rounded-[13px] text-[13px] font-extrabold disabled:opacity-30" style={{ ...card, color: RD.text }}><RotateCcw className="h-4 w-4" />Reset</button>
            <button onClick={() => navigate(`/practice?fen=${encodeURIComponent(fen)}&rating=1500&color=${turn}`)} disabled={over} className="flex h-[46px] items-center justify-center gap-1.5 rounded-[13px] text-[13px] font-extrabold text-white disabled:opacity-40" style={{ background: RD.green }}><Swords className="h-4 w-4" />Bot</button>
          </div>
        </div>

        <div className="space-y-3">
          {/* How it works + display */}
          <div className="rounded-[18px] p-4" style={card}>
            <p className="text-[14px] font-extrabold" style={{ color: RD.text }}>Tap a piece to see where it can go</p>
            <p className="mt-1 text-[13px] leading-snug" style={{ color: RD.muted }}>
              Every square it can reach shows Stockfish's verdict. Make moves for both sides to explore any line.
            </p>
            <div className="mt-3 space-y-1.5 text-[12.5px]">
              <p className="flex items-center gap-2" style={{ color: RD.text }}><span className="rounded px-1.5 py-0.5 text-[11px] font-black text-white" style={{ background: GREEN, outline: '1.5px solid #fff' }}>0.0</span> The best move</p>
              <p className="flex items-center gap-2" style={{ color: RD.text }}><span className="rounded px-1.5 py-0.5 text-[11px] font-black text-white" style={{ background: GREEN }}>−0.2</span> Keeps the evaluation</p>
              <p className="flex items-center gap-2" style={{ color: RD.text }}><span className="rounded px-1.5 py-0.5 text-[11px] font-black text-white" style={{ background: RED }}>−1.8</span> Gives away that many pawns</p>
              <p className="flex items-center gap-2" style={{ color: RD.text }}><span className="rounded px-1.5 py-0.5 text-[11px] font-black text-white" style={{ background: GREEN }}>M3</span> Forces mate in 3</p>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-1 rounded-[12px] p-1" style={{ background: RD.cardSolid, border: `1px solid ${RD.border}` }}>
              {([['swing', 'Swing'], ['eval', 'Eval after move']] as const).map(([id, label]) => (
                <button key={id} onClick={() => setShow(id)} className="rounded-[9px] py-2 text-[12.5px] font-extrabold" style={show === id ? { background: RD.green, color: '#fff' } : { color: RD.muted }}>{label}</button>
              ))}
            </div>
            <p className="mt-2 text-[11.5px]" style={{ color: RD.muted }}>
              {show === 'swing' ? 'Swing: how much the evaluation changes with that move, compared with the best one (in pawns).' : 'Eval after move: the evaluation from White\'s side once that move is played.'}
            </p>
          </div>

          {/* Moves */}
          <div className="rounded-[18px] p-4" style={card}>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-[12px] font-black uppercase tracking-[0.14em]" style={{ color: RD.muted }}>Your line</h3>
              <button onClick={copyFen} className="flex items-center gap-1 text-[12px] font-bold" style={{ color: copied ? RD.green : RD.muted }}>
                {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}{copied ? 'Copied' : 'Copy FEN'}
              </button>
            </div>
            {lineSteps.length === 0 ? (
              <p className="text-[13px]" style={{ color: RD.muted }}>No moves yet. {fromScan ? 'You\'re at your scanned position.' : 'You\'re at the starting position.'}</p>
            ) : (
              <div className="flex flex-wrap gap-x-1 gap-y-1">
                {lineSteps.map((s, i) => {
                  const ply = i + (startBlack ? 1 : 0);
                  const num = startMoveNo + Math.floor(ply / 2);
                  const showNum = ply % 2 === 0 || i === 0;
                  const active = at === i + 1;
                  return (
                    <React.Fragment key={i}>
                      {showNum && <span className="self-center pl-1 text-[12.5px] font-bold tabular-nums" style={{ color: RD.muted }}>{num}.{ply % 2 === 1 ? '..' : ''}</span>}
                      <button onClick={() => setAt(i + 1)} className="rounded-[8px] px-2 py-1 text-[14px] font-bold" style={active ? { background: RD.green, color: '#fff' } : { color: i + 1 > at ? RD.muted : RD.text }}>{s.san}</button>
                    </React.Fragment>
                  );
                })}
              </div>
            )}
            {at > 0 && <button onClick={() => setAt(0)} className="mt-2 text-[12px] font-bold" style={{ color: RD.muted }}>Back to the {fromScan ? 'scanned' : 'starting'} position</button>}
          </div>

          {!fromScan && (
            <button onClick={() => navigate('/scan')} className="flex w-full items-center gap-3 rounded-[18px] p-4 text-left" style={card}>
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[11px]" style={{ background: 'rgba(129,182,76,.16)' }}><Camera className="h-[18px] w-[18px]" style={{ color: RD.green }} /></span>
              <span className="min-w-0 flex-1">
                <b className="block text-[14px] font-extrabold" style={{ color: RD.text }}>Explore a real position</b>
                <span className="block text-[12.5px]" style={{ color: RD.muted }}>Scan a board or screenshot and start from there</span>
              </span>
              <ChevronRight className="h-4 w-4 shrink-0" style={{ color: RD.muted }} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
