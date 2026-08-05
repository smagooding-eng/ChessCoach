import OpenAI from "openai";
import { logger } from "./logger";
import { evaluateAllPositions, classifyFromWinPctLoss, isSacrificialMove, uciToSan, winPct, accuracyFromAvgLoss, estimatedLossForMove, type PositionEval } from "./engineAnalysis";
import { extractStartFen, normalizeFen } from "./chesscom";
import { isBookPosition, getBookFensForEco } from "./openingBook";
import {
  computeEngineFacts,
  renderFactSheet,
  buildFallbackExplanation,
  buildFallbackProsCons,
  reconcileExplanation,
  type CoachStatus,
  type EngineFacts,
} from "./engineFacts";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

interface GameSummary {
  pgn: string;
  result: string;
  opening: string | null;
  timeControl: string;
  whiteUsername: string;
  blackUsername: string;
  whiteRating: number;
  blackRating: number;
  gameId?: number;
}

export interface WeaknessResult {
  category: string;
  severity: string;
  description: string;
  frequency: number;
  examples: string[];
  relatedGameIndices?: number[];
}

export interface AnalysisOutput {
  weaknesses: WeaknessResult[];
  summary: string;
}

/** Extract first N half-moves from PGN as a readable move-line string */
function pgnMoveLine(pgn: string, maxHalfMoves = 30): string {
  try {
    const Chess = require("chess.js").Chess;
    const chess = new Chess();
    chess.loadPgn(pgn);
    const hist = chess.history();
    return hist
      .slice(0, maxHalfMoves)
      .map((san: string, i: number) => {
        const moveNum = Math.floor(i / 2) + 1;
        return i % 2 === 0 ? `${moveNum}.${san}` : san;
      })
      .join(" ");
  } catch {
    return "";
  }
}

export async function analyzePlayerGames(
  username: string,
  games: GameSummary[],
  options?: { isOpponentScout?: boolean }
): Promise<AnalysisOutput> {
  const subset = games.slice(0, 30);

  const gamesText = subset
    .map((g, i) => {
      const playerColor =
        g.whiteUsername.toLowerCase() === username.toLowerCase() ? "White" : "Black";
      const opponentRating = playerColor === "White" ? g.blackRating : g.whiteRating;
      const moves = pgnMoveLine(g.pgn, 30);
      return [
        `--- Game ${i + 1} [index:${i}] ---`,
        `Color: ${playerColor} | Result: ${g.result} | Opening: ${g.opening || "Unknown"} | Time: ${g.timeControl} | Opp Rating: ${opponentRating}`,
        moves ? `Moves: ${moves}` : "",
      ]
        .filter(Boolean)
        .join("\n");
    })
    .join("\n\n");

  const isScout = options?.isOpponentScout === true;
  const perspectiveInstruction = isScout
    ? `IMPORTANT: You are scouting an OPPONENT named "${username}". Always refer to them by name ("${username}") or as "the opponent" — NEVER use "you" or "your". Write in third person about ${username}'s play. Example: "${username} repeatedly allows..." NOT "You repeatedly allow..."`
    : `Address the player directly using "you" and "your" — this is the player's own self-analysis.`;

  const prompt = `You are a grandmaster-level chess coach performing a rigorous analysis of ${username}'s last ${subset.length} games.

${perspectiveInstruction}

GAME DATA (with actual move sequences):
${gamesText}

---
TASK: Identify 4-6 specific, concrete weaknesses. Base conclusions on the actual move sequences provided — cite real move numbers and patterns you observe.

For each weakness output:
- category: one of ["Opening Preparation", "Tactical Awareness", "Endgame Technique", "Positional Play", "Time Management", "Defensive Play"]
- severity: one of ["Critical", "High", "Medium", "Low"]
- description: 2-3 sentences that name SPECIFIC moves or move numbers you observed.${isScout ? ` Always refer to the player as "${username}" (third person). Example: "In Game 3, ${username} allowed 14...Qxd5 losing the initiative."` : ` Example: "In Game 3, after 14.Nxd5 you allowed 14...Qxd5 losing the initiative."`} Be concrete — no vague generalities.
- frequency: 0.0–1.0 (proportion of games this appears in)
- examples: exactly 3 strings, each citing a specific game number, move, and what went wrong (e.g. "Game 7 (White, loss): After 21.Rfd1 the d-file was already contested; 21.Re1 keeping the e-file would have held equality")
- relatedGameIndices: array of 2-4 game index numbers (0-based from the list above, matching [index:N]) where this weakness clearly shows up

Also output a summary paragraph that names concrete patterns and move references.${isScout ? ` Use "${username}" or "the opponent" throughout — never "you".` : ""}

Respond with VALID JSON only:
{
  "weaknesses": [
    {
      "category": "...",
      "severity": "...",
      "description": "...",
      "frequency": 0.0,
      "examples": ["Game N (Color, result): move X — ...", "...", "..."],
      "relatedGameIndices": [0, 3, 7]
    }
  ],
  "summary": "..."
}`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-5.2",
      max_completion_tokens: 8192,
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
    });

    const content = response.choices[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(content) as AnalysisOutput;
    return parsed;
  } catch (err) {
    logger.error({ err }, "Failed to analyze games with OpenAI");
    throw err;
  }
}

export interface MoveClassification {
  moveIndex: number;
  san: string;
  color: string;
  classification: "checkmate" | "brilliant" | "great" | "best" | "excellent" | "good" | "book" | "inaccuracy" | "mistake" | "blunder" | "missed_win";
  explanation: string;
  cpLoss: number;
  engineAvailable: boolean;
  bestMove: string | null;
}

interface AnalyzeMovesInput {
  pgn: string;
  moves: Array<{ moveNumber: number; san: string; color: string; fen: string | null }>;
  opening: string | null;
  eco: string | null;
  result: string;
  whiteUsername: string;
  blackUsername: string;
}

function stripFenCounters(fen: string): string {
  return fen.split(" ").slice(0, 4).join(" ");
}

function isInBookForGame(fen: string, ecoBookFens: Set<string>): boolean {
  const key = stripFenCounters(fen);
  if (ecoBookFens.size > 0) return ecoBookFens.has(key);
  return isBookPosition(fen);
}

export async function analyzeMoves(input: AnalyzeMovesInput): Promise<MoveClassification[]> {
  const Chess = require("chess.js").Chess;
  const chess = new Chess();
  const fens: string[] = [chess.fen()];
  const uciMoves: Array<{ from: string; to: string } | null> = [];
  const ecoBookFens = getBookFensForEco(input.eco);

  for (const m of input.moves) {
    try {
      const result = chess.move(m.san);
      fens.push(chess.fen());
      uciMoves.push(result ? { from: result.from, to: result.to } : null);
    } catch {
      fens.push(chess.fen());
      uciMoves.push(null);
      break;
    }
  }

  logger.info({ positions: fens.length, eco: input.eco, bookFens: ecoBookFens.size }, "analyzeMoves: Running Stockfish on all positions");
  const evals = await evaluateAllPositions(fens);
  logger.info({ evaluated: evals.length }, "analyzeMoves: Stockfish complete");

  let stillInBook = true;

  return input.moves.map((m, idx) => {
    const evalBefore = evals[idx];
    const evalAfter = evals[idx + 1];

    if (!evalBefore || !evalAfter) {
      stillInBook = false;
      return {
        moveIndex: idx, san: m.san, color: m.color,
        classification: "good" as const, explanation: "", cpLoss: 0,
        engineAvailable: false, bestMove: null,
      };
    }

    const fenAfterMove = fens[idx + 1];
    if (stillInBook && fenAfterMove) {
      stillInBook = isInBookForGame(fenAfterMove, ecoBookFens);
    } else {
      stillInBook = false;
    }

    const cpBefore = evalBefore.cpWhite;
    const cpAfter = evalAfter.cpWhite;
    const playerColor = m.color as "white" | "black";

    const moveUci = uciMoves[idx];
    const playedUci = moveUci ? `${moveUci.from}${moveUci.to}` : "";
    const isTopEngineMove = evalBefore.bestMoveUci.startsWith(playedUci) && playedUci.length > 0;
    const isSecondEngineMove = evalBefore.secondBestUci.startsWith(playedUci) && playedUci.length > 0;
    const isOpeningRange = idx < 30;
    const wasBalanced = Math.abs(cpBefore) < 150;

    let winPctLossRaw: number;
    if (playerColor === "white") {
      winPctLossRaw = winPct(cpBefore) - winPct(cpAfter);
    } else {
      winPctLossRaw = (100 - winPct(cpBefore)) - (100 - winPct(cpAfter));
    }
    const moveCpLoss = Math.max(0, winPctLossRaw);

    const playerWinBefore = playerColor === "white" ? winPct(cpBefore) : (100 - winPct(cpBefore));
    const playerWinAfter = playerColor === "white" ? winPct(cpAfter) : (100 - winPct(cpAfter));

    let legalMoves: string[] = [];
    try {
      const pos = new Chess(fens[idx]);
      legalMoves = pos.moves();
    } catch {}

    let classification = classifyFromWinPctLoss(winPctLossRaw, isTopEngineMove, isSecondEngineMove, isOpeningRange, wasBalanced, playerWinBefore, stillInBook, playerWinAfter, legalMoves.length, cpBefore, cpAfter, playerColor);

    if (legalMoves.length <= 1 && stillInBook && isOpeningRange) {
      classification = "book";
    }

    if (classification === "brilliant") {
      if (!isSacrificialMove(fens[idx], m.san)) {
        classification = isTopEngineMove ? "best" : "excellent";
      }
    }

    // Checkmate: if the played move actually delivers mate, override
    // whatever the engine-eval-based classifier produced.
    try {
      const after = new Chess(fens[idx + 1]);
      if (after.isCheckmate()) classification = "checkmate";
    } catch {}

    const isBad = ["inaccuracy", "mistake", "blunder", "missed_win"].includes(classification);
    let bestMove: string | null = null;
    if (isBad && evalBefore.bestMoveSan && !isTopEngineMove) {
      bestMove = evalBefore.bestMoveSan;
    }

    return {
      moveIndex: idx, san: m.san, color: m.color,
      classification, explanation: "",
      cpLoss: moveCpLoss, engineAvailable: true, bestMove,
    };
  });
}

export interface PgnAnalysisResult {
  moves: Array<{
    moveIndex: number;
    san: string;
    color: "white" | "black";
    classification: "checkmate" | "brilliant" | "great" | "best" | "excellent" | "good" | "book" | "inaccuracy" | "mistake" | "blunder" | "missed_win";
    cpLoss: number;
    bestMove: string | null;
    evalBefore: number;
    evalAfter: number;
  }>;
  whiteAccuracy: number;
  blackAccuracy: number;
}

