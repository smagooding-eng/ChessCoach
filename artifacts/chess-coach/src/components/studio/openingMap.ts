// Content Studio: the "Opening Map" series. Six episodes, each a tree of opening
// names walked in order: the board plays out to a branch, the opening is named,
// then it winds back to try the next one. Names are the standard ones; every path
// is a legal move sequence from the start (checked in the Studio before it plays).
//
// Captions: *word* is shown in the accent colour.

export interface MapStep {
  /** Moves from the starting position, in SAN. */
  path: string;
  caption: string;
  /** The opening named at this step (it's added to the collection). */
  name?: string;
}
export interface MapEpisode {
  id: string; no: number; title: string;
  /** The position the episode is about, e.g. "1.e4 e5". */
  family: string;
  steps: MapStep[];
}

export const OPENING_MAP: MapEpisode[] = [
  {
    id: 'map-1', no: 1, title: 'The open games', family: '1.e4 e5',
    steps: [
      { path: '', caption: 'Every chess opening has a *name*.' },
      { path: '', caption: 'Six episodes. Every big one, *in order*.' },
      { path: '', caption: 'Episode 1: the *open* games.' },
      { path: 'e4', caption: 'White pushes the king\'s pawn: *e4*', name: "King's Pawn Opening" },
      { path: 'e4 e5', caption: 'Black copies with *e5*:', name: 'Open Game' },
      { path: 'e4 e5 f4', caption: 'Throw in the f-pawn and it\'s a *gambit*:', name: "King's Gambit" },
      { path: 'e4 e5 Nc3', caption: 'Knight to *c3* first:', name: 'Vienna Game' },
      { path: 'e4 e5 Nf3', caption: 'The most popular: knight *f3*, hitting e5.' },
      { path: 'e4 e5 Nf3 d6', caption: 'Black defends with *d6*:', name: 'Philidor Defense' },
      { path: 'e4 e5 Nf3 Nf6', caption: 'Black hits back with knight *f6*:', name: 'Petrov Defense' },
      { path: 'e4 e5 Nf3 Nc6', caption: 'Knight *c6* defends, and three big roads open.' },
      { path: 'e4 e5 Nf3 Nc6 Bc4', caption: 'Bishop *c4*, aiming at f7:', name: 'Italian Game' },
      { path: 'e4 e5 Nf3 Nc6 Bb5', caption: 'Bishop *b5*, hitting the knight:', name: 'Ruy Lopez' },
      { path: 'e4 e5 Nf3 Nc6 d4', caption: 'Open the center with *d4*:', name: 'Scotch Game' },
      { path: 'e4 e5 Nf3 Nc6 Nc3 Nf6', caption: 'Knight c3, knight *f6*:', name: 'Four Knights Game' },
      { path: 'e4 e5 Nf3 Nc6 Bc4 Nf6', caption: 'In the Italian, knight *f6*…', name: 'Two Knights Defense' },
      { path: 'e4 e5 Nf3 Nc6 Bc4 Bc5 b4', caption: '…or bishop c5, then *b4*!', name: 'Evans Gambit' },
    ],
  },
  {
    id: 'map-2', no: 2, title: 'The Sicilian', family: '1.e4 c5',
    steps: [
      { path: '', caption: 'Episode 2: the *Sicilian*.' },
      { path: 'e4', caption: 'White starts with *e4* again…' },
      { path: 'e4 c5', caption: '…and Black hits d4 from the side: *c5*', name: 'Sicilian Defense' },
      { path: 'e4 c5 c3', caption: '*c3*, to build a full center:', name: 'Alapin Variation' },
      { path: 'e4 c5 Nc3', caption: 'Knight *c3* keeps it closed:', name: 'Closed Sicilian' },
      { path: 'e4 c5 d4 cxd4 c3', caption: 'Give up a pawn for speed with *c3*:', name: 'Smith-Morra Gambit' },
      { path: 'e4 c5 Nf3 Nc6 Bb5', caption: 'Knight f3, knight c6, bishop *b5*:', name: 'Rossolimo Variation' },
      { path: 'e4 c5 Nf3 d6 d4 cxd4 Nxd4', caption: 'Or open it all up with *d4*:', name: 'Open Sicilian' },
      { path: 'e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 a6', caption: '*a6*, the most famous move in the Sicilian:', name: 'Najdorf Variation' },
      { path: 'e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 g6', caption: '*g6*, and the bishop breathes fire:', name: 'Dragon Variation' },
      { path: 'e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 e6', caption: '*e6*, a small, tough center:', name: 'Scheveningen Variation' },
      { path: 'e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 Nc6', caption: 'Knight *c6*:', name: 'Classical Sicilian' },
      { path: 'e4 c5 Nf3 Nc6 d4 cxd4 Nxd4 Nf6 Nc3 e5', caption: 'And *e5*, kicking the knight:', name: 'Sveshnikov Variation' },
    ],
  },
  {
    id: 'map-3', no: 3, title: 'The other answers to e4', family: '1.e4 …',
    steps: [
      { path: '', caption: 'Episode 3: Black doesn\'t have to play *e5* or *c5*.' },
      { path: 'e4', caption: 'Against *e4*, Black has more options:' },
      { path: 'e4 e6', caption: '*e6*, getting ready for d5:', name: 'French Defense' },
      { path: 'e4 c6', caption: '*c6*, the same idea, with the bishop free:', name: 'Caro-Kann Defense' },
      { path: 'e4 d5', caption: 'Hit e4 on move one with *d5*:', name: 'Scandinavian Defense' },
      { path: 'e4 Nf6', caption: 'Knight *f6*, inviting e5:', name: "Alekhine's Defense" },
      { path: 'e4 d6 d4 Nf6 Nc3 g6', caption: 'd6, knight f6, then *g6*:', name: 'Pirc Defense' },
      { path: 'e4 g6', caption: 'Straight to *g6*:', name: 'Modern Defense' },
      { path: 'e4 Nc6', caption: 'Knight *c6* on move one:', name: 'Nimzowitsch Defense' },
      { path: 'e4 b6', caption: 'And *b6*, for the queenside bishop:', name: "Owen's Defense" },
    ],
  },
  {
    id: 'map-4', no: 4, title: 'The Queen\'s Gambit family', family: '1.d4 d5',
    steps: [
      { path: '', caption: 'Episode 4: the *queen\'s* pawn.' },
      { path: 'd4', caption: 'White starts with *d4*:', name: "Queen's Pawn Opening" },
      { path: 'd4 d5', caption: 'Black answers *d5*:', name: 'Closed Game' },
      { path: 'd4 d5 c4', caption: 'Offer the c-pawn with *c4*:', name: "Queen's Gambit" },
      { path: 'd4 d5 c4 dxc4', caption: 'Take it:', name: "Queen's Gambit Accepted" },
      { path: 'd4 d5 c4 e6', caption: 'Hold d5 with *e6*:', name: "Queen's Gambit Declined" },
      { path: 'd4 d5 c4 c6', caption: 'Hold it with *c6*:', name: 'Slav Defense' },
      { path: 'd4 d5 c4 e6 Nc3 Nf6 Nf3 c6', caption: 'Both: e6 *and* c6:', name: 'Semi-Slav Defense' },
      { path: 'd4 d5 c4 e6 Nc3 c5', caption: 'e6, then hit back with *c5*:', name: 'Tarrasch Defense' },
      { path: 'd4 d5 c4 e5', caption: 'Gambit right back with *e5*:', name: 'Albin Countergambit' },
      { path: 'd4 d5 c4 Nc6', caption: 'Knight *c6*:', name: 'Chigorin Defense' },
      { path: 'd4 d5 Bf4', caption: 'No c4 at all: bishop *f4*:', name: 'London System' },
      { path: 'd4 d5 e4', caption: 'Or throw in *e4*:', name: 'Blackmar-Diemer Gambit' },
    ],
  },
  {
    id: 'map-5', no: 5, title: 'The Indian defenses', family: '1.d4 Nf6',
    steps: [
      { path: '', caption: 'Episode 5: the *Indian* defenses.' },
      { path: 'd4 Nf6', caption: 'Against d4, knight *f6*:', name: 'Indian Defense' },
      { path: 'd4 Nf6 c4 g6 Nc3 Bg7 e4 d6', caption: 'Fianchetto, then *d6*:', name: "King's Indian Defense" },
      { path: 'd4 Nf6 c4 g6 Nc3 d5', caption: 'g6, then strike with *d5*:', name: 'Grünfeld Defense' },
      { path: 'd4 Nf6 c4 e6 Nc3 Bb4', caption: 'e6, then pin with bishop *b4*:', name: 'Nimzo-Indian Defense' },
      { path: 'd4 Nf6 c4 e6 Nf3 b6', caption: 'e6, then *b6*:', name: "Queen's Indian Defense" },
      { path: 'd4 Nf6 c4 e6 Nf3 Bb4+', caption: 'Or check with bishop *b4*:', name: 'Bogo-Indian Defense' },
      { path: 'd4 Nf6 c4 e6 g3', caption: 'White fianchettoes with *g3*:', name: 'Catalan Opening' },
      { path: 'd4 Nf6 c4 c5 d5', caption: '*c5*, and White pushes past:', name: 'Benoni Defense' },
      { path: 'd4 Nf6 c4 c5 d5 b5', caption: 'Then give up a pawn with *b5*:', name: 'Benko Gambit' },
      { path: 'd4 Nf6 c4 e5', caption: 'Gambit straight away with *e5*:', name: 'Budapest Gambit' },
      { path: 'd4 Nf6 Bg5', caption: 'White skips c4: bishop *g5*:', name: 'Trompowsky Attack' },
    ],
  },
  {
    id: 'map-6', no: 6, title: 'The flank openings', family: 'Everything else',
    steps: [
      { path: '', caption: 'Episode 6: no *e4*, no *d4*.' },
      { path: 'c4', caption: '*c4*, from the side:', name: 'English Opening' },
      { path: 'Nf3', caption: 'Knight *f3* first:', name: 'Réti Opening' },
      { path: 'f4', caption: 'The f-pawn, *f4*:', name: "Bird's Opening" },
      { path: 'f4 e5', caption: 'Black gambits with *e5*:', name: "From's Gambit" },
      { path: 'd4 f5', caption: 'And against d4, Black\'s *f5*:', name: 'Dutch Defense' },
      { path: 'b3', caption: '*b3*, for the long diagonal:', name: 'Nimzo-Larsen Attack' },
      { path: 'b4', caption: '*b4*:', name: 'Polish Opening' },
      { path: 'Nc3', caption: 'Knight *c3*:', name: 'Van Geet Opening' },
      { path: 'g4', caption: 'And the wildest one: *g4*:', name: 'Grob Opening' },
    ],
  },
];
