import type { PositionEval } from "./engineAnalysis";
import { winPct, uciToSan } from "./engineAnalysis";

const PIECE_VALUES: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
const PIECE_NAMES: Record<string, string> = {
  p: "pawn", n: "knight", b: "bishop", r: "rook", q: "queen", k: "king",
};

export type EvalDirection = "improved" | "maintained" | "slightly_worse" | "worsened" | "lost";
export type CoachStatus = "engine-aligned" | "fallback";

export interface EngineFacts {
  classification: string;
  playerColor: "white" | "black";
  cpBefore: number;
  cpAfter: number;
  winPctBefore: number;
  winPctAfter: number;
  winPctSwing: number;
  evalDirection: EvalDirection;
  /** Player's piece moved this turn, if known. */
  movedPiece: string | null;
  /** Opponent piece captured by the played move (single char), if any. */
  capturedPiece: string | null;
  capturedValue: number;
  /** Player piece now hung (winnable by opponent on the very next move) — single char. */
  hungPiece: string | null;
  hungValue: number;
  /** Engine's preferred move from the position before, in SAN. */
  bestMoveSan: string | null;
  /** Best move's response: short PV (a few plies) in SAN, if reconstructible. */
  bestLineSan: string[];
  /** All player + opponent piece types present on the board after the move. */
  piecesOnBoard: Set<string>;
  legalMoveCount: number;
  inBook: boolean;
  isCheckmate: boolean;
  isCheck: boolean;
}

/** SEE-style: opponent's best capture on resulting position, against our undefended pieces. */
function detectHangAfter(fenAfter: string, ourColor: "white" | "black"): { piece: string | null; value: number } {
  try {
    // After the move, it's opponent to move (per fen). We check what they can capture cheaply.
    const Chess = require("chess.js").Chess;
    const board = new Chess(fenAfter);
    const opp = board.moves({ verbose: true }) as Array<{
      to: string; captured?: string; piece: string; san: string;
    }>;
    let worst: { piece: string; value: number } | null = null;
    for (const m of opp) {
      if (!m.captured) continue;
      const victimVal = PIECE_VALUES[m.captured] || 0;
      const attackerVal = PIECE_VALUES[m.piece] || 0;
      // Simulate the capture; can we recapture for at most attackerVal back?
      const sim = new Chess(fenAfter);
      sim.move(m.san);
      const recaps = (sim.moves({ verbose: true }) as Array<{ to: string; piece: string }>)
        .filter(r => r.to === m.to);
      // Net material gain for the opponent after a single exchange.
      // If we have a defender that recaptures, opponent loses attacker;
      // otherwise they keep the full victim value.
      const net = recaps.length > 0 ? victimVal - attackerVal : victimVal;
      if (net >= 2) {
        if (!worst || victimVal > worst.value) {
          worst = { piece: m.captured, value: victimVal };
        }
      }
    }
    void ourColor; // currently inferred from whose turn it is in fenAfter
    return worst ? { piece: worst.piece, value: worst.value } : { piece: null, value: 0 };
  } catch {
    return { piece: null, value: 0 };
  }
}

function piecesOnBoard(fen: string): Set<string> {
  const set = new Set<string>();
  const placement = fen.split(" ")[0] || "";
  for (const ch of placement) {
    if (/[A-Za-z]/.test(ch)) set.add(ch.toLowerCase());
  }
  return set;
}

function evalDirectionFor(winPctSwing: number, classification: string): EvalDirection {
  if (classification === "checkmate") return "improved";
  if (winPctSwing <= -8) return "improved";
  if (winPctSwing < 1) return "maintained";
  if (winPctSwing < 8) return "slightly_worse";
  if (winPctSwing < 20) return "worsened";
  return "lost";
}

