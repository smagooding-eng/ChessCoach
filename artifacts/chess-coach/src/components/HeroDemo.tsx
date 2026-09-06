import { useState } from 'react';
import { Loader2, TrendingDown, ArrowRight, Lock, Sparkles, BookOpen, Swords, ChevronDown, ChevronUp, Crown, ArrowRightLeft, Crosshair } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { analyzeMoveQuality, type MoveAnalysisResult } from '@/lib/chess-bot';

const G = '#81b64c';
const TEXT = '#e8e6e3';
const MUTED = '#9e9b98';
const CARD = '#1c1b19';
const SEV_COLORS: Record<string, string> = { Critical: '#ef4444', High: '#f97316', Medium: '#f59e0b', Low: '#10b981' };

interface BlunderDetail extends MoveAnalysisResult {
  fenBefore: string;
  san: string;
  moveNumber: number;
}

interface SampleWeakness {
  category: string;
  severity: string;
  description: string;
  frequency: number;
  examples: string[];
  previewFen: string | null;
}

interface SampleReport {
  username: string;
  totalGames: number;
  wins: number;
  losses: number;
  draws: number;
  avgRating: number | null;
  biggestOpportunity: string | null;
  severityCounts: Record<string, number>;
  topWeaknessAreas: { category: string; count: number }[];
  favoriteOpenings: { opening: string; games: number; winRate: number }[];
  phaseAccuracy: {
    opening: { accuracy: number; moves: number };
    middlegame: { accuracy: number; moves: number };
    endgame: { accuracy: number; moves: number };
    gamesAnalyzed: number;
  };
  weaknesses: SampleWeakness[];
}

interface DemoResult {
  gamesAnalyzed: number;
  totalMoves: number;
  blunders: number;
  mistakes: number;
  topOpening: string | null;
  blunderRate: number;
  totals: { total: number; wins: number; losses: number } | null;
  // The single worst real blunder found across the analyzed games (by
  // centipawn loss) -- not a mockup. Null when the sampled games happened
  // to have zero blunders.
  worstBlunder: BlunderDetail | null;
}

// Renders a FEN position as a small static 8x8 grid using unicode chess
// glyphs. Deliberately not react-chessboard/chess.js's full interactive
// ChessBoard component -- that component (with its drag-and-drop, sound
// effects, and error-boundary retry machinery) is built for gameplay
// pages, not a read-only landing-page diagram, and pulling it into the
// landing bundle would add real weight to the page we're trying to make
// faster. This is read-only and has no other dependencies.
function MiniBoard({ fen }: { fen: string }) {
  const PIECES: Record<string, string> = {
    K: '♔', Q: '♕', R: '♖', B: '♗', N: '♘', P: '♙',
    k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟',
  };
  const rows = fen.split(' ')[0].split('/');
  const squares: { dark: boolean; piece: string | null }[] = [];
  rows.forEach((row, r) => {
    let file = 0;
    for (const ch of row) {
      if (/\d/.test(ch)) {
        const n = parseInt(ch, 10);
        for (let i = 0; i < n; i++) { squares.push({ dark: (r + file) % 2 === 1, piece: null }); file++; }
      } else {
        squares.push({ dark: (r + file) % 2 === 1, piece: ch });
        file++;
      }
    }
  });
  return (
    <div className="grid grid-cols-8 w-full rounded-md overflow-hidden shrink-0" style={{ maxWidth: '132px', border: '1px solid rgba(255,255,255,0.15)', aspectRatio: '1' }}>
      {squares.map((sq, i) => (
        <div key={i} className="flex items-center justify-center" style={{ aspectRatio: '1', background: sq.dark ? '#5c7a3a' : '#e8e6d8', fontSize: '0.85rem', lineHeight: 1 }}>
          {sq.piece ? PIECES[sq.piece] : ''}
        </div>
      ))}
    </div>
  );
}

