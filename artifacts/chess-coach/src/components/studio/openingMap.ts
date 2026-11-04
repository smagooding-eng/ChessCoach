// Content Studio: "The Family Tree" series. Six parts, each the family tree of
// openings that grow from one starting point. The coach asks which road to take
// at each fork, the board plays it out, the opening's name is stamped on, and the
// tree under the board grows a branch. It ends with "how many did you know?".
// Names are the standard ones; every path is a legal move sequence from the start
// (checked before it plays).
//
// Captions: *word* is shown in the accent colour; {n} becomes the number of openings.

export interface MapStep {
  /** Moves from the starting position, in SAN. */
  path: string;
  caption: string;
  /** The opening named here (it's stamped on and joins the tree). */
  name?: string;
}
export interface MapEpisode {
  id: string; no: number; title: string;
  /** Where the tree starts, e.g. "1.e4 e5". */
  family: string;
  steps: MapStep[];
}

export const OPENING_MAP: MapEpisode[] = [
  {
    id: 'map-1', no: 1, title: 'The open games', family: '1.e4 e5',
    steps: [
      { path: '', caption: 'How many of these {n} openings do you know? *Count as you watch* 👇' },
      { path: 'e4', caption: 'It starts with *e4*…', name: "King's Pawn Opening" },
      { path: 'e4 e5', caption: '…and Black *mirrors* it.', name: 'Open Game' },
      { path: 'e4 e5', caption: "White's move. *Three big roads* from here 🤔" },
      { path: 'e4 e5 f4', caption: 'Road one: give up a pawn *right away*.', name: "King's Gambit" },
      { path: 'e4 e5 Nc3', caption: 'Road two: knight first, *f4 later*.', name: 'Vienna Game' },
      { path: 'e4 e5 Nf3', caption: 'Road three, the most popular: *hit e5*.' },
      { path: 'e4 e5 Nf3 d6', caption: 'Black can just *defend* it…', name: 'Philidor Defense' },
      { path: 'e4 e5 Nf3 Nf6', caption: '…or attack e4 *right back*.', name: 'Petrov Defense' },
      { path: 'e4 e5 Nf3 Nc6', caption: 'But the main answer is knight c6. Now *White picks again* 👇' },
      { path: 'e4 e5 Nf3 Nc6 Bc4', caption: 'Bishop c4, *staring at f7*.', name: 'Italian Game' },
      { path: 'e4 e5 Nf3 Nc6 Bb5', caption: 'Bishop b5, *pressuring the defender*.', name: 'Ruy Lopez' },
      { path: 'e4 e5 Nf3 Nc6 d4', caption: 'Smash the center open with *d4*.', name: 'Scotch Game' },
      { path: 'e4 e5 Nf3 Nc6 Nc3 Nf6', caption: 'Both sides just bring out *knights*.', name: 'Four Knights Game' },
      { path: 'e4 e5 Nf3 Nc6 Bc4 Nf6', caption: 'Back in the Italian, Black *hits e4*…', name: 'Two Knights Defense' },
      { path: 'e4 e5 Nf3 Nc6 Bc4 Bc5 b4', caption: '…or copies, and White *throws a pawn* at the bishop!', name: 'Evans Gambit' },
    ],
  },
  {
    id: 'map-2', no: 2, title: 'The Sicilian', family: '1.e4 c5',
    steps: [
      { path: '', caption: 'The Sicilian has {n} big branches. *Which is yours?* 👇' },
      { path: 'e4 c5', caption: 'e4, and Black fights *from the side* with c5.', name: 'Sicilian Defense' },
      { path: 'e4 c5 c3', caption: 'White wants d4 with backup: *c3*.', name: 'Alapin Variation' },
      { path: 'e4 c5 Nc3', caption: 'Or keeps it *closed* with knight c3.', name: 'Closed Sicilian' },
      { path: 'e4 c5 d4 cxd4 c3', caption: 'Or gives a pawn away *for speed*.', name: 'Smith-Morra Gambit' },
      { path: 'e4 c5 Nf3 Nc6 Bb5', caption: 'After knight c6, bishop b5 *goes after it*.', name: 'Rossolimo Variation' },
      { path: 'e4 c5 Nf3 d6 d4 cxd4 Nxd4', caption: 'The big one: *open it all up*.', name: 'Open Sicilian' },
      { path: 'e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 a6', caption: "a6: *Fischer's and Kasparov's* weapon.", name: 'Najdorf Variation' },
      { path: 'e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 g6', caption: 'g6: the bishop takes the *long diagonal*.', name: 'Dragon Variation' },
      { path: 'e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 e6', caption: 'e6: a small, *tough* center.', name: 'Scheveningen Variation' },
      { path: 'e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 Nc6', caption: 'Knight c6: the *classical* way.', name: 'Classical Sicilian' },
      { path: 'e4 c5 Nf3 Nc6 d4 cxd4 Nxd4 Nf6 Nc3 e5', caption: 'Or e5, *kicking the knight* away.', name: 'Sveshnikov Variation' },
    ],
  },
  {
    id: 'map-3', no: 3, title: 'The other answers to e4', family: '1.e4 …',
    steps: [
      { path: '', caption: 'e5 and c5 aren\'t the only answers to e4. How many of these {n} *do you know?* 👇' },
      { path: 'e4', caption: 'White plays *e4*…' },
      { path: 'e4 e6', caption: 'e6, ready to *hit back* with d5.', name: 'French Defense' },
      { path: 'e4 c6', caption: 'c6: same idea, but the *bishop stays free*.', name: 'Caro-Kann Defense' },
      { path: 'e4 d5', caption: 'd5, hitting e4 *immediately*.', name: 'Scandinavian Defense' },
      { path: 'e4 Nf6', caption: 'Knight f6, *daring* the pawn forward.', name: "Alekhine's Defense" },
      { path: 'e4 d6 d4 Nf6 Nc3 g6', caption: 'd6, knight f6, g6: *let White* take the center.', name: 'Pirc Defense' },
      { path: 'e4 g6', caption: 'g6 *straight away*.', name: 'Modern Defense' },
      { path: 'e4 Nc6', caption: 'Knight c6 on *move one*.', name: 'Nimzowitsch Defense' },
      { path: 'e4 b6', caption: 'b6, aiming the bishop *at e4*.', name: "Owen's Defense" },
    ],
  },
  {
    id: 'map-4', no: 4, title: "The Queen's Gambit family", family: '1.d4 d5',
    steps: [
      { path: '', caption: 'How many of these {n} openings *do you know?* Count as you watch 👇' },
      { path: 'd4', caption: 'The other king of first moves: *d4*.', name: "Queen's Pawn Opening" },
      { path: 'd4 d5', caption: 'Black *stops it cold* with d5.', name: 'Closed Game' },
      { path: 'd4 d5 c4', caption: 'White *offers a pawn*.', name: "Queen's Gambit" },
      { path: 'd4 d5 c4 dxc4', caption: 'Black can *take it*…', name: "Queen's Gambit Accepted" },
      { path: 'd4 d5 c4 e6', caption: '…hold d5 with *e6*…', name: "Queen's Gambit Declined" },
      { path: 'd4 d5 c4 c6', caption: '…or hold it with *c6*.', name: 'Slav Defense' },
      { path: 'd4 d5 c4 e6 Nc3 Nf6 Nf3 c6', caption: 'Or do *both*: e6 and c6.', name: 'Semi-Slav Defense' },
      { path: 'd4 d5 c4 e6 Nc3 c5', caption: 'e6, then *hit the center* with c5.', name: 'Tarrasch Defense' },
      { path: 'd4 d5 c4 e5', caption: 'Or gambit *straight back*: e5!', name: 'Albin Countergambit' },
      { path: 'd4 d5 c4 Nc6', caption: 'Knight c6: the *rebel* choice.', name: 'Chigorin Defense' },
      { path: 'd4 d5 Bf4', caption: 'Not into gambits? Bishop f4, *same setup every game*.', name: 'London System' },
      { path: 'd4 d5 e4', caption: 'Or go *wild* with e4.', name: 'Blackmar-Diemer Gambit' },
    ],
  },
  {
    id: 'map-5', no: 5, title: 'The Indian defenses', family: '1.d4 Nf6',
    steps: [
      { path: '', caption: 'Knight f6 against d4 opens up {n} openings. *How many do you know?* 👇' },
      { path: 'd4 Nf6', caption: 'Knight f6 keeps *every option* open.', name: 'Indian Defense' },
      { path: 'd4 Nf6 c4 g6 Nc3 Bg7 e4 d6', caption: 'Fianchetto, let White build, *then strike*.', name: "King's Indian Defense" },
      { path: 'd4 Nf6 c4 g6 Nc3 d5', caption: 'g6, then hit the center *with d5*.', name: 'Grünfeld Defense' },
      { path: 'd4 Nf6 c4 e6 Nc3 Bb4', caption: 'e6, then *pin* the knight.', name: 'Nimzo-Indian Defense' },
      { path: 'd4 Nf6 c4 e6 Nf3 b6', caption: 'White dodges the pin, so *b6*.', name: "Queen's Indian Defense" },
      { path: 'd4 Nf6 c4 e6 Nf3 Bb4+', caption: 'Or give *check* anyway.', name: 'Bogo-Indian Defense' },
      { path: 'd4 Nf6 c4 e6 g3', caption: 'White *fianchettoes* too.', name: 'Catalan Opening' },
      { path: 'd4 Nf6 c4 c5 d5', caption: 'c5, and White *pushes past* it.', name: 'Benoni Defense' },
      { path: 'd4 Nf6 c4 c5 d5 b5', caption: 'Then b5: a pawn *for pressure*.', name: 'Benko Gambit' },
      { path: 'd4 Nf6 c4 e5', caption: 'e5: a gambit on *move two*!', name: 'Budapest Gambit' },
      { path: 'd4 Nf6 Bg5', caption: 'Skip c4 and go *bishop g5*.', name: 'Trompowsky Attack' },
    ],
  },
  {
    id: 'map-6', no: 6, title: 'The flank openings', family: 'No e4, no d4',
    steps: [
      { path: '', caption: 'No e4, no d4. {n} openings *most players never learn* 👇' },
      { path: 'c4', caption: 'c4: fight for d5 *from the side*.', name: 'English Opening' },
      { path: 'Nf3', caption: 'Knight f3, keeping *every option* open.', name: 'Réti Opening' },
      { path: 'f4', caption: 'f4, *grabbing e5*.', name: "Bird's Opening" },
      { path: 'f4 e5', caption: 'And Black can gambit *right away*.', name: "From's Gambit" },
      { path: 'd4 f5', caption: "Black's version, against d4: *f5*.", name: 'Dutch Defense' },
      { path: 'b3', caption: 'b3, for the *long diagonal*.', name: 'Nimzo-Larsen Attack' },
      { path: 'b4', caption: 'b4: rare, but *sneaky*.', name: 'Polish Opening' },
      { path: 'Nc3', caption: 'Knight c3 *first*.', name: 'Van Geet Opening' },
      { path: 'g4', caption: 'And the *wildest* of all: g4.', name: 'Grob Opening' },
    ],
  },
];

/** Each named opening's parent in the tree: the closest earlier name whose moves it continues. */
export function mapTree(e: MapEpisode): { k: number; name: string; depth: number; parent: number | null }[] {
  const named = e.steps.map((s, k) => ({ k, s })).filter((x) => x.s.name);
  const moves = (p: string) => p.split(' ').filter(Boolean);
  const out: { k: number; name: string; depth: number; parent: number | null }[] = [];
  for (const { k, s } of named) {
    const mine = moves(s.path);
    let parent: number | null = null; let best = -1;
    for (const o of out) {
      const theirs = moves(e.steps[o.k].path);
      if (theirs.length < mine.length && theirs.length > best && theirs.every((m, i) => mine[i] === m)) { parent = o.k; best = theirs.length; }
    }
    const depth = parent == null ? 0 : (out.find((o) => o.k === parent)!.depth + 1);
    out.push({ k, name: s.name!, depth, parent });
  }
  // Tree order: each opening right under its parent (after its earlier siblings).
  const kids = (p: number | null) => out.filter((o) => o.parent === p);
  const ordered: typeof out = [];
  const walk = (p: number | null) => { for (const c of kids(p)) { ordered.push(c); walk(c.k); } };
  walk(null);
  return ordered;
}