export async function analyzeGamePgn(pgn: string, onProgress?: (done: number, total: number) => void): Promise<PgnAnalysisResult> {
  const Chess = require("chess.js").Chess;
  const startFen = extractStartFen(pgn);
  const normalizedPgn = pgn.replace(/\[FEN "([^"]+)"\]/, (_: string, fen: string) => `[FEN "${normalizeFen(fen)}"]`);
  const chess = new Chess(startFen);

  const ecoMatch = pgn.match(/\[ECO\s+"([^"]+)"\]/);
  const eco = ecoMatch ? ecoMatch[1] : null;
  const ecoBookFens = getBookFensForEco(eco);

  try {
    chess.loadPgn(normalizedPgn);
  } catch {
    throw new Error("Invalid PGN");
  }

  const history = chess.history();
  const replayChess = new Chess(startFen);

  const fens: string[] = [replayChess.fen()];
  const moveMeta: Array<{ san: string; color: "white" | "black"; from: string; to: string }> = [];

  for (const san of history) {
    const color: "white" | "black" = replayChess.turn() === "w" ? "white" : "black";
    const result = replayChess.move(san);
    if (!result) break;
    fens.push(replayChess.fen());
    moveMeta.push({ san, color, from: result.from, to: result.to });
  }

  logger.info({ positions: fens.length, eco, bookFens: ecoBookFens.size }, "analyzeGamePgn: Running Stockfish on all positions");
  const evals = await evaluateAllPositions(fens, undefined, onProgress);

  const moves: PgnAnalysisResult["moves"] = [];
  const whiteLosses: number[] = [];
  const blackLosses: number[] = [];
  let stillInBook = true;

  for (let idx = 0; idx < moveMeta.length; idx++) {
    const m = moveMeta[idx];
    const evalBefore = evals[idx];
    const evalAfter = evals[idx + 1];

    if (!evalBefore || !evalAfter) {
      stillInBook = false;
      moves.push({
        moveIndex: idx, san: m.san, color: m.color,
        classification: "good", cpLoss: 0, bestMove: null,
        evalBefore: 0, evalAfter: 0,
      });
      continue;
    }

    const fenAfterMove = fens[idx + 1];
    if (stillInBook && fenAfterMove) {
      stillInBook = isInBookForGame(fenAfterMove, ecoBookFens);
    } else {
      stillInBook = false;
    }

    const cpBefore = evalBefore.cpWhite;
    const cpAfter = evalAfter.cpWhite;
    const playedUci = `${m.from}${m.to}`;
    const isTopEngineMove = evalBefore.bestMoveUci.startsWith(playedUci);
    const isSecondEngineMove = evalBefore.secondBestUci.startsWith(playedUci);
    const isOpeningRange = idx < 30;
    const wasBalanced = Math.abs(cpBefore) < 150;

    let winPctLossRaw: number;
    if (m.color === "white") {
      winPctLossRaw = winPct(cpBefore) - winPct(cpAfter);
    } else {
      winPctLossRaw = (100 - winPct(cpBefore)) - (100 - winPct(cpAfter));
    }
    const moveCpLoss = Math.max(0, winPctLossRaw);

    if (m.color === "white") whiteLosses.push(moveCpLoss);
    else blackLosses.push(moveCpLoss);

    const playerWinBefore = m.color === "white" ? winPct(cpBefore) : (100 - winPct(cpBefore));
    const playerWinAfter = m.color === "white" ? winPct(cpAfter) : (100 - winPct(cpAfter));

    let legalMoves: string[] = [];
    try {
      const pos = new Chess(fens[idx]);
      legalMoves = pos.moves();
    } catch {}

    let classification = classifyFromWinPctLoss(winPctLossRaw, isTopEngineMove, isSecondEngineMove, isOpeningRange, wasBalanced, playerWinBefore, stillInBook, playerWinAfter, legalMoves.length, cpBefore, cpAfter, m.color as "white" | "black");

    if (legalMoves.length <= 1 && stillInBook && isOpeningRange) classification = "book";

    if (classification === "brilliant") {
      if (!isSacrificialMove(fens[idx], m.san)) {
        classification = isTopEngineMove ? "best" : "excellent";
      }
    }

    // Checkmate override: actual delivered mate trumps any other label.
    try {
      const after = new Chess(fens[idx + 1]);
      if (after.isCheckmate()) classification = "checkmate";
    } catch {}

    const isBad = ["inaccuracy", "mistake", "blunder", "missed_win"].includes(classification);
    let bestMove: string | null = null;
    if (isBad && evalBefore.bestMoveSan && !isTopEngineMove) {
      bestMove = evalBefore.bestMoveSan;
    }

    moves.push({
      moveIndex: idx, san: m.san, color: m.color,
      classification, cpLoss: moveCpLoss, bestMove,
      evalBefore: cpBefore, evalAfter: cpAfter,
    });
  }

  const avgWhiteLoss = whiteLosses.length > 0
    ? whiteLosses.reduce((a, b) => a + b, 0) / whiteLosses.length : 0;
  const avgBlackLoss = blackLosses.length > 0
    ? blackLosses.reduce((a, b) => a + b, 0) / blackLosses.length : 0;

  // Uses the single shared accuracy formula (engineAnalysis.ts) — this used
  // to have its own locally-duplicated formula with a different exponent
  // than analysis.ts's copy, causing inconsistent accuracy numbers for
  // identical underlying performance depending on which code path rendered
  // it.
  const toAccuracy = accuracyFromAvgLoss;

  return {
    moves,
    whiteAccuracy: Math.round(toAccuracy(avgWhiteLoss) * 10) / 10,
    blackAccuracy: Math.round(toAccuracy(avgBlackLoss) * 10) / 10,
  };
}

export interface SingleMoveAnalysis {
  classification: "checkmate" | "brilliant" | "great" | "best" | "excellent" | "good" | "book" | "inaccuracy" | "mistake" | "blunder" | "missed_win";
  pros: string[];
  cons: string[];
  betterMove: string | null;
  cpLoss: number | null;
  engineDepth: number | null;
  engineAvailable: boolean;
  coachStatus?: CoachStatus;
}

interface AnalyzeSingleMoveInput {
  moves: Array<{ moveNumber: number; san: string; color: string; from: string; to: string; fenBefore: string; fen: string | null }>;
  moveIndex: number;
  opening: string | null;
  eco: string | null;
  result: string;
  whiteUsername: string;
  blackUsername: string;
}

export async function analyzeSingleMove(input: AnalyzeSingleMoveInput): Promise<SingleMoveAnalysis> {
  const { moves, moveIndex, opening, eco, result, whiteUsername, blackUsername } = input;
  const ecoBookFens = getBookFensForEco(eco);

  const target = moves[moveIndex];
  if (!target) throw new Error("Move not found");

  const playerColor = target.color as "white" | "black";
  const player = playerColor === "white" ? whiteUsername : blackUsername;
  const fenBefore = target.fenBefore;
  const fenAfter = target.fen ?? "";

  const sfEvals = await evaluateAllPositions([fenBefore, fenAfter]);
  const evalBefore = sfEvals[0];
  const evalAfter = sfEvals[1];

  const contextStart = Math.max(0, moveIndex - 5);
  const contextEnd = Math.min(moves.length - 1, moveIndex + 2);
  const contextMoves = moves.slice(contextStart, contextEnd + 1).map((m, i) => {
    const idx = contextStart + i;
    const marker = idx === moveIndex ? ">>> " : "    ";
    return `${marker}${m.moveNumber}${m.color === "white" ? "." : "..."} ${m.san}`;
  }).join("\n");

  const cpBefore = evalBefore.cpWhite;
  const cpAfter = evalAfter.cpWhite;

  let winPctLossRaw: number;
  if (playerColor === "white") {
    winPctLossRaw = winPct(cpBefore) - winPct(cpAfter);
  } else {
    winPctLossRaw = (100 - winPct(cpBefore)) - (100 - winPct(cpAfter));
  }
  const cpLoss = Math.max(0, winPctLossRaw);

  const playedUci = `${target.from}${target.to}`;
  const isTopEngineMove = evalBefore.bestMoveUci.startsWith(playedUci);
  const isSecondEngineMove = evalBefore.secondBestUci.startsWith(playedUci);
  const isOpeningRange = moveIndex < 30;
  const wasBalanced = Math.abs(cpBefore) < 150;
  const playerWinBefore = playerColor === "white" ? winPct(cpBefore) : (100 - winPct(cpBefore));
  const playerWinAfter = playerColor === "white" ? winPct(cpAfter) : (100 - winPct(cpAfter));

  let isInBook = false;
  if (fenAfter) {
    let allPriorInBook = isInBookForGame(fenBefore, ecoBookFens);
    if (allPriorInBook && isInBookForGame(fenAfter, ecoBookFens)) {
      isInBook = true;
    }
  }

  const Chess = require("chess.js").Chess;
  let legalMoveCount = 20;
  try { legalMoveCount = new Chess(fenBefore).moves().length; } catch {}

  let classification = classifyFromWinPctLoss(winPctLossRaw, isTopEngineMove, isSecondEngineMove, isOpeningRange, wasBalanced, playerWinBefore, isInBook, playerWinAfter, legalMoveCount, cpBefore, cpAfter, playerColor);

  if (classification === "brilliant") {
    if (!isSacrificialMove(fenBefore, target.san)) {
      classification = isTopEngineMove ? "best" : "excellent";
    }
  }

  const isBad = ["inaccuracy", "mistake", "blunder", "missed_win"].includes(classification);

  // Build engine fact sheet up-front so the LLM can't drift.
  const facts: EngineFacts = computeEngineFacts({
    fenBefore,
    fenAfter,
    evalBefore,
    evalAfter,
    sanPlayed: target.san,
    classification,
    playerColor,
    inBook: isInBook,
    legalMoveCount,
  });
  const factSheet = renderFactSheet(facts);

  const prompt = `You are an expert chess coach. Use ONLY the engine facts below.
Do not invent pieces, captures, or motifs not in the fact sheet. Match the eval direction.

Game: ${whiteUsername} (White) vs ${blackUsername} (Black)
Opening: ${opening ?? "Unknown"} | Result: ${result}

Move sequence (>>> = analyzed move):
${contextMoves}

Player "${player}" (${playerColor}) played ${target.moveNumber}${playerColor === "white" ? "." : "..."} ${target.san}.

ENGINE FACT SHEET (authoritative):
${factSheet}

Rules:
- Pros must be true given the facts above (e.g. only mention a captured piece if captured≠none).
- Cons must reflect the eval direction. If verdict is mistake/blunder/missed_win you MUST mention what was lost or missed.
- Reference only pieces in piecesOnBoard. Do NOT name pieces that aren't there.
- If hangs=none, do NOT say a piece "hangs" or "is lost".
- Each item ≤ 14 words.

Respond with valid JSON:
{
  "pros": ["...", "..."],
  "cons": ["...", "..."]${isBad && evalBefore.bestMoveSan ? ',\n  "betterMoveExplanation": "1 sentence on why ' + evalBefore.bestMoveSan + ' is stronger"' : ""}
}`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      max_completion_tokens: 512,
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
    });
    const content = response.choices[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(content) as {
      pros?: string[];
      cons?: string[];
      betterMoveExplanation?: string;
    };

    let betterMove: string | null = null;
    if (isBad && evalBefore.bestMoveSan) {
      betterMove = evalBefore.bestMoveSan;
      if (parsed.betterMoveExplanation && reconcileExplanation(parsed.betterMoveExplanation, facts).ok) {
        betterMove += ` — ${parsed.betterMoveExplanation}`;
      }
    }

    let pros = Array.isArray(parsed.pros) ? parsed.pros.filter(p => typeof p === "string") : [];
    let cons = Array.isArray(parsed.cons) ? parsed.cons.filter(c => typeof c === "string") : [];

    let coachStatus: CoachStatus = "engine-aligned";
    const cleanPros = pros.filter(p => reconcileExplanation(p, facts).ok);
    const cleanCons = cons.filter(c => reconcileExplanation(c, facts).ok);
    if (cleanPros.length !== pros.length || cleanCons.length !== cons.length) {
      coachStatus = "fallback";
    }
    if (cleanPros.length === 0 && cleanCons.length === 0) {
      const fb = buildFallbackProsCons(facts);
      pros = fb.pros;
      cons = fb.cons;
      coachStatus = "fallback";
    } else {
      pros = cleanPros;
      cons = cleanCons;
    }

    return {
      classification,
      pros,
      cons,
      betterMove,
      cpLoss,
      engineDepth: evalBefore.depth,
      engineAvailable: true,
      coachStatus,
    };
  } catch (err) {
    logger.error({ err }, "GPT pros/cons failed");
    const fb = buildFallbackProsCons(facts);
    return {
      classification,
      pros: fb.pros,
      cons: fb.cons,
      betterMove: evalBefore.bestMoveSan,
      cpLoss,
      engineDepth: evalBefore.depth,
      engineAvailable: true,
      coachStatus: "fallback",
    };
  }
}

