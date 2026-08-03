import { db, growthCredentialsTable, growthPostLogTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import OpenAI from "openai";
import {
  decryptCredentials,
  postToDiscord,
  postToTwitter,
  postToReddit,
  type PostResult,
} from "./growthPosting";

export const CAMPAIGN_THEMES: Record<string, string> = {
  "Free Trial": "Emphasize the free 3-day trial with no credit card required. Urgency: try it risk-free today.",
  "Opponent Scouting": "Focus on the killer feature: smart scouting reports that expose any opponent's weaknesses before you play them.",
  "Game Analysis": "Highlight move-by-move game analysis with Stockfish 17 engine + coaching explanations for every move.",
  "New Feature": "Announce exciting new features. Be enthusiastic and specific about what's new.",
  "General Promo": "Broad promotional message covering the full value proposition: scouting, analysis, courses, bots, and progress tracking.",
  "ELO Improvement": "Target players who want to gain rating points. Emphasize how personalized training and weakness detection leads to measurable improvement.",
};

export function computeNextRun(frequency: string, from?: Date): Date {
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

function platformToCredKey(platform: string): string {
  if (platform.includes('Discord')) return 'discord';
  if (platform.includes('Twitter')) return 'twitter';
  if (platform.includes('Reddit')) return 'reddit';
  return platform.toLowerCase();
}

async function generateContentForPlatform(theme: string, platform: string, customNote?: string | null): Promise<{ title?: string; content: string }> {
  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });

  const platformInstructions: Record<string, string> = {
    'Twitter/X': 'Max 280 chars. Punchy, use 2-3 relevant hashtags. Chess community tone.',
    'Reddit (r/chess)': 'Title + body. Informative, not salesy. Value-first. 150-250 words. Target experienced players.',
    'Reddit (r/chessbeginners)': 'Title + body. Beginner-friendly, encouraging. 150-250 words. Avoid jargon.',
    'Discord': 'Casual, community-friendly. 80-120 words. Like sharing something cool with friends.',
  };

  const needsTitle = platform.includes('Reddit');

  const prompt = `You are a marketing copywriter for ChessScout.net — a smart chess coaching app.

PRODUCT: Smart opponent scouting, Stockfish 17 game analysis, personalized courses, practice bots (400-2000 ELO), ELO tracking. 3-day free trial, $4/month, no credit card required. https://chessscout.net

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

  const parsed: { title?: string; content: string } = JSON.parse(response.choices[0]?.message?.content ?? '{"content":""}');
  return parsed;
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
