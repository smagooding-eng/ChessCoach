import { VsPage } from '@/components/VsPage';

export default function VsImproveMyChessPage() {
  return (
    <VsPage
      competitorName="Improve My Chess"
      title="ChessScout vs Improve My Chess — Honest Comparison"
      metaDescription="How ChessScout compares to Improve My Chess on price, features, and opponent scouting."
      canonicalPath="/vs/improve-my-chess"
      intro="Improve My Chess uses Stockfish plus an AI (Claude) to explain your blunders in plain English, and offers opponent scouting and personalized drills through a credit-based system — every feature spends from the same credit pool. Here's how it compares to ChessScout, honestly."
      rows={[
        { feature: 'Price', us: '$5/mo or $55/yr', them: '£4.99/mo or £39/yr, credit-based' },
        { feature: 'Free tier', us: 'Unlimited puzzles + limits elsewhere', them: '"Try the core experience" tier' },
        { feature: 'Plain-English blunder explanations', us: true, them: true },
        { feature: 'Opponent scouting', us: true, them: true },
        { feature: 'Personalized drills from your mistakes', us: true, them: true },
        { feature: 'Scan a board photo mid-game', us: true, them: false },
        { feature: 'Practice bots', us: true, them: false },
        { feature: 'Fixed monthly price (no credit tracking)', us: true, them: false },
      ]}
      honestNote="Improve My Chess is a genuinely similar product with a similar philosophy — using AI to explain mistakes in plain language rather than raw engine output. The biggest practical difference is pricing structure: ChessScout has one flat monthly price with generous free-tier limits, while Improve My Chess uses a shared credit pool where every analysis and scout draws down the same balance. If you'd rather pay a flat rate and not think about credits, that's where ChessScout differs most."
    />
  );
}
