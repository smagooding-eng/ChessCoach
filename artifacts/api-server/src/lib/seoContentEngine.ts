import OpenAI from "openai";
import { db, seoArticlesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "./logger";
import { trackAiUsage, AI_FEATURES } from "./aiUsageTracker";

// Long-tail keywords targeting real, specific frustration a chess player
// would type into Google — not generic terms like "chess coach" (which a
// new domain has no chance of ranking for), but the exact, narrow
// questions that have much less competition and much higher intent.
export const SEO_KEYWORD_QUEUE: string[] = [
  "why do I keep blundering my queen",
  "why do I keep losing on time in chess",
  "why does my opponent always beat my openings",
  "how to stop hanging pieces in chess",
  "why am I stuck at the same chess rating",
  "how to analyze your own chess games",
  "why do I lose winning chess positions",
  "how to prepare for a chess opponent",
  "why do I play well in the opening but lose in the endgame",
  "how to find patterns in your chess losses",
  "why does 1.e4 keep beating me",
  "why does 1.d4 keep beating me",
  "how to stop making the same chess mistakes",
  "chess rating plateau how to break through",
  "how to study your chess.com games",
  "how to study your lichess games",
  "why am I bad at chess endgames",
  "how to spot chess tactics faster",
  "why do I panic in chess time trouble",
  "how to scout a chess opponent before playing them",
  "why do I keep missing forks in chess",
  "why do I keep missing back rank mate",
  "how to stop losing to the same opening trap",
  "why can I never convert a winning chess position",
  "how to defend a losing chess position better",
  "why do I lose to lower rated players in chess",
  "chess 1200 rating plateau tips",
  "chess 800 rating plateau tips",
  "chess 1500 rating plateau tips",
  "how many games should I review to improve at chess",
  "how to use chess.com game review effectively",
  "how to use lichess analysis board effectively",
  "why does the engine say I blundered when I won the game",
  "why do I calculate slower than my opponent",
  "how to improve calculation in chess without a coach",
  "why do I keep losing to the same opponent in chess",
  "how to build an opening repertoire as a club player",
  "why do my openings fall apart after move 10",
  "how to know if my chess opening is actually bad",
  "why do I play worse in rated games than casual games",
  "how to stop tilting after a chess loss",
  "why do I lose focus in long chess games",
  "how to prepare for a chess tournament opponent",
  "why do I always lose the endgame with equal material",
  "how to study chess without a coach",
  "best way to review your own chess games",
  "why do I blunder more in blitz than rapid chess",
  "why do I blunder more in bullet than blitz",
  "how to stop hanging your queen in chess",
  "how to stop missing simple tactics in chess",
  "why do club players plateau at the same rating",
  "how to find your weakest chess phase opening middlegame endgame",
  "why do I lose games I should have drawn",
  "how to identify recurring chess mistakes",
  "why do I keep losing as black in chess",
  "why do I keep losing as white in chess",
  "how to use a chess engine to actually improve not just to see the best move",
  "why does my rating go up and down and never improve",
  "how to stop losing on time when you have a winning position",
  "what chess stats should I actually be tracking",
  "how to know what to study next in chess",
  "why do I keep falling for chess opening traps",
  "how to spot a chess trap before it's too late",
  "why do I lose the same way every time in chess",
  "how to turn chess losses into improvement",
  "why am I not improving even though I play chess every day",
  "how to analyze a chess opponent before a tournament",
  "why do stronger players always find my weaknesses",
  "how to build a personalized chess study plan",
  "why do I make good moves but still lose in chess",
];

function slugify(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

const PRODUCT_CONTEXT = `ChessScout.net is a chess coaching app that analyzes a player's real Chess.com or Lichess game history with an engine (Stockfish) to find recurring, specific weaknesses — not generic tips. It also lets players scout any opponent's weaknesses before a game, and generates personalized courses and puzzles from a player's own actual mistakes.`;

interface GeneratedArticle {
  title: string;
  metaDescription: string;
  content: string; // markdown
}

async function generateArticle(keyword: string, existingArticles: { slug: string; title: string; targetKeyword: string }[]): Promise<GeneratedArticle | null> {
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const relatedArticlesBlock = existingArticles.length
    ? `\n\nEXISTING PUBLISHED ARTICLES ON THIS SITE (for internal linking — see instructions below):\n${existingArticles.map((a) => `- "${a.title}" — /learn/${a.slug} (target search: "${a.targetKeyword}")`).join("\n")}`
    : "";

  const prompt = `You are writing a genuinely useful chess improvement article for a real person who searched: "${keyword}"

CONTEXT ON THE PRODUCT THIS ARTICLE LIVES ON (mention naturally, once, only where it's an honest fit — never force it):
${PRODUCT_CONTEXT}
${relatedArticlesBlock}

Write a complete, specific, genuinely useful article (700-1000 words) that actually answers this search query in depth. This must be real, substantive chess content a club player would find useful even if they never look at the product — Google actively suppresses thin, generic, keyword-stuffed content, so this needs concrete examples, specific advice, and real chess understanding, not vague platitudes.

Structure:
- A clear title (not just the keyword restated — make it specific and compelling)
- An opening that shows you understand the exact frustration behind this search
- 3-5 concrete, actionable sections with real chess substance (specific patterns, concrete examples, actual technique)
- A natural, single, low-pressure mention of ChessScout only if it's a genuinely honest fit for solving this specific problem — never forced
- A short, honest conclusion

INTERNAL LINKING: if (and only if) one or two of the existing articles listed above are genuinely relevant to a point you're making, link to them naturally inline using markdown link syntax, e.g. "as covered in [why you keep hanging pieces](/learn/some-slug)". Never link an article that isn't a real, on-topic fit just to have a link — zero forced links is better than one irrelevant one. Do not link the same article more than once.

Return valid JSON only:
{
  "title": "...",
  "metaDescription": "under 160 characters, accurately describing the article",
  "content": "full article body in markdown, using ## for section headings and [text](/learn/slug) for any genuine internal links"
}`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-5.6-luna",
      max_completion_tokens: 2000,
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
    });
    void trackAiUsage({ userId: undefined, feature: AI_FEATURES.SEO_ARTICLE, model: "gpt-5.6-luna", usage: response.usage });
    const parsed = JSON.parse(response.choices[0]?.message?.content ?? "{}") as Partial<GeneratedArticle>;
    if (!parsed.title || !parsed.content || !parsed.metaDescription) return null;
    return parsed as GeneratedArticle;
  } catch (err) {
    logger.error({ err, keyword }, "[seo] Article generation failed");
    return null;
  }
}