export function computeEngineFacts(opts: {
  fenBefore: string;
  fenAfter: string;
  evalBefore: PositionEval;
  evalAfter: PositionEval;
  sanPlayed: string;
  classification: string;
  playerColor: "white" | "black";
  inBook: boolean;
  legalMoveCount: number;
}): EngineFacts {
  const { fenBefore, fenAfter, evalBefore, evalAfter, sanPlayed, classification, playerColor, inBook, legalMoveCount } = opts;

  const cpBefore = evalBefore.cpWhite;
  const cpAfter = evalAfter.cpWhite;
  const wb = winPct(cpBefore);
  const wa = winPct(cpAfter);
  const playerWb = playerColor === "white" ? wb : 100 - wb;
  const playerWa = playerColor === "white" ? wa : 100 - wa;
  const winPctSwing = playerWb - playerWa; // positive = player got worse

  // What did the played move do? Inspect via chess.js
  let movedPiece: string | null = null;
  let capturedPiece: string | null = null;
  let isCheckmate = false;
  let isCheck = false;
  try {
    const Chess = require("chess.js").Chess;
    const c = new Chess(fenBefore);
    const r = c.move(sanPlayed);
    if (r) {
      movedPiece = r.piece;
      capturedPiece = r.captured ?? null;
    }
    isCheckmate = c.isCheckmate();
    isCheck = c.isCheck();
  } catch {}

  // Hung piece detection on resulting position
  const { piece: hungPiece, value: hungValue } = detectHangAfter(fenAfter, playerColor);

  // Build short engine PV from bestMoveSan only (deeper PV not stored; provide one ply)
  const bestLineSan: string[] = [];
  if (evalBefore.bestMoveSan) bestLineSan.push(evalBefore.bestMoveSan);

  return {
    classification,
    playerColor,
    cpBefore,
    cpAfter,
    winPctBefore: playerWb,
    winPctAfter: playerWa,
    winPctSwing,
    evalDirection: evalDirectionFor(winPctSwing, classification),
    movedPiece,
    capturedPiece,
    capturedValue: capturedPiece ? (PIECE_VALUES[capturedPiece] || 0) : 0,
    hungPiece,
    hungValue,
    bestMoveSan: evalBefore.bestMoveSan ?? null,
    bestLineSan,
    piecesOnBoard: piecesOnBoard(fenAfter),
    legalMoveCount,
    inBook,
    isCheckmate,
    isCheck,
  };
}

/** A short, factual fact-sheet block that we paste into LLM prompts. */
export function renderFactSheet(f: EngineFacts): string {
  const lines: string[] = [];
  lines.push(`verdict=${f.classification}`);
  lines.push(`evalDirection=${f.evalDirection} (winPctSwing=${f.winPctSwing.toFixed(1)}%, cp ${f.cpBefore}→${f.cpAfter})`);
  if (f.movedPiece) lines.push(`movedPiece=${PIECE_NAMES[f.movedPiece]}`);
  if (f.capturedPiece) lines.push(`captured=${PIECE_NAMES[f.capturedPiece]} (worth ${f.capturedValue})`);
  if (f.hungPiece) lines.push(`hangs=${PIECE_NAMES[f.hungPiece]} (worth ${f.hungValue}) — opponent can win it next move`);
  else lines.push(`hangs=none`);
  if (f.bestMoveSan) lines.push(`engineBest=${f.bestMoveSan}`);
  if (f.isCheckmate) lines.push(`checkmate=true`);
  else if (f.isCheck) lines.push(`check=true`);
  if (f.inBook) lines.push(`book=true`);
  if (f.legalMoveCount <= 1) lines.push(`forced=true`);
  lines.push(`piecesOnBoard=${[...f.piecesOnBoard].join(",")}`);
  return lines.join("; ");
}

/** Deterministic, never-wrong explanation derived purely from facts. */
export function buildFallbackExplanation(f: EngineFacts, sanPlayed: string): string {
  if (f.isCheckmate) return `${sanPlayed} delivers checkmate.`;
  if (f.inBook) return `${sanPlayed} is established opening theory.`;
  if (f.legalMoveCount <= 1) return `${sanPlayed} was the only legal move.`;

  switch (f.classification) {
    case "brilliant":
      return `${sanPlayed} is a brilliant resource — a sacrifice or hard-to-find move that flips the evaluation in your favor (${f.winPctSwing < 0 ? `+${(-f.winPctSwing).toFixed(0)}%` : ""}).`;
    case "great":
      return `${sanPlayed} is a great move that shifts momentum (eval ${f.evalDirection}).`;
    case "best":
      return `${sanPlayed} is the engine's top choice here.`;
    case "excellent":
      return `${sanPlayed} is excellent — within a fraction of a percent of the engine's best.`;
    case "good":
      return `${sanPlayed} is a solid move; the engine preferred ${f.bestMoveSan ?? "another continuation"}.`;
    case "inaccuracy":
      return `${sanPlayed} is slightly inaccurate — your winning chances dropped by ${f.winPctSwing.toFixed(1)}%. Engine preferred ${f.bestMoveSan ?? "a different move"}.`;
    case "mistake": {
      const hang = f.hungPiece ? ` It leaves your ${PIECE_NAMES[f.hungPiece]} hanging.` : "";
      return `${sanPlayed} is a mistake — you lost ${f.winPctSwing.toFixed(1)}% in winning chances.${hang} Engine preferred ${f.bestMoveSan ?? "a different move"}.`;
    }
    case "blunder": {
      const hang = f.hungPiece ? ` Your ${PIECE_NAMES[f.hungPiece]} can be won by force.` : "";
      return `${sanPlayed} is a blunder — winning chances collapsed by ${f.winPctSwing.toFixed(1)}%.${hang} Engine preferred ${f.bestMoveSan ?? "a different move"}.`;
    }
    case "missed_win":
      return `${sanPlayed} misses a clear winning line. ${f.bestMoveSan ? `${f.bestMoveSan} would have kept the advantage.` : ""}`.trim();
    default:
      return `${sanPlayed}: eval ${f.cpBefore} → ${f.cpAfter} cp.`;
  }
}

