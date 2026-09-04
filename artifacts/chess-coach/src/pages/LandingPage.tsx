import { useState } from 'react';
import { Loader2, TrendingDown, ArrowRight, Lock, Sparkles, BookOpen, Swords, Check, ChevronDown, ChevronUp, X, Crown } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { analyzeMoveQuality } from '@/lib/chess-bot';

const G = '#81b64c';
const TEXT = '#e8e6e3';
const MUTED = '#9e9b98';
const CARD = '#1c1b19';

interface DemoResult {
  gamesAnalyzed: number;
  totalMoves: number;
  blunders: number;
  mistakes: number;
  topOpening: string | null;
  blunderRate: number;
  totals: { total: number; wins: number; losses: number } | null;
}

// Runs analyzeMoveQuality() in small batches with a yield back to the
// browser between each one (via setTimeout 0), instead of one long
// synchronous loop. A depth-2 minimax per move is fast individually, but
// running 30-40 of them back-to-back on the main thread can visibly
// freeze the tab -- this keeps the UI responsive and lets the progress
// bar actually update while it works.
async function analyzeMovesInChunks(
  allMoves: { fenBefore: string; san: string }[],
  onProgress: (done: number, total: number) => void,
): Promise<{ quality: string }[]> {
  const BATCH_SIZE = 6;
  const results: { quality: string }[] = [];
  for (let i = 0; i < allMoves.length; i += BATCH_SIZE) {
    const batch = allMoves.slice(i, i + BATCH_SIZE);
    for (const move of batch) {
      try {
        const analysis = analyzeMoveQuality(move.fenBefore, move.san);
        results.push({ quality: analysis.quality });
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
// Practice Bots move feedback. Full AI-written explanations of *why* a
// move was a mistake remain a signed-in/paid feature -- this demo shows
// the pattern-finding value, not the full product.
export function HeroDemo({ onUpgradeClick }: { onUpgradeClick: () => void }) {
  const [username, setUsername] = useState('');
  const [platform, setPlatform] = useState<'chesscom' | 'lichess'>('chesscom');
  const [state, setState] = useState<'idle' | 'loading' | 'analyzing' | 'result' | 'error'>('idle');
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');
  const [result, setResult] = useState<DemoResult | null>(null);
  const [showSample, setShowSample] = useState(false);

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
      const allMoves: { fenBefore: string; san: string }[] = [];
      for (const game of data.games as { openingName: string | null; moves: { fenBefore: string; san: string }[] }[]) {
        if (game.openingName) {
          openingCounts[game.openingName] = (openingCounts[game.openingName] ?? 0) + 1;
        }
        allMoves.push(...game.moves);
      }

      const analyzed = await analyzeMovesInChunks(allMoves, (done, total) => {
        setProgress(Math.round((done / total) * 100));
      });

      const blunders = analyzed.filter((a) => a.quality === 'blunder').length;
      const mistakes = analyzed.filter((a) => a.quality === 'mistake').length;
      const topOpening = Object.entries(openingCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

      setResult({
        gamesAnalyzed: data.gamesAnalyzed,
        totalMoves: analyzed.length,
        blunders,
        mistakes,
        topOpening,
        blunderRate: analyzed.length > 0 ? Math.round((blunders / analyzed.length) * 1000) / 10 : 0,
        totals: data.totals ?? null,
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

          <div className="rounded-xl p-4 mb-4" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
            <p className="text-[11px] font-black uppercase tracking-wide mb-2.5 flex items-center gap-1.5" style={{ color: G }}>
              <Sparkles className="w-3.5 h-3.5" /> Pro unlocks for these exact games
            </p>
            <div className="space-y-2">
              <div className="flex items-start gap-2">
                <Lock className="w-3.5 h-3.5 shrink-0 mt-0.5" style={{ color: MUTED }} />
                <p className="text-xs" style={{ color: MUTED }}>Plain-English explanation of <strong style={{ color: TEXT }}>why</strong> each blunder happened, not just that it did</p>
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
            onClick={() => setShowSample((v) => !v)}
            className="w-full flex items-center justify-between gap-2 px-4 py-3 rounded-xl mb-4 text-xs font-bold"
            style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', color: TEXT }}
          >
            <span>See what a full Pro review looks like</span>
            {showSample ? <ChevronUp className="w-4 h-4" style={{ color: MUTED }} /> : <ChevronDown className="w-4 h-4" style={{ color: MUTED }} />}
          </button>

          {showSample && <SampleReviewCard />}

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

// A clearly-labeled EXAMPLE, not the visitor's real data -- this demo
// never calls OpenAI, so there's no real AI-written review to show for
// their own games. This mirrors the actual GameReplay move-list UI
// closely enough to set accurate expectations without misrepresenting
// what was just computed above (which is real, but move-quality only,
// not the AI explanation).
function SampleReviewCard() {
  const sampleMoves = [
    { num: 14, san: 'Nxe5??', quality: 'blunder', color: '#e57373', label: 'Blunder', note: 'This hangs the knight to Qxe5 — the queen was already eyeing e5 after your last move opened the diagonal.' },
    { num: 21, san: 'Rd1', quality: 'best', color: '#81b64c', label: 'Best', note: 'Centralizing the rook before trading queens — this was the top engine choice.' },
    { num: 27, san: 'f6?', quality: 'mistake', color: '#eaa631', label: 'Mistake', note: 'Weakens the king\'s shelter right when the opponent has a rook on the open g-file.' },
  ];
  return (
    <div className="rounded-xl p-4 mb-4" style={{ background: '#141413', border: '1px solid rgba(255,255,255,0.08)' }}>
      <div className="flex items-center justify-between mb-3">
        <p className="text-[10px] font-black uppercase tracking-wide" style={{ color: MUTED }}>Example — not your data</p>
        <span className="flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-md" style={{ background: 'rgba(129,182,76,0.15)', color: G }}>
          <Crown className="w-2.5 h-2.5" /> Pro
        </span>
      </div>
      <div className="space-y-2.5">
        {sampleMoves.map((m) => (
          <div key={m.num} className="flex items-start gap-2.5">
            <span className="text-xs font-mono shrink-0 w-14" style={{ color: TEXT }}>{m.num}. {m.san}</span>
            <div className="flex-1 min-w-0">
              <span className="text-[10px] font-black px-1.5 py-0.5 rounded" style={{ background: `${m.color}20`, color: m.color }}>{m.label}</span>
              <p className="text-[11px] mt-1 leading-relaxed" style={{ color: MUTED }}>{m.note}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
