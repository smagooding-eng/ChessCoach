// Beginner path -- the same learn-then-practise flow as Chess for Kids,
// written for older students (teens and adults) who are new to chess.
//
// Each unit is a short run of lessons. A lesson opens with a few lines of
// explanation, then a set of exercises built from the same level kinds the
// kids section uses, plus real-position ones (best move, escape check,
// legal-move taps, quick quizzes). White is always the student's side.

import type { Level, BoardPiece, PieceType } from '@/lib/kids/levels';

export interface Lesson {
  id: string;
  title: string;
  /** Short paragraphs shown before the exercises. */
  intro: string[];
  /** Optional diagram for the intro: a FEN, with squares to highlight. */
  diagram?: { fen: string; highlight?: string[]; moves?: string; arrows?: { from: string; to: string; color?: 'good' | 'bad' | 'info' | 'warn' }[] };
  exercises: Level[];
}

export interface Unit {
  id: string;
  title: string;
  blurb: string;
  icon: PieceType;
  lessons: Lesson[];
}

const me = (type: PieceType, sq: string): BoardPiece => ({ type, side: 'w', sq });
const op = (type: PieceType, sq: string): BoardPiece => ({ type, side: 'b', sq });
const targets = (list: string[]) => list.map((sq) => ({ sq, kind: 'star' as const }));

