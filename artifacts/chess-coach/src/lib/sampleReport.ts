// Static, bundled sample data for the two "what Pro/Opponent Scout looks
// like" dropdowns on the landing page. This used to be a live API call to
// /api/demo/sample-report -- pulled from a real account's real, reviewed
// games -- but since this content is a fixed demo sample rather than
// something that varies per visitor, there's no reason to hit the
// database (or even make a network request) every time someone opens the
// dropdown. The values below are that same real snapshot, captured once
// and bundled directly, so it's available instantly with no loading
// state.
//
// Trade-off: this won't update automatically if the source account's
// weaknesses change over time. If it should reflect fresher data later,
// regenerate this file from a real account rather than editing the
// numbers by hand.

export interface SampleWeakness {
  category: string;
  severity: string;
  description: string;
  frequency: number;
  examples: string[];
  previewFen: string | null;
}

export interface SampleReport {
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

export const SAMPLE_REPORT: SampleReport = {
  totalGames: 1091,
  wins: 502,
  losses: 548,
  draws: 41,
  avgRating: 567,
  biggestOpportunity: 'Tactical Awareness',
  severityCounts: { Critical: 0, High: 2, Medium: 2, Low: 0 },
  topWeaknessAreas: [
    { category: 'Tactical Awareness', count: 2 },
    { category: 'Opening Preparation', count: 1 },
    { category: 'Positional Play', count: 1 },
  ],
  favoriteOpenings: [
    { opening: 'Italian Game', games: 8, winRate: 50 },
    { opening: 'Sicilian Defense', games: 6, winRate: 33 },
    { opening: 'English Opening: Agincourt Defense', games: 4, winRate: 25 },
  ],
  phaseAccuracy: {
    opening: { accuracy: 62, moves: 3299 },
    middlegame: { accuracy: 0, moves: 0 },
    endgame: { accuracy: 0, moves: 0 },
    gamesAnalyzed: 236,
  },
  weaknesses: [
    {
      category: 'Tactical Awareness',
      severity: 'High',
      frequency: 1.0,
      description: "You've blundered 382 times across 237 reviewed games — about 1.6 per game on average.",
      examples: ['Game 2: 9...Nd4', 'Game 3: 7.d6', 'Game 3: 8.Qf4'],
      previewFen: null,
    },
    {
      category: 'Tactical Awareness',
      severity: 'High',
      frequency: 0.44,
      description: "You've let a winning position slip away in 105 of your last 237 reviewed games (44%) — the engine confirms you were winning before a mistake handed back the advantage.",
      examples: ['Game 1: 12...e6', 'Game 1: 20...e5', 'Game 12: 22...Rh5'],
      previewFen: null,
    },
    {
      category: 'Positional Play',
      severity: 'Medium',
      frequency: 0.15,
      description: 'Across your 237 reviewed games, 15% of your middlegame moves were inaccuracies or worse, versus 10% in the opening. This is your most costly phase.',
      examples: ['Game 1: 21...Nxh2+', 'Game 2: 18...f6', 'Game 3: 16.Qh5'],
      previewFen: null,
    },
    {
      category: 'Opening Preparation',
      severity: 'Medium',
      frequency: 0.02,
      description: 'In the English Opening Agincourt Defense 2.b3 d5 (4 games), 24% of your moves were inaccuracies or worse — noticeably above your 12% overall rate.',
      examples: ['Game 128: 5.e4', 'Game 128: 9.Bxh6', 'Game 128: 10.Nd2'],
      previewFen: null,
    },
  ],
};