// ── Post-process GPT review using chess.js to fix hallucinations ─────────────

function mergeReviewWithEngine(
  reviewMoves: MoveReview[],
  originalMoves: Array<{ moveNumber: number; san: string; color: string }>,
  fens: string[],
  evals: PositionEval[],
  uciMoves: Array<{ from: string; to: string } | null>,
  ecoBookFens: Set<string> = new Set(),
): MoveReview[] {
  const Chess = require("chess.js").Chess;

  const gptByIndex = new Map<number, MoveReview>();
  for (const rm of reviewMoves) {
    gptByIndex.set(rm.moveIndex, rm);
  }

  let stillInBook = true;

  const results: MoveReview[] = [];
  for (let idx = 0; idx < originalMoves.length; idx++) {
    const om = originalMoves[idx];
    const gpt = gptByIndex.get(idx);

    let classification: MoveReview["classification"] = gpt?.classification ?? "good";
    let betterMove: string | null = gpt?.betterMove ?? null;
    let explanation: string = gpt?.explanation ?? "";
    let pros: string[] = gpt?.pros ?? [];
    let cons: string[] = gpt?.cons ?? [];

    const fenBefore = fens[idx];
    if (!fenBefore) {
      stillInBook = false;
      results.push({
        moveIndex: idx, san: om.san, color: om.color as "white" | "black",
        classification, explanation, betterMove, pros, cons, cpLoss: 0, engineAvailable: false,
      });
      continue;
    }

    const fenAfterMove = fens[idx + 1];
    if (stillInBook && fenAfterMove) {
      stillInBook = isInBookForGame(fenAfterMove, ecoBookFens);
    } else {
      stillInBook = false;
    }

    let legalMoves: string[];
    try {
      const pos = new Chess(fenBefore);
      legalMoves = pos.moves();
    } catch {
      stillInBook = false;
      results.push({
        moveIndex: idx, san: om.san, color: om.color as "white" | "black",
        classification, explanation, betterMove, pros, cons, cpLoss: 0, engineAvailable: false,
      });
      continue;
    }

    if (legalMoves.length <= 1) {
      results.push({
        moveIndex: idx, san: om.san, color: om.color as "white" | "black",
        classification: "book" as const, explanation: explanation || "Forced move — the only legal option.",
        betterMove: null, pros, cons: [], cpLoss: 0, engineAvailable: true,
      });
      continue;
    }

    const evalBefore = evals[idx];
    const evalAfter = evals[idx + 1];

    if (!evalBefore || !evalAfter) {
      stillInBook = false;
      results.push({
        moveIndex: idx, san: om.san, color: om.color as "white" | "black",
        classification, explanation, betterMove, pros, cons, cpLoss: 0, engineAvailable: false,
      });
      continue;
    }

    const cpBefore = evalBefore.cpWhite;
    const cpAfter = evalAfter.cpWhite;

    const moveUci = uciMoves[idx];
    const playedUci = moveUci ? `${moveUci.from}${moveUci.to}` : "";
    const isTopEngineMove = evalBefore.bestMoveUci.startsWith(playedUci) && playedUci.length > 0;
    const isSecondEngineMove = evalBefore.secondBestUci.startsWith(playedUci) && playedUci.length > 0;
    const isOpeningRange = idx < 30;
    const wasBalanced = Math.abs(cpBefore) < 150;

    const playerColor = om.color as "white" | "black";

    let winPctLossRaw: number;
    if (playerColor === "white") {
      winPctLossRaw = winPct(cpBefore) - winPct(cpAfter);
    } else {
      winPctLossRaw = (100 - winPct(cpBefore)) - (100 - winPct(cpAfter));
    }
    const moveCpLoss = Math.max(0, winPctLossRaw);

    const playerWinBefore = playerColor === "white" ? winPct(cpBefore) : (100 - winPct(cpBefore));
    const playerWinAfter = playerColor === "white" ? winPct(cpAfter) : (100 - winPct(cpAfter));

    let legalMoveCount = 20;
    try { legalMoveCount = new Chess(fenBefore).moves().length; } catch {}

    classification = classifyFromWinPctLoss(winPctLossRaw, isTopEngineMove, isSecondEngineMove, isOpeningRange, wasBalanced, playerWinBefore, stillInBook, playerWinAfter, legalMoveCount, cpBefore, cpAfter, playerColor);

    const isBad = ["inaccuracy", "mistake", "blunder", "missed_win"].includes(classification);
    if (isBad && evalBefore.bestMoveSan && !isTopEngineMove) {
      betterMove = evalBefore.bestMoveSan;
    } else if (!isBad) {
      betterMove = null;
    }

    if (betterMove) {
      const sanOnly = betterMove.split(/\s*[—–-]\s*/)[0].trim();
      try {
        const pos = new Chess(fenBefore);
        pos.move(sanOnly);
      } catch {
        betterMove = null;
      }
    }

    if (classification === "brilliant") {
      if (!isSacrificialMove(fenBefore, om.san)) {
        classification = isTopEngineMove ? "best" : "excellent";
      }
    }

    if (isBad && !betterMove && evalBefore.bestMoveSan) {
      betterMove = evalBefore.bestMoveSan;
    }

    // ── Engine fact extraction + reconciliation guard ─────────────────────
    const facts = computeEngineFacts({
      fenBefore,
      fenAfter: fenAfterMove ?? fenBefore,
      evalBefore,
      evalAfter,
      sanPlayed: om.san,
      classification,
      playerColor,
      inBook: stillInBook,
      legalMoveCount: legalMoves.length,
    });

    let coachStatus: CoachStatus = "engine-aligned";

    // Validate explanation; if invalid, fall back to deterministic template
    if (explanation && explanation.trim()) {
      const check = reconcileExplanation(explanation, facts);
      if (!check.ok) {
        logger.debug({ moveIndex: idx, san: om.san, classification, reasons: check.reasons }, "coach explanation reconciliation failed");
        explanation = buildFallbackExplanation(facts, om.san);
        coachStatus = "fallback";
      }
    } else {
      explanation = buildFallbackExplanation(facts, om.san);
      coachStatus = "fallback";
    }

    // Validate pros/cons: any item that fails reconciliation is dropped;
    // if everything is dropped we use the fact-based fallback set.
    const cleanPros = pros.filter(p => reconcileExplanation(p, facts).ok);
    const cleanCons = cons.filter(c => reconcileExplanation(c, facts).ok);
    if (cleanPros.length !== pros.length || cleanCons.length !== cons.length) {
      coachStatus = "fallback";
    }
    if (cleanPros.length === 0 && cleanCons.length === 0) {
      const fb = buildFallbackProsCons(facts);
      pros = fb.pros;
      cons = fb.cons;
    } else {
      pros = cleanPros;
      cons = cleanCons;
    }

    const bestLineSan = isBad ? (evalBefore.bestLineSan ?? []) : [];

    results.push({
      moveIndex: idx, san: om.san, color: om.color as "white" | "black",
      classification, explanation, betterMove, pros, cons,
      cpLoss: moveCpLoss, engineAvailable: true,
      coachStatus,
      bestLineSan,
    });
  }
  return results;
}

// ── Full-game review ─────────────────────────────────────────────────────────

export interface MoveReview {
  moveIndex: number;
  san: string;
  color: "white" | "black";
  classification: "checkmate" | "brilliant" | "great" | "best" | "excellent" | "good" | "book" | "inaccuracy" | "mistake" | "blunder" | "missed_win";
  explanation: string;
  betterMove: string | null;
  pros: string[];
  cons: string[];
  cpLoss?: number;
  engineAvailable?: boolean;
  /** Whether the coach text was validated against the engine fact sheet
   *  ("engine-aligned") or had to be replaced with a deterministic template
   *  ("fallback"). Absent when no LLM text was applicable. */
  coachStatus?: CoachStatus;
  /** Engine principal variation (in SAN) starting from the position BEFORE the player's move.
   *  Only populated for inaccuracy/mistake/blunder/missed_win moves. Up to 6 plies. */
  bestLineSan?: string[];
}

export interface GameReviewSummary {
  overview: string;
  keyMistakes: Array<{
    moveIndex: number;
    move: string;
    whatWentWrong: string;
    whatYouShouldHaveDone: string;
    tip: string;
  }>;
  strengths: string[];
  improvementAreas: string[];
}

export interface GameReviewResult {
  moves: MoveReview[];
  gameSummary: GameReviewSummary | null;
  /** Computed once, authoritatively, using the shared accuracy formula —
   *  previously each consumer of reviewMoves (the frontend, and a separate
   *  analyze-pgn function) computed its own accuracy independently, with
   *  different fallback-severity tables, guaranteeing they could disagree
   *  for the same underlying moves. */
  whiteAccuracy: number;
  blackAccuracy: number;
}

