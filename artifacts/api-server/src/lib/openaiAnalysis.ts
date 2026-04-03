import OpenAI from "openai";
import { logger } from "./logger";
import { engineEvalMove } from "./engineAnalysis";

const openai = new OpenAI({
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
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
  classification: "brilliant" | "excellent" | "good" | "inaccuracy" | "mistake" | "blunder";
  explanation: string;
}

interface AnalyzeMovesInput {
  pgn: string;
  moves: Array<{ moveNumber: number; san: string; color: string; fen: string | null }>;
  opening: string | null;
  result: string;
  whiteUsername: string;
  blackUsername: string;
}

export async function analyzeMoves(input: AnalyzeMovesInput): Promise<MoveClassification[]> {
  const moveLine = input.moves
    .map((m, i) => `${i + 1}. (${m.color[0]}) ${m.san}`)
    .join(" ");

  const prompt = `You are an expert chess coach. Analyze this game and identify the 8-10 most critical moves.

Players: ${input.whiteUsername} (White) vs ${input.blackUsername} (Black)
Opening: ${input.opening ?? "Unknown"}
Result: ${input.result}
Moves: ${moveLine}

For each critical move, classify it as one of:
- "brilliant": A stunning, non-obvious move that drastically improves the position
- "excellent": A very strong move, likely the best or near-best
- "good": A solid, correct move
- "inaccuracy": A slightly suboptimal move that misses a better option
- "mistake": A clear error that worsens the position noticeably
- "blunder": A serious error that loses material or the game

Focus on turning points and decisive moments. Only classify the 8-10 most important moves.

Respond with valid JSON:
{
  "classifications": [
    {
      "moveIndex": 0,
      "san": "e4",
      "color": "white",
      "classification": "excellent",
      "explanation": "Controlling the center immediately..."
    }
  ]
}`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      max_completion_tokens: 2048,
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
    });

    const content = response.choices[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(content) as { classifications: MoveClassification[] };
    return parsed.classifications ?? [];
  } catch (err) {
    logger.error({ err }, "Failed to analyze moves with OpenAI");
    return [];
  }
}

export interface SingleMoveAnalysis {
  classification: "brilliant" | "excellent" | "good" | "book" | "inaccuracy" | "mistake" | "blunder";
  pros: string[];
  cons: string[];
  betterMove: string | null;
  cpLoss: number | null;
  engineDepth: number | null;
  engineAvailable: boolean;
}

interface AnalyzeSingleMoveInput {
  moves: Array<{ moveNumber: number; san: string; color: string; from: string; to: string; fenBefore: string; fen: string | null }>;
  moveIndex: number;
  opening: string | null;
  result: string;
  whiteUsername: string;
  blackUsername: string;
}

