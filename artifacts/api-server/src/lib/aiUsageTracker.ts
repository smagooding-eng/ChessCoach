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
// aliases, not standard OpenAI model names.
//
// These are the real, official documented rates from OpenAI's own
// pricing page (developers.openai.com), not a guess or a reverse-
// engineered estimate from one day's billing. Two earlier attempts at
// this were both wrong: $0.02/1M (given directly by Shann, never
// verified -- off by ~55x) and then a rough $1.11/1M blended estimate
// reverse-engineered from a single day's total spend divided by total
// tokens (reasonable given what was available at the time, but blending
// input+output together always over/under-estimates depending on the
// actual mix, since output is billed at a very different rate than
// input for both these models).
//
// Cached-input tokens are billed at a separate, lower rate (luna: $0.02,
// terra: $0.20) -- not applied here since the OpenAI usage object this
// tracker receives doesn't currently break out cached vs. uncached
// prompt tokens, only a single prompt_tokens total. Using the plain
// (uncached) input rate for all prompt tokens means this may slightly
// overestimate cost on requests that got a cache hit -- the safe
// direction to be wrong in, given the whole point of this fix is to stop
// underestimating.
const MODEL_RATES_PER_1M_TOKENS: Record<string, { prompt: number; completion: number } | null> = {
  "gpt-5.6-luna": { prompt: 0.20, completion: 1.20 },
  "gpt-5.6-terra": { prompt: 2.00, completion: 12.00 },
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