/** Fact-grounded pros/cons fallback. */
export function buildFallbackProsCons(f: EngineFacts): { pros: string[]; cons: string[] } {
  const pros: string[] = [];
  const cons: string[] = [];

  if (f.capturedPiece && f.capturedValue >= 1) {
    pros.push(`Captures opponent's ${PIECE_NAMES[f.capturedPiece]}.`);
  }
  if (f.isCheck) pros.push("Gives check.");
  if (f.isCheckmate) pros.push("Delivers checkmate.");
  if (f.evalDirection === "improved") pros.push("Improves the engine evaluation.");
  if (f.evalDirection === "maintained" && !f.hungPiece) pros.push("Holds the position.");

  if (f.hungPiece) cons.push(`Leaves your ${PIECE_NAMES[f.hungPiece]} attacked and winnable.`);
  if (f.evalDirection === "lost") cons.push("Loses substantial winning chances.");
  else if (f.evalDirection === "worsened") cons.push("Worsens the engine evaluation.");
  if (f.bestMoveSan && ["inaccuracy", "mistake", "blunder", "missed_win"].includes(f.classification)) {
    cons.push(`${f.bestMoveSan} was stronger.`);
  }

  if (pros.length === 0) pros.push("Develops the position.");
  if (cons.length === 0) cons.push("Not the engine's preferred continuation.");
  return { pros: pros.slice(0, 3), cons: cons.slice(0, 3) };
}

/** Words that strongly imply a positive verdict. */
const POSITIVE_WORDS = /\b(brilliant|excellent|strong|great|best|winning|decisive|crushing|good|solid|clever|accurate)\b/i;
const NEGATIVE_WORDS = /\b(blunder|mistake|terrible|losing|disaster|bad|hangs?|hung|drops?|loses?|weakens?|inaccurate)\b/i;
const PIECE_RE = /\b(pawn|knight|bishop|rook|queen|king)\b/gi;

const PIECE_NAME_TO_LETTER: Record<string, string> = {
  pawn: "p", knight: "n", bishop: "b", rook: "r", queen: "q", king: "k",
};

export interface ReconciliationResult {
  ok: boolean;
  reasons: string[];
}

/** Validate an LLM-produced explanation against the engine fact sheet. */
export function reconcileExplanation(text: string, f: EngineFacts): ReconciliationResult {
  const reasons: string[] = [];
  if (!text || !text.trim()) return { ok: false, reasons: ["empty"] };

  const isBad = ["inaccuracy", "mistake", "blunder", "missed_win"].includes(f.classification);
  const isGood = ["best", "excellent", "great", "brilliant", "checkmate"].includes(f.classification);

  // Verdict polarity check
  if (isBad && POSITIVE_WORDS.test(text) && !NEGATIVE_WORDS.test(text)) {
    reasons.push("polarity: praises a bad move");
  }
  if (isGood && NEGATIVE_WORDS.test(text) && !POSITIVE_WORDS.test(text) && f.classification !== "checkmate") {
    reasons.push("polarity: criticizes a good move");
  }

  // "hangs the X" / "loses the X" — verify the piece matches a real captured/hung piece
  const hangMatch = text.match(/\b(?:hangs?|hung|loses?|drops?|sacrifices?)\s+(?:the|a|his|her|their|your|its)?\s*(pawn|knight|bishop|rook|queen|king)\b/i);
  if (hangMatch) {
    const namedPiece = PIECE_NAME_TO_LETTER[hangMatch[1].toLowerCase()];
    const allowed = new Set([f.hungPiece, f.movedPiece].filter(Boolean));
    if (!allowed.has(namedPiece) && namedPiece !== "p") {
      reasons.push(`hallucination: claims hangs ${hangMatch[1]} but engine sees ${f.hungPiece ? PIECE_NAMES[f.hungPiece] : "no hang"}`);
    }
  }

  // Mention of pieces that aren't on the board (skip pawn since it's nearly always present)
  const mentioned = text.match(PIECE_RE) || [];
  for (const m of mentioned) {
    const letter = PIECE_NAME_TO_LETTER[m.toLowerCase()];
    if (letter === "p" || letter === "k") continue;
    if (!f.piecesOnBoard.has(letter)) {
      reasons.push(`hallucination: mentions ${m.toLowerCase()} not present on board`);
      break;
    }
  }

  return { ok: reasons.length === 0, reasons };
}
