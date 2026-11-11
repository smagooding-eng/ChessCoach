// Opening traps for the trap reels, each explained step by step like the Family
// Tree: the setup, the natural-looking mistake (bait), the trap, the win.
// Every line was played through chess.js move by move; the ones marked as mate
// really end in checkmate.
export type TrapStepKind = 'intro' | 'setup' | 'bait' | 'trap' | 'win';
export interface TrapStep { upto: number; kind: TrapStepKind; text: string }
export interface Trap {
  id: string; name: string; opening: string;
  /** The side that springs the trap (and faces the viewer). */
  trapper: 'w' | 'b';
  san: string[];
  result: string; // the stamp at the end
  hook: string;
  steps: TrapStep[];
}

const s = (line: string) => line.split(' ');

export const TRAPS: Trap[] = [
  {
    id: 'legal', name: "Legal's Mate", opening: 'Philidor Defense', trapper: 'w', result: 'CHECKMATE',
    san: s('e4 e5 Nf3 d6 Bc4 Bg4 Nc3 g6 Nxe5 Bxd1 Bxf7+ Ke7 Nd5#'),
    hook: 'Give up your queen… and mate in 7',
    steps: [
      { upto: 0, kind: 'intro', text: "Legal's Mate: a queen sacrifice that has been catching players since 1750." },
      { upto: 5, kind: 'setup', text: "1.e4 e5 2.Nf3 d6 3.Bc4. White's bishop aims at f7, Black's weakest square." },
      { upto: 6, kind: 'setup', text: 'Bg4 pins the knight to the queen. Or does it?' },
      { upto: 8, kind: 'setup', text: 'Nc3, and Black plays g6. Too slow.' },
      { upto: 9, kind: 'trap', text: 'Nxe5!! White ignores the pin and leaves the queen hanging.' },
      { upto: 10, kind: 'bait', text: 'Bxd1?? Black grabs the queen. This is the mistake.' },
      { upto: 11, kind: 'setup', text: 'Bxf7+! The king is forced to e7.' },
      { upto: 13, kind: 'win', text: 'Nd5#. Three minor pieces mate the king.' },
    ],
  },
  {
    id: 'fishing', name: 'Fishing Pole Trap', opening: 'Ruy Lopez', trapper: 'b', result: 'CHECKMATE',
    san: s('e4 e5 Nf3 Nc6 Bb5 Nf6 O-O Ng4 h3 h5 hxg4 hxg4 Ne1 Qh4 f3 g3 d4 Qh2#'),
    hook: 'Put bait on the hook… and wait',
    steps: [
      { upto: 0, kind: 'intro', text: 'The Fishing Pole: Black puts bait on a hook in the Ruy Lopez.' },
      { upto: 7, kind: 'setup', text: 'Ruy Lopez. White castles, everything looks normal.' },
      { upto: 8, kind: 'setup', text: 'Ng4!? The knight jumps forward. This is the bait.' },
      { upto: 10, kind: 'setup', text: 'h3 kicks it… and h5! Black just leaves it there.' },
      { upto: 11, kind: 'bait', text: 'hxg4?? White takes the free knight.' },
      { upto: 12, kind: 'trap', text: 'hxg4! The h-file opens straight at White’s king.' },
      { upto: 14, kind: 'setup', text: 'Ne1 Qh4. The queen joins the rook on the h-file.' },
      { upto: 16, kind: 'setup', text: 'f3 g3! Mate on h2 can’t be stopped.' },
      { upto: 18, kind: 'win', text: 'Qh2#. Hooked.' },
    ],
  },
  {
    id: 'blackburne', name: 'Blackburne Shilling Trap', opening: 'Italian Game', trapper: 'b', result: 'CHECKMATE',
    san: s('e4 e5 Nf3 Nc6 Bc4 Nd4 Nxe5 Qg5 Nxf7 Qxg2 Rf1 Qxe4+ Be2 Nf3#'),
    hook: 'Leave a pawn hanging… on purpose',
    steps: [
      { upto: 0, kind: 'intro', text: 'The Blackburne Shilling Gambit: Black leaves a pawn hanging on purpose.' },
      { upto: 6, kind: 'setup', text: '3...Nd4!? looks like a beginner’s move. The e5 pawn is left undefended.' },
      { upto: 7, kind: 'setup', text: 'Nxe5. White takes the free pawn.' },
      { upto: 8, kind: 'trap', text: 'Qg5! The queen hits the knight AND the g2 pawn.' },
      { upto: 9, kind: 'bait', text: 'Nxf7?? White forks the queen and rook… and ignores g2.' },
      { upto: 10, kind: 'setup', text: 'Qxg2! Now the rook on h1 is attacked.' },
      { upto: 12, kind: 'setup', text: 'Rf1 Qxe4+. Check, and the bishop has to block.' },
      { upto: 14, kind: 'win', text: 'Be2 Nf3#. Smothered mate in 7 moves.' },
    ],
  },
  {
    id: 'siberian', name: 'Siberian Trap', opening: 'Smith-Morra Gambit', trapper: 'b', result: 'CHECKMATE',
    san: s('e4 c5 d4 cxd4 c3 dxc3 Nxc3 Nc6 Nf3 e6 Bc4 Qc7 O-O Nf6 Qe2 Ng4 h3 Nd4 Nxd4 Qh2#'),
    hook: 'How to punish the Smith-Morra',
    steps: [
      { upto: 0, kind: 'intro', text: 'The Siberian Trap: how Black punishes the Smith-Morra Gambit.' },
      { upto: 7, kind: 'setup', text: 'White gives up a pawn for fast development.' },
      { upto: 14, kind: 'setup', text: 'Black develops calmly. The queen on c7 is already eyeing h2.' },
      { upto: 16, kind: 'setup', text: 'Qe2 Ng4! The knight joins the queen on h2.' },
      { upto: 17, kind: 'bait', text: 'h3?? White kicks the knight. Natural… and losing.' },
      { upto: 18, kind: 'trap', text: 'Nd4!! It attacks the queen and lures away the knight that guards h2.' },
      { upto: 20, kind: 'win', text: 'Nxd4 Qh2#. Checkmate.' },
    ],
  },
  {
    id: 'stafford', name: 'Stafford Gambit Trap', opening: 'Petrov Defense', trapper: 'b', result: 'CHECKMATE',
    san: s('e4 e5 Nf3 Nf6 Nxe5 Nc6 Nxc6 dxc6 d3 Bc5 Bg5 Nxe4 Bxd8 Bxf2+ Ke2 Bg4#'),
    hook: 'Let them take your queen',
    steps: [
      { upto: 0, kind: 'intro', text: 'The Stafford Gambit: Black gives up a pawn and sets traps everywhere.' },
      { upto: 8, kind: 'setup', text: 'Black lets White take the knight and gets open lines for both bishops.' },
      { upto: 10, kind: 'setup', text: 'd3 Bc5. The bishop is already aiming at f2.' },
      { upto: 11, kind: 'bait', text: 'Bg5?? Pinning the knight to the queen. Looks strong.' },
      { upto: 12, kind: 'trap', text: 'Nxe4!! Black ignores the pin and gives up the queen.' },
      { upto: 13, kind: 'setup', text: 'Bxd8. White takes the queen…' },
      { upto: 15, kind: 'setup', text: 'Bxf2+! The king has to go to e2.' },
      { upto: 16, kind: 'win', text: 'Bg4#. Checkmate with two bishops and a knight.' },
    ],
  },
  {
    id: 'kieninger', name: 'Kieninger Trap', opening: 'Budapest Gambit', trapper: 'b', result: 'CHECKMATE',
    san: s('d4 Nf6 c4 e5 dxe5 Ng4 Bf4 Nc6 Nf3 Bb4+ Nbd2 Qe7 a3 Ngxe5 axb4 Nd3#'),
    hook: 'They take the free bishop… and get mated',
    steps: [
      { upto: 0, kind: 'intro', text: 'The Kieninger Trap: checkmate in 8 from the Budapest Gambit.' },
      { upto: 6, kind: 'setup', text: 'Black gives a pawn with e5 and goes after it with the knight.' },
      { upto: 10, kind: 'setup', text: 'Both sides develop. Black’s bishop comes out with check.' },
      { upto: 12, kind: 'setup', text: 'Nbd2 Qe7. The queen lines up on the e-file.' },
      { upto: 14, kind: 'trap', text: 'a3 Ngxe5! Black ignores the attacked bishop.' },
      { upto: 15, kind: 'bait', text: 'axb4?? White takes the free bishop.' },
      { upto: 16, kind: 'win', text: 'Nd3#! The e2 pawn can’t take: it’s pinned by the queen.' },
    ],
  },
  {
    id: 'carokann', name: 'Caro-Kann Smothered Mate', opening: 'Caro-Kann', trapper: 'w', result: 'CHECKMATE',
    san: s('e4 c6 d4 d5 Nc3 dxe4 Nxe4 Nd7 Qe2 Ngf6 Nd6#'),
    hook: 'Checkmate in 6 moves from the Caro-Kann',
    steps: [
      { upto: 0, kind: 'intro', text: 'A 6-move checkmate hiding in the main line of the Caro-Kann.' },
      { upto: 7, kind: 'setup', text: 'Main-line Caro-Kann. White’s knight takes over e4.' },
      { upto: 8, kind: 'setup', text: 'Nd7, a completely normal move.' },
      { upto: 9, kind: 'trap', text: 'Qe2!? A quiet move: the queen lines up behind the knight on the e-file.' },
      { upto: 10, kind: 'bait', text: 'Ngf6?? The most natural move in the world.' },
      { upto: 11, kind: 'win', text: 'Nd6#! The knight steps aside: the e7 pawn is pinned and the king is smothered.' },
    ],
  },
  {
    id: 'owen', name: "Owen's Defense Trap", opening: "Owen's Defense", trapper: 'w', result: 'CHECKMATE',
    san: s('e4 b6 d4 Bb7 Bd3 f5 exf5 Bxg2 Qh5+ g6 fxg6 Nf6 gxh7+ Nxh5 Bg6#'),
    hook: 'One pawn move opens the king',
    steps: [
      { upto: 0, kind: 'intro', text: 'Owen’s Defense: the trap that punishes …f5.' },
      { upto: 5, kind: 'setup', text: 'Black fianchettoes the bishop. It aims straight at the rook on h1.' },
      { upto: 6, kind: 'bait', text: 'f5?? Black attacks e4… and opens up the king.' },
      { upto: 8, kind: 'setup', text: 'exf5 Bxg2. Black goes for the rook.' },
      { upto: 9, kind: 'trap', text: 'Qh5+! The weakened kingside is wide open.' },
      { upto: 12, kind: 'setup', text: 'g6 fxg6 Nf6. Black attacks the queen…' },
      { upto: 15, kind: 'win', text: 'gxh7+ Nxh5 Bg6#! White gives up the queen and mates anyway.' },
    ],
  },
  {
    id: 'englund', name: 'Englund Gambit Trap', opening: 'Englund Gambit', trapper: 'b', result: 'CHECKMATE',
    san: s('d4 e5 dxe5 Nc6 Nf3 Qe7 Bf4 Qb4+ Bd2 Qxb2 Bc3 Bb4 Qd2 Bxc3 Qxc3 Qc1#'),
    hook: 'Checkmate in 8 against 1.d4',
    steps: [
      { upto: 0, kind: 'intro', text: 'The Englund Gambit Trap: checkmate in 8 against 1.d4.' },
      { upto: 6, kind: 'setup', text: 'Black gives a pawn, then puts the queen on e7 to win it back.' },
      { upto: 7, kind: 'setup', text: 'Bf4 defends the pawn. Natural.' },
      { upto: 8, kind: 'setup', text: 'Qb4+! Check, and the b2 pawn is attacked too.' },
      { upto: 10, kind: 'setup', text: 'Bd2 Qxb2. Now the rook on a1 is in trouble.' },
      { upto: 11, kind: 'bait', text: 'Bc3?? White attacks the queen.' },
      { upto: 12, kind: 'trap', text: 'Bb4!! Black pins the bishop instead of running.' },
      { upto: 15, kind: 'setup', text: 'Qd2 Bxc3 Qxc3…' },
      { upto: 16, kind: 'win', text: 'Qc1#! Checkmate on the back rank.' },
    ],
  },
  {
    id: 'elephant', name: 'Elephant Trap', opening: "Queen's Gambit Declined", trapper: 'b', result: 'BLACK WINS A PIECE',
    san: s('d4 d5 c4 e6 Nc3 Nf6 Bg5 Nbd7 cxd5 exd5 Nxd5 Nxd5 Bxd8 Bb4+ Qd2 Bxd2+ Kxd2 Kxd8'),
    hook: 'The pinned knight that isn’t pinned',
    steps: [
      { upto: 0, kind: 'intro', text: 'The Elephant Trap: Black “hangs” a pawn in the Queen’s Gambit.' },
      { upto: 7, kind: 'setup', text: 'Queen’s Gambit Declined. White pins the knight on f6.' },
      { upto: 10, kind: 'setup', text: 'Nbd7, then the center opens: cxd5 exd5.' },
      { upto: 11, kind: 'bait', text: 'Nxd5?? The knight on f6 is pinned, so it can’t take back… can it?' },
      { upto: 12, kind: 'trap', text: 'Nxd5!! It can. Black gives up the queen.' },
      { upto: 13, kind: 'setup', text: 'Bxd8. White takes the queen…' },
      { upto: 14, kind: 'setup', text: 'Bb4+! Check, and White has to give the queen back.' },
      { upto: 18, kind: 'win', text: 'Qd2 Bxd2+ Kxd2 Kxd8. Black is a whole piece up.' },
    ],
  },
  {
    id: 'lasker', name: 'Lasker Trap', opening: 'Albin Countergambit', trapper: 'b', result: 'BLACK WINS THE QUEEN',
    san: s('d4 d5 c4 e5 dxe5 d4 e3 Bb4+ Bd2 dxe3 Bxb4 exf2+ Ke2 fxg1=N+ Rxg1 Bg4+'),
    hook: 'Promote to a knight. Win the queen.',
    steps: [
      { upto: 0, kind: 'intro', text: 'The Lasker Trap: the famous trap with a knight promotion.' },
      { upto: 6, kind: 'setup', text: 'The Albin Countergambit. Black’s pawn on d4 cramps White.' },
      { upto: 7, kind: 'setup', text: 'e3, trying to break up the pawn.' },
      { upto: 10, kind: 'setup', text: 'Bb4+ Bd2 dxe3! The pawn keeps marching.' },
      { upto: 11, kind: 'bait', text: 'Bxb4?? White grabs the bishop.' },
      { upto: 12, kind: 'setup', text: 'exf2+! The king has to move.' },
      { upto: 14, kind: 'trap', text: 'Ke2 fxg1=N+!! Promoting to a KNIGHT, with check.' },
      { upto: 16, kind: 'win', text: 'Rxg1 Bg4+. The queen on d1 is lost.' },
    ],
  },
  {
    id: 'noah', name: "Noah's Ark Trap", opening: 'Ruy Lopez', trapper: 'b', result: 'BISHOP TRAPPED',
    san: s('e4 e5 Nf3 Nc6 Bb5 a6 Ba4 d6 d4 b5 Bb3 Nxd4 Nxd4 exd4 Qxd4 c5 Qd5 Be6 Qc6+ Bd7 Qd5 c4'),
    hook: 'A trap as old as the ark',
    steps: [
      { upto: 0, kind: 'intro', text: 'Noah’s Ark Trap: as old as the ark, and it still works.' },
      { upto: 9, kind: 'setup', text: 'Ruy Lopez. White strikes in the center with d4.' },
      { upto: 11, kind: 'setup', text: 'b5 Bb3. The bishop retreats into the corner.' },
      { upto: 15, kind: 'bait', text: 'Nxd4 Nxd4 exd4 Qxd4?? Taking back with the queen is the mistake.' },
      { upto: 16, kind: 'trap', text: 'c5! The queen is hit.' },
      { upto: 21, kind: 'setup', text: 'The queen runs, Black keeps chasing it with tempo.' },
      { upto: 22, kind: 'win', text: 'c4! The bishop on b3 is trapped in an “ark” of pawns.' },
    ],
  },
];

export const trapById = (id: string) => TRAPS.find((t) => t.id === id) ?? TRAPS[0];
