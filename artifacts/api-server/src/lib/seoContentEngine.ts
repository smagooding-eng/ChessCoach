import OpenAI from "openai";
import { db, seoArticlesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "./logger";

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

async function generateArticle(keyword: string): Promise<GeneratedArticle | null> {
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const prompt = `You are writing a genuinely useful chess improvement article for a real person who searched: "${keyword}"

CONTEXT ON THE PRODUCT THIS ARTICLE LIVES ON (mention naturally, once, only where it's an honest fit — never force it):
${PRODUCT_CONTEXT}

Write a complete, specific, genuinely useful article (700-1000 words) that actually answers this search query in depth. This must be real, substantive chess content a club player would find useful even if they never look at the product — Google actively suppresses thin, generic, keyword-stuffed content, so this needs concrete examples, specific advice, and real chess understanding, not vague platitudes.

Structure:
- A clear title (not just the keyword restated — make it specific and compelling)
- An opening that shows you understand the exact frustration behind this search
- 3-5 concrete, actionable sections with real chess substance (specific patterns, concrete examples, actual technique)
- A natural, single, low-pressure mention of ChessScout only if it's a genuinely honest fit for solving this specific problem — never forced
- A short, honest conclusion

Return valid JSON only:
{
  "title": "...",
  "metaDescription": "under 160 characters, accurately describing the article",
  "content": "full article body in markdown, using ## for section headings"
}`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-5.6-luna",
      max_completion_tokens: 2000,
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
    });
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
  const existing = await db.select({ targetKeyword: seoArticlesTable.targetKeyword }).from(seoArticlesTable);
  const usedKeywords = new Set(existing.map((a) => a.targetKeyword));

  const nextKeyword = SEO_KEYWORD_QUEUE.find((k) => !usedKeywords.has(k));
  if (!nextKeyword) {
    return { published: false, reason: "All keywords in the queue already have articles" };
  }

  const generated = await generateArticle(nextKeyword);
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