export async function reviewFullGame(input: {
  moves: Array<{ moveNumber: number; san: string; color: string }>;
  opening: string | null;
  eco: string | null;
  result: string;
  whiteUsername: string;
  blackUsername: string;
  startFen?: string;
  onProgress?: (done: number, total: number) => void;
}): Promise<GameReviewResult> {
  const { moves, opening, eco, result, whiteUsername, blackUsername, startFen, onProgress } = input;
  const ecoBookFens = getBookFensForEco(eco);
  const startTime = Date.now();

  const Chess = require("chess.js").Chess;
  const chess = startFen ? new Chess(startFen) : new Chess();
  const moveDetails: string[] = [];
  const fens: string[] = [chess.fen()];
  const uciMoves: Array<{ from: string; to: string } | null> = [];

  for (let i = 0; i < moves.length; i++) {
    const m = moves[i];
    const fenBefore = chess.fen();
    const legalCount = chess.moves().length;
    try {
      const result = chess.move(m.san);
      fens.push(chess.fen());
      uciMoves.push(result ? { from: result.from, to: result.to } : null);
    } catch {
      fens.push(chess.fen());
      uciMoves.push(null);
      break;
    }
    moveDetails.push(`${i}: ${m.moveNumber}${m.color === "white" ? "." : "..."} ${m.san} [fen:${fenBefore}] [legal:${legalCount}]`);
  }
  const CHUNK_SIZE = 25;
  const needsChunking = moves.length > CHUNK_SIZE;

  function buildChunkPrompt(chunkMoveDetails: string[], chunkStart: number, chunkEnd: number, includeSummary: boolean): string {
    const chunkList = chunkMoveDetails.join("\n");
    const concise = moves.length > 30 ? " BE CONCISE — 1 short sentence per explanation, pros/cons max 8 words each." : "";
    return `You are a chess coach. Analyze moves ${chunkStart}-${chunkEnd} of this game.${concise}

Game: ${whiteUsername} vs ${blackUsername} | ${opening ?? "Unknown"} | ${result}

Moves to analyze:
${chunkList}

Rules:
- Classify each move: "brilliant"|"great"|"best"|"excellent"|"good"|"book"|"inaccuracy"|"mistake"|"blunder"|"missed_win"
- "brilliant" = piece sacrifice that significantly improves position, extremely rare (0-1 per game)
- "great" = shifts momentum or one of very few good moves available
- "best" = the engine's top choice
- "excellent" = very close to the best move
- "good" = solid move that maintains position but not optimal
- "book" = opening theory move or forced move [legal:1]
- "inaccuracy" = slightly worsens position
- "mistake" = bad move that instantly worsens position
- "blunder" = critical mistake causing massive disadvantage
- "missed_win" = fails to capitalize on a winning opportunity
- betterMove: only for inaccuracy/mistake/blunder/missed_win, must be legal in the FEN. null otherwise.

Per move: classification, explanation (1 sentence), pros (1-2 items), cons (1-2 items), betterMove.
${includeSummary ? `
Also provide "gameSummary": overview (2 sentences), keyMistakes (up to 3: moveIndex, move, whatWentWrong, whatYouShouldHaveDone, tip), strengths (1-3), improvementAreas (2-3).` : ""}

You MUST cover ALL ${chunkEnd - chunkStart + 1} moves listed above. Do not skip any.

JSON format:
{"moves":[{"moveIndex":${chunkStart},"san":"...","color":"white","classification":"...","explanation":"...","pros":["..."],"cons":["..."],"betterMove":null}]${includeSummary ? ',"gameSummary":{"overview":"...","keyMistakes":[],"strengths":[],"improvementAreas":[]}' : ""}}`;
  }

  function parseGptResponse(content: string): { moves?: Array<Partial<MoveReview>>; gameSummary?: Partial<GameReviewSummary> } {
    try {
      return JSON.parse(content);
    } catch (parseErr) {
      logger.warn({ parseErr, contentLen: content.length }, "GPT returned malformed JSON — attempting repair");
      let repaired = content;
      const lastBrace = repaired.lastIndexOf("}");
      if (lastBrace > 0) repaired = repaired.slice(0, lastBrace + 1);
      const lastBracket = repaired.lastIndexOf("]");
      const openBrackets = (repaired.match(/\[/g) || []).length;
      const closeBrackets = (repaired.match(/\]/g) || []).length;
      if (openBrackets > closeBrackets) {
        repaired = repaired.slice(0, lastBracket > 0 ? lastBracket + 1 : repaired.length);
        for (let i = 0; i < openBrackets - closeBrackets; i++) repaired += "]";
        repaired += "}";
      }
      try {
        const result = JSON.parse(repaired);
        logger.info("JSON repair successful");
        return result;
      } catch {
        logger.warn("JSON repair failed — returning empty");
        return { moves: [] };
      }
    }
  }

  try {
    logger.info({ positions: fens.length, moves: moves.length, chunked: needsChunking }, "Starting parallel GPT + Stockfish analysis");

    const chunks: Array<{ start: number; end: number; details: string[] }> = [];
    for (let i = 0; i < moveDetails.length; i += CHUNK_SIZE) {
      const end = Math.min(i + CHUNK_SIZE - 1, moveDetails.length - 1);
      chunks.push({ start: i, end, details: moveDetails.slice(i, end + 1) });
    }

    const gptPromises = chunks.map((chunk, ci) => {
      const includeSummary = ci === 0;
      const chunkMoveCount = chunk.end - chunk.start + 1;
      const chunkTokens = Math.min(16384, Math.max(4096, chunkMoveCount * 350 + (includeSummary ? 1500 : 0)));
      const prompt = buildChunkPrompt(chunk.details, chunk.start, chunk.end, includeSummary);
      return openai.chat.completions.create({
        model: "gpt-4o",
        max_completion_tokens: chunkTokens,
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" },
      });
    });

    const [gptResponses, evals] = await Promise.all([
      Promise.all(gptPromises),
      evaluateAllPositions(fens, undefined, onProgress),
    ]);

    const gptTime = Date.now() - startTime;
    const totalTokens = gptResponses.reduce((s, r) => s + (r.usage?.completion_tokens ?? 0), 0);
    logger.info({ gptTimeMs: gptTime, evaluated: evals.length, chunks: chunks.length, totalTokensUsed: totalTokens }, "Parallel GPT + Stockfish complete");

    let allParsedMoves: Array<Partial<MoveReview>> = [];
    let gameSummaryRaw: Partial<GameReviewSummary> | undefined;

    for (let ci = 0; ci < gptResponses.length; ci++) {
      const resp = gptResponses[ci];
      const content = resp.choices[0]?.message?.content ?? "{}";
      const finishReason = resp.choices[0]?.finish_reason;
      if (finishReason === "length") {
        logger.warn({ chunk: ci, finishReason }, "GPT chunk truncated");
      }
      const parsed = parseGptResponse(content);
      const chunkMoves = parsed.moves ?? [];
      logger.info({ chunk: ci, expected: chunks[ci].end - chunks[ci].start + 1, received: chunkMoves.length }, "GPT chunk parsed");
      allParsedMoves.push(...chunkMoves);
      if (parsed.gameSummary) gameSummaryRaw = parsed.gameSummary;
    }

    const validClassifications = ["brilliant", "great", "best", "excellent", "good", "book", "inaccuracy", "mistake", "blunder", "missed_win"];

    if (allParsedMoves.length < moves.length) {
      logger.warn({ expected: moves.length, received: allParsedMoves.length }, "GPT returned fewer moves than expected — remaining use engine-only data");
    }

    const rawMoves = allParsedMoves.map((m, i) => ({
      moveIndex: typeof m.moveIndex === "number" ? m.moveIndex : i,
      san: m.san ?? moves[i]?.san ?? "",
      color: (m.color ?? moves[i]?.color ?? "white") as "white" | "black",
      classification: (validClassifications.includes(m.classification ?? "")
        ? m.classification
        : "good") as MoveReview["classification"],
      explanation: m.explanation ?? "",
      betterMove: m.betterMove ?? null,
      pros: Array.isArray(m.pros) ? m.pros : [],
      cons: Array.isArray(m.cons) ? m.cons : [],
    }));

    const reviewMoves = mergeReviewWithEngine(rawMoves, moves, fens, evals, uciMoves, ecoBookFens);

    const gameSummary: GameReviewSummary | null = gameSummaryRaw ? {
      overview: gameSummaryRaw.overview ?? "",
      keyMistakes: Array.isArray(gameSummaryRaw.keyMistakes)
        ? gameSummaryRaw.keyMistakes.map(km => ({
            moveIndex: km.moveIndex ?? 0,
            move: km.move ?? "",
            whatWentWrong: km.whatWentWrong ?? "",
            whatYouShouldHaveDone: km.whatYouShouldHaveDone ?? "",
            tip: km.tip ?? "",
          }))
        : [],
      strengths: Array.isArray(gameSummaryRaw.strengths) ? gameSummaryRaw.strengths : [],
      improvementAreas: Array.isArray(gameSummaryRaw.improvementAreas) ? gameSummaryRaw.improvementAreas : [],
    } : null;

    const totalTime = Date.now() - startTime;
    logger.info({ totalTimeMs: totalTime, moves: moves.length, gptMovesCovered: allParsedMoves.length }, "Game review complete");

    const accuracyFor = (color: "white" | "black") => {
      const colorMoves = reviewMoves.filter((m) => m.color === color);
      if (colorMoves.length === 0) return 0;
      const avgLoss = colorMoves.reduce((sum, m) => sum + estimatedLossForMove(m), 0) / colorMoves.length;
      return Math.round(accuracyFromAvgLoss(avgLoss) * 10) / 10;
    };

    return {
      moves: reviewMoves,
      gameSummary,
      whiteAccuracy: accuracyFor("white"),
      blackAccuracy: accuracyFor("black"),
    };
  } catch (err) {
    logger.error({ err }, "Failed to review full game with OpenAI");
    throw err;
  }
}

interface CourseLesson {
  title: string;
  content: string;
  orderIndex: number;
  examplePgn: string | null;
  fixExamplePgn?: string | null;
  drillFen?: string | null;
  drillExpectedMove?: string | null;
  drillHint?: string | null;
}

interface CourseOutput {
  title: string;
  description: string;
  category: string;
  difficulty: string;
  lessons: CourseLesson[];
}

