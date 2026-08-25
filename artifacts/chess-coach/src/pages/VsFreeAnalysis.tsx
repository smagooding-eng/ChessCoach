import { VsPage } from '@/components/VsPage';

export default function VsFreeAnalysisPage() {
  return (
    <VsPage
      competitorName="Free Chess.com/Lichess Analysis"
      title="ChessScout.net vs Free Chess.com Analysis — Honest Comparison"
      metaDescription="How ChessScout.net compares to free game review on Chess.com and Lichess."
      canonicalPath="/vs/free-chess-analysis"
      intro="Chess.com's Game Review and Lichess's built-in analysis are both genuinely good, and free. So why pay for anything? Here's the honest answer."
      rows={[
        { feature: 'Reviews a single game', us: true, them: true },
        { feature: 'Finds patterns across ALL your games', us: true, them: false },
        { feature: 'Opponent scouting before you play', us: true, them: false },
        { feature: 'Puzzles built from your own blunders', us: true, them: false },
        { feature: 'Scan a board photo mid-game', us: true, them: false },
        { feature: 'Cost', us: 'Free tier, $5/mo for full access', them: 'Free (Lichess) / free with daily limit (Chess.com)' },
      ]}
      honestNote="If you only ever play one important game and want it reviewed, Chess.com or Lichess's free tools genuinely do that well — there's no need to pay for a single-game review. ChessScout.net exists for a different question: not 'what happened in this game' but 'what do I keep doing wrong across all my games.' That's the gap free single-game review doesn't fill."
    />
  );
}
