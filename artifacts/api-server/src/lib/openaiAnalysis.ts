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
