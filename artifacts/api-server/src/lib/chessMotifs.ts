import { Chess, type Square, type PieceSymbol, type Color } from "chess.js";

interface BoardPiece {
  square: Square;
  type: PieceSymbol;
  color: Color;
}

const PIECE_VALUE: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

export interface MotifResult {
  legal: boolean;
  themes: string[];
  mateIn: number | null;
  materialGain: number;
  finalFen: string;
  sanLine: string[];
}

function materialBalance(chess: Chess, color: "w" | "b"): number {
  let total = 0;
  const board = chess.board();
  for (const row of board) {
    for (const sq of row) {
      if (!sq) continue;
      const v = PIECE_VALUE[sq.type] ?? 0;
      total += sq.color === color ? v : -v;
    }
  }
  return total;
}

function applyUci(chess: Chess, uci: string): boolean {
  try {
    const from = uci.slice(0, 2);
    const to = uci.slice(2, 4);
    const promotion = uci.length > 4 ? uci[4] : undefined;
    const r = chess.move({ from, to, promotion });
    return !!r;
  } catch {
    return false;
  }
}

function withTurn(chess: Chess, color: "w" | "b"): Chess | null {
  const parts = chess.fen().split(" ");
  parts[1] = color;
  parts[3] = "-";
  try {
    return new Chess(parts.join(" "));
  } catch {
    return null;
  }
}

function detectFork(chess: Chess, mover: "w" | "b"): boolean {
  // After the mover plays, it's the opponent's turn; flip side-to-move so
  // chess.moves() returns the mover's threats in the resulting position.
  const view = chess.turn() === mover ? chess : withTurn(chess, mover);
  if (!view) return false;
  const moves = view.moves({ verbose: true });
  let attacks = 0;
  for (const m of moves) {
    const target = view.get(m.to as Square);
    if (target && target.color !== mover && (PIECE_VALUE[target.type] ?? 0) >= 3) {
      attacks++;
    }
    if (m.san.includes("+")) attacks++;
  }
  return attacks >= 2;
}

function detectHangingPiece(chess: Chess, mover: "w" | "b"): boolean {
  const opp = mover === "w" ? "b" : "w";
  const moves = chess.moves({ verbose: true });
  for (const m of moves) {
    if (m.color !== mover) continue;
    if (!m.captured) continue;
    const value = PIECE_VALUE[m.captured] ?? 0;
    if (value < 3) continue;
    const next = new Chess(chess.fen());
    next.move({ from: m.from, to: m.to, promotion: m.promotion });
    const recaptures = next.moves({ verbose: true }).filter(r => r.to === m.to && r.color === opp);
    if (recaptures.length === 0) return true;
  }
  return false;
}

function detectPinOrSkewer(chess: Chess, mover: "w" | "b"): boolean {
  const board = chess.board();
  const opp = mover === "w" ? "b" : "w";
  const sliders: { sq: Square; type: string }[] = [];
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const p = board[r][c];
      if (p && p.color === mover && (p.type === "b" || p.type === "r" || p.type === "q")) {
        sliders.push({ sq: p.square as Square, type: p.type });
      }
    }
  }
  const dirs: Record<string, [number, number][]> = {
    b: [[1, 1], [1, -1], [-1, 1], [-1, -1]],
    r: [[1, 0], [-1, 0], [0, 1], [0, -1]],
    q: [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]],
  };
  for (const s of sliders) {
    const file = s.sq.charCodeAt(0) - 97;
    const rank = parseInt(s.sq[1]) - 1;
    for (const [df, dr] of dirs[s.type]) {
      let f = file + df, r = rank + dr;
      let firstHit: { sq: string; piece: BoardPiece } | null = null;
      while (f >= 0 && f < 8 && r >= 0 && r < 8) {
        const t = String.fromCharCode(97 + f) + (r + 1);
        const p = chess.get(t as Square);
        if (p) {
          if (!firstHit) {
            if (p.color !== opp) break;
            firstHit = { sq: t, piece: p as BoardPiece };
          } else {
            if (p.color === opp && (PIECE_VALUE[p.type] ?? 0) >= (PIECE_VALUE[firstHit.piece.type] ?? 0)) {
              return true;
            }
            break;
          }
        }
        f += df; r += dr;
      }
    }
  }
  return false;
}

/**
 * Run a deterministic motif analysis on a puzzle. Replays the solution UCI line
 * on a copy of the position. Returns themes that the line actually demonstrates,
 * a material gain (positive when the side-to-move wins material), and mateIn
 * (counted in own moves) when the line ends in checkmate by the side to move.
 */
export function analyzePuzzle(fen: string, uciSolution: string[]): MotifResult {
  const result: MotifResult = {
    legal: true,
    themes: [],
    mateIn: null,
    materialGain: 0,
    finalFen: fen,
    sanLine: [],
  };

  let chess: Chess;
  try {
    chess = new Chess(fen);
  } catch {
    return { ...result, legal: false };
  }

  const mover = chess.turn();
  const startMaterial = materialBalance(chess, mover);

  const themes = new Set<string>();
  let ownMoves = 0;

  for (let i = 0; i < uciSolution.length; i++) {
    const moveUci = uciSolution[i];
    const isMoverTurn = chess.turn() === mover;
    const before = new Chess(chess.fen());
    if (!applyUci(chess, moveUci)) {
      return { ...result, legal: false, finalFen: chess.fen(), sanLine: result.sanLine };
    }
    const last = chess.history({ verbose: true }).slice(-1)[0];
    if (last) result.sanLine.push(last.san);

    if (isMoverTurn) {
      ownMoves++;

      // Sacrifice — moving a piece worth more than the captured value into a defended square
      if (last && last.piece && (PIECE_VALUE[last.piece] ?? 0) >= 3) {
        const captured = last.captured ? (PIECE_VALUE[last.captured] ?? 0) : 0;
        const moved = PIECE_VALUE[last.piece] ?? 0;
        const opp = mover === "w" ? "b" : "w";
        const recaps = chess.moves({ verbose: true }).filter(r => r.to === last.to && r.color === opp);
        if (recaps.length > 0 && moved > captured + 1) {
          themes.add("sacrifice");
        }
      }

      // Fork / pin / hanging — evaluate position created for opponent
      if (detectFork(chess, mover)) themes.add("fork");
      if (detectPinOrSkewer(chess, mover)) themes.add("pin");
      // hanging-piece detection runs on the BEFORE position from the mover's POV
      if (detectHangingPiece(before, mover)) themes.add("hangingPiece");

      // Check / checkmate
      if (chess.isCheckmate()) {
        result.mateIn = ownMoves;
        themes.add(`mateIn${ownMoves}`);
      }
    }
  }

  const endMaterial = materialBalance(chess, mover);
  result.materialGain = endMaterial - startMaterial;

  // Phase tagging from FEN move number
  try {
    const fullMove = parseInt(fen.split(" ").pop() || "1");
    if (fullMove <= 12) themes.add("opening");
    else if (fullMove >= 30) themes.add("endgame");
    else themes.add("middlegame");
  } catch {}

  if (result.materialGain >= 5) themes.add("crushing");
  else if (result.materialGain >= 2) themes.add("advantage");

  result.themes = Array.from(themes);
  result.finalFen = chess.fen();
  return result;
}
