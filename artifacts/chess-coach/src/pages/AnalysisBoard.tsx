// Free analysis board: paste a PGN or FEN (or just play moves) and Stockfish analyses every
// position live, on the player's own device. No account needed.
import { recordActivity } from '@/lib/activity';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Chess } from 'chess.js';
import { ChevronLeft, ChevronRight, Copy, Check, FlipVertical2, RotateCcw, ClipboardPaste } from 'lucide-react';
import { ChessBoard } from '@/components/ChessBoard';
import { RedesignHeader } from '@/components/RedesignHeader';
import { EnginePanel, type BoardArrow } from '@/components/EnginePanel';
import { useHoldRepeat } from '@/hooks/use-hold-repeat';
import { RD } from '@/lib/redesignTheme';
import { setPageMeta } from '@/lib/pageMeta';

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
type Step = { fen: string; san?: string; from?: string; to?: string };

/** A PGN or a FEN → the game's positions (null if it's neither). */
function parseInput(text: string): { steps: Step[]; headers: Record<string, string> } | null {
  const t = text.trim();
  if (!t) return null;
  if (/^[1-8pnbrqkPNBRQK/]+\s+[wb]\b/.test(t)) {
    try { const c = new Chess(t); return { steps: [{ fen: c.fen() }], headers: {} }; } catch { return null; }
  }
  try {
    const c = new Chess();
    c.loadPgn(t);
    const hist = c.history({ verbose: true });
    const headers = c.getHeaders() as Record<string, string>;
    const start = headers.FEN || START;
    const r = new Chess(start);
    const steps: Step[] = [{ fen: r.fen() }];
    for (const m of hist) { const mv = r.move(m.san); steps.push({ fen: r.fen(), san: mv.san, from: mv.from, to: mv.to }); }
    return { steps, headers };
  } catch { return null; }
}

