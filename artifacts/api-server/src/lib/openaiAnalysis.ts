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
}

export interface WeaknessResult {
  category: string;
  severity: string;
  description: string;
  frequency: number;
  examples: string[];
}

export interface AnalysisOutput {
  weaknesses: WeaknessResult[];
  summary: string;
}

export async function analyzePlayerGames(
  username: string,
  games: GameSummary[]
): Promise<AnalysisOutput> {
  const gamesText = games
    .slice(0, 30)
    .map((g, i) => {
      const playerColor =
        g.whiteUsername.toLowerCase() === username.toLowerCase() ? "White" : "Black";
      const opponentRating =
        playerColor === "White" ? g.blackRating : g.whiteRating;
      return `Game ${i + 1}: Playing as ${playerColor} | Result: ${g.result} | Opening: ${g.opening || "Unknown"} | Time Control: ${g.timeControl} | Opponent Rating: ${opponentRating}`;
    })
    .join("\n");

  const prompt = `You are an expert chess coach analyzing a player's performance. Analyze the following ${games.length} games played by "${username}" and identify their key weaknesses.

Game data:
${gamesText}

Analyze patterns across these games and identify 4-6 specific weaknesses. For each weakness provide:
- category: One of ["Opening Preparation", "Tactical Awareness", "Endgame Technique", "Positional Play", "Time Management", "Defensive Play"]
- severity: One of ["Critical", "High", "Medium", "Low"]
- description: A specific, actionable description (2-3 sentences)
- frequency: A number 0-1 representing how often this issue appears
- examples: 2-3 specific example descriptions from the games

Also provide an overall summary paragraph.

Respond with valid JSON in this exact format:
{
  "weaknesses": [
    {
      "category": "...",
      "severity": "...",
      "description": "...",
      "frequency": 0.0,
      "examples": ["...", "..."]
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

interface CourseLesson {
  title: string;
  content: string;
  orderIndex: number;
  examplePgn: string | null;
}

interface CourseOutput {
  title: string;
  description: string;
  category: string;
  difficulty: string;
  lessons: CourseLesson[];
}

export async function generateCourseForWeakness(
  weakness: WeaknessResult
): Promise<CourseOutput> {
  const prompt = `You are an expert chess coach. Create a personalized chess course to address this weakness:

Category: ${weakness.category}
Severity: ${weakness.severity}
Description: ${weakness.description}

Create a course with 4-5 lessons. Each lesson should be educational and actionable.

Respond with valid JSON:
{
  "title": "Course title (max 60 chars)",
  "description": "Course description (2-3 sentences)",
  "category": "${weakness.category}",
  "difficulty": "Beginner|Intermediate|Advanced",
  "lessons": [
    {
      "title": "Lesson title",
      "content": "Detailed lesson content (3-5 paragraphs with specific chess advice, patterns, and tips)",
      "orderIndex": 0,
      "examplePgn": null
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
    return parsed;
  } catch (err) {
    logger.error({ err }, "Failed to generate course with OpenAI");
    throw err;
  }
}