// Shared between both landing-page dropdowns -- Pro's personal weakness
// report and Opponent Scout's "their weaknesses" report are the exact
// same underlying data and page structure in the real app, just framed
// as "fix this" vs "exploit this". frame picks the copy; the data and
// layout are identical, matching what Analysis.tsx and
// OpponentAnalysis.tsx actually render.
function SampleWeaknessList({ report, frame }: { report: SampleReport; frame: 'fix' | 'exploit' }) {
  const totalDecided = report.wins + report.losses + report.draws;
  const severityLabels: { key: string; icon: string }[] = [
    { key: 'Critical', icon: '⚡' }, { key: 'High', icon: '⚠' }, { key: 'Medium', icon: '🛡' }, { key: 'Low', icon: '👁' },
  ];
  const maxSeverity = Math.max(1, ...Object.values(report.severityCounts));
  const maxCategory = Math.max(1, ...report.topWeaknessAreas.map((a) => a.count));
  return (
    <div>
      {report.biggestOpportunity && (
        <p className="text-xs mb-3" style={{ color: MUTED }}>
          {frame === 'exploit' ? 'Their biggest opening to attack right now: ' : 'Your biggest opportunity right now: '}
          <span className="font-black" style={{ color: TEXT }}>{report.biggestOpportunity}</span>
        </p>
      )}

      <div className="grid grid-cols-4 gap-1.5 mb-3">
        {[
          { label: 'Games', value: report.totalGames },
          { label: 'Wins', value: report.wins },
          { label: 'Losses', value: report.losses },
          { label: 'Avg Rating', value: report.avgRating ?? '—' },
        ].map((s) => (
          <div key={s.label} className="rounded-lg p-2 text-center" style={{ background: 'rgba(255,255,255,0.03)' }}>
            <p className="text-sm font-black" style={{ color: TEXT }}>{s.value}</p>
            <p className="text-[9px]" style={{ color: MUTED }}>{s.label}</p>
          </div>
        ))}
      </div>
      {totalDecided > 0 && (
        <div className="flex h-1.5 rounded-full overflow-hidden mb-4">
          <div style={{ width: `${(report.wins / totalDecided) * 100}%`, background: G }} />
          <div style={{ width: `${(report.draws / totalDecided) * 100}%`, background: 'rgba(255,255,255,0.15)' }} />
          <div style={{ width: `${(report.losses / totalDecided) * 100}%`, background: '#c1493d' }} />
        </div>
      )}

      <p className="text-[10px] font-black uppercase tracking-wide mb-1.5" style={{ color: MUTED }}>Severity breakdown</p>
      <div className="space-y-1 mb-4">
        {severityLabels.map((s) => (
          <div key={s.key} className="flex items-center gap-2">
            <span className="text-[10px] w-14 shrink-0" style={{ color: SEV_COLORS[s.key] }}>{s.icon} {s.key}</span>
            <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
              <div className="h-full rounded-full" style={{ width: `${((report.severityCounts[s.key] ?? 0) / maxSeverity) * 100}%`, background: SEV_COLORS[s.key] }} />
            </div>
            <span className="text-[10px] font-bold w-4 text-right" style={{ color: TEXT }}>{report.severityCounts[s.key] ?? 0}</span>
          </div>
        ))}
      </div>

      {report.phaseAccuracy.gamesAnalyzed > 0 && (
        <>
          <p className="text-[10px] font-black uppercase tracking-wide mb-1.5" style={{ color: MUTED }}>
            Accuracy by game phase — from {report.phaseAccuracy.gamesAnalyzed} reviewed games
          </p>
          <div className="grid grid-cols-3 gap-1.5 mb-4">
            {(['opening', 'middlegame', 'endgame'] as const).map((phase) => {
              const p = report.phaseAccuracy[phase];
              const color = p.accuracy >= 70 ? G : p.accuracy >= 50 ? '#f59e0b' : '#ef4444';
              return (
                <div key={phase} className="rounded-lg p-2 text-center" style={{ background: 'rgba(255,255,255,0.03)' }}>
                  <p className="text-[9px] uppercase tracking-wide mb-0.5" style={{ color: MUTED }}>{phase}</p>
                  <p className="text-base font-black" style={{ color }}>{p.moves > 0 ? `${p.accuracy}%` : '—'}</p>
                  <p className="text-[9px]" style={{ color: MUTED }}>{p.moves} moves</p>
                </div>
              );
            })}
          </div>
        </>
      )}

      {report.topWeaknessAreas.length > 0 && (
        <>
          <p className="text-[10px] font-black uppercase tracking-wide mb-1.5" style={{ color: MUTED }}>Top weakness areas — by count</p>
          <div className="space-y-1 mb-4">
            {report.topWeaknessAreas.map((a) => (
              <div key={a.category} className="flex items-center gap-2">
                <span className="text-[10px] w-28 shrink-0 truncate" style={{ color: TEXT }}>{a.category}</span>
                <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
                  <div className="h-full rounded-full" style={{ width: `${(a.count / maxCategory) * 100}%`, background: G }} />
                </div>
                <span className="text-[10px] font-bold w-4 text-right" style={{ color: TEXT }}>{a.count}</span>
              </div>
            ))}
          </div>
        </>
      )}

      <div className="space-y-2.5 mb-4">
        {report.weaknesses.map((w, i) => (
          <div key={i} className="rounded-lg p-3" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
            <div className="flex items-start gap-2.5">
              {w.previewFen && <MiniBoard fen={w.previewFen} />}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap mb-1">
                  <span className="text-[9px] font-black px-1.5 py-0.5 rounded-full" style={{ background: SEV_COLORS[w.severity] ?? SEV_COLORS.Low, color: '#fff' }}>{w.severity}</span>
                  <span className="text-xs font-bold" style={{ color: TEXT }}>{w.category}</span>
                </div>
                <div className="flex items-center gap-2 mb-1.5">
                  <div className="flex-1 h-1 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
                    <div className="h-full rounded-full" style={{ width: `${Math.round(w.frequency * 100)}%`, background: SEV_COLORS[w.severity] ?? SEV_COLORS.Low }} />
                  </div>
                  <span className="text-[10px] font-bold shrink-0" style={{ color: SEV_COLORS[w.severity] ?? SEV_COLORS.Low }}>{Math.round(w.frequency * 100)}%</span>
                </div>
                <p className="text-[11px] leading-relaxed" style={{ color: MUTED }}>{w.description}</p>
                {w.examples && w.examples.length > 0 && (
                  <div className="mt-2 pt-2" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                    <p className="text-[9px] font-black uppercase tracking-wide mb-1" style={{ color: MUTED }}>
                      {frame === 'exploit' ? 'How to punish it' : 'Examples from your games'}
                    </p>
                    <ul className="space-y-1">
                      {w.examples.map((ex, exIdx) => (
                        <li key={exIdx} className="text-[10px] leading-relaxed flex gap-1.5" style={{ color: MUTED }}>
                          <span style={{ color: G }}>•</span>
                          <span>{ex}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {report.favoriteOpenings.length > 0 && (
        <>
          <p className="text-[10px] font-black uppercase tracking-wide mb-1.5" style={{ color: MUTED }}>{frame === 'exploit' ? 'Their favourite openings' : 'Favourite openings'}</p>
          <div className="space-y-1.5">
            {report.favoriteOpenings.map((o) => (
              <div key={o.opening} className="p-2 rounded-lg" style={{ background: 'rgba(255,255,255,0.03)' }}>
                <div className="flex items-center justify-between text-[10px] mb-1">
                  <span className="truncate pr-2" style={{ color: TEXT }}>{o.opening}</span>
                  <span className="shrink-0" style={{ color: MUTED }}>{o.games}g · {o.winRate}%</span>
                </div>
                <div className="h-1 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
                  <div className="h-full rounded-full" style={{ width: `${o.winRate}%`, background: G }} />
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}


// browser between each one (via setTimeout 0), instead of one long
// synchronous loop. A depth-2 minimax per move is fast individually, but
// running 30-40 of them back-to-back on the main thread can visibly
// freeze the tab -- this keeps the UI responsive and lets the progress
// bar actually update while it works.
async function analyzeMovesInChunks(
  allMoves: { fenBefore: string; san: string; moveNumber: number }[],
  onProgress: (done: number, total: number) => void,
): Promise<BlunderDetail[]> {
  const BATCH_SIZE = 6;
  const results: BlunderDetail[] = [];
  for (let i = 0; i < allMoves.length; i += BATCH_SIZE) {
    const batch = allMoves.slice(i, i + BATCH_SIZE);
    for (const move of batch) {
      try {
        const analysis = analyzeMoveQuality(move.fenBefore, move.san);
        results.push({ ...analysis, fenBefore: move.fenBefore, san: move.san, moveNumber: move.moveNumber });
      } catch {
        // Skip any move that fails to analyze rather than aborting the
        // whole demo over one malformed FEN/SAN edge case.
      }
    }
    onProgress(Math.min(i + BATCH_SIZE, allMoves.length), allMoves.length);
    // Yield to the browser so it can paint/respond before the next batch.
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  return results;
}

// This is the free, no-signup demo described in the site audit. It
// deliberately calls zero AI/OpenAI endpoints -- games are fetched
// server-side (existing Chess.com/Lichess integration, rate-limited per
// IP), then analyzed entirely in the browser using analyzeMoveQuality(),
// the same lightweight chess-engine-based classifier that already powers
// Practice Bots move feedback. analyzeMoveQuality already computes a full
// breakdown per move (eval swing, the engine's suggested best move,
// pros/cons, a plain-language summary) -- the result view below shows all
// of that for the visitor's single worst real blunder, rather than
// discarding everything but the quality label. Full AI-written
// explanations across *every* game remain a signed-in/paid feature; this
// demo shows one real example of that depth, not a mockup of it.
export function HeroDemo({ onUpgradeClick }: { onUpgradeClick: () => void }) {
  const [username, setUsername] = useState('');
  const [platform, setPlatform] = useState<'chesscom' | 'lichess'>('chesscom');
  const [state, setState] = useState<'idle' | 'loading' | 'analyzing' | 'result' | 'error'>('idle');
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');
  const [result, setResult] = useState<DemoResult | null>(null);
  const [showBreakdown, setShowBreakdown] = useState(true);
  const [sample, setSample] = useState<SampleReport | null>(null);
  const [sampleLoading, setSampleLoading] = useState(false);
  const [sampleError, setSampleError] = useState(false);
  const [showProSample, setShowProSample] = useState(false);
  const [showScoutSample, setShowScoutSample] = useState(false);

  // Both dropdowns share one fetch -- Opponent Scout shows the exact same
  // weakness-detection output as the personal Pro analysis, just aimed at
  // someone else's account instead of your own, so there's no need for a
  // second sample or a second request.
  const loadSample = async () => {
    if (sample || sampleLoading) return;
    setSampleLoading(true);
    setSampleError(false);
    try {
      const res = await apiFetch('/api/demo/sample-report');
      if (!res.ok) throw new Error();
      setSample(await res.json());
    } catch {
      setSampleError(true);
    } finally {
      setSampleLoading(false);
    }
  };
  const toggleProSample = () => { if (!showProSample) loadSample(); setShowProSample((v) => !v); };
  const toggleScoutSample = () => { if (!showScoutSample) loadSample(); setShowScoutSample((v) => !v); };

  const runDemo = async () => {
    if (!username.trim()) return;
    setState('loading');
    setProgress(0);
    setError('');
    try {
      const res = await apiFetch('/api/demo/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), platform }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Something went wrong. Try again.');
        setState('error');
        return;
      }

      setState('analyzing');

      const openingCounts: Record<string, number> = {};
      const allMoves: { fenBefore: string; san: string; moveNumber: number }[] = [];
      for (const game of data.games as { openingName: string | null; moves: { fenBefore: string; san: string }[] }[]) {
        if (game.openingName) {
          openingCounts[game.openingName] = (openingCounts[game.openingName] ?? 0) + 1;
        }
        game.moves.forEach((move, idx) => {
          allMoves.push({ ...move, moveNumber: Math.floor(idx / 2) + 1 });
        });
      }

      const analyzed = await analyzeMovesInChunks(allMoves, (done, total) => {
        setProgress(Math.round((done / total) * 100));
      });

      const blunderList = analyzed.filter((a) => a.quality === 'blunder');
      const mistakes = analyzed.filter((a) => a.quality === 'mistake').length;
      const topOpening = Object.entries(openingCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
      const worstBlunder = blunderList.length > 0
        ? blunderList.reduce((worst, b) => (b.cpLoss > worst.cpLoss ? b : worst))
        : null;

      setResult({
        gamesAnalyzed: data.gamesAnalyzed,
        totalMoves: analyzed.length,
        blunders: blunderList.length,
        mistakes,
        topOpening,
        blunderRate: analyzed.length > 0 ? Math.round((blunderList.length / analyzed.length) * 1000) / 10 : 0,
        totals: data.totals ?? null,
        worstBlunder,
      });
      setState('result');
    } catch {
      setError('Connection error. Try again.');
      setState('error');
    }
  };

  return (
    <div id="hero-demo" className="rounded-2xl p-6 sm:p-8" style={{ background: CARD, border: `1.5px solid ${G}40`, boxShadow: `0 30px 80px -20px rgba(0,0,0,0.6), 0 0 60px ${G}12` }}>
      {state !== 'result' && (
        <>
          <p className="text-sm font-black uppercase tracking-wide mb-1" style={{ color: G }}>
            Try it free — no signup
          </p>
          <p className="text-xs mb-4" style={{ color: MUTED }}>
            Real analysis of your real games, right here. Takes about 10 seconds.
          </p>
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="flex rounded-xl overflow-hidden shrink-0" style={{ border: '1px solid rgba(255,255,255,0.1)' }}>
              {(['chesscom', 'lichess'] as const).map((p) => (
                <button
                  key={p}
                  onClick={() => setPlatform(p)}
                  disabled={state === 'loading' || state === 'analyzing'}
                  className="flex-1 flex items-center justify-center px-4 py-3 text-xs font-bold text-center transition-colors"
                  style={{ background: platform === p ? G : 'transparent', color: platform === p ? '#000' : MUTED, minWidth: '92px' }}
                >
                  {p === 'chesscom' ? 'Chess.com' : 'Lichess'}
                </button>
              ))}
            </div>
            <input
              id="demo-username-input"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && runDemo()}
              disabled={state === 'loading' || state === 'analyzing'}
              placeholder="Your username"
              className="flex-1 px-4 py-3 rounded-xl text-sm disabled:opacity-60"
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', color: TEXT }}
            />
            <button
              onClick={runDemo}
              disabled={state === 'loading' || state === 'analyzing' || !username.trim()}
              className="px-5 py-3 rounded-xl text-sm font-black shrink-0 disabled:opacity-50 flex items-center justify-center gap-2 min-w-[110px]"
              style={{ background: G, color: '#000' }}
            >
              {state === 'loading' && <Loader2 className="w-4 h-4 animate-spin" />}
              {state === 'analyzing' && `${progress}%`}
              {state === 'idle' || state === 'error' ? 'Analyze' : null}
            </button>
          </div>
          {state === 'analyzing' && (
            <div className="mt-2 h-1 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
              <div className="h-full rounded-full transition-all duration-150" style={{ width: `${progress}%`, background: G }} />
            </div>
          )}
          {state === 'error' && <p className="text-xs mt-2" style={{ color: '#e57373' }}>{error}</p>}
          <p className="text-[11px] mt-2" style={{ color: MUTED }}>
            {state === 'loading' && 'Fetching your games...'}
            {state === 'analyzing' && 'Scanning for blunders...'}
            {(state === 'idle' || state === 'error') && "We'll look at your last 2 games. No account needed."}
          </p>
        </>
      )}

      {state === 'result' && result && (
        <div>
          <p className="text-xs font-black uppercase tracking-wide mb-3" style={{ color: G }}>
            Your quick scan
          </p>
          <div className="flex items-center gap-2 mb-4">
            <TrendingDown className="w-5 h-5" style={{ color: result.blunderRate > 3 ? '#e57373' : G }} />
            <p className="text-sm font-bold" style={{ color: TEXT }}>
              {result.blunders} blunder{result.blunders === 1 ? '' : 's'} across your last {result.gamesAnalyzed} games
              {result.topOpening && <> — mostly in the <span style={{ color: G }}>{result.topOpening}</span></>}
            </p>
          </div>

          {result.worstBlunder ? (
            <div className="rounded-xl p-4 mb-4" style={{ background: '#141413', border: '1px solid rgba(255,255,255,0.08)' }}>
              <button onClick={() => setShowBreakdown((v) => !v)} className="w-full flex items-center justify-between gap-2 mb-1">
                <p className="text-[10px] font-black uppercase tracking-wide" style={{ color: MUTED }}>Your biggest blunder — real, from your games</p>
                {showBreakdown ? <ChevronUp className="w-3.5 h-3.5 shrink-0" style={{ color: MUTED }} /> : <ChevronDown className="w-3.5 h-3.5 shrink-0" style={{ color: MUTED }} />}
              </button>
              {showBreakdown && (
                <div className="flex gap-3 mt-2">
                  <MiniBoard fen={result.worstBlunder.fenBefore} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap text-xs font-mono mb-1.5">
                      <span style={{ color: TEXT }}>{result.worstBlunder.moveNumber}.</span>
                      <span style={{ color: '#e57373', textDecoration: 'line-through' }}>{result.worstBlunder.san}</span>
                      {result.worstBlunder.bestMoveSan && (
                        <span className="flex items-center gap-1.5" style={{ color: G }}>
                          <ArrowRightLeft className="w-3 h-3" /> {result.worstBlunder.bestMoveSan}
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] leading-relaxed" style={{ color: MUTED }}>{result.worstBlunder.summary}</p>
                    <p className="text-[10px] font-bold mt-1.5" style={{ color: '#e57373' }}>
                      Eval swing: {(result.worstBlunder.cpLoss / 100).toFixed(1)} pawns
                    </p>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="rounded-xl p-4 mb-4 flex items-center gap-2" style={{ background: '#141413', border: '1px solid rgba(255,255,255,0.08)' }}>
              <Sparkles className="w-4 h-4 shrink-0" style={{ color: G }} />
              <p className="text-xs" style={{ color: MUTED }}>No outright blunders in these games — solid control. Go Pro to see the smaller mistakes still costing you points.</p>
            </div>
          )}

          <div className="rounded-xl p-4 mb-4" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
            <p className="text-[11px] font-black uppercase tracking-wide mb-2.5 flex items-center gap-1.5" style={{ color: G }}>
              <Crown className="w-3.5 h-3.5" /> Pro does this for every mistake, in every game
            </p>
            <div className="space-y-2">
              <div className="flex items-start gap-2">
                <Lock className="w-3.5 h-3.5 shrink-0 mt-0.5" style={{ color: MUTED }} />
                <p className="text-xs" style={{ color: MUTED }}>Deeper AI coaching on <strong style={{ color: TEXT }}>why</strong> it happened — this scan gives the engine's line, Pro adds the plain-English lesson</p>
              </div>
              <div className="flex items-start gap-2">
                <BookOpen className="w-3.5 h-3.5 shrink-0 mt-0.5" style={{ color: MUTED }} />
                <p className="text-xs" style={{ color: MUTED }}>A personalized course built around your {result.topOpening ?? 'most-played opening'} specifically</p>
              </div>
              {result.totals && result.totals.total > 0 ? (
                <div className="flex items-start gap-2">
                  <Swords className="w-3.5 h-3.5 shrink-0 mt-0.5" style={{ color: MUTED }} />
                  <p className="text-xs" style={{ color: MUTED }}>
                    Go Pro and we'll review all <strong style={{ color: TEXT }}>{result.totals.total.toLocaleString()}</strong> of your games —
                    including your <strong style={{ color: TEXT }}>{result.totals.losses.toLocaleString()}</strong> losses
                    and <strong style={{ color: TEXT }}>{result.totals.wins.toLocaleString()}</strong> wins — not just these {result.gamesAnalyzed}
                  </p>
                </div>
              ) : (
                <div className="flex items-start gap-2">
                  <Swords className="w-3.5 h-3.5 shrink-0 mt-0.5" style={{ color: MUTED }} />
                  <p className="text-xs" style={{ color: MUTED }}>This pattern checked across <strong style={{ color: TEXT }}>every</strong> game you've played, not just these {result.gamesAnalyzed}</p>
                </div>
              )}
            </div>
          </div>

          <button
            onClick={toggleProSample}
            className="w-full flex items-center justify-between gap-2 px-4 py-3 rounded-xl mb-2 text-xs font-bold"
            style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', color: TEXT }}
          >
            <span className="flex items-center gap-1.5"><Crown className="w-3.5 h-3.5" style={{ color: G }} /> What your analysis looks like with Pro</span>
            {showProSample ? <ChevronUp className="w-4 h-4 shrink-0" style={{ color: MUTED }} /> : <ChevronDown className="w-4 h-4 shrink-0" style={{ color: MUTED }} />}
          </button>
          {showProSample && (
            <div className="rounded-xl p-3 mb-2" style={{ background: '#141413', border: '1px solid rgba(255,255,255,0.08)' }}>
              <p className="text-[10px] font-black uppercase tracking-wide mb-2.5" style={{ color: MUTED }}>Real sample account — not your data</p>
              {sampleLoading && <div className="flex justify-center py-4"><Loader2 className="w-4 h-4 animate-spin" style={{ color: MUTED }} /></div>}
              {sampleError && <p className="text-xs" style={{ color: '#e57373' }}>Couldn't load the sample right now.</p>}
              {sample && <SampleWeaknessList report={sample} frame="fix" />}
            </div>
          )}

          <button
            onClick={toggleScoutSample}
            className="w-full flex items-center justify-between gap-2 px-4 py-3 rounded-xl mb-4 text-xs font-bold"
            style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', color: TEXT }}
          >
            <span className="flex items-center gap-1.5"><Crosshair className="w-3.5 h-3.5" style={{ color: G }} /> What Opponent Scout shows about someone else</span>
            {showScoutSample ? <ChevronUp className="w-4 h-4 shrink-0" style={{ color: MUTED }} /> : <ChevronDown className="w-4 h-4 shrink-0" style={{ color: MUTED }} />}
          </button>
          {showScoutSample && (
            <div className="rounded-xl p-3 mb-4" style={{ background: '#141413', border: '1px solid rgba(255,255,255,0.08)' }}>
              <p className="text-[10px] font-black uppercase tracking-wide mb-2.5" style={{ color: MUTED }}>Scouting "{sample?.username ?? 'a real account'}" — same real report, before playing them</p>
              {sampleLoading && <div className="flex justify-center py-4"><Loader2 className="w-4 h-4 animate-spin" style={{ color: MUTED }} /></div>}
              {sampleError && <p className="text-xs" style={{ color: '#e57373' }}>Couldn't load the sample right now.</p>}
              {sample && <SampleWeaknessList report={sample} frame="exploit" />}
            </div>
          )}

          <button
            onClick={onUpgradeClick}
            className="w-full py-3 rounded-xl text-sm font-black flex items-center justify-center gap-2"
            style={{ background: G, color: '#000' }}
          >
            See My Full Analysis <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
}
