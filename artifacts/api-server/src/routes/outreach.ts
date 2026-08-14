import { Router, type IRouter, type Request, type Response } from "express";
import { db, outreachLeadsTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import OpenAI from "openai";
import { logger } from "../lib/logger";

const router: IRouter = Router();

function requireAdmin(req: Request, res: Response, next: (err?: unknown) => void) {
  if (!req.isAuthenticated() || !req.user?.isAdmin) {
    res.status(403).json({ error: "Admin access required" });
    return;
  }
  next();
}

interface RedditCandidate {
  title: string;
  selftext: string;
  permalink: string;
  author: string;
  subreddit: string;
  createdUtc: number;
  numComments: number;
}

// Read-only search against Reddit's public JSON search endpoint. This never
// posts, comments, or writes anything — it only fetches public post data
// for the admin to review. Reddit requires a descriptive User-Agent or it
// aggressively rate-limits/blocks requests.
router.get("/admin/outreach/search-reddit", requireAdmin, async (req: Request, res: Response) => {
  try {
    const query = (req.query.query as string || "").trim();
    const subreddit = (req.query.subreddit as string || "chess").trim().replace(/^r\//, "");
    if (!query) {
      res.status(400).json({ error: "query is required" });
      return;
    }

    const url = `https://www.reddit.com/r/${encodeURIComponent(subreddit)}/search.json?q=${encodeURIComponent(query)}&restrict_sr=1&sort=new&limit=15&t=month`;
    const response = await fetch(url, {
      headers: { "User-Agent": "ChessScoutOutreachTool/1.0 (admin lead search, read-only)" },
    });

    if (!response.ok) {
      logger.warn({ status: response.status, subreddit, query }, "[outreach] Reddit search request failed");
      res.status(502).json({ error: `Reddit returned ${response.status} — it may be rate-limiting or the subreddit name may be wrong` });
      return;
    }

    const data = await response.json() as { data?: { children?: Array<{ data: Record<string, unknown> }> } };
    const posts = data?.data?.children ?? [];

    const candidates: RedditCandidate[] = posts.map((p) => ({
      title: String(p.data.title ?? ""),
      selftext: String(p.data.selftext ?? ""),
      permalink: `https://www.reddit.com${p.data.permalink}`,
      author: String(p.data.author ?? "unknown"),
      subreddit: String(p.data.subreddit ?? subreddit),
      createdUtc: Number(p.data.created_utc ?? 0),
      numComments: Number(p.data.num_comments ?? 0),
    })).filter((c) => c.title.length > 0);

    res.json({ candidates });
  } catch (err) {
    logger.error({ err }, "[outreach] Reddit search failed");
    res.status(500).json({ error: "Search failed — Reddit may be temporarily unreachable" });
  }
});

const PRODUCT_INFO = `PRODUCT INFO — ChessScout.net:
- Smart opponent scouting reports that expose weaknesses of any Chess.com or Lichess player
- Move-by-move game analysis powered by Stockfish 17 + coaching, grounded in real engine data (not generic advice)
- Personalized training courses and puzzles generated from your actual mistakes
- 8 practice bots from 400 to 2000 ELO
- ELO tracking across Chess.com and Lichess
- 3-day free trial, $4/month or $1/week, no credit card required
- A free, no-signup live demo on the homepage that scouts your last 5 games and your last opponent's
- Website: https://chessscout.net`;

const PLATFORM_GUIDANCE: Record<string, string> = {
  reddit: "Reddit despises anything that reads as an ad. Write as a genuine, specific reply to what this person actually said — reference their exact situation. Only mention ChessScout if it's a real, honest answer to their question, framed as 'this helped me' or 'there's a tool that does exactly this,' never as a pitch. If their post doesn't actually call for a product mention, say so honestly instead of forcing one in.",
  twitter: "Twitter/X replies should be short, conversational, and specific to what they tweeted — not a canned pitch. Max 280 characters.",
  discord: "Discord messages should read like something a real community member would type — casual, specific to the conversation, no marketing tone.",
  forum: "Forum replies should be genuinely helpful first, with a natural, low-pressure mention of the tool only if it's relevant.",
  other: "Match the tone of a genuine, specific human reply to this exact context — not a generic template.",
};

router.get("/admin/outreach/leads", requireAdmin, async (_req: Request, res: Response) => {
  try {
    const leads = await db.select().from(outreachLeadsTable).orderBy(desc(outreachLeadsTable.createdAt));
    res.json({ leads });
  } catch {
    res.status(500).json({ error: "Failed to load leads" });
  }
});

router.post("/admin/outreach/leads", requireAdmin, async (req: Request, res: Response) => {
  try {
    const { platform, sourceUrl, context } = req.body as { platform?: string; sourceUrl?: string; context?: string };
    if (!platform || !context || context.trim().length === 0) {
      res.status(400).json({ error: "platform and context are required" });
      return;
    }
    const [lead] = await db.insert(outreachLeadsTable)
      .values({ platform, sourceUrl: sourceUrl || null, context: context.trim() })
      .returning();
    res.json({ lead });
  } catch {
    res.status(500).json({ error: "Failed to create lead" });
  }
});

router.patch("/admin/outreach/leads/:id", requireAdmin, async (req: Request, res: Response) => {
  try {
    const { status, draftContent, notes } = req.body as { status?: string; draftContent?: string; notes?: string };
    const updates: Record<string, unknown> = {};
    if (status !== undefined) updates.status = status;
    if (draftContent !== undefined) updates.draftContent = draftContent;
    if (notes !== undefined) updates.notes = notes;
    if (Object.keys(updates).length === 0) {
      res.status(400).json({ error: "Nothing to update" });
      return;
    }
    const [lead] = await db.update(outreachLeadsTable)
      .set(updates)
      .where(eq(outreachLeadsTable.id, req.params.id as string))
      .returning();
    if (!lead) {
      res.status(404).json({ error: "Lead not found" });
      return;
    }
    res.json({ lead });
  } catch {
    res.status(500).json({ error: "Failed to update lead" });
  }
});

router.delete("/admin/outreach/leads/:id", requireAdmin, async (req: Request, res: Response) => {
  try {
    await db.delete(outreachLeadsTable).where(eq(outreachLeadsTable.id, req.params.id as string));
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Failed to delete lead" });
  }
});

router.post("/admin/outreach/leads/:id/generate-draft", requireAdmin, async (req: Request, res: Response) => {
  try {
    const [lead] = await db.select().from(outreachLeadsTable).where(eq(outreachLeadsTable.id, req.params.id as string));
    if (!lead) {
      res.status(404).json({ error: "Lead not found" });
      return;
    }

    const guidance = PLATFORM_GUIDANCE[lead.platform] ?? PLATFORM_GUIDANCE.other;
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const prompt = `${PRODUCT_INFO}

You are drafting a reply for a real person to review and post themselves — this is not an automated post.

PLATFORM: ${lead.platform}
PLATFORM GUIDANCE: ${guidance}

WHAT THE PROSPECT ACTUALLY SAID/ASKED:
"""
${lead.context}
"""

Write a single, specific, genuine-sounding reply to this exact situation. It must directly address what they said — not a generic template. If mentioning ChessScout wouldn't be a natural, honest answer to their actual question, write a genuinely helpful reply without forcing a mention in.

Return plain text only — just the reply itself, no preamble, no markdown formatting, no quotes around it.`;

    const response = await openai.chat.completions.create({
      model: "gpt-5.6-luna",
      max_completion_tokens: 500,
      messages: [{ role: "user", content: prompt }],
    });

    const draft = response.choices[0]?.message?.content?.trim() ?? "";
    if (!draft) {
      res.status(502).json({ error: "Draft generation returned nothing — try again" });
      return;
    }

    const [updated] = await db.update(outreachLeadsTable)
      .set({ draftContent: draft, status: lead.status === "new" ? "drafted" : lead.status })
      .where(eq(outreachLeadsTable.id, req.params.id as string))
      .returning();

    res.json({ lead: updated });
  } catch (err) {
    logger.error({ err }, "Failed to generate outreach draft");
    res.status(500).json({ error: "Failed to generate draft" });
  }
});

export default router;
