export type OpeningLine = {
  id: string;
  name: string;
  eco: string;
  userColor: 'w' | 'b';
  description: string;
  ideas: string[];
  moves: string[];
};

export const OPENINGS: OpeningLine[] = [
  {
    id: 'italian-main',
    name: 'Italian Game (Giuoco Piano)',
    eco: 'C50',
    userColor: 'w',
    description: 'Classical king-pawn opening targeting f7 with a fast bishop development.',
    ideas: [
      'Develop knights before bishops',
      'Bishop to c4 eyes the f7 square',
      'Castle short quickly for king safety',
    ],
    moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5', 'c3', 'Nf6', 'd3', 'd6', 'O-O', 'O-O', 'Re1', 'a6', 'Nbd2', 'Ba7'],
  },
  {
    id: 'ruy-lopez-main',
    name: 'Ruy López — Closed',
    eco: 'C84',
    userColor: 'w',
    description: 'Pressure the c6 knight, build a strong pawn center, and slowly squeeze.',
    ideas: [
      'Pin the knight with Bb5',
      'Retreat to a4-b3 keeping bishop alive',
      'Aim for c3-d4 pawn break',
    ],
    moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6', 'Ba4', 'Nf6', 'O-O', 'Be7', 'Re1', 'b5', 'Bb3', 'd6', 'c3', 'O-O', 'h3', 'Na5'],
  },
  {
    id: 'queens-gambit-declined',
    name: "Queen's Gambit Declined",
    eco: 'D37',
    userColor: 'w',
    description: 'Solid central play with a long-term grip on d5 and queenside expansion.',
    ideas: [
      'Build with c4-d4 and Nf3-Nc3',
      'Pin black knight with Bg5',
      'Trade bishops on d3-c2 for queenside attack',
    ],
    moves: ['d4', 'd5', 'c4', 'e6', 'Nc3', 'Nf6', 'Nf3', 'Be7', 'Bg5', 'O-O', 'e3', 'h6', 'Bh4', 'b6', 'cxd5', 'Nxd5'],
  },
  {
    id: 'london-system',
    name: 'London System',
    eco: 'D02',
    userColor: 'w',
    description: 'Easy-to-learn setup. Same plan against almost any black response.',
    ideas: [
      'd4 + Bf4 + e3 + c3 + Nf3 + Nbd2',
      'Castle short, then expand on either flank',
      'Bishop to d3 eyes h7 for kingside attack',
    ],
    moves: ['d4', 'd5', 'Bf4', 'Nf6', 'e3', 'e6', 'Nf3', 'Bd6', 'Bg3', 'O-O', 'c3', 'Nbd7', 'Bd3', 'Re8', 'O-O', 'Nf8'],
  },
  {
    id: 'caro-kann-main',
    name: 'Caro-Kann Defense',
    eco: 'B12',
    userColor: 'b',
    description: 'Sturdy reply to 1.e4. Solid pawn structure, easy development for Black.',
    ideas: [
      'Build with c6 + d5 supporting the center',
      'Get the light-squared bishop out before e6',
      'Aim for c5 pawn break or solid structure',
    ],
    moves: ['e4', 'c6', 'd4', 'd5', 'Nc3', 'dxe4', 'Nxe4', 'Bf5', 'Ng3', 'Bg6', 'h4', 'h6', 'Nf3', 'Nd7'],
  },
  {
    id: 'sicilian-najdorf',
    name: 'Sicilian Defense — Najdorf',
    eco: 'B90',
    userColor: 'b',
    description: 'The sharpest reply to 1.e4. Counterattack with active piece play.',
    ideas: [
      'a6 controls b5 and prepares queenside expansion',
      'Aim for ...e5 or ...e6 setups',
      'Counterattack on the queenside while White attacks kingside',
    ],
    moves: ['e4', 'c5', 'Nf3', 'd6', 'd4', 'cxd4', 'Nxd4', 'Nf6', 'Nc3', 'a6', 'Be3', 'e5', 'Nb3', 'Be6', 'f3', 'Be7'],
  },
  {
    id: 'french-defense',
    name: 'French Defense — Classical',
    eco: 'C11',
    userColor: 'b',
    description: 'Solid Black setup. Closed center with a long strategic battle.',
    ideas: [
      'Lock the center with d5',
      'Develop knight to f6 challenging e4',
      'Plan ...c5 break against White center',
    ],
    moves: ['e4', 'e6', 'd4', 'd5', 'Nc3', 'Nf6', 'e5', 'Nfd7', 'f4', 'c5', 'Nf3', 'Nc6', 'Be3', 'cxd4', 'Nxd4', 'Bc5'],
  },
  {
    id: 'kings-indian',
    name: "King's Indian Defense",
    eco: 'E94',
    userColor: 'b',
    description: 'Hyper-modern Black setup. Let White take the center, then attack it.',
    ideas: [
      'Fianchetto bishop on g7 controls the long diagonal',
      'Castle short, then play ...e5 to challenge center',
      'Launch a kingside pawn storm with ...f5-f4-g4',
    ],
    moves: ['d4', 'Nf6', 'c4', 'g6', 'Nc3', 'Bg7', 'e4', 'd6', 'Nf3', 'O-O', 'Be2', 'e5', 'O-O', 'Nc6', 'd5', 'Ne7'],
  },
];