export async function analyzeSingleMove(input: AnalyzeSingleMoveInput): Promise<SingleMoveAnalysis> {
  const { moves, moveIndex, opening, result, whiteUsername, blackUsername } = input;

  const target = moves[moveIndex];
  if (!target) throw new Error("Move not found");

  const playerColor = target.color as "white" | "black";
  const player = playerColor === "white" ? whiteUsername : blackUsername;
  const fenBefore = target.fenBefore;
  const fenAfter = target.fen ?? "";

  // ── Step 1: Get engine evaluation from Lichess Cloud Eval ──────────────────
  const engineResult = await engineEvalMove({
    fenBefore,
    fenAfter,
    playedFrom: target.from,
    playedTo: target.to,
    playerColor,
    moveIndex,
  });

  // ── Step 2: GPT analysis — behavior changes based on whether engine eval is available ──
  const contextStart = Math.max(0, moveIndex - 5);
  const contextEnd = Math.min(moves.length - 1, moveIndex + 2);
  const contextMoves = moves.slice(contextStart, contextEnd + 1).map((m, i) => {
    const idx = contextStart + i;
    const marker = idx === moveIndex ? ">>> " : "    ";
    return `${marker}${m.moveNumber}${m.color === "white" ? "." : "..."} ${m.san}`;
  }).join("\n");

  // ── Path A: Lichess/Stockfish had the position — GPT only writes pros/cons ──
  if (engineResult.available) {
    const classification = engineResult.classification;
    const isBad = ["inaccuracy", "mistake", "blunder"].includes(classification);

    const cpInfo =
      `Stockfish (depth ${engineResult.depth}) reports centipawn loss = ${engineResult.cpLoss}. ` +
      `Eval before: ${engineResult.engineCpBefore}cp, after: ${engineResult.engineCpAfter}cp (white's perspective).`;

    const betterMoveHint = engineResult.engineBestMoveSan
      ? `The engine's recommended move was ${engineResult.engineBestMoveSan}.` : "";

    const prompt = `You are an expert chess coach providing in-depth move analysis.

Game: ${whiteUsername} (White) vs ${blackUsername} (Black)
Opening: ${opening ?? "Unknown"} | Result: ${result}

Move sequence (>>> = analyzed move):
${contextMoves}

Player "${player}" (${playerColor}) played ${target.moveNumber}${playerColor === "white" ? "." : "..."} ${target.san}.

ENGINE VERDICT: "${classification}"
${cpInfo}
${betterMoveHint}

Provide 2-3 concrete PROS and 2-3 concrete CONS for this specific move.
${isBad && engineResult.engineBestMoveSan ? `Also explain briefly why ${engineResult.engineBestMoveSan} would have been better.` : ""}

Respond with valid JSON:
{
  "pros": ["...", "...", "..."],
  "cons": ["...", "...", "..."]${isBad && engineResult.engineBestMoveSan ? ',\n  "betterMoveExplanation": "..."' : ""}
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
      if (isBad && engineResult.engineBestMoveSan) {
        betterMove = engineResult.engineBestMoveSan;
        if (parsed.betterMoveExplanation) betterMove += ` — ${parsed.betterMoveExplanation}`;
      }

      return {
        classification,
        pros: Array.isArray(parsed.pros) ? parsed.pros : [],
        cons: Array.isArray(parsed.cons) ? parsed.cons : [],
        betterMove,
        cpLoss: engineResult.cpLoss,
        engineDepth: engineResult.depth,
        engineAvailable: true,
      };
    } catch (err) {
      logger.error({ err }, "GPT pros/cons failed (engine path)");
      return {
        classification,
        pros: [],
        cons: [],
        betterMove: engineResult.engineBestMoveSan,
        cpLoss: engineResult.cpLoss,
        engineDepth: engineResult.depth,
        engineAvailable: true,
      };
    }
  }

  // ── Path B: No engine data — GPT evaluates the full position from FEN ──────
  const prompt = `You are a chess grandmaster and coach. Analyze this specific chess move precisely.

Game: ${whiteUsername} (White) vs ${blackUsername} (Black)
Opening: ${opening ?? "Unknown"} | Result: ${result}

Move sequence (>>> = analyzed move):
${contextMoves}

Position FEN before the move: ${fenBefore}
Position FEN after the move:  ${fenAfter}

Player "${player}" (${playerColor}) played ${target.moveNumber}${playerColor === "white" ? "." : "..."} ${target.san}.

Analyze this move as a strong chess engine would. Determine:
1. CLASSIFICATION — pick exactly one:
   - "brilliant": stunning sacrifice or non-obvious winning move
   - "excellent": best or near-best move, no better option missed
   - "good": solid move, maintains or slightly improves position
   - "book": well-known theoretical move from opening/endgame databases
   - "inaccuracy": suboptimal, a clearly better move exists (+25–50cp swing)
   - "mistake": clear error, noticeably worsens the position (+51–100cp swing)
   - "blunder": serious error, loses material or the game (>100cp swing)

2. PROS — 2-3 specific strengths of this move (threats created, pieces activated, structure improved, etc.)
3. CONS — 2-3 specific weaknesses (what it misses, weaknesses created, opponent's best response)
4. BETTER MOVE — if inaccuracy/mistake/blunder, name the best alternative move and explain why in 1 sentence

Respond with valid JSON:
{
  "classification": "good",
  "pros": ["...", "..."],
  "cons": ["...", "..."],
  "betterMove": "Nf6 — develops a piece with tempo and controls the center (only for inaccuracy/mistake/blunder, else null)"
}`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      max_completion_tokens: 600,
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
    });
    const content = response.choices[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(content) as {
      classification?: string;
      pros?: string[];
      cons?: string[];
      betterMove?: string | null;
    };

    const validClassifications = ["brilliant", "excellent", "good", "book", "inaccuracy", "mistake", "blunder"];
    const classification = (
      validClassifications.includes(parsed.classification ?? "") ? parsed.classification : "good"
    ) as SingleMoveAnalysis["classification"];

    return {
      classification,
      pros: Array.isArray(parsed.pros) ? parsed.pros : [],
      cons: Array.isArray(parsed.cons) ? parsed.cons : [],
      betterMove: parsed.betterMove ?? null,
      cpLoss: null,
      engineDepth: null,
      engineAvailable: false,
    };
  } catch (err) {
    logger.error({ err }, "GPT full-position analysis failed");
    return {
      classification: "good",
      pros: [],
      cons: [],
      betterMove: null,
      cpLoss: null,
      engineDepth: null,
      engineAvailable: false,
    };
  }
}

// ── Full-game review ─────────────────────────────────────────────────────────

export interface MoveReview {
  moveIndex: number;
  san: string;
  color: "white" | "black";
  classification: "brilliant" | "excellent" | "good" | "book" | "inaccuracy" | "mistake" | "blunder";
  explanation: string;
  betterMove: string | null;
  pros: string[];
  cons: string[];
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
}

export async function reviewFullGame(input: {
  moves: Array<{ moveNumber: number; san: string; color: string }>;
  opening: string | null;
  result: string;
  whiteUsername: string;
  blackUsername: string;
}): Promise<GameReviewResult> {
  const { moves, opening, result, whiteUsername, blackUsername } = input;

  const moveList = moves
    .map((m, i) => `${i}: ${m.moveNumber}${m.color === "white" ? "." : "..."} ${m.san}`)
    .join("\n");

  const prompt = `You are a master chess coach. Review this complete chess game and classify EVERY single move.

Game: ${whiteUsername} (White) vs ${blackUsername} (Black)
Opening: ${opening ?? "Unknown"} | Result: ${result}

Move list (format: index: moveNum. san):
${moveList}

Classify each move as ONE of:
- "brilliant": unexpected, deeply calculated, significantly improves position
- "excellent": very strong, best or near-best move
- "good": solid, reasonable move
- "book": standard opening/endgame theory (typically first 10-12 moves)
- "inaccuracy": suboptimal, a clearly better option was missed
- "mistake": clear error, noticeably worsens the position
- "blunder": serious error that loses material or the game

For each move provide:
1. classification (required)
2. explanation: concise 1-2 sentence explanation of why this classification (required)
3. pros: array of 1-2 SHORT strengths of this move (max 12 words each). Even bad moves may have some upside.
4. cons: array of 1-2 SHORT weaknesses or missed opportunities (max 12 words each). Even great moves can have minor downsides.
5. betterMove: for inaccuracy/mistake/blunder only — the better move in SAN notation (e.g. "Nf6", "d4", "Bxd5+"). For good/excellent/brilliant/book set null.

ALSO provide a "gameSummary" object with an overall AI coaching analysis of the game:

1. "overview": 2-3 sentences summarizing the game flow — who had the advantage and when, and what decided the outcome.
2. "keyMistakes": an array of the most important mistakes/blunders (up to 4). Each entry:
   - "moveIndex": the move index of the mistake
   - "move": the move in SAN (e.g. "14...Bxe4")
   - "whatWentWrong": 1-2 sentences explaining what was wrong with this move
   - "whatYouShouldHaveDone": 1-2 sentences explaining the correct move and why
   - "tip": A concise coaching takeaway (a pattern or rule to remember for next time)
3. "strengths": array of 1-3 things the player did well (even in a loss)
4. "improvementAreas": array of 2-3 specific areas to work on, phrased as actionable coaching advice

If the game was a loss, be especially detailed in keyMistakes and improvementAreas. Focus on the turning points that cost the game.

Respond with valid JSON covering ALL ${moves.length} moves in order:
{
  "moves": [
    {
      "moveIndex": 0,
      "san": "e4",
      "color": "white",
      "classification": "book",
      "explanation": "Standard central pawn opening move, controlling d5 and f5.",
      "pros": ["Controls key central squares d5 and f5", "Opens lines for bishop and queen"],
      "cons": ["Slightly weakens d4 square"],
      "betterMove": null
    }
  ],
  "gameSummary": {
    "overview": "White had a solid opening but lost the thread in the middlegame...",
    "keyMistakes": [
      {
        "moveIndex": 14,
        "move": "14...Bxe4",
        "whatWentWrong": "This capture trades away a strong bishop and opens the e-file for White's rook.",
        "whatYouShouldHaveDone": "14...Nf6 develops the knight while maintaining pressure on e4.",
        "tip": "Before capturing, ask: does this trade help my opponent more than me?"
      }
    ],
    "strengths": ["Solid opening preparation", "Good piece development"],
    "improvementAreas": ["Practice calculating exchanges before capturing", "Work on endgame technique"]
  }
}`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      max_completion_tokens: 16000,
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
    });

    const finishReason = response.choices[0]?.finish_reason;
    const content = response.choices[0]?.message?.content ?? "{}";

    if (finishReason === "length") {
      logger.warn({ moves: moves.length }, "Review response truncated by token limit — trying to parse partial result");
    }

    const parsed = JSON.parse(content) as { moves?: Array<Partial<MoveReview>>; gameSummary?: Partial<GameReviewSummary> };
    const validClassifications = ["brilliant", "excellent", "good", "book", "inaccuracy", "mistake", "blunder"];

    const reviewMoves = (parsed.moves ?? []).map((m, i) => ({
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

    if (reviewMoves.length === 0) {
      throw new Error("OpenAI returned an empty move list — possibly a model error or format issue");
    }

    const gameSummary: GameReviewSummary | null = parsed.gameSummary ? {
      overview: parsed.gameSummary.overview ?? "",
      keyMistakes: Array.isArray(parsed.gameSummary.keyMistakes)
        ? parsed.gameSummary.keyMistakes.map(km => ({
            moveIndex: km.moveIndex ?? 0,
            move: km.move ?? "",
            whatWentWrong: km.whatWentWrong ?? "",
            whatYouShouldHaveDone: km.whatYouShouldHaveDone ?? "",
            tip: km.tip ?? "",
          }))
        : [],
      strengths: Array.isArray(parsed.gameSummary.strengths) ? parsed.gameSummary.strengths : [],
      improvementAreas: Array.isArray(parsed.gameSummary.improvementAreas) ? parsed.gameSummary.improvementAreas : [],
    } : null;

    return { moves: reviewMoves, gameSummary };
  } catch (err) {
    logger.error({ err }, "Failed to review full game with OpenAI");
    throw err; // Re-throw so the SSE route handler sends an error event
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

export async function generateExploitCourseForOpponent(
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
