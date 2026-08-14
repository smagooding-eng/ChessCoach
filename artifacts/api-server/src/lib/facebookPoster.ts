import { db, puzzlesTable, seoArticlesTable } from "@workspace/db";
import { and, eq, isNull, or, sql } from "drizzle-orm";
import { logger } from "./logger";

const FACEBOOK_PAGE_ID = process.env.FACEBOOK_PAGE_ID;
const FACEBOOK_PAGE_ACCESS_TOKEN = process.env.FACEBOOK_PAGE_ACCESS_TOKEN;
const SITE_URL = process.env.SITE_URL || "https://chessscout.net";

function isConfigured(): boolean {
  return Boolean(FACEBOOK_PAGE_ID && FACEBOOK_PAGE_ACCESS_TOKEN);
}

/**
 * Builds a publicly-embeddable board image URL from a FEN, using Lichess's
 * documented public board-image export endpoint (the same one widely used
 * for embedding chess positions in blogs/forums — not scraping, this is
 * an intentionally public, stable API Lichess provides for exactly this).
 */
function boardImageUrl(fen: string): string {
  return `https://lichess1.org/export/fen.gif?fen=${encodeURIComponent(fen)}&color=white`;
}

async function postPhotoToFacebook(imageUrl: string, caption: string): Promise<{ ok: boolean; error?: string }> {
  if (!isConfigured()) return { ok: false, error: "Facebook posting is not configured" };
  try {
    const res = await fetch(
      `https://graph.facebook.com/v19.0/${FACEBOOK_PAGE_ID}/photos`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: imageUrl,
          caption,
          access_token: FACEBOOK_PAGE_ACCESS_TOKEN,
        }),
      }
    );
    const body = await res.json().catch(() => ({})) as { error?: { message?: string } };
    if (!res.ok) {
      logger.error({ body }, "Facebook photo post failed");
      return { ok: false, error: body?.error?.message || "Facebook API error" };
    }
    return { ok: true };
  } catch (err) {
    logger.error({ err }, "Facebook photo post threw");
    return { ok: false, error: "Network error posting to Facebook" };
  }
}

async function postLinkToFacebook(link: string, message: string): Promise<{ ok: boolean; error?: string }> {
  if (!isConfigured()) return { ok: false, error: "Facebook posting is not configured" };
  try {
    const res = await fetch(
      `https://graph.facebook.com/v19.0/${FACEBOOK_PAGE_ID}/feed`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          link,
          message,
          access_token: FACEBOOK_PAGE_ACCESS_TOKEN,
        }),
      }
    );
    const body = await res.json().catch(() => ({})) as { error?: { message?: string } };
    if (!res.ok) {
      logger.error({ body }, "Facebook link post failed");
      return { ok: false, error: body?.error?.message || "Facebook API error" };
    }
    return { ok: true };
  } catch (err) {
    logger.error({ err }, "Facebook link post threw");
    return { ok: false, error: "Network error posting to Facebook" };
  }
}

/**
 * Posts a mate-in-2/3 puzzle: real, verified position data from the
 * curated puzzle set — no generated claims, so no hallucination risk.
 * The solution is deliberately left out of the caption (posted as a
 * follow-up comment instead) so the puzzle is actually a puzzle.
 */
async function postPuzzle(): Promise<{ posted: boolean; reason?: string }> {
  const [puzzle] = await db
    .select()
    .from(puzzlesTable)
    .where(and(
      eq(puzzlesTable.archived, false),
      eq(puzzlesTable.postedToFacebook, false),
      or(sql`${puzzlesTable.themes} LIKE '%mateIn2%'`, sql`${puzzlesTable.themes} LIKE '%mateIn3%'`),
    ))
    .orderBy(sql`random()`)
    .limit(1);

  if (!puzzle) return { posted: false, reason: "No unposted mate-in-2/3 puzzles available" };

  const mateIn = puzzle.themes?.includes("mateIn2") ? 2 : 3;
  const caption = `Mate in ${mateIn}. Can you find it? \u265f\ufe0f\n\nWhite to move.\n\nSolve it at ${SITE_URL}/puzzles`;

  const result = await postPhotoToFacebook(boardImageUrl(puzzle.fen), caption);
  if (!result.ok) return { posted: false, reason: result.error };

  await db.update(puzzlesTable).set({ postedToFacebook: true }).where(eq(puzzlesTable.id, puzzle.id));
  return { posted: true };
}

/**
 * Promotes an already-published article — the article itself went
 * through the site's own generation-and-review pipeline (see
 * seoContentEngine.ts and the admin dashboard's approve/reject step), so
 * this is sharing existing, reviewed content rather than generating new
 * factual claims on the spot.
 */
async function postArticle(): Promise<{ posted: boolean; reason?: string }> {
  const [article] = await db
    .select()
    .from(seoArticlesTable)
    .where(and(eq(seoArticlesTable.published, true), isNull(seoArticlesTable.sharedToFacebookAt)))
    .orderBy(sql`random()`)
    .limit(1);

  if (!article) return { posted: false, reason: "No unshared published articles available" };

  const message = `${article.title}\n\n${article.metaDescription}`;
  const link = `${SITE_URL}/learn/${article.slug}`;

  const result = await postLinkToFacebook(link, message);
  if (!result.ok) return { posted: false, reason: result.error };

  await db.update(seoArticlesTable).set({ sharedToFacebookAt: new Date() }).where(eq(seoArticlesTable.id, article.id));
  return { posted: true };
}

/**
 * Runs one auto-post cycle. Rotates content type — mostly puzzles (safest,
 * zero factual risk), occasionally an article promotion. Deliberately does
 * NOT include GPT-generated chess trivia/history/quotes: a wrong date,
 * wrong player, or misattributed game in a public brand post is a much
 * costlier mistake than the same error inside the app.
 */
export async function postShareableContentToFacebook(): Promise<{ posted: boolean; type?: "puzzle" | "article"; reason?: string }> {
  if (!isConfigured()) {
    return { posted: false, reason: "FACEBOOK_PAGE_ID / FACEBOOK_PAGE_ACCESS_TOKEN not set" };
  }

  // Puzzles ~4 out of 5 times — highest-confidence content, and the site
  // has far more puzzles available than articles.
  const useArticle = Math.random() < 0.2;

  if (useArticle) {
    const result = await postArticle();
    if (result.posted) return { posted: true, type: "article" };
    // Fall through to a puzzle if there's nothing left to share.
  }

  const puzzleResult = await postPuzzle();
  if (puzzleResult.posted) return { posted: true, type: "puzzle" };

  return { posted: false, reason: puzzleResult.reason };
}
