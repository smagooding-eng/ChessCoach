import { Router, type Request, type Response } from "express";
import { db, growthCredentialsTable, growthCampaignsTable, growthPostLogTable } from "@workspace/db";
import { eq, desc, and, gte, lte } from "drizzle-orm";
import {
  encryptCredentials,
  decryptCredentials,
} from "../lib/growthPosting";
import { executePostForCampaign, computeNextRun, CAMPAIGN_THEMES } from "../lib/growthService";

const router = Router();

interface TwitterTestResponse {
  data?: { username?: string };
}

interface RedditTokenTestResponse {
  error?: string;
}

function requireAdmin(req: Request, res: Response, next: Function) {
  if (!req.isAuthenticated() || !req.user?.isAdmin) {
    res.status(403).json({ error: "Admin access required" });
    return;
  }
  next();
}

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
      const cryptoMod = await import('crypto');
      const nonce = cryptoMod.randomBytes(16).toString('hex');

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
      const data: TwitterTestResponse = await testRes.json();
      res.json({ success: true, message: `Authenticated as @${data.data?.username || 'unknown'}` });
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
      const tokenData: RedditTokenTestResponse = await tokenRes.json();
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
    const queryLimit = Math.min(parseInt(limitStr) || 50, 200);

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

export default router;
