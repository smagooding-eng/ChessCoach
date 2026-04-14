import { Router, type Request, type Response } from "express";
import { db, growthCredentialsTable, growthCampaignsTable, growthPostLogTable } from "@workspace/db";
import { eq, desc, and, gte, lte, sql } from "drizzle-orm";
import {
  encryptCredentials,
  decryptCredentials,
  postToDiscord,
  postToTwitter,
  postToReddit,
  type PostResult,
} from "../lib/growthPosting";
import OpenAI from "openai";

const router = Router();

function requireAdmin(req: Request, res: Response, next: Function) {
  if (!req.isAuthenticated() || !req.user?.isAdmin) {
    res.status(403).json({ error: "Admin access required" });
    return;
  }
  next();
}

const CAMPAIGN_THEMES: Record<string, string> = {
  "Free Trial": "Emphasize the free 3-day trial with no credit card required. Urgency: try it risk-free today.",
  "Opponent Scouting": "Focus on the killer feature: AI scouting reports that expose any opponent's weaknesses before you play them.",
  "Game Analysis": "Highlight move-by-move game analysis with Stockfish 17 engine + AI coaching explanations for every move.",
  "New Feature": "Announce exciting new features. Be enthusiastic and specific about what's new.",
  "General Promo": "Broad promotional message covering the full value proposition: scouting, analysis, courses, bots, and progress tracking.",
  "ELO Improvement": "Target players who want to gain rating points. Emphasize how personalized training and weakness detection leads to measurable improvement.",
};

router.get("/admin/growth/credentials", requireAdmin, async (_req: Request, res: Response) => {
  try {
    const creds = await db.select({
      id: growthCredentialsTable.id,
      platform: growthCredentialsTable.platform,
      isActive: growthCredentialsTable.isActive,
      updatedAt: growthCredentialsTable.updatedAt,
    }).from(growthCredentialsTable);

    const result = creds.map(c => ({
      ...c,
      isConfigured: true,
    }));

    res.json(result);
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Unknown error" });
  }
});

router.post("/admin/growth/credentials", requireAdmin, async (req: Request, res: Response): Promise<void> => {
  try {
    const { platform, credentials } = req.body as { platform: string; credentials: Record<string, string> };

    if (!platform || !credentials) {
      res.status(400).json({ error: "platform and credentials required" });
      return;
    }

    const validPlatforms = ["discord", "twitter", "reddit"];
    if (!validPlatforms.includes(platform)) {
      res.status(400).json({ error: `Invalid platform. Choose from: ${validPlatforms.join(", ")}` });
      return;
    }

    const encrypted = encryptCredentials(credentials);

    await db.insert(growthCredentialsTable)
      .values({ platform, credentials: encrypted })
      .onConflictDoUpdate({
        target: growthCredentialsTable.platform,
        set: { credentials: encrypted, isActive: true, updatedAt: new Date() },
      });

    res.json({ success: true, platform });
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Unknown error" });
  }
});