export const UNITS: Unit[] = [
  {
    id: 'board', title: 'The Board', blurb: 'Squares, files, ranks and the starting position.', icon: 'r',
    lessons: [
      {
        id: 'board-1', title: 'Every square has a name',
        intro: [
          'A chessboard has 64 squares in an 8 × 8 grid.',
          'Columns are called files and are lettered a to h from White\'s left. Rows are called ranks and are numbered 1 to 8 from White\'s side.',
          'A square\'s name is its file then its rank, so the square where file e (blue arrow) meets rank 4 (orange arrow) is "e4".',
        ],
        diagram: { fen: '8/8/8/8/8/8/8/8 w - - 0 1', highlight: ['e4'], arrows: [{ from: 'e1', to: 'e4', color: 'info' }, { from: 'a4', to: 'e4', color: 'warn' }] },
        exercises: [
          { id: 'bd1', kind: 'tapSquare', title: 'Find e4', say: 'Tap the square e4.', squares: ['e4'] },
          { id: 'bd2', kind: 'tapSquare', title: 'Two corners', say: 'Tap the two corner squares a8 and h1.', squares: ['a8', 'h1'] },
          { id: 'bd3', kind: 'tapSquare', title: 'Three squares', say: 'Tap c6, f3 and d7.', squares: ['c6', 'f3', 'd7'] },
          { id: 'bd4', kind: 'quiz', title: 'Files and ranks', say: 'Quick check.', question: 'What is a "file"?',
            options: ['A column, lettered a–h', 'A row, numbered 1–8', 'A diagonal line of squares'], correct: 0,
            explain: 'Files are the columns (a–h); ranks are the rows (1–8).' },
        ],
      },
      {
        id: 'board-2', title: 'Setting up the pieces',
        intro: [
          'Turn the board so each player has a light square in the bottom-right corner: "light on the right".',
          'White\'s pieces start on ranks 1 and 2, Black\'s on ranks 7 and 8. Pawns fill the second row; Rooks go in the corners, then Knights, then Bishops.',
          'The Queen starts on her own color (the White Queen on light d1), and the King goes next to her. White always moves first.',
        ],
        diagram: { fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', highlight: ['d1', 'e1'] },
        exercises: [
          { id: 'bd5', kind: 'quiz', title: 'Which corner?', say: 'Quick check.', question: 'Which corner square should be light (white)?',
            options: ['Bottom-right', 'Bottom-left', 'It doesn\'t matter'], correct: 0, explain: '"Light on the right": the bottom-right square, h1 for White, is light.' },
          { id: 'bd6', kind: 'quiz', title: 'The Queen', say: 'Quick check.', question: 'Where does the White Queen start?',
            options: ['d1', 'e1', 'd8'], correct: 0, explain: 'The Queen starts on her own color: the White Queen on the light square d1.',
            fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1' },
          { id: 'bd7', kind: 'quiz', title: 'First move', say: 'Quick check.', question: 'Who makes the first move of the game?',
            options: ['White', 'Black', 'Whoever wins a coin toss'], correct: 0, explain: 'White always moves first. Players then take turns, one move each.' },
          { id: 'bd8', kind: 'tapSquare', title: 'Find the Kings', say: 'Tap the squares where the two Kings start.', squares: ['e1', 'e8'],
            fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1' },
        ],
      },
    ],
  },
  {
    id: 'rook', title: 'The Rook', blurb: 'Straight lines, and what blocks them.', icon: 'r',
    lessons: [
      {
        id: 'rook-1', title: 'How the Rook moves',
        intro: [
          'The Rook moves any number of squares along a rank or a file: up, down, left or right.',
          'It can\'t jump. Any piece in the way stops it. It can capture the first enemy piece it runs into by landing on its square, but never goes past it.',
          'A Rook is worth about 5 points.',
        ],
        diagram: { fen: '8/8/8/8/3R4/8/8/8 w - - 0 1', moves: 'd4' },
        exercises: [
          { id: 'rk1', kind: 'collect', title: 'Reach the targets', say: 'Move the Rook onto every target. Take as many moves as you need.',
            pieces: [me('r', 'd4')], shapes: targets(['d8', 'h8', 'h2']) },
          { id: 'rk2', kind: 'tapAll', title: 'What can it reach?', say: 'Tap every target the Rook could capture in ONE move. Your own pawns block the way.',
            pieces: [me('r', 'e4'), me('p', 'e6'), me('p', 'c4')], shapes: targets(['e8', 'h4', 'a4', 'e1', 'e5', 'g6']) },
          { id: 'rk3', kind: 'tapAll', title: 'Capture', say: 'Tap every black piece the Rook could capture in one move.',
            pieces: [me('r', 'd3'), op('n', 'd7'), op('b', 'g3'), op('p', 'f5'), op('r', 'a3'), op('q', 'b6')] },
          { id: 'rk4', kind: 'collect', title: 'Clear the board', say: 'Capture every black piece.',
            pieces: [me('r', 'b2'), op('p', 'b7'), op('n', 'g7'), op('b', 'g3')] },
        ],
      },
    ],
  },
  {
    id: 'bishop', title: 'The Bishop', blurb: 'Diagonals, and why a Bishop keeps its color.', icon: 'b',
    lessons: [
      {
        id: 'bishop-1', title: 'How the Bishop moves',
        intro: [
          'The Bishop moves any number of squares diagonally.',
          'Because it only moves diagonally, a Bishop stays on the color it starts on for the whole game. Each side has one light-squared and one dark-squared Bishop.',
          'A Bishop is worth about 3 points.',
        ],
        diagram: { fen: '8/8/8/8/3B4/8/8/8 w - - 0 1', moves: 'd4' },
        exercises: [
          { id: 'bp1', kind: 'collect', title: 'Reach the targets', say: 'Move the Bishop onto every target.',
            pieces: [me('b', 'f1')], shapes: targets(['b5', 'e8', 'h3']) },
          { id: 'bp2', kind: 'tapAll', title: 'What can it reach?', say: 'Tap every target the Bishop could capture in one move.',
            pieces: [me('b', 'e4'), me('p', 'f5'), me('p', 'c2')], shapes: targets(['h7', 'b7', 'b1', 'h1', 'e8']) },
          { id: 'bp3', kind: 'tapAll', title: 'Light and dark', say: 'Tap every target this Bishop could capture in one move. Watch the square colors.',
            pieces: [me('b', 'c4')], shapes: targets(['e6', 'f7', 'a6', 'a2', 'd5', 'c6', 'e2']) },
          { id: 'bp4', kind: 'tapAll', title: 'Capture', say: 'Tap every black piece the Bishop could capture.',
            pieces: [me('b', 'e3'), op('r', 'b6'), op('n', 'h6'), op('p', 'c1'), op('q', 'e6'), op('b', 'g1')] },
        ],
      },
    ],
  },
  {
    id: 'queen', title: 'The Queen', blurb: 'Rook plus Bishop: the strongest piece.', icon: 'q',
    lessons: [
      {
        id: 'queen-1', title: 'How the Queen moves',
        intro: [
          'The Queen combines the Rook and the Bishop: any number of squares along a rank, file or diagonal.',
          'She is the most powerful piece, worth about 9 points, so losing her for less is usually a disaster.',
        ],
        diagram: { fen: '8/8/8/3Q4/8/8/8/8 w - - 0 1', moves: 'd5' },
        exercises: [
          { id: 'qn1', kind: 'collect', title: 'Reach the targets', say: 'Move the Queen onto every target.',
            pieces: [me('q', 'd1')], shapes: targets(['h5', 'a5', 'a8', 'e8']) },
          { id: 'qn2', kind: 'tapAll', title: 'Eight directions', say: 'Tap every target the Queen could capture in one move.',
            pieces: [me('q', 'd5')], shapes: targets(['d8', 'h1', 'a8', 'a5', 'f4', 'b2', 'g5', 'e7']) },
          { id: 'qn3', kind: 'tapAll', title: 'Blocked lines', say: 'Your own pieces block the Queen. Tap only what she can reach.',
            pieces: [me('q', 'e4'), me('p', 'e6'), me('n', 'c6'), me('p', 'f4')], shapes: targets(['e8', 'h7', 'a8', 'a4', 'h4', 'b1', 'g2']) },
          { id: 'qn4', kind: 'tapAll', title: 'Capture', say: 'Tap every black piece the Queen could capture.',
            pieces: [me('q', 'd4'), op('r', 'd8'), op('n', 'd6'), op('b', 'g7'), op('p', 'b6'), op('q', 'f3'), op('k', 'h4')] },
        ],
      },
    ],
  },
  {
    id: 'knight', title: 'The Knight', blurb: 'The L-shaped jump that ignores blockers.', icon: 'n',
    lessons: [
      {
        id: 'knight-1', title: 'How the Knight moves',
        intro: [
          'The Knight moves in an L: two squares along a rank or file, then one square to the side.',
          'It is the only piece that jumps. Pieces in between don\'t matter; only the landing square does.',
          'A Knight always lands on the opposite color to where it started. It is worth about 3 points.',
        ],
        diagram: { fen: '8/8/8/8/3N4/8/8/8 w - - 0 1', moves: 'd4' },
        exercises: [
          { id: 'kn1', kind: 'collect', title: 'Two jumps', say: 'Move the Knight onto the target. It takes two moves.',
            pieces: [me('n', 'g1')], shapes: targets(['g5']) },
          { id: 'kn2', kind: 'tapAll', title: 'Where can it land?', say: 'Tap every target the Knight could capture in one move.',
            pieces: [me('n', 'd4')], shapes: targets(['e6', 'f3', 'b5', 'c2', 'd6', 'f4', 'b3']) },
          { id: 'kn3', kind: 'tapAll', title: 'Jumping over', say: 'The Knight is boxed in by its own pawns. Can it still capture? Tap every target it can reach.',
            pieces: [me('n', 'e5'), me('p', 'e6'), me('p', 'f6'), me('p', 'f5'), me('p', 'f4'), me('p', 'e4'), me('p', 'd4'), me('p', 'd5'), me('p', 'd6')],
            shapes: targets(['f7', 'g4', 'c4', 'd7', 'e7', 'g5']) },
          { id: 'kn4', kind: 'tapAll', title: 'Capture', say: 'Tap every black piece the Knight could capture.',
            pieces: [me('n', 'e4'), op('p', 'f6'), op('r', 'c5'), op('b', 'e6'), op('q', 'g3'), op('n', 'd2')] },
        ],
      },
    ],
  },
  {
    id: 'king', title: 'The King', blurb: 'One step at a time, and never into check.', icon: 'k',
    lessons: [
      {
        id: 'king-1', title: 'How the King moves',
        intro: [
          'The King moves one square in any direction.',
          'The King may never move to a square the opponent attacks. That would put him in check, which is against the rules.',
          'The whole game is about the King. You can\'t afford to lose him, so he has no point value.',
        ],
        diagram: { fen: '8/8/8/8/4K3/8/8/8 w - - 0 1', moves: 'e4' },
        exercises: [
          { id: 'kg1', kind: 'collect', title: 'A short walk', say: 'Walk the King to the target, one square at a time.',
            pieces: [me('k', 'c8')], shapes: targets(['g6']) },
          { id: 'kg2', kind: 'tapAll', title: 'One step', say: 'Tap every target the King could capture in one move.',
            pieces: [me('k', 'e4')], shapes: targets(['e5', 'f3', 'd4', 'e6', 'c4', 'g4', 'd3']) },
          { id: 'kg3', kind: 'tapLegal', title: 'Safe squares', say: 'The black Rook controls the 5th rank. Tap every square your King can legally move to.',
            fen: '7k/8/8/r7/4K3/8/8/8 w - - 0 1', from: 'e4' },
          { id: 'kg4', kind: 'tapLegal', title: 'More danger', say: 'Now a Rook and a Bishop. Tap every legal King move.',
            fen: '7k/8/8/r7/4K3/8/8/6b1 w - - 0 1', from: 'e4' },
        ],
      },
    ],
  },
  {
    id: 'pawn', title: 'The Pawn', blurb: 'Forward moves, diagonal captures, promotion, en passant.', icon: 'p',
    lessons: [
      {
        id: 'pawn-1', title: 'How the Pawn moves',
        intro: [
          'A Pawn moves straight forward one square. On its very first move it may go two squares instead.',
          'In the diagram the Pawn on e4 can step to e5 (blue arrow), or capture either black Pawn diagonally (green arrows).',
          'Unlike every other piece, it captures differently from how it moves: one square diagonally forward.',
          'A piece directly in front blocks a Pawn completely. Pawns never move backwards. Each Pawn is worth 1 point.',
        ],
        diagram: { fen: '8/8/8/3p1p2/4P3/8/8/8 w - - 0 1', moves: 'e4' },
        exercises: [
          { id: 'pw1', kind: 'collect', title: 'Two squares', say: 'From its starting square a Pawn can move two. Reach the target in one move.',
            pieces: [me('p', 'd2')], shapes: targets(['d4']) },
          { id: 'pw2', kind: 'tapAll', title: 'Diagonal captures', say: 'Tap every target the Pawn could capture in one move.',
            pieces: [me('p', 'e4')], shapes: targets(['d5', 'f5', 'e5', 'd3', 'e6']) },
          { id: 'pw3', kind: 'tapAll', title: 'Capture', say: 'Tap every black piece the Pawn could capture.',
            pieces: [me('p', 'e5'), op('n', 'd6'), op('r', 'e6'), op('b', 'f6'), op('q', 'd4'), op('p', 'f4')] },
          { id: 'pw4', kind: 'collect', title: 'Pawn chain', say: 'Capture both black pieces with the Pawn.',
            pieces: [me('p', 'c3'), op('n', 'd4'), op('b', 'e5')] },
        ],
      },
      {
        id: 'pawn-2', title: 'Promotion and en passant',
        intro: [
          'Promotion: a Pawn that reaches the far rank must turn into a Queen, Rook, Bishop or Knight. Almost always you choose a Queen.',
          'En passant: if an enemy Pawn moves two squares and lands right beside your Pawn, you may capture it as if it had moved only one. You must do it immediately or the chance is gone.',
          'In the diagram, Black\'s Pawn just jumped d7→d5 (orange arrow) to land beside yours. White captures en passant by moving e5→d6 (green arrow), and the Pawn on d5 is removed.',
        ],
        diagram: { fen: 'k7/8/8/3pP3/8/8/8/4K3 w - d6 0 2', highlight: ['d6'], arrows: [{ from: 'd7', to: 'd5', color: 'warn' }, { from: 'e5', to: 'd6', color: 'good' }] },
        exercises: [
          { id: 'pw5', kind: 'best', title: 'Promote', say: 'Push the Pawn to the last rank and promote it.',
            fen: '8/4P3/8/8/8/2k5/8/4K3 w - - 0 1', answers: ['e8=Q'], explain: 'e8=Q: a brand new Queen.' },
          { id: 'pw6', kind: 'best', title: 'Capture and promote', say: 'Promote, and win the black Rook at the same time.',
            fen: '3r4/4P3/8/8/8/2k5/8/4K3 w - - 0 1', answers: ['exd8=Q'],
            wrong: { 'e8=Q': 'That promotes, but the Rook just takes your new Queen. Capture as you promote.' },
            explain: 'exd8=Q: the Pawn captures diagonally onto the last rank and becomes a Queen.' },
          { id: 'pw7', kind: 'best', title: 'En passant', say: 'Black just played d7-d5, landing beside your Pawn. Capture it en passant.',
            fen: 'k7/8/8/3pP3/8/8/8/4K3 w - d6 0 2', answers: ['exd6'],
            explain: 'exd6 e.p.: your Pawn moves diagonally to d6 and the black Pawn on d5 is removed.' },
          { id: 'pw8', kind: 'quiz', title: 'Promotion choice', say: 'Quick check.', question: 'When a Pawn promotes, which piece can it NOT become?',
            options: ['A King', 'A Knight', 'A Queen'], correct: 0, explain: 'A Pawn can become a Queen, Rook, Bishop or Knight, never a King or a Pawn.' },
        ],
      },
    ],
  },
  {
    id: 'values', title: 'Piece Values', blurb: 'Counting material and making good trades.', icon: 'q',
    lessons: [
      {
        id: 'values-1', title: 'What pieces are worth',
        intro: [
          'Players use a simple point scale to compare pieces: Pawn 1, Knight 3, Bishop 3, Rook 5, Queen 9.',
          'Before you capture, ask two questions. What am I taking? Can it be taken back? Swapping your 3-point Knight for a 5-point Rook wins material. Giving your Queen for a Rook loses it.',
        ],
        exercises: [
          { id: 'vl1', kind: 'quiz', title: 'Rook or Bishop', say: 'Quick check.', question: 'Which is worth more?',
            options: ['A Rook', 'A Bishop', 'They are equal'], correct: 0, explain: 'A Rook (5) is worth more than a Bishop (3).' },
          { id: 'vl2', kind: 'quiz', title: 'Fair trade?', say: 'Quick check.', question: 'You give up a Knight and capture a Bishop. How did you do?',
            options: ['About even', 'Won 2 points', 'Lost 2 points'], correct: 0, explain: 'Knights and Bishops are both worth about 3, so it is an even trade.' },
          { id: 'vl3', kind: 'best', title: 'Take the biggest', say: 'Your Knight can capture three different pieces. Take the most valuable one.',
            fen: '4k3/8/4r3/1p3b2/3N4/8/8/7K w - - 0 1', answers: ['Nxe6'],
            wrong: { Nxb5: 'That wins a Pawn (1). There is a Rook (5) available.', Nxf5: 'That wins a Bishop (3). There is a Rook (5) available.' },
            explain: 'Nxe6 wins a whole Rook.' },
          { id: 'vl4', kind: 'best', title: 'Free or protected?', say: 'Two black pieces are hanging, or are they? Win material safely.',
            fen: '4k3/3r4/8/8/n7/8/8/3QK3 w - - 0 1', answers: ['Qxa4'],
            wrong: { Qxd7: 'The King takes back: Kxd7. You gave a 9-point Queen for a 5-point Rook.' },
            explain: 'Qxa4 wins a Knight for nothing. The Rook on d7 was protected by the King.' },
        ],
      },
    ],
  },
  {
    id: 'check', title: 'Check', blurb: 'Attacking the King, and the three ways out.', icon: 'k',
    lessons: [
      {
        id: 'check-1', title: 'Giving check',
        intro: [
          'When a piece attacks the enemy King, the King is "in check".',
          'Check is not a capture. Kings are never taken. The player in check must deal with it immediately.',
        ],
        exercises: [
          { id: 'ck1', kind: 'check', title: 'Rook check', say: 'Make one Rook move that puts the black King in check.', pieces: [me('r', 'e8'), op('k', 'd4')] },
          { id: 'ck2', kind: 'check', title: 'Bishop check', say: 'Give check with the Bishop.', pieces: [me('b', 'c1'), op('k', 'e7')] },
          { id: 'ck3', kind: 'check', title: 'Knight check', say: 'Give check with the Knight.', pieces: [me('n', 'g5'), op('k', 'd8')] },
          { id: 'ck4', kind: 'check', title: 'Pawn check', say: 'Give check with the Pawn.', pieces: [me('p', 'c5'), op('k', 'd7')] },
        ],
      },
      {
        id: 'check-2', title: 'Getting out of check',
        intro: [
          'There are exactly three ways to get out of check:',
          '1. Move the King to a safe square. 2. Block the attack by putting a piece in between. 3. Capture the attacking piece.',
          'Any move that leaves your King in check is illegal. The board won\'t let you play it.',
        ],
        exercises: [
          { id: 'ck5', kind: 'escape', goal: 'king', title: 'Step aside', say: 'Your King is in check from the Rook. Move the King to safety.',
            fen: '4r1k1/8/8/8/8/8/8/4K3 w - - 0 1' },
          { id: 'ck6', kind: 'escape', goal: 'block', title: 'Block it', say: 'Get out of check by blocking with your Bishop.',
            fen: '4r1k1/8/8/8/8/8/3B4/4K3 w - - 0 1' },
          { id: 'ck7', kind: 'escape', goal: 'capture', title: 'Capture it', say: 'Get out of check by capturing the attacker.',
            fen: '4r1k1/8/8/8/B7/8/8/4K3 w - - 0 1' },
          { id: 'ck8', kind: 'quiz', title: 'Three ways', say: 'Quick check.', question: 'Which of these is NOT a way out of check?',
            options: ['Capturing an enemy Pawn elsewhere on the board', 'Moving the King', 'Blocking the line of attack'], correct: 0,
            explain: 'Only moving the King, blocking, or capturing the checking piece gets you out of check.' },
        ],
      },
    ],
  },
  {
    id: 'mate', title: 'Checkmate', blurb: 'How games are won, and the stalemate trap.', icon: 'k',
    lessons: [
      {
        id: 'mate-1', title: 'Checkmate in one',
        intro: [
          'Checkmate is check with no way out: the King can\'t move, the attack can\'t be blocked, and the attacker can\'t be captured.',
          'Checkmate ends the game immediately. The side that delivers it wins.',
        ],
        exercises: [
          { id: 'mt1', kind: 'mate', title: 'Back-rank mate', say: 'The black King is trapped behind his own Pawns. Checkmate in one move.', fen: '6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1' },
          { id: 'mt2', kind: 'mate', title: 'Queen mate', say: 'Checkmate with the Queen.', fen: '6k1/5ppp/8/8/8/8/8/3Q2K1 w - - 0 1' },
          { id: 'mt3', kind: 'mate', title: 'King and Rook', say: 'Your King takes away the escape squares. Finish with the Rook.', fen: 'k7/8/1K6/8/8/8/8/7R w - - 0 1' },
          { id: 'mt4', kind: 'mate', title: 'The ladder', say: 'Two Rooks work together. Checkmate in one.', fen: '7k/R7/8/8/8/8/8/1R4K1 w - - 0 1' },
          { id: 'mt5', kind: 'mate', title: 'Smothered', say: 'The black King is surrounded by his own pieces. Checkmate with the Knight.', fen: '6rk/6pp/8/6N1/8/8/8/6K1 w - - 0 1' },
        ],
      },
      {
        id: 'mate-2', title: 'Don\'t stalemate!',
        intro: [
          'Stalemate is when the player to move is NOT in check but has no legal move. The game ends in a draw.',
          'When you are winning, stalemate throws the win away. Before every move near the end, check that the opponent still has a move, or that you are giving checkmate.',
        ],
        exercises: [
          { id: 'mt6', kind: 'quiz', title: 'Stalemate or mate?', say: 'Quick check.', question: 'Black to move, not in check, and has no legal moves. What is the result?',
            options: ['Draw (stalemate)', 'White wins', 'Black loses a turn'], correct: 0, explain: 'No legal moves without being in check is stalemate, a draw.' },
          { id: 'mt7', kind: 'mate', title: 'Mate, not stalemate', say: 'Checkmate in one. Careful: one tempting Queen move is stalemate.', fen: '7k/5K2/8/8/8/8/8/6Q1 w - - 0 1' },
          { id: 'mt8', kind: 'mate', title: 'King helps Queen', say: 'Bring the Queen in, protected by your King, for checkmate.', fen: '7k/8/6K1/8/8/8/1Q6/8 w - - 0 1' },
        ],
      },
    ],
  },
  {
    id: 'special', title: 'Castling', blurb: 'The one move that moves two pieces.', icon: 'r',
    lessons: [
      {
        id: 'special-1', title: 'How to castle',
        intro: [
          'Castling moves the King two squares toward a Rook, and that Rook jumps to the square on the King\'s other side. It tucks the King away and brings the Rook into play.',
          'You can castle only if: neither piece has moved yet, the squares between them are empty, and the King is not in check, doesn\'t pass through an attacked square, and doesn\'t land in check.',
          'In the diagram: kingside castling moves the King e1→g1 and the Rook h1→f1; queenside moves the King e1→c1 and the Rook a1→d1.',
          'To castle here, tap your King, then tap the square two steps to the side.',
        ],
        diagram: { fen: 'r3k2r/pppppppp/8/8/8/8/PPPPPPPP/R3K2R w KQkq - 0 1', arrows: [{ from: 'e1', to: 'g1', color: 'good' }, { from: 'h1', to: 'f1', color: 'info' }, { from: 'e1', to: 'c1', color: 'good' }, { from: 'a1', to: 'd1', color: 'info' }] },
        exercises: [
          { id: 'sp1', kind: 'best', title: 'Castle kingside', say: 'Castle on the kingside (toward the h-file Rook).',
            fen: 'r3k2r/pppppppp/8/8/8/8/PPPPPPPP/R3K2R w KQkq - 0 1', answers: ['O-O'],
            wrong: { 'O-O-O': 'That\'s queenside castling. This time castle toward the h-file.' }, explain: 'O-O: King to g1, Rook to f1.' },
          { id: 'sp2', kind: 'best', title: 'Castle queenside', say: 'Now castle on the queenside (toward the a-file Rook).',
            fen: 'r3k2r/pppppppp/8/8/8/8/PPPPPPPP/R3K2R w KQkq - 0 1', answers: ['O-O-O'],
            wrong: { 'O-O': 'That\'s kingside castling. This time castle toward the a-file.' }, explain: 'O-O-O: King to c1, Rook to d1.' },
          { id: 'sp3', kind: 'best', title: 'Which side is legal?', say: 'One side is not allowed right now. Castle on the side that is.',
            fen: '4k3/8/8/8/2b5/8/8/R3K2R w KQ - 0 1', answers: ['O-O-O'],
            explain: 'The Bishop on c4 attacks f1, so the King can\'t pass through it. Queenside is fine.' },
          { id: 'sp4', kind: 'quiz', title: 'Rules', say: 'Quick check.', question: 'Your King is in check. Can you castle to escape?',
            options: ['No', 'Yes, if the Rook hasn\'t moved', 'Yes, but only queenside'], correct: 0, explain: 'You may never castle out of check.' },
        ],
      },
    ],
  },
  {
    id: 'tactics', title: 'First Tactics', blurb: 'Forks, pins and skewers: winning material.', icon: 'n',
    lessons: [
      {
        id: 'tactics-1', title: 'Forks, pins and skewers',
        intro: [
          'A fork is one piece attacking two things at once. The opponent can only save one.',
          'A pin attacks a piece that can\'t move without exposing something more valuable behind it, often the King.',
          'A skewer is a pin in reverse: you attack a valuable piece, it moves, and you take what was behind it.',
        ],
        exercises: [
          { id: 'tc1', kind: 'best', title: 'Knight fork', say: 'Find a Knight move that attacks the King and the Rook at the same time.',
            fen: 'r3k3/8/8/1N6/8/8/8/4K3 w - - 0 1', answers: ['Nc7'], explain: 'Nc7+ forks King and Rook. After the King moves, Nxa8.' },
          { id: 'tc2', kind: 'best', title: 'Queen fork', say: 'Find a Queen move that checks the King and attacks the Rook.',
            fen: 'r5k1/8/8/8/8/8/8/3QK3 w - - 0 1', answers: ['Qd5'], explain: 'Qd5+ hits g8 and a8 along two diagonals. Next move Qxa8.' },
          { id: 'tc3', kind: 'best', title: 'Pin', say: 'Pin the black Knight to its King.',
            fen: '4k3/8/2n5/8/8/8/8/4KB2 w - - 0 1', answers: ['Bb5'], explain: 'Bb5: the Knight can\'t move, because that would expose its King.' },
          { id: 'tc4', kind: 'best', title: 'Skewer', say: 'Check the King so that the Queen behind it falls.',
            fen: '8/8/2k4q/8/8/8/8/R3K3 w - - 0 1', answers: ['Ra6'],
            explain: 'Ra6+: the King has to step off the 6th rank, then Rxh6.' },
        ],
      },
    ],
  },
  {
    id: 'opening', title: 'Opening Principles', blurb: 'Center, development, castle early.', icon: 'p',
    lessons: [
      {
        id: 'opening-1', title: 'A good start',
        intro: [
          'Three habits make a strong opening. Control the center with pawns (e4, d4). Develop your Knights and Bishops toward the middle. Castle early to keep your King safe.',
          'Avoid moving the same piece twice and bringing your Queen out too soon, where it can be chased around.',
        ],
        exercises: [
          { id: 'op1', kind: 'best', title: 'Claim the center', say: 'It\'s move one. Put a pawn in the center.',
            fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', answers: ['e4', 'd4'],
            wrong: { Nf3: 'A fine move, but this lesson is about grabbing the center with a pawn first.', Nc3: 'A fine move, but this lesson is about grabbing the center with a pawn first.' },
            explain: 'e4 and d4 both take central space and open lines for your pieces.' },
          { id: 'op2', kind: 'best', title: 'Develop', say: 'After 1.e4 e5, develop a minor piece (Knight or Bishop) toward the center.',
            fen: 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq e6 0 2', answers: ['Nf3', 'Nc3', 'Bc4', 'Bb5'],
            wrong: { Qh5: 'The Queen comes out early and gets chased by ...Nc6 and ...Nf6. Develop a minor piece first.', Qf3: 'Too early for the Queen. Develop a Knight or Bishop first.' },
            explain: 'Knights and Bishops first: they control the center and get ready for castling.' },
          { id: 'op3', kind: 'best', title: 'Castle', say: 'Your pieces are out. Get your King to safety.',
            fen: 'r1bqk2r/pppp1ppp/2n2n2/2b1p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4', answers: ['O-O'],
            explain: 'O-O tucks the King away and connects the Rook to the center.' },
          { id: 'op4', kind: 'quiz', title: 'Principles', say: 'Quick check.', question: 'Which is usually the WORST idea in the first few moves?',
            options: ['Moving the Queen out early', 'Developing a Knight', 'Castling'], correct: 0, explain: 'An early Queen gets chased, and you lose time while your opponent develops.' },
        ],
      },
    ],
  },
];

export function findLesson(unitId: string, lessonId: string) {
  const unit = UNITS.find((u) => u.id === unitId);
  const lesson = unit?.lessons.find((l) => l.id === lessonId);
  return { unit, lesson };
}

export const ALL_LESSONS = UNITS.flatMap((u) => u.lessons.map((l) => ({ unit: u, lesson: l })));
