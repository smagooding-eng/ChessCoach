export interface EloTier {
  label: string;
  range: string;
  min: number;
  max: number;
  color: string;
  bgColor: string;
  borderColor: string;
  icon: string;
  nextTier: string;
  tips: string[];
}

export const ELO_TIERS: EloTier[] = [
  {
    label: 'Beginner',
    range: '0 – 800',
    min: 0,
    max: 800,
    color: 'text-stone-400',
    bgColor: 'bg-stone-500/10',
    borderColor: 'border-stone-500/30',
    icon: '🌱',
    nextTier: 'Intermediate (800+)',
    tips: [
      'Learn how every piece moves and practices simple checkmates (King + Queen vs King, King + Rook vs King).',
      'Always look at your opponent\'s last move before making yours — ask "what is their threat?"',
      'Develop your knights and bishops early. Move each piece once before moving any piece twice.',
      'Control the center with pawns (e4/d4) and aim to castle within the first 10 moves.',
      'Avoid moving your queen out too early — it can be chased around and you\'ll lose tempo.',
      'Practice "counting attackers vs defenders" before every capture to avoid losing material.',
    ],
  },
  {
    label: 'Intermediate',
    range: '800 – 1200',
    min: 800,
    max: 1200,
    color: 'text-emerald-400',
    bgColor: 'bg-emerald-500/10',
    borderColor: 'border-emerald-500/30',
    icon: '♟️',
    nextTier: 'Advanced (1200+)',
    tips: [
      'Start every game with a solid opening plan you know well (e.g. Italian Game, London System) rather than improvising.',
      'After every opponent move, do a "blunder check" — scan for any undefended pieces or one-move tactics.',
      'Learn basic tactical patterns: forks, pins, skewers, discovered attacks, and back-rank mates.',
      'Trade pieces when you\'re ahead in material, avoid trades when you\'re behind.',
      'Pay attention to pawn structure — avoid doubled, isolated, and backward pawns.',
      'In the endgame, activate your king! Walk it toward the center to support your pawns.',
    ],
  },
  {
    label: 'Advanced',
    range: '1200 – 1600',
    min: 1200,
    max: 1600,
    color: 'text-blue-400',
    bgColor: 'bg-blue-500/10',
    borderColor: 'border-blue-500/30',
    icon: '🏰',
    nextTier: 'Expert (1600+)',
    tips: [
      'Build a proper opening repertoire: know at least 8-10 moves deep in your main lines for both colors.',
      'Calculate forcing sequences (checks, captures, threats) before quiet moves — forced moves narrow your opponent\'s options.',
      'Learn key endgame positions: Lucena & Philidor (rook endings), king + pawn vs king, and opposite-colored bishop draws.',
      'Improve piece coordination — look for ways to make your pieces work together on the same squares.',
      'Use prophylaxis: before executing your plan, ask what your opponent wants to do and prevent it.',
      'Review your losses with an engine — focus on the moment you went from equal to losing and understand why.',
    ],
  },
  {
    label: 'Expert',
    range: '1600 – 2000',
    min: 1600,
    max: 2000,
    color: 'text-purple-400',
    bgColor: 'bg-purple-500/10',
    borderColor: 'border-purple-500/30',
    icon: '⚔️',
    nextTier: 'Master (2000+)',
    tips: [
      'Study classical games by grandmasters (Capablanca, Fischer, Karpov) to internalize positional concepts.',
      'Work on your weakest phase: if your openings are solid, focus endgame technique; if tactics are strong, study strategy.',
      'Deepen opening preparation: understand the middlegame plans that arise from your openings, not just memorized moves.',
      'Master complex endgames: rook + pawn endings, knight vs bishop, and queen endings with pawns.',
      'Develop a pre-move thought process: check for threats → identify candidate moves → calculate → evaluate → decide.',
      'Time management: allocate more time for critical positions and learn to play faster in clear positions.',
    ],
  },
  {
    label: 'Master',
    range: '2000+',
    min: 2000,
    max: 9999,
    color: 'text-amber-400',
    bgColor: 'bg-amber-500/10',
    borderColor: 'border-amber-500/30',
    icon: '👑',
    nextTier: 'Grandmaster (2200+)',
    tips: [
      'Study modern grandmaster games to stay current with theoretical trends and novelties.',
      'Work with a coach or training partner for objective feedback on blind spots in your play.',
      'Build a deep understanding of pawn structures — know typical plans for every structure you encounter.',
      'Improve calculation accuracy: practice long forced lines (5-10 moves) without moving pieces.',
      'Psychological preparation: learn to handle pressure, time trouble, and recover from mistakes within games.',
      'Analyze your own games deeply before checking the engine — build independent evaluation skills.',
    ],
  },
];

export function getTierForRating(rating: number): EloTier {
  for (const tier of ELO_TIERS) {
    if (rating < tier.max) return tier;
  }
  return ELO_TIERS[ELO_TIERS.length - 1];
}