/**
 * Generates and publishes one new article from the keyword queue, skipping
 * any keyword that's already been used. Intended to run on a slow cron
 * (weekly), not in a burst — this is a long-horizon content channel, and
 * publishing a handful of genuinely substantive articles over months is
 * far more valuable than a large batch of thin ones at once.
 */
export async function generateNextSeoArticle(): Promise<{ published: boolean; slug?: string; reason?: string }> {
  const existing = await db.select({
    slug: seoArticlesTable.slug,
    title: seoArticlesTable.title,
    targetKeyword: seoArticlesTable.targetKeyword,
  }).from(seoArticlesTable).where(eq(seoArticlesTable.published, true));
  const usedKeywords = new Set(existing.map((a) => a.targetKeyword));

  const nextKeyword = SEO_KEYWORD_QUEUE.find((k) => !usedKeywords.has(k));
  if (!nextKeyword) {
    return { published: false, reason: "All keywords in the queue already have articles" };
  }

  const generated = await generateArticle(nextKeyword, existing);
  if (!generated) {
    return { published: false, reason: "Generation failed" };
  }

  let slug = slugify(generated.title);
  const [slugCollision] = await db.select({ id: seoArticlesTable.id }).from(seoArticlesTable).where(eq(seoArticlesTable.slug, slug));
  if (slugCollision) slug = `${slug}-${Date.now().toString(36)}`;

  await db.insert(seoArticlesTable).values({
    slug,
    title: generated.title,
    targetKeyword: nextKeyword,
    metaDescription: generated.metaDescription,
    content: generated.content,
    published: true,
  });

  logger.info({ slug, keyword: nextKeyword }, "[seo] Published new article");
  return { published: true, slug };
}
