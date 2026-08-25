import { VsPage } from '@/components/VsPage';

export default function VsAimchessPage() {
  return (
    <VsPage
      competitorName="Aimchess"
      title="ChessScout.net vs Aimchess — Honest Comparison"
      metaDescription="How ChessScout.net compares to Aimchess on price, features, and opponent scouting."
      canonicalPath="/vs/aimchess"
      intro="Aimchess is a well-established chess analytics tool that diagnoses weaknesses across six dimensions (opening accuracy, time management, resourcefulness, endgame conversion, advantage capitalization, and blunder prevention) and builds training around them. Here's how it compares to ChessScout.net, honestly."
      rows={[
        { feature: 'Price', us: '$5/mo or $55/yr', them: '~$8–14/mo (varies by billing)' },
        { feature: 'Free tier', us: true, them: 'Limited free reports' },
        { feature: 'Imports Chess.com & Lichess', us: true, them: true },
        { feature: 'Opponent scouting', us: true, them: true },
        { feature: 'Puzzles from your own games', us: true, them: true },
        { feature: 'Scan a board photo mid-game', us: true, them: false },
        { feature: 'Practice bots', us: true, them: false },
      ]}
      honestNote="Aimchess has been around longer and has a deep, well-regarded training system across more dimensions than ChessScout.net currently covers. Where ChessScout.net is different: it's priced lower, has a genuinely free tier (not just a limited trial report), and includes Scan Position and Practice Bots, which Aimchess doesn't offer. If you want the deepest, most established weakness-diagnosis system and don't mind paying more for it, Aimchess is a real option worth considering."
    />
  );
}