export default function AnalysisBoardPage() {
  const initial = useMemo(() => {
    const q = new URLSearchParams(window.location.search);
    const f = q.get('fen'); const pgn = q.get('pgn');
    return (pgn && parseInput(pgn)) || (f && parseInput(f)) || { steps: [{ fen: START }], headers: {} };
  }, []);
  const [steps, setSteps] = useState<Step[]>(initial.steps);
  const [headers, setHeaders] = useState<Record<string, string>>(initial.headers);
  const [at, setAt] = useState(initial.steps.length - 1);
  const [flipped, setFlipped] = useState(false);
  const [arrows, setArrows] = useState<BoardArrow[]>([]);
  const [paste, setPaste] = useState('');
  const [pasteOpen, setPasteOpen] = useState(initial.steps.length === 1 && initial.steps[0].fen === START);
  const [err, setErr] = useState('');
  const [copied, setCopied] = useState<'' | 'fen' | 'pgn'>('');

  useEffect(() => {
    setPageMeta('Free Chess Analysis Board with Stockfish 19 | ChessScout.net',
      'Paste a PGN or FEN and analyse it free with Stockfish 19, running in your browser. Live evaluation, the top 3 lines, threats. No account needed.', '/analysis-board');
  }, []);

  const step = steps[at];
  const over = useMemo(() => { try { return new Chess(step.fen).isGameOver(); } catch { return true; } }, [step.fen]);

  const play = useCallback((san: string) => {
    recordActivity('analysis');
    try {
      const c = new Chess(steps[at].fen);
      const mv = c.move(san);
      if (!mv) return;
      // the same move as the game's next one just steps forward; anything else starts a new line here
      if (steps[at + 1]?.san === mv.san) { setAt(at + 1); return; }
      setSteps([...steps.slice(0, at + 1), { fen: c.fen(), san: mv.san, from: mv.from, to: mv.to }]);
      setAt(at + 1);
    } catch { /* illegal */ }
  }, [steps, at]);
  const playUci = useCallback((u: string) => {
    try { const c = new Chess(steps[at].fen); const mv = c.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] || undefined }); if (mv) play(mv.san); } catch { /* */ }
  }, [steps, at, play]);

  const load = () => {
    const r = parseInput(paste);
    if (!r) { setErr("That isn't a PGN or FEN I can read. Check it's the whole game or position."); return; }
    setErr(''); setSteps(r.steps); setHeaders(r.headers); setAt(0); setPasteOpen(false); setPaste('');
  };
  const reset = () => { setSteps([{ fen: START }]); setHeaders({}); setAt(0); };

  const pgn = useMemo(() => {
    const c = new Chess(steps[0].fen);
    if (steps[0].fen !== START) { c.setHeader('SetUp', '1'); c.setHeader('FEN', steps[0].fen); }
    for (const s of steps.slice(1)) if (s.san) c.move(s.san);
    return c.pgn();
  }, [steps]);
  const copy = (what: 'fen' | 'pgn') => {
    void navigator.clipboard?.writeText(what === 'fen' ? step.fen : pgn).then(() => { setCopied(what); setTimeout(() => setCopied(''), 1500); });
  };

  const holdBack = useHoldRepeat(() => setAt((a) => Math.max(0, a - 1)));
  const holdFwd = useHoldRepeat(() => setAt((a) => Math.min(steps.length - 1, a + 1)));
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'TEXTAREA') return;
      if (e.key === 'ArrowLeft') setAt((a) => Math.max(0, a - 1));
      if (e.key === 'ArrowRight') setAt((a) => Math.min(steps.length - 1, a + 1));
    };
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k);
  }, [steps.length]);

  const card: React.CSSProperties = { background: RD.card, border: `1px solid ${RD.border}` };
  const title = headers.White && headers.Black ? `${headers.White} vs ${headers.Black}` : 'Analysis Board';

  return (
    <div className="mx-auto w-full max-w-[1200px] px-4 pb-28 pt-3 md:px-8" style={{ color: RD.text }}>
      <RedesignHeader dense title={title} backHref="/"
        right={<button onClick={() => setFlipped((f) => !f)} aria-label="Flip board" className="grid h-9 w-9 place-items-center rounded-full"><FlipVertical2 size={19} /></button>} />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-3">
          <div className="mx-auto w-full" style={{ maxWidth: 'min(100%, max(300px, calc(100dvh - 300px)))' }}>
            <ChessBoard fen={step.fen} flipped={flipped} practiceMode={!over} suppressConfirmMoves
              onMovePlayed={(san) => play(san)} lastMove={step.from && step.to ? { from: step.from, to: step.to } : null}
              arrows={arrows} maxWidthOverride="100%" />
          </div>
          <div className="grid grid-cols-4 gap-2">
            <button {...holdBack} disabled={at === 0} aria-label="Back" className="flex h-[46px] items-center justify-center rounded-[13px] disabled:opacity-30" style={card}><ChevronLeft className="h-6 w-6" /></button>
            <button {...holdFwd} disabled={at >= steps.length - 1} aria-label="Forward" className="flex h-[46px] items-center justify-center rounded-[13px] disabled:opacity-30" style={card}><ChevronRight className="h-6 w-6" /></button>
            <button onClick={reset} className="flex h-[46px] items-center justify-center gap-1.5 rounded-[13px] text-[13px] font-extrabold" style={card}><RotateCcw className="h-4 w-4" />Reset</button>
            <button onClick={() => setPasteOpen((v) => !v)} className="flex h-[46px] items-center justify-center gap-1.5 rounded-[13px] text-[13px] font-extrabold text-white" style={{ background: RD.green }}><ClipboardPaste className="h-4 w-4" />Paste</button>
          </div>
        </div>

        <div className="space-y-3">
          {pasteOpen && (
            <div className="rounded-[18px] p-4" style={card}>
              <p className="text-[14px] font-extrabold">Paste a PGN or FEN</p>
              <p className="mt-0.5 text-[12.5px]" style={{ color: RD.muted }}>A whole game from Chess.com, Lichess or anywhere, or one position. Or just make moves on the board.</p>
              <textarea value={paste} onChange={(e) => setPaste(e.target.value)} rows={5} spellCheck={false}
                placeholder={'1. e4 e5 2. Nf3 Nc6 …\nor  rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1'}
                className="mt-2.5 w-full rounded-[12px] p-3 font-mono text-[12.5px] outline-none" style={{ background: RD.cardSolid, border: `1px solid ${RD.border}`, color: RD.text }} />
              {err && <p className="mt-1.5 text-[12.5px]" style={{ color: '#FF7A80' }}>{err}</p>}
              <button onClick={load} disabled={!paste.trim()} className="mt-2 w-full rounded-[12px] py-2.5 text-[14px] font-extrabold text-white disabled:opacity-40" style={{ background: RD.green }}>Analyse</button>
            </div>
          )}

          <EnginePanel fen={step.fen} onArrows={setArrows} onMoveClick={playUci} />

          {steps.length > 1 && (
            <div className="rounded-[18px] p-3" style={card}>
              <div className="flex max-h-[220px] flex-wrap gap-x-1 gap-y-1 overflow-y-auto text-[13px]">
                {steps.slice(1).map((s, i) => {
                  const ply = i + 1;
                  const startBlack = steps[0].fen.split(' ')[1] === 'b';
                  const n = Math.floor((i + (startBlack ? 1 : 0)) / 2) + Number(steps[0].fen.split(' ')[5] || 1);
                  const white = (i + (startBlack ? 1 : 0)) % 2 === 0;
                  return (
                    <span key={ply} className="inline-flex items-baseline">
                      {(white || i === 0) && <span className="mr-1" style={{ color: RD.muted }}>{n}{white ? '.' : '…'}</span>}
                      <button onClick={() => setAt(ply)} className="rounded-md px-1.5 py-0.5 font-bold"
                        style={ply === at ? { background: RD.green, color: '#fff' } : undefined}>{s.san}</button>
                    </span>
                  );
                })}
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => copy('fen')} className="flex h-[42px] items-center justify-center gap-1.5 rounded-[12px] text-[13px] font-bold" style={card}>{copied === 'fen' ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}Copy FEN</button>
            <button onClick={() => copy('pgn')} disabled={steps.length < 2} className="flex h-[42px] items-center justify-center gap-1.5 rounded-[12px] text-[13px] font-bold disabled:opacity-40" style={card}>{copied === 'pgn' ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}Copy PGN</button>
          </div>
          <p className="px-1 text-[11.5px]" style={{ color: RD.muted }}>Stockfish 19 runs on your device, so analysis is free and nothing is uploaded.</p>
        </div>
      </div>
    </div>
  );
}