function reconstructPgnFromGames(lesson: CourseLesson, gamePgns: string[]): { pgn: string; fixPgn?: string; drillFen?: string } | null {
  const Chess = require("chess.js").Chess;
  if (!lesson.content || !gamePgns.length) return null;

  const mistakeRe = /\*\*(\d+)\.\s*(\.{3})?\s*([KQRBN]?[a-h]?[1-8]?x?[a-h][1-8](?:=[QRBN])?[+#]?|O-O(?:-O)?)[!?]*\*\*/;
  const mistakeMatch = lesson.content.match(mistakeRe);
  if (!mistakeMatch) return null;

  const mistakeMoveNum = parseInt(mistakeMatch[1]);
  const isBlackMistake = !!mistakeMatch[2];
  const mistakeSan = mistakeMatch[3].replace(/[+#!?]/g, "");

  const fixSan = lesson.drillExpectedMove ?? null;

  for (const gamePgn of gamePgns) {
    try {
      const chess = new Chess();
      chess.loadPgn(gamePgn);
      const history = chess.history({ verbose: true });

      const fenHeader = gamePgn.match(/\[FEN\s+"([^"]+)"\]/i);
      const gameStartFen = fenHeader ? fenHeader[1] : null;
      const baseMoveNum = gameStartFen ? (parseInt(gameStartFen.split(" ")[5]) || 1) : 1;
      const baseColorOffset = gameStartFen && gameStartFen.split(" ")[1] === "b" ? 1 : 0;

      for (let i = 0; i < history.length; i++) {
        const move = history[i];
        const globalIdx = baseColorOffset + i;
        const moveNum = baseMoveNum + Math.floor(globalIdx / 2);
        const isBlack = globalIdx % 2 === 1;
        const cleanSan = move.san.replace(/[+#!?]/g, "");

        if (moveNum === mistakeMoveNum && isBlack === isBlackMistake && cleanSan === mistakeSan) {
          const CONTEXT_BEFORE = 5;
          const CONTEXT_AFTER = 3;
          const startIdx = Math.max(0, i - CONTEXT_BEFORE);
          const endIdx = Math.min(history.length - 1, i + CONTEXT_AFTER);

          const replay = new Chess();
          if (gameStartFen) replay.load(gameStartFen);
          for (let j = 0; j < startIdx; j++) replay.move(history[j].san);
          const startFen = replay.fen();

          const pgnParts: string[] = [];
          const builder = new Chess(startFen);
          for (let j = startIdx; j <= endIdx; j++) {
            const m = history[j];
            const gi = baseColorOffset + j;
            const mn = baseMoveNum + Math.floor(gi / 2);
            const black = gi % 2 === 1;

            let comment = "";
            if (j === i) {
              comment = ` {[MISTAKE] This was the critical error.}`;
            } else if (j < i) {
              comment = ` {Leading up to the critical moment.}`;
            } else {
              comment = ` {The consequence of the mistake.}`;
            }

            try {
              builder.move(m.san);
            } catch {
              break;
            }

            if (!black) {
              pgnParts.push(`${mn}. ${m.san}${comment}`);
            } else if (j === startIdx) {
              pgnParts.push(`${mn}... ${m.san}${comment}`);
            } else {
              pgnParts.push(`${m.san}${comment}`);
            }
          }

          if (pgnParts.length < 2) continue;

          const preMistake = new Chess(startFen);
          for (let j = startIdx; j < i; j++) preMistake.move(history[j].san);
          const drillFen = preMistake.fen();

          let resolvedDrillFen = drillFen;
          let fixPgn: string | undefined;
          if (fixSan) {
            try {
              const fixTest = new Chess(drillFen);
              const fixMove = fixTest.move(fixSan);
              if (fixMove) {
                const fixPgnParts: string[] = [];
                const fixBuilder = new Chess(startFen);
                for (let j = startIdx; j < i; j++) {
                  const m = history[j];
                  const gi = baseColorOffset + j;
                  const mn = baseMoveNum + Math.floor(gi / 2);
                  const black = gi % 2 === 1;
                  try { fixBuilder.move(m.san); } catch { break; }
                  if (!black) {
                    fixPgnParts.push(`${mn}. ${m.san} {Leading up to the key moment.}`);
                  } else if (j === startIdx) {
                    fixPgnParts.push(`${mn}... ${m.san} {Leading up to the key moment.}`);
                  } else {
                    fixPgnParts.push(`${m.san} {Leading up to the key moment.}`);
                  }
                }
                try { fixBuilder.move(fixSan); } catch {}
                const fixGi = baseColorOffset + i;
                const fixMn = baseMoveNum + Math.floor(fixGi / 2);
                const fixBlack = fixGi % 2 === 1;
                if (!fixBlack) {
                  fixPgnParts.push(`${fixMn}. ${fixSan} {[FIX] The correct move — this avoids the mistake.}`);
                } else {
                  if (fixPgnParts.length === 0) {
                    fixPgnParts.push(`${fixMn}... ${fixSan} {[FIX] The correct move — this avoids the mistake.}`);
                  } else {
                    fixPgnParts.push(`${fixSan} {[FIX] The correct move — this avoids the mistake.}`);
                  }
                }
                if (fixPgnParts.length >= 2) {
                  fixPgn = `[FEN "${startFen}"]\n\n${fixPgnParts.join(" ")}`;
                }
              }
            } catch {
              resolvedDrillFen = drillFen;
            }
          }

          return { pgn: `[FEN "${startFen}"]\n\n${pgnParts.join(" ")}`, fixPgn, drillFen: resolvedDrillFen };
        }
      }
    } catch {
      continue;
    }
  }

  return null;
}

function validateAndFixPgn(lesson: CourseLesson, gamePgns?: string[]): { pgn: string; fixPgn?: string; drillFen?: string } {
  const Chess = require("chess.js").Chess;

  if (gamePgns && gamePgns.length > 0) {
    const reconstructed = reconstructPgnFromGames(lesson, gamePgns);
    if (reconstructed) {
      try {
        const chess = new Chess();
        chess.loadPgn(reconstructed.pgn);
        if (chess.history().length >= 2) return reconstructed;
      } catch {}
    }
  }

  const pgn = lesson.examplePgn;

  if (pgn && pgn.trim()) {
    try {
      const chess = new Chess();
      chess.loadPgn(pgn);
      const history = chess.history();
      if (history.length > 0) return { pgn };
    } catch {}

    const fenMatch = pgn.match(/\[FEN\s+"([^"]+)"\]/i);
    if (fenMatch) {
      try {
        const fen = fenMatch[1];
        new Chess(fen);
        const moveSection = pgn.replace(/\[[^\]]*\]\s*/g, "").trim();
        const cleanMoves = moveSection.replace(/\{[^}]*\}/g, "").replace(/\d+\.\.\./g, "").trim();
        if (!cleanMoves || cleanMoves === "*") {
          return { pgn: `[FEN "${fen}"]\n\n*` };
        }
        try {
          const chess = new Chess(fen);
          chess.loadPgn(pgn);
          return { pgn };
        } catch {
          const sanPattern = /([KQRBNP]?[a-h]?[1-8]?x?[a-h][1-8](?:=[QRBN])?[+#]?|O-O-O|O-O)/g;
          const moves = moveSection.match(sanPattern);
          if (moves && moves.length > 0) {
            const chess = new Chess(fen);
            const validMoves: string[] = [];
            for (const m of moves) {
              try {
                chess.move(m);
                validMoves.push(m);
              } catch { break; }
            }
            if (validMoves.length > 0) {
              const chess2 = new Chess(fen);
              const numbered: string[] = [];
              const fullMove = parseInt(fen.split(" ")[5]) || 1;
              const isBlack = fen.split(" ")[1] === "b";
              for (let i = 0; i < validMoves.length; i++) {
                chess2.move(validMoves[i]);
                const globalIdx = (isBlack ? 1 : 0) + i;
                const moveNum = fullMove + Math.floor(globalIdx / 2);
                if (globalIdx % 2 === 0) {
                  numbered.push(`${moveNum}. ${validMoves[i]}`);
                } else {
                  if (i === 0 && isBlack) {
                    numbered.push(`${moveNum}... ${validMoves[i]}`);
                  } else {
                    numbered[numbered.length - 1] += ` ${validMoves[i]}`;
                  }
                }
              }
              return { pgn: `[FEN "${fen}"]\n\n${numbered.join(" ")} *` };
            }
          }
          return { pgn: `[FEN "${fen}"]\n\n*` };
        }
      } catch {}
    }
  }

  if (lesson.drillFen) {
    try {
      new Chess(lesson.drillFen);
      const comment = lesson.drillHint ? `{${lesson.drillHint}}` : "{Study this position.}";
      if (lesson.drillExpectedMove) {
        try {
          const chess = new Chess(lesson.drillFen);
          chess.move(lesson.drillExpectedMove);
          return { pgn: `[FEN "${lesson.drillFen}"]\n\n1. ${lesson.drillExpectedMove} ${comment} *` };
        } catch {}
      }
      return { pgn: `[FEN "${lesson.drillFen}"]\n\n*` };
    } catch {}
  }

  return { pgn: "1. e4 {White opens with the most popular first move.} e5 {Black mirrors, contesting the center.} 2. Nf3 {Developing a knight toward the center.} Nc6 {Defending the e5 pawn.} *" };
}

function ensureAllLessonsHavePgn(course: CourseOutput, gamePgns?: string[]): CourseOutput {
  return {
    ...course,
    lessons: course.lessons.map(lesson => {
      const result = validateAndFixPgn(lesson, gamePgns);
      return {
        ...lesson,
        examplePgn: result.pgn,
        ...(result.fixPgn ? { fixExamplePgn: result.fixPgn } : {}),
        ...(result.drillFen ? { drillFen: result.drillFen } : {}),
      };
    }),
  };
}

// ── Fact-grounded course generation ──────────────────────────────────────
//
// generateCourseForWeakness / generateExploitCourseForOpponent / the
// personal-endgames branch of generateEndgameCourse used to ask GPT to
// "mentally replay" a PGN, invent the FEN at the mistake, decide what the
// mistake was, and invent a legal correct continuation — all from GPT's own
// knowledge, with no chess.js or Stockfish verification. That's exactly the
// kind of task LLMs are unreliable at (tracking exact board state over many
// moves), which is why lesson PGNs/positions/"best moves" could end up
// wrong or even illegal.
//
// TeachableMistake below is a real, engine-verified error found by replaying
// actual games with chess.js and evaluating every position with Stockfish —
// the same mechanism reviewFullGame already uses. GPT is only used to write
// the prose explanation, grounded by the real fact sheet and validated with
// reconcileExplanation (same guard as single-move analysis).

// ── Engine-grounded weakness detection ───────────────────────────────────
//
// analyzePlayerGames (below) asks GPT to read raw move text from the last
// 30 games and guess at weaknesses from its own chess knowledge — the same
// unreliable pattern already fixed for lesson generation. But for games
// that have already been through reviewFullGame, real per-move
// classifications (blunder/mistake/inaccuracy/etc, computed by Stockfish,
// not guessed) already exist. This computes weaknesses directly from that
// real data — deterministically, no GPT call at all, since these are
// statistics, not judgment calls. Falls back to null (caller should use the
// GPT-based path instead) when there isn't enough reviewed-game data yet
// for the numbers to be meaningful.

export interface GroundedReviewedGame {
  id: number;
  opening: string | null;
  whiteUsername: string;
  blackUsername: string;
  reviewData: unknown;
}

const MIN_REVIEWED_GAMES_FOR_GROUNDED_WEAKNESSES = 8;

export function computeGroundedWeaknesses(
  username: string,
  games: GroundedReviewedGame[],
): AnalysisOutput | null {
  if (games.length < MIN_REVIEWED_GAMES_FOR_GROUNDED_WEAKNESSES) return null;

  type FlatMove = { classification: string; moveIndex: number; gameId: number; opening: string | null };
  const playerMoves: FlatMove[] = [];

  for (const g of games) {
    const rd = g.reviewData as { moves?: MoveReview[] } | MoveReview[] | null;
    const moves: MoveReview[] = Array.isArray(rd)
      ? rd
      : Array.isArray((rd as { moves?: MoveReview[] } | null)?.moves)
        ? (rd as { moves: MoveReview[] }).moves
        : [];
    const userColor: "white" | "black" =
      g.whiteUsername.toLowerCase() === username.toLowerCase() ? "white" : "black";
    for (const m of moves) {
      if (m.color !== userColor || typeof m.classification !== "string") continue;
      playerMoves.push({ classification: m.classification, moveIndex: m.moveIndex ?? 0, gameId: g.id, opening: g.opening });
    }
  }

  if (playerMoves.length < 20) return null;

  const totalMoves = playerMoves.length;
  const countBy = (cls: string) => playerMoves.filter((m) => m.classification === cls).length;
  const blunders = countBy("blunder");
  const mistakes = countBy("mistake");
  const missedWins = countBy("missed_win");
  const badMoveRate = (blunders + mistakes) / totalMoves;

  const phaseOf = (moveIndex: number): "opening" | "middlegame" | "endgame" => {
    const moveNumber = Math.floor(moveIndex / 2) + 1;
    return moveNumber <= 15 ? "opening" : moveNumber <= 32 ? "middlegame" : "endgame";
  };
  const phaseBad: Record<string, number> = { opening: 0, middlegame: 0, endgame: 0 };
  const phaseTotal: Record<string, number> = { opening: 0, middlegame: 0, endgame: 0 };
  for (const m of playerMoves) {
    const p = phaseOf(m.moveIndex);
    phaseTotal[p]++;
    if (m.classification === "blunder" || m.classification === "mistake") phaseBad[p]++;
  }
  const phaseRate = (p: string) => (phaseTotal[p] > 0 ? phaseBad[p] / phaseTotal[p] : 0);

  const openingGroups = new Map<string, { games: Set<number>; bad: number; total: number }>();
  for (const m of playerMoves) {
    const key = m.opening || "Unknown Opening";
    if (!openingGroups.has(key)) openingGroups.set(key, { games: new Set(), bad: 0, total: 0 });
    const grp = openingGroups.get(key)!;
    grp.games.add(m.gameId);
    grp.total++;
    if (m.classification === "blunder" || m.classification === "mistake") grp.bad++;
  }

  // Maps a real gameId back to its index in the `games` array — the frontend
  // (WeaknessDetail.tsx) derives a preview board position from the first
  // related game's index, so leaving this empty (as it was before) meant
  // every grounded weakness silently lost its preview board.
  const gameIdToIndex = new Map<number, number>();
  games.forEach((g, i) => gameIdToIndex.set(g.id, i));
  const toIndices = (gameIds: Iterable<number>, limit = 5): number[] =>
    Array.from(new Set(Array.from(gameIds).map((id) => gameIdToIndex.get(id)).filter((i): i is number => i != null))).slice(0, limit);

  const weaknesses: WeaknessResult[] = [];

  const phases: Array<"opening" | "middlegame" | "endgame"> = ["opening", "middlegame", "endgame"];
  const validPhases = phases.filter((p) => phaseTotal[p] >= 10);
  if (validPhases.length >= 2) {
    const worst = validPhases.reduce((a, b) => (phaseRate(a) > phaseRate(b) ? a : b));
    const best = validPhases.reduce((a, b) => (phaseRate(a) < phaseRate(b) ? a : b));
    if (worst !== best && phaseRate(worst) > phaseRate(best) * 1.4 && phaseRate(worst) > 0.08) {
      const label = worst === "opening" ? "Opening Preparation" : worst === "middlegame" ? "Positional Play" : "Endgame Technique";
      const contributingGameIds = playerMoves
        .filter((m) => phaseOf(m.moveIndex) === worst && (m.classification === "blunder" || m.classification === "mistake"))
        .map((m) => m.gameId);
      weaknesses.push({
        category: label,
        severity: phaseRate(worst) > 0.25 ? "High" : phaseRate(worst) > 0.15 ? "Medium" : "Low",
        description: `Across your ${games.length} reviewed games, ${Math.round(phaseRate(worst) * 100)}% of your ${worst} moves were inaccuracies or worse, versus ${Math.round(phaseRate(best) * 100)}% in the ${best}. This is your most costly phase.`,
        frequency: phaseBad[worst],
        examples: [],
        relatedGameIndices: toIndices(contributingGameIds),
      });
    }
  }

  if (missedWins >= 3) {
    const rate = missedWins / games.length;
    const contributingGameIds = playerMoves.filter((m) => m.classification === "missed_win").map((m) => m.gameId);
    weaknesses.push({
      category: "Tactical Awareness",
      severity: rate > 0.15 ? "High" : rate > 0.08 ? "Medium" : "Low",
      description: `You've let a winning position slip away in ${missedWins} of your last ${games.length} reviewed games (${Math.round(rate * 100)}%) — the engine confirms you were winning before a mistake handed back the advantage.`,
      frequency: missedWins,
      examples: [],
      relatedGameIndices: toIndices(contributingGameIds),
    });
  }

  if (blunders >= 5) {
    const perGame = blunders / games.length;
    const contributingGameIds = playerMoves.filter((m) => m.classification === "blunder").map((m) => m.gameId);
    weaknesses.push({
      category: "Tactical Awareness",
      severity: perGame > 1 ? "High" : perGame > 0.5 ? "Medium" : "Low",
      description: `You've blundered ${blunders} times across ${games.length} reviewed games — about ${perGame.toFixed(1)} per game on average.`,
      frequency: blunders,
      examples: [],
      relatedGameIndices: toIndices(contributingGameIds),
    });
  }

  let worstOpening: { name: string; rate: number; gameCount: number } | null = null;
  for (const [name, grp] of openingGroups.entries()) {
    if (grp.games.size < 3 || grp.total < 8) continue;
    const rate = grp.bad / grp.total;
    if (!worstOpening || rate > worstOpening.rate) worstOpening = { name, rate, gameCount: grp.games.size };
  }
  if (worstOpening && worstOpening.rate > badMoveRate * 1.3 && worstOpening.rate > 0.12) {
    const contributingGameIds = openingGroups.get(worstOpening.name)?.games ?? new Set<number>();
    weaknesses.push({
      category: "Opening Preparation",
      severity: worstOpening.rate > 0.25 ? "High" : "Medium",
      description: `In the ${worstOpening.name} (${worstOpening.gameCount} games), ${Math.round(worstOpening.rate * 100)}% of your moves were inaccuracies or worse — noticeably above your ${Math.round(badMoveRate * 100)}% overall rate.`,
      frequency: worstOpening.gameCount,
      examples: [],
      relatedGameIndices: toIndices(contributingGameIds),
    });
  }

  if (weaknesses.length === 0) return null;

  return {
    weaknesses: weaknesses.slice(0, 6),
    summary: `Based on real engine analysis of your ${games.length} reviewed games (${totalMoves} of your moves evaluated), your overall inaccuracy-or-worse rate is ${Math.round(badMoveRate * 100)}%.`,
  };
}

export interface TeachableMistake {
  gameIndex: number;
  moveNumber: number;
  color: "white" | "black";
  sanPlayed: string;
  /** FEN immediately before the mistake — this is what the student is quizzed on. */
  fenBeforeMistake: string;
  facts: EngineFacts;
  /** A few SAN moves of real game history leading up to the mistake, for board context. */
  contextSan: string[];
  /** SAN move immediately after the mistake (if any), for showing the consequence. */
  consequenceSan: string[];
  bestMoveSan: string;
  bestLineSan: string[];
}

// Course generation commonly calls this once per weakness (up to 4x in a
// single batch), often falling back to the SAME "player's last N games"
// when a weakness has no specific related games — without caching, that
// means re-running a full Stockfish pass over identical games up to 4x in
// one job. Cache by content hash, capped so it can't grow unbounded across
// the life of the server process.
const teachableMistakeCache = new Map<string, TeachableMistake[]>();
const TEACHABLE_MISTAKE_CACHE_MAX = 30;

function cacheKeyFor(gamePgns: string[], skipOpeningPlies: number): string {
  const crypto = require("crypto");
  return crypto.createHash("sha1").update(`${skipOpeningPlies}:${gamePgns.join("\u0000")}`).digest("hex");
}

/**
 * Replays real game PGNs, evaluates every position with Stockfish, and
 * returns actual mistakes/blunders/missed wins ranked worst-first. This is
 * the ground truth that course generation should teach from, instead of
 * letting GPT invent positions.
 */
export async function findTeachableMistakes(
  gamePgns: string[],
  opts?: { maxResults?: number; skipOpeningPlies?: number },
): Promise<TeachableMistake[]> {
  const maxResults = opts?.maxResults ?? 8;
  const skipOpeningPlies = opts?.skipOpeningPlies ?? 10;

  const cacheKey = cacheKeyFor(gamePgns, skipOpeningPlies);
  const cached = teachableMistakeCache.get(cacheKey);
  if (cached) {
    return cached.slice(0, maxResults);
  }

  const Chess = require("chess.js").Chess;

  const candidates: TeachableMistake[] = [];

  for (let gameIndex = 0; gameIndex < gamePgns.length; gameIndex++) {
    try {
      const chess = new Chess();
      chess.loadPgn(gamePgns[gameIndex]);
      const history = chess.history({ verbose: true }) as Array<{
        san: string; color: "w" | "b"; from: string; to: string;
      }>;
      if (history.length < 4) continue;

      // Replay from scratch to collect FEN before each ply.
      const replay = new Chess();
      const fens: string[] = [replay.fen()];
      for (const m of history) {
        replay.move(m.san);
        fens.push(replay.fen());
      }

      const evals = await evaluateAllPositions(fens);

      for (let ply = skipOpeningPlies; ply < history.length; ply++) {
        const m = history[ply];
        const evalBefore = evals[ply];
        const evalAfter = evals[ply + 1];
        if (!evalBefore || !evalAfter) continue;

        const fenBefore = fens[ply];
        let legalMoveCount = 20;
        try { legalMoveCount = new Chess(fenBefore).moves().length; } catch {}
        if (legalMoveCount <= 1) continue; // forced move, nothing to teach

        const playerColor: "white" | "black" = m.color === "w" ? "white" : "black";
        const cpBefore = evalBefore.cpWhite;
        const cpAfter = evalAfter.cpWhite;
        const playedUci = `${m.from}${m.to}`;
        const isTopEngineMove = evalBefore.bestMoveUci.startsWith(playedUci);
        const isSecondEngineMove = evalBefore.secondBestUci.startsWith(playedUci);
        const isOpeningRange = ply < 30;
        const wasBalanced = Math.abs(cpBefore) < 150;

        let winPctLossRaw: number;
        if (playerColor === "white") {
          winPctLossRaw = winPct(cpBefore) - winPct(cpAfter);
        } else {
          winPctLossRaw = (100 - winPct(cpBefore)) - (100 - winPct(cpAfter));
        }
        const playerWinBefore = playerColor === "white" ? winPct(cpBefore) : 100 - winPct(cpBefore);
        const playerWinAfter = playerColor === "white" ? winPct(cpAfter) : 100 - winPct(cpAfter);

        const classification = classifyFromWinPctLoss(
          winPctLossRaw, isTopEngineMove, isSecondEngineMove, isOpeningRange, wasBalanced,
          playerWinBefore, false, playerWinAfter, legalMoveCount, cpBefore, cpAfter, playerColor,
        );

        if (!["inaccuracy", "mistake", "blunder", "missed_win"].includes(classification)) continue;
        if (!evalBefore.bestMoveSan) continue;

        const facts = computeEngineFacts({
          fenBefore, fenAfter: fens[ply + 1], evalBefore, evalAfter,
          sanPlayed: m.san, classification, playerColor, inBook: false, legalMoveCount,
        });

        const contextSan = history.slice(Math.max(0, ply - 5), ply).map(h => h.san);
        const consequenceSan = history.slice(ply + 1, ply + 4).map(h => h.san);

        candidates.push({
          gameIndex,
          moveNumber: Math.floor(ply / 2) + 1,
          color: playerColor,
          sanPlayed: m.san,
          fenBeforeMistake: fenBefore,
          facts,
          contextSan,
          consequenceSan,
          bestMoveSan: evalBefore.bestMoveSan,
          bestLineSan: evalBefore.bestLineSan?.length ? evalBefore.bestLineSan : [evalBefore.bestMoveSan],
        });
      }
    } catch (err) {
      logger.warn({ err, gameIndex }, "findTeachableMistakes: failed to replay game, skipping");
    }
  }

  // Worst first (biggest win% swing), then dedupe near-identical positions.
  candidates.sort((a, b) => b.facts.winPctSwing - a.facts.winPctSwing);

  if (teachableMistakeCache.size >= TEACHABLE_MISTAKE_CACHE_MAX) {
    const oldestKey = teachableMistakeCache.keys().next().value;
    if (oldestKey !== undefined) teachableMistakeCache.delete(oldestKey);
  }
  teachableMistakeCache.set(cacheKey, candidates);

  return candidates.slice(0, maxResults);
}

/** Deterministically build the PGN context around a real mistake — no GPT involved. */
function buildContextPgn(mistake: TeachableMistake, useBestMove: boolean): string {
  const Chess = require("chess.js").Chess;
  const replay = new Chess(mistake.fenBeforeMistake);
  const isBlackToMove = mistake.fenBeforeMistake.split(" ")[1] === "b";
  const startMoveNum = mistake.moveNumber;

  // Each token is a fully-formed "SAN {comment}" (or just "SAN") string, in
  // playing order starting from fenBeforeMistake.
  const tokens: string[] = [];

  if (useBestMove) {
    const bestSan = mistake.bestMoveSan;
    try { replay.move(bestSan); } catch { return `[FEN "${mistake.fenBeforeMistake}"]\n\n*`; }
    tokens.push(`${bestSan} {[FIX] ${bestSan} is the engine's preferred move here.}`);
    for (let i = 1; i < mistake.bestLineSan.length && i < 5; i++) {
      const san = mistake.bestLineSan[i];
      try { replay.move(san); tokens.push(san); } catch { break; }
    }
  } else {
    try { replay.move(mistake.sanPlayed); } catch { return `[FEN "${mistake.fenBeforeMistake}"]\n\n*`; }
    tokens.push(`${mistake.sanPlayed} {[MISTAKE] This is the move being reviewed.}`);
    for (const san of mistake.consequenceSan) {
      try { replay.move(san); tokens.push(san); } catch { break; }
    }
  }

  // Number the tokens, respecting whose move it is at fenBeforeMistake.
  let moveNum = startMoveNum;
  let out = "";
  for (let i = 0; i < tokens.length; i++) {
    const isWhiteMove = isBlackToMove ? i % 2 === 1 : i % 2 === 0;
    if (isWhiteMove) {
      out += `${moveNum}. ${tokens[i]} `;
    } else {
      if (i === 0) out += `${moveNum}... ${tokens[i]} `;
      else out += `${tokens[i]} `;
      moveNum += 1;
    }
  }
  return `[FEN "${mistake.fenBeforeMistake}"]\n\n${out.trim()} *`;
}

/** Ask GPT for just the prose explanation of a real, engine-verified mistake — grounded and validated. */
async function writeGroundedLessonContent(mistake: TeachableMistake): Promise<{ title: string; content: string }> {
  const factSheet = renderFactSheet(mistake.facts);
  const moveLabel = mistake.color === "white"
    ? `${mistake.moveNumber}. ${mistake.sanPlayed}`
    : `${mistake.moveNumber}... ${mistake.sanPlayed}`;
  const fixLabel = mistake.color === "white"
    ? `${mistake.moveNumber}. ${mistake.bestMoveSan}`
    : `${mistake.moveNumber}... ${mistake.bestMoveSan}`;

  const prompt = `You are a chess coach. Write a short lesson about ONE real move from the student's own game.

Engine facts (ground truth — do not contradict these): ${factSheet}
Move played: ${moveLabel}
Engine's preferred move instead: ${fixLabel}

Write valid JSON:
{
  "title": "Short lesson title (max 60 chars), naming the pattern (e.g. 'Missed knight fork on move ${mistake.moveNumber}')",
  "content": "## The Mistake\\n1-2 short paragraphs on why **${moveLabel}** was wrong, using ONLY the facts above (do not invent tactics, threats, or piece positions not listed in the facts).\\n\\n## The Fix\\n1-2 short paragraphs on why **${fixLabel}** was better, using ONLY the facts above. End with one takeaway sentence."
}

Rules: Only reference pieces, captures, and threats that appear in the engine facts above. Do not describe hanging pieces, tactics, or threats that aren't listed. Keep it concrete and specific to this position, not generic advice.`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-5.2",
      max_completion_tokens: 900,
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
    });
    const parsed = JSON.parse(response.choices[0]?.message?.content ?? "{}") as { title?: string; content?: string };
    const check = parsed.content ? reconcileExplanation(parsed.content, mistake.facts) : { ok: false, reasons: ["empty"] };
    if (parsed.title && parsed.content && check.ok) {
      return { title: parsed.title, content: parsed.content };
    }
    logger.warn({ reasons: check.reasons }, "Grounded lesson content failed reconciliation, using fallback");
  } catch (err) {
    logger.warn({ err }, "Failed to generate grounded lesson content, using fallback");
  }

  // Deterministic, fact-only fallback — never wrong, just less prose-y.
  const mistakeExplanation = buildFallbackExplanation(mistake.facts, mistake.sanPlayed);
  const fallbackPros = buildFallbackProsCons(mistake.facts);
  return {
    title: `${mistake.facts.classification === "blunder" ? "Blunder" : "Mistake"} on move ${mistake.moveNumber}`,
    content: `## The Mistake\n**${moveLabel}** — ${mistakeExplanation}\n\n## The Fix\n**${fixLabel}** was the engine's preferred move instead. ${fallbackPros.cons.join(" ")}`,
  };
}

/** Build a full CourseOutput lesson from one real, verified mistake. */
async function buildLessonFromMistake(mistake: TeachableMistake, orderIndex: number): Promise<CourseLesson> {
  const { title, content } = await writeGroundedLessonContent(mistake);
  return {
    title,
    content,
    orderIndex,
    examplePgn: buildContextPgn(mistake, false),
    fixExamplePgn: buildContextPgn(mistake, true),
    drillFen: mistake.fenBeforeMistake,
    drillExpectedMove: mistake.bestMoveSan,
    drillHint: mistake.facts.hungPiece
      ? `Watch out for your ${mistake.facts.hungPiece} — find the move that keeps it safe.`
      : `Look for the engine's top idea in this position.`,
  };
}

export async function generateExploitCourseForOpponent(
  opponentUsername: string,
  weakness: WeaknessResult,
  relatedGamePgns?: string[]
): Promise<CourseOutput> {
  if (relatedGamePgns?.length) {
    const mistakes = await findTeachableMistakes(relatedGamePgns, { maxResults: 5 });
    if (mistakes.length > 0) {
      const lessons = await Promise.all(mistakes.map((m, i) => buildLessonFromMistake(m, i)));
      return {
        title: `vs ${opponentUsername}: exploiting their ${weakness.category}`.slice(0, 60),
        description: `A course built from ${opponentUsername}'s actual games, targeting real moments where their ${weakness.category} showed up.`,
        category: weakness.category,
        difficulty: "Intermediate",
        lessons,
      };
    }
  }
  return generateExploitCourseForOpponentLLM(opponentUsername, weakness, relatedGamePgns);
}

async function generateExploitCourseForOpponentLLM(
  opponentUsername: string,
  weakness: WeaknessResult,
  relatedGamePgns?: string[]
): Promise<CourseOutput> {
  const gameSection = relatedGamePgns?.length
    ? `\n\nACTUAL GAMES WHERE THIS WEAKNESS APPEARED:\n${relatedGamePgns.map((pgn, i) => `--- Game ${i + 1} ---\n${pgn}`).join("\n\n")}\n\nCRITICAL: Your lesson PGNs MUST be drawn from these actual games. Each lesson's examplePgn should replay a key segment from one of these games (the moves where the weakness is visible), with commentary. Use a [FEN "..."] tag if starting from a mid-game position. Do NOT invent generic opening sequences — use the real moves from the games above.`
    : "";

  const prompt = `You are an expert chess coach preparing a player to face a specific opponent.

Opponent: ${opponentUsername}
Opponent's Weakness: ${weakness.category}
Severity: ${weakness.severity}
Description: ${weakness.description}
Examples from their games: ${weakness.examples.join("; ")}${gameSection}

Create a course (4–5 lessons) that teaches the STUDENT how to recognize, steer toward, and EXPLOIT this specific weakness in their opponent. Frame everything from the student's perspective ("you should…", "to exploit this…"). Do NOT teach how to fix the weakness — teach how to punish it.

RULES for each lesson:
1. examplePgn: MANDATORY — every lesson MUST have a valid PGN string (NEVER null, NEVER empty). This is the most important field — it drives the interactive chessboard that students use to learn.
   - Every move must have a {comment in curly braces} explaining WHY it matters and how to exploit it
   - After the FEN header (if used), include at least 3-6 moves of actual play
   - Legal moves only — verify each move is legal from the given position
   - The PGN must be parseable by chess.js — use standard algebraic notation
   - ${relatedGamePgns?.length ? "MUST use actual move sequences from the provided games. If the relevant sequence starts mid-game, include a [FEN \"...\"] header with the starting position." : "Base the moves on the patterns described in the weakness examples. Start from the initial position unless the weakness is endgame-specific."}
   - Do NOT invent generic textbook openings — every PGN must reflect the specific patterns and moves described in the weakness

2. drillFen: A FEN string representing a position from one of the actual games where the student must find the move that best exploits this weakness.

3. drillExpectedMove: The move in SAN notation that most effectively exploits the weakness (must be legal in drillFen).

4. drillHint: A one-sentence hint guiding the student toward the exploitation.

5. fixExamplePgn: A SECOND PGN showing the CORRECT exploitation line. Same starting position and context moves as examplePgn, but plays the optimal exploiting move (drillExpectedMove) instead. Then include 3-6 best continuation moves showing the advantage gained. The correct move's comment MUST start with [FIX].

6. content: 3–5 paragraphs of concrete coaching on HOW to exploit this specific pattern. Reference specific moves from the opponent's actual games. Name the tactical/positional motifs, the move orders that provoke mistakes, and the techniques that punish this weakness.

Respond with valid JSON:
{
  "title": "vs ${opponentUsername}: [short title related to exploiting their ${weakness.category}] (max 60 chars)",
  "description": "2-3 sentence description focused on exploiting ${opponentUsername}'s ${weakness.category}",
  "category": "${weakness.category}",
  "difficulty": "Beginner|Intermediate|Advanced",
  "lessons": [
    {
      "title": "Lesson title",
      "content": "3-5 paragraphs of exploitation-focused coaching referencing actual game moves...",
      "orderIndex": 0,
      "examplePgn": "1. e4 {Comment on the actual game move} e5 {Comment} ...",
      "fixExamplePgn": "1. e4 {Comment} e5 {Comment} 2. Nf3 {[FIX] The correct exploitation...} ...",
      "drillFen": "rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 2",
      "drillExpectedMove": "Nc6",
      "drillHint": "Find the move that puts maximum pressure on their weak point"
    }
  ]
}`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-5.2",
      max_completion_tokens: 8192,
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
    });

    const content = response.choices[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(content) as CourseOutput;
    return ensureAllLessonsHavePgn(parsed, relatedGamePgns);
  } catch (err) {
    logger.error({ err }, "Failed to generate exploit course with OpenAI");
    throw err;
  }
}

export async function generateCourseForWeakness(
  weakness: WeaknessResult,
  relatedGamePgns?: string[]
): Promise<CourseOutput> {
  if (relatedGamePgns?.length) {
    const mistakes = await findTeachableMistakes(relatedGamePgns, { maxResults: 5 });
    if (mistakes.length > 0) {
      const lessons = await Promise.all(mistakes.map((m, i) => buildLessonFromMistake(m, i)));
      return {
        title: `Fixing your ${weakness.category}`.slice(0, 60),
        description: `A course built from your own games, targeting the ${mistakes.length} clearest real moments where ${weakness.category.toLowerCase()} cost you.`,
        category: weakness.category,
        difficulty: weakness.severity === "high" ? "Advanced" : weakness.severity === "low" ? "Beginner" : "Intermediate",
        lessons,
      };
    }
  }
  return generateCourseForWeaknessLLM(weakness, relatedGamePgns);
}

async function generateCourseForWeaknessLLM(
  weakness: WeaknessResult,
  relatedGamePgns?: string[]
): Promise<CourseOutput> {
  const gameSection = relatedGamePgns?.length
    ? `\n\nACTUAL GAMES FROM THE PLAYER WHERE THIS WEAKNESS APPEARED:\n${relatedGamePgns.map((pgn, i) => `--- Game ${i + 1} ---\n${pgn}`).join("\n\n")}\n\nCRITICAL: Your lesson PGNs MUST be drawn from these actual games. Each lesson's examplePgn should replay a key segment from one of these games (the moves where the weakness/mistake occurs), with commentary explaining what went wrong and what should have been played instead. Use a [FEN "..."] tag if starting from a mid-game position. Do NOT invent generic opening sequences — use the real moves from the games above.`
    : "";

  const prompt = `You are an expert chess coach. Create a personalized chess course to address this specific weakness:

Category: ${weakness.category}
Severity: ${weakness.severity}
Description: ${weakness.description}
Examples from player's games: ${weakness.examples.join("; ")}${gameSection}

Create a course with 4-5 lessons. Each lesson MUST be tightly focused on a concrete sub-skill within this weakness — no generic advice.

RULES for each lesson:
1. examplePgn: MANDATORY — every lesson MUST have a valid PGN string (NEVER null, NEVER empty). This is the most important field — it drives the interactive chessboard.
   - CRITICAL: Use moves DIRECTLY from the provided game PGNs when available. Do NOT invent moves.
   - Use a [FEN "..."] header for the position 5 half-moves BEFORE the mistake move.
   - To get the correct FEN: mentally replay the game to that point and write the exact board position.
   - After the FEN header, include the actual game moves leading up to AND including the mistake.
   - Every move must have a {comment in curly braces} explaining exactly WHY it matters.
   - The mistake move MUST have [MISTAKE] at the START of its comment.
   - After the mistake, include 2-3 more moves showing the consequence.
   - EVERY move must be LEGAL from the position after the previous move. Verify this carefully.
   - Use standard algebraic notation (SAN) — e.g. Nf3, Bxe5, O-O, exd5.
   - State the EXACT move number from the original game — do not renumber.
   - ${relatedGamePgns?.length ? "MUST use actual move sequences from the provided games." : "Base the moves on the patterns described in the weakness examples."}
   - Do NOT invent generic textbook openings — every PGN must reflect the specific patterns and moves described in the weakness

2. drillFen: The exact FEN position ONE move BEFORE the mistake — where the student must choose the correct alternative.
   Choose the exact position where the mistake was made or could have been avoided.

3. drillExpectedMove: The best move in the drill position in SAN notation (e.g. "Ng5", "d4", "Bxf7+").
   This must be a legal move from the drillFen position.

4. drillHint: A one-sentence hint the player can reveal if stuck (e.g. "Look for a way to attack the f7 square").

5. fixExamplePgn: MANDATORY — a SECOND PGN string showing the CORRECT continuation. This is what the board shows when the student views "The Fix".
   - Use the SAME [FEN "..."] starting position and same context moves as examplePgn.
   - Instead of the mistake move, play the CORRECT move (drillExpectedMove).
   - After the correct move, include 3-6 moves of the BEST continuation showing why this is better.
   - The correct move's comment MUST start with [FIX] (e.g. "{[FIX] This is better because...}").
   - Every move must be LEGAL. Use standard algebraic notation.

6. content: MUST follow this exact structure with these markdown headings:

   ## The Mistake
   1-2 paragraphs identifying the exact move(s) where the player went wrong. IMPORTANT: Write the mistake move in bold with exact move number, e.g. **14...Bxe4??** or **22. Rxd1??**. Explain WHY it was a mistake — what it allowed the opponent to do or what it gave up positionally.

   ## The Fix
   1-2 paragraphs explaining what the player SHOULD have done instead. Write the correct move in bold with exact move number, e.g. **14...Nf6** or **22. Qxd1**. Explain WHY it's better — what it achieves tactically or positionally. End with a takeaway the player can apply to future games.

   This two-part structure ("The Mistake" then "The Fix") is mandatory for every lesson. The bold move notation is critical for the interactive board to work correctly. Reference actual moves from the player's games — no generic advice.

Respond with valid JSON:
{
  "title": "Course title (max 60 chars)",
  "description": "2-3 sentence course description",
  "category": "${weakness.category}",
  "difficulty": "Beginner|Intermediate|Advanced",
  "lessons": [
    {
      "title": "Lesson title",
      "content": "## The Mistake\nIn your game you played **5. Bg5??**, which...\n\n## The Fix\nInstead, **5. O-O** was the correct move because it...\n\n**Takeaway:** Always check for...",
      "orderIndex": 0,
      "examplePgn": "[FEN \"r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4\"]\n\n4. d3 {Setting up a quiet Italian structure} Be7 {Developing the bishop} 5. Bg5 {[MISTAKE] Pinning the knight prematurely — this allows a fork} d6 {Black calmly defends}",
      "fixExamplePgn": "[FEN \"r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4\"]\n\n4. d3 {Setting up a quiet Italian structure} Be7 {Developing the bishop} 5. O-O {[FIX] Castling first is safer — secures the king before any aggressive plans} d6 {A solid response} 6. Re1 {Preparing central play} O-O {Both sides have castled safely}",
      "drillFen": "rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 2",
      "drillExpectedMove": "Nc6",
      "drillHint": "Develop a piece that also defends the pawn"
    }
  ]
}`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-5.2",
      max_completion_tokens: 8192,
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
    });

    const content = response.choices[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(content) as CourseOutput;
    return ensureAllLessonsHavePgn(parsed, relatedGamePgns);
  } catch (err) {
    logger.error({ err }, "Failed to generate course with OpenAI");
    throw err;
  }
}

