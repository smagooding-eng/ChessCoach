import OpenAI from "openai";
import { logger } from "./logger";

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
  classification: "brilliant" | "excellent" | "good" | "inaccuracy" | "mistake" | "blunder";
  explanation: string;
  betterMove: string | null;
}

interface AnalyzeSingleMoveInput {
  moves: Array<{ moveNumber: number; san: string; color: string }>;
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

  // Build context: up to 4 moves before and 2 after for reference
  const contextStart = Math.max(0, moveIndex - 4);
  const contextEnd = Math.min(moves.length - 1, moveIndex + 2);
  const contextMoves = moves.slice(contextStart, contextEnd + 1).map((m, i) => {
    const idx = contextStart + i;
    const marker = idx === moveIndex ? ">>> " : "    ";
    return `${marker}${m.moveNumber}${m.color === 'white' ? '.' : '...'} ${m.san}`;
  }).join("\n");

  const playerColor = target.color;
  const player = playerColor === "white" ? whiteUsername : blackUsername;

  const prompt = `You are an expert chess coach providing in-depth move analysis.

Game: ${whiteUsername} (White) vs ${blackUsername} (Black)
Opening: ${opening ?? "Unknown"}
Game result: ${result}

Move being analyzed (marked with >>>):
${contextMoves}

The player "${player}" (${playerColor}) played ${target.moveNumber}${playerColor === 'white' ? '.' : '...'} ${target.san}.

Provide a thorough analysis of this specific move. Consider:
1. What does this move accomplish? (tactical threats, positional goals, development)
2. How good or bad is this move? (brilliant/excellent/good/inaccuracy/mistake/blunder)
3. What are the consequences of this move?
4. If it is an inaccuracy, mistake, or blunder — what was the better alternative and why?

Respond with valid JSON:
{
  "classification": "good",
  "explanation": "3-5 sentence detailed explanation of the move covering what it achieves, why it is classified this way, and its consequences.",
  "betterMove": "Nf3 — brief reason why this was better (only include if classification is inaccuracy/mistake/blunder, otherwise null)"
}`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      max_completion_tokens: 512,
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
    });

    const content = response.choices[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(content) as SingleMoveAnalysis;
    return {
      classification: parsed.classification ?? "good",
      explanation: parsed.explanation ?? "",
      betterMove: parsed.betterMove ?? null,
    };
  } catch (err) {
    logger.error({ err }, "Failed to analyze single move with OpenAI");
    throw err;
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