router.post("/admin/growth/credentials/test", requireAdmin, async (req: Request, res: Response): Promise<void> => {
  try {
    const { platform } = req.body as { platform: string };
    const [cred] = await db.select().from(growthCredentialsTable).where(eq(growthCredentialsTable.platform, platform));
    if (!cred) {
      res.status(404).json({ error: "No credentials found for " + platform });
      return;
    }

    const decrypted = decryptCredentials(cred.credentials);

    if (platform === "discord") {
      const url = decrypted.webhookUrl || '';
      const discordPattern = /^https:\/\/(discord\.com|discordapp\.com)\/api\/webhooks\//;
      if (!discordPattern.test(url)) {
        res.json({ success: false, error: "Invalid Discord webhook URL — must be a discord.com webhook" });
        return;
      }
      const testRes = await fetch(url, { method: 'GET' });
      if (!testRes.ok) {
        res.json({ success: false, error: "Invalid webhook URL" });
        return;
      }
      res.json({ success: true, message: "Discord webhook is valid" });
      return;
    }

    if (platform === "twitter") {
      const url = 'https://api.twitter.com/2/users/me';
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const nonce = (await import('crypto')).randomBytes(16).toString('hex');
      const cryptoMod = await import('crypto');

      const params: Record<string, string> = {
        oauth_consumer_key: decrypted.apiKey,
        oauth_nonce: nonce,
        oauth_signature_method: 'HMAC-SHA1',
        oauth_timestamp: timestamp,
        oauth_token: decrypted.accessToken,
        oauth_version: '1.0',
      };
      const paramString = Object.keys(params).sort()
        .map(k => `${encodeURIComponent(k)}=${encodeURIComponent(params[k])}`)
        .join('&');
      const signatureBase = `GET&${encodeURIComponent(url)}&${encodeURIComponent(paramString)}`;
      const signingKey = `${encodeURIComponent(decrypted.apiSecret)}&${encodeURIComponent(decrypted.accessTokenSecret)}`;
      const signature = cryptoMod.createHmac('sha1', signingKey).update(signatureBase).digest('base64');

      const authHeader = 'OAuth ' + Object.entries({ ...params, oauth_signature: signature })
        .map(([k, v]) => `${encodeURIComponent(k)}="${encodeURIComponent(v)}"`).join(', ');

      const testRes = await fetch(url, { headers: { 'Authorization': authHeader } });
      if (!testRes.ok) {
        res.json({ success: false, error: `Twitter API returned ${testRes.status}` });
        return;
      }
      const data = await testRes.json() as Record<string, unknown>;
      const dataObj = data.data as Record<string, unknown> | undefined;
      res.json({ success: true, message: `Authenticated as @${dataObj?.username || 'unknown'}` });
      return;
    }

    if (platform === "reddit") {
      const auth = Buffer.from(`${decrypted.clientId}:${decrypted.clientSecret}`).toString('base64');
      const tokenRes = await fetch('https://www.reddit.com/api/v1/access_token', {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${auth}`,
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'ChessScout/1.0',
        },
        body: `grant_type=password&username=${encodeURIComponent(decrypted.username)}&password=${encodeURIComponent(decrypted.password)}`,
      });
      const tokenData = await tokenRes.json() as Record<string, unknown>;
      if (tokenData.error) {
        res.json({ success: false, error: `Reddit: ${tokenData.error}` });
        return;
      }
      res.json({ success: true, message: `Authenticated as u/${decrypted.username}` });
      return;
    }

    res.status(400).json({ error: "Unknown platform" });
  } catch (err: unknown) {
    res.status(500).json({ success: false, error: err instanceof Error ? err.message : "Unknown error" });
  }
});

router.delete("/admin/growth/credentials/:platform", requireAdmin, async (req: Request, res: Response) => {
  try {
    const platform = String(req.params.platform);
    await db.delete(growthCredentialsTable).where(eq(growthCredentialsTable.platform, platform));
    res.json({ success: true });
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Unknown error" });
  }
});

router.get("/admin/growth/campaigns", requireAdmin, async (_req: Request, res: Response) => {
  try {
    const campaigns = await db.select().from(growthCampaignsTable).orderBy(desc(growthCampaignsTable.createdAt));
    res.json(campaigns);
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Unknown error" });
  }
});

function computeNextRun(frequency: string, from?: Date): Date {
  const base = from || new Date();
  const next = new Date(base);
  switch (frequency) {
    case 'daily': next.setHours(next.getHours() + 24); break;
    case 'every_3_days': next.setHours(next.getHours() + 72); break;
    case 'weekly': next.setDate(next.getDate() + 7); break;
    default: next.setHours(next.getHours() + 24);
  }
  return next;
}

router.post("/admin/growth/campaigns", requireAdmin, async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, theme, platforms, frequency, customNote } = req.body as {
      name: string; theme: string; platforms: string[]; frequency: string; customNote?: string;
    };

    if (!name || !theme || !platforms?.length || !frequency) {
      res.status(400).json({ error: "name, theme, platforms, and frequency are required" });
      return;
    }
    if (!CAMPAIGN_THEMES[theme]) {
      res.status(400).json({ error: "Invalid theme" });
      return;
    }
    const validFreqs = ['daily', 'every_3_days', 'weekly'];
    if (!validFreqs.includes(frequency)) {
      res.status(400).json({ error: "frequency must be: " + validFreqs.join(", ") });
      return;
    }

    const nextRunAt = computeNextRun(frequency);
    const [campaign] = await db.insert(growthCampaignsTable)
      .values({ name, theme, platforms, frequency, customNote, nextRunAt })
      .returning();

    res.json(campaign);
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Unknown error" });
  }
});

router.patch("/admin/growth/campaigns/:id", requireAdmin, async (req: Request, res: Response): Promise<void> => {
  try {
    const campaignId = String(req.params.id);
    const { status } = req.body as { status: string };
    const validStatuses = ['active', 'paused'];
    if (!validStatuses.includes(status)) {
      res.status(400).json({ error: "status must be active or paused" });
      return;
    }

    const updates: { status: string; nextRunAt?: Date } = { status };
    if (status === 'active') {
      const [existing] = await db.select({ frequency: growthCampaignsTable.frequency })
        .from(growthCampaignsTable)
        .where(eq(growthCampaignsTable.id, campaignId));
      if (!existing) {
        res.status(404).json({ error: "Campaign not found" });
        return;
      }
      updates.nextRunAt = computeNextRun(existing.frequency);
    }

    const [updated] = await db.update(growthCampaignsTable)
      .set(updates)
      .where(eq(growthCampaignsTable.id, campaignId))
      .returning();

    if (!updated) {
      res.status(404).json({ error: "Campaign not found" });
      return;
    }
    res.json(updated);
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Unknown error" });
  }
});

router.delete("/admin/growth/campaigns/:id", requireAdmin, async (req: Request, res: Response) => {
  try {
    const campaignId = String(req.params.id);
    await db.delete(growthCampaignsTable).where(eq(growthCampaignsTable.id, campaignId));
    res.json({ success: true });
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Unknown error" });
  }
});

async function generateContentForPlatform(theme: string, platform: string, customNote?: string | null): Promise<{ title?: string; content: string }> {
  const openai = new OpenAI({
    baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
    apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  });

  const platformInstructions: Record<string, string> = {
    'Twitter/X': 'Max 280 chars. Punchy, use 2-3 relevant hashtags. Chess community tone.',
    'Reddit (r/chess)': 'Title + body. Informative, not salesy. Value-first. 150-250 words. Target experienced players.',
    'Reddit (r/chessbeginners)': 'Title + body. Beginner-friendly, encouraging. 150-250 words. Avoid jargon.',
    'Discord': 'Casual, community-friendly. 80-120 words. Like sharing something cool with friends.',
  };

  const needsTitle = platform.includes('Reddit');

  const prompt = `You are a marketing copywriter for ChessScout.net — an AI-powered chess coaching app.

PRODUCT: AI opponent scouting, Stockfish 17 game analysis, personalized courses, practice bots (400-2000 ELO), ELO tracking. 3-day free trial, $4/month, no credit card required. https://chessscout.net

THEME: ${theme} — ${CAMPAIGN_THEMES[theme]}
${customNote ? `NOTE: ${customNote}` : ""}

Write ONE post for: ${platform}
Instructions: ${platformInstructions[platform] || 'Informative, 100-150 words.'}

Return VALID JSON only:
${needsTitle ? '{ "title": "...", "content": "..." }' : '{ "content": "..." }'}`;

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    max_tokens: 500,
    messages: [{ role: "user", content: prompt }],
    response_format: { type: "json_object" },
  });

  return JSON.parse(response.choices[0]?.message?.content ?? '{"content":""}');
}

async function postToPlatform(platform: string, content: string, title?: string): Promise<PostResult> {
  const [cred] = await db.select().from(growthCredentialsTable)
    .where(eq(growthCredentialsTable.platform, platformToCredKey(platform)));

  if (!cred) return { platform, success: false, error: "No credentials configured" };

  const decrypted = decryptCredentials(cred.credentials);

  if (platform === 'Discord') {
    return postToDiscord(decrypted.webhookUrl, content);
  }
  if (platform === 'Twitter/X') {
    return postToTwitter({
      apiKey: decrypted.apiKey,
      apiSecret: decrypted.apiSecret,
      accessToken: decrypted.accessToken,
      accessTokenSecret: decrypted.accessTokenSecret,
    }, content);
  }
  if (platform.includes('Reddit')) {
    const sub = platform.includes('r/chessbeginners') ? 'chessbeginners' : 'chess';
    return postToReddit({
      clientId: decrypted.clientId,
      clientSecret: decrypted.clientSecret,
      username: decrypted.username,
      password: decrypted.password,
    }, sub, title || 'ChessScout.net', content);
  }

  return { platform, success: false, error: "Unsupported platform" };
}

function platformToCredKey(platform: string): string {
  if (platform.includes('Discord')) return 'discord';
  if (platform.includes('Twitter')) return 'twitter';
  if (platform.includes('Reddit')) return 'reddit';
  return platform.toLowerCase();
}

export async function executePostForCampaign(campaignId: string | null, platforms: string[], theme: string, customNote?: string | null): Promise<PostResult[]> {
  const results: PostResult[] = [];

  for (const platform of platforms) {
    try {
      const generated = await generateContentForPlatform(theme, platform, customNote);
      const result = await postToPlatform(platform, generated.content, generated.title);

      await db.insert(growthPostLogTable).values({
        campaignId,
        platform,
        content: generated.title ? `${generated.title}\n\n${generated.content}` : generated.content,
        title: generated.title,
        status: result.success ? 'sent' : 'failed',
        error: result.error,
        externalId: result.externalId,
      });

      results.push(result);
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : "Unknown error";
      await db.insert(growthPostLogTable).values({
        campaignId,
        platform,
        content: '',
        status: 'failed',
        error: errMsg,
      });
      results.push({ platform, success: false, error: errMsg });
    }
  }

  return results;
}

router.post("/admin/growth/post-now", requireAdmin, async (req: Request, res: Response): Promise<void> => {
  try {
    const { platforms, theme, customNote } = req.body as { platforms: string[]; theme: string; customNote?: string };

    if (!platforms?.length || !theme) {
      res.status(400).json({ error: "platforms and theme are required" });
      return;
    }
    if (!CAMPAIGN_THEMES[theme]) {
      res.status(400).json({ error: "Invalid theme" });
      return;
    }

    const results = await executePostForCampaign(null, platforms, theme, customNote);
    res.json({ results });
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Unknown error" });
  }
});

router.get("/admin/growth/post-log", requireAdmin, async (req: Request, res: Response) => {
  try {
    const { platform, from, to, limit: limitStr } = req.query as Record<string, string>;
    const queryLimit = parseInt(limitStr) || 50;

    const conditions = [];
    if (platform) conditions.push(eq(growthPostLogTable.platform, platform));
    if (from) conditions.push(gte(growthPostLogTable.postedAt, new Date(from)));
    if (to) conditions.push(lte(growthPostLogTable.postedAt, new Date(to)));

    const baseQuery = db.select().from(growthPostLogTable);
    const filteredQuery = conditions.length > 0
      ? baseQuery.where(and(...conditions))
      : baseQuery;
    const logs = await filteredQuery.orderBy(desc(growthPostLogTable.postedAt)).limit(queryLimit);

    res.json(logs);
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Unknown error" });
  }
});

export { computeNextRun, CAMPAIGN_THEMES };
export default router;