export type EndgameType = "checkmate_patterns" | "essential_endgames" | "personal_endgames";

const ENDGAME_TOPICS: Record<Exclude<EndgameType, "personal_endgames">, { title: string; subtopics: string[] }> = {
  checkmate_patterns: {
    title: "Checkmate Patterns",
    subtopics: [
      "Back rank mate — recognizing when the king is trapped behind its own pawns",
      "Smothered mate — using a knight when the king is boxed in by friendly pieces",
      "Queen and rook battery checkmates — coordinating heavy pieces on open files",
      "Bishop and queen diagonal mates — exploiting weakened kingside diagonals",
      "Arabian mate — rook + knight coordination on the edge of the board",
    ],
  },
  essential_endgames: {
    title: "Essential Endgames",
    subtopics: [
      "King + pawn vs King — the rule of the square, opposition, and key squares",
      "King + rook vs King — the staircase / box method for forcing checkmate",
      "Rook endgames — Lucena position (winning with an extra pawn) and Philidor position (drawing technique)",
      "Queen vs pawn on 7th — winning technique and when it's a draw",
      "Bishop vs knight endgames — when each piece is stronger and how to convert",
    ],
  },
};

export async function generateEndgameCourse(
  type: EndgameType,
  playerRating?: number,
  gamePgns?: string[],
): Promise<CourseOutput> {
  if (type === "personal_endgames" && gamePgns?.length) {
    // Endgame mistakes only — approximate "endgame phase" as roughly the
    // last third of the game by skipping straight past the opening/middlegame.
    const mistakes = await findTeachableMistakes(gamePgns, { maxResults: 5, skipOpeningPlies: 40 });
    if (mistakes.length > 0) {
      const lessons = await Promise.all(mistakes.map((m, i) => buildLessonFromMistake(m, i)));
      return {
        title: "Your Endgame Mistakes",
        description: `A course built from real endgame moments in your own games (${mistakes.length} verified mistakes).`,
        category: "endgames",
        difficulty: "Intermediate",
        lessons,
      };
    }
  }
  return generateEndgameCourseLLM(type, playerRating, gamePgns);
}

