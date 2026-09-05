import { db, aiUsageEventsTable } from "@workspace/db";

// Fixed slugs, not free-text, so the admin breakdown groups cleanly
// instead of fragmenting into near-duplicate labels over time. Add a new
// one here whenever a new OpenAI call site is instrumented.
export const AI_FEATURES = {
  GAME_ANALYSIS: "game_analysis",           // analyzePlayerGames
  SINGLE_MOVE_ANALYSIS: "single_move_analysis", // analyzeSingleMove
  FULL_GAME_REVIEW: "full_game_review",     // reviewFullGame
  LESSON_CONTENT: "lesson_content",         // writeGroundedLessonContent
  OPPONENT_EXPLOIT_COURSE: "opponent_exploit_course", // generateExploitCourseForOpponentLLM
  WEAKNESS_COURSE: "weakness_course",       // generateCourseForWeaknessLLM
  ENDGAME_COURSE: "endgame_course",         // generateEndgameCourseLLM
  SCAN_POSITION: "scan_position",           // /analysis/scan-position
  PUZZLE_EXPLANATION: "puzzle_explanation", // generatePuzzleExplanation
  SEO_ARTICLE: "seo_article",               // generateArticle
  ADMIN_MARKETING: "admin_marketing",       // /admin/marketing/generate
  OUTREACH_DRAFT: "outreach_draft",         // outreach lead draft generation
} as const;

export type AiFeature = (typeof AI_FEATURES)[keyof typeof AI_FEATURES];

// $ per 1M tokens. "luna" and "terra" are this account's own model
// aliases, not standard OpenAI model names -- these rates were given
// directly by Shann, not looked up. Using one blended rate per model
// (not separate prompt/completion rates) since that's how they were
// given; can split them out later if actual input/output pricing
// differs. gpt-audio's rate is still unknown -- cost reports as null
// for it until that's provided too.
const MODEL_RATES_PER_1M_TOKENS: Record<string, { prompt: number; completion: number } | null> = {
  "gpt-5.6-luna": { prompt: 0.02, completion: 0.02 },
  "gpt-5.6-terra": { prompt: 2.00, completion: 2.00 },
  "gpt-audio": null,
};

export function estimateCostUsd(model: string, promptTokens: number, completionTokens: number): number | null {
  const rate = MODEL_RATES_PER_1M_TOKENS[model];
  if (!rate) return null;
  return (promptTokens / 1_000_000) * rate.prompt + (completionTokens / 1_000_000) * rate.completion;
}

// Fire-and-forget by design: a logging failure here should never break
// the actual feature that just ran. Call this right after every
// `openai.chat.completions.create(...)` (or similar) call, passing the
// response's own `usage` object straight through.
export async function trackAiUsage(params: {
  userId?: string | null;
  feature: AiFeature;
  model: string;
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number } | null;
}): Promise<void> {
  try {
    const promptTokens = params.usage?.prompt_tokens ?? 0;
    const completionTokens = params.usage?.completion_tokens ?? 0;
    const totalTokens = params.usage?.total_tokens ?? promptTokens + completionTokens;
    await db.insert(aiUsageEventsTable).values({
      userId: params.userId ?? null,
      feature: params.feature,
      model: params.model,
      promptTokens,
      completionTokens,
      totalTokens,
    });
  } catch (err) {
    console.error("Failed to log AI usage event:", err);
  }
}