async function generateEndgameCourseLLM(
  type: EndgameType,
  playerRating?: number,
  gamePgns?: string[],
): Promise<CourseOutput> {
  let prompt: string;

  if (type === "personal_endgames") {
    const gameSection = gamePgns?.length
      ? `\n\nACTUAL ENDGAME POSITIONS FROM THE PLAYER'S GAMES:\n${gamePgns.map((pgn, i) => `--- Game ${i + 1} ---\n${pgn}`).join("\n\n")}\n\nAnalyze the endgame phase of each game (typically the last 15-25 moves). Identify specific endgame mistakes the player made.`
      : "";

    prompt = `You are an expert chess endgame coach. Create a personalized endgame improvement course based on this player's actual games.

Player rating: ${playerRating ?? "unknown"}${gameSection}

Create a course with 4-5 lessons focused ONLY on endgame mistakes from these actual games. Each lesson should address a specific endgame error the player made.

RULES for each lesson:
1. examplePgn: MANDATORY — every lesson MUST have a valid PGN string (NEVER null, NEVER empty). This is the most important field — it drives the interactive chessboard.
   - CRITICAL: Use moves DIRECTLY from the provided game PGNs. Do NOT invent moves.
   - Use a [FEN "..."] header for the position 5 half-moves BEFORE the mistake move.
   - To get the correct FEN: mentally replay the game to that point and write the exact board position.
   - After the FEN header, include the actual game moves leading up to AND including the mistake.
   - Every move must have a {comment in curly braces}.
   - The mistake move MUST have [MISTAKE] at the START of its comment.
   - After the mistake, include 2-3 more moves showing the consequence.
   - EVERY move must be LEGAL from the position after the previous move. Verify this carefully.
   - Use standard algebraic notation (SAN) — e.g. Nf3, Bxe5, O-O, exd5.
   - State the EXACT move number from the original game — do not renumber.

2. drillFen: The exact FEN position ONE move BEFORE the mistake — where the player must choose.

3. drillExpectedMove: The correct alternative move in SAN notation, legal from the drillFen position.

4. drillHint: A one-sentence hint.

5. fixExamplePgn: MANDATORY — a SECOND PGN showing the CORRECT continuation. Same [FEN "..."] start and context moves as examplePgn, but plays the correct move (drillExpectedMove) instead of the mistake. Then include 3-6 moves of the best continuation showing the improved position. The correct move's comment MUST start with [FIX].

6. content: MUST follow this structure:

   ## The Mistake
   Quote the exact endgame move where the player went wrong, in bold with move number e.g. **29. Ke1??**. Explain why it was a mistake in the endgame context.

   ## The Fix
   Explain the correct endgame technique. Name the correct move in bold e.g. **29. Kf1** and the endgame principle behind it.

Respond with valid JSON:
{
  "title": "Course title (max 60 chars)",
  "description": "2-3 sentence course description focused on endgame improvement",
  "category": "Endgame Technique",
  "difficulty": "Beginner|Intermediate|Advanced",
  "lessons": [
    {
      "title": "Lesson title",
      "content": "## The Mistake\\n...\\n\\n## The Fix\\n...",
      "orderIndex": 0,
      "examplePgn": "[FEN \\"...\\"]\\n\\n...",
      "fixExamplePgn": "[FEN \\"...\\"]\\n\\n...",
      "drillFen": "...",
      "drillExpectedMove": "...",
      "drillHint": "..."
    }
  ]
}`;
  } else {
    const topic = ENDGAME_TOPICS[type];
    const difficultyGuide = playerRating
      ? (playerRating < 1200 ? "Beginner" : playerRating < 1800 ? "Intermediate" : "Advanced")
      : "Intermediate";

    prompt = `You are an expert chess endgame coach. Create a structured training course on: ${topic.title}

Target difficulty: ${difficultyGuide} (player rating: ${playerRating ?? "unknown"})

Cover these subtopics, one lesson each:
${topic.subtopics.map((s, i) => `${i + 1}. ${s}`).join("\n")}

RULES for each lesson:
1. examplePgn: MANDATORY — every lesson MUST have a valid PGN string (NEVER null, NEVER empty). This is the most important field — it drives the interactive chessboard.
   - Use a [FEN "..."] header to start from a carefully constructed position.
   - CRITICAL: The FEN must be a LEGAL chess position. After writing the FEN, mentally verify each move is legal from the resulting position.
   - Include 3-6 moves leading up to the key moment, then the mistake move, then 2-3 moves of consequence.
   - Every move must have a {comment in curly braces} explaining the concept.
   - If demonstrating a common mistake, mark it with [MISTAKE] at the START of the comment.
   - EVERY move must be LEGAL from the position after the previous move. Double-check this.
   - Use standard algebraic notation (SAN) — e.g. Nf3, Bxe5, O-O, exd5.
   - The PGN must be parseable by chess.js.

2. drillFen: The position ONE move BEFORE the mistake — where the student must choose the correct alternative.

3. drillExpectedMove: The correct alternative move in SAN notation, MUST be legal from the drillFen position.

4. drillHint: A one-sentence hint referencing the technique.

5. fixExamplePgn: MANDATORY — a SECOND PGN showing the CORRECT continuation. Same [FEN "..."] start and context moves as examplePgn, but plays the correct move instead of the mistake. Then include 3-6 moves of the best continuation. The correct move's comment MUST start with [FIX].

6. content: MUST follow this structure:

   ## The Mistake
   Explain the common error players make in this type of position. Use a concrete example with the bold move notation like **28. Rxd1??**.

   ## The Fix
   Explain the correct technique step by step. Reference the key principle (opposition, Lucena, etc.) with the bold fix move like **28. Qxd1**.

Respond with valid JSON:
{
  "title": "Course title (max 60 chars)",
  "description": "2-3 sentence course description",
  "category": "Endgame Technique",
  "difficulty": "${difficultyGuide}",
  "lessons": [
    {
      "title": "Lesson title",
      "content": "## The Mistake\\n...\\n\\n## The Fix\\n...",
      "orderIndex": 0,
      "examplePgn": "[FEN \\"...\\"]\\n\\n...",
      "fixExamplePgn": "[FEN \\"...\\"]\\n\\n...",
      "drillFen": "...",
      "drillExpectedMove": "...",
      "drillHint": "..."
    }
  ]
}`;
  }

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-5.2",
      max_completion_tokens: 8192,
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
    });

    const content = response.choices[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(content) as CourseOutput;
    return ensureAllLessonsHavePgn(parsed, gamePgns);
  } catch (err) {
    logger.error({ err, type }, "Failed to generate endgame course");
    throw err;
  }
}
