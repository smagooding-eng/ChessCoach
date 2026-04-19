import crypto from 'crypto';

function getKey(): Buffer {
  const key = process.env.SESSION_SECRET;
  if (!key) throw new Error('SESSION_SECRET env var is required for credential encryption');
  return crypto.createHash('sha256').update(key).digest();
}

export function encryptCredentials(data: Record<string, string>): string {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', getKey(), iv);
  let encrypted = cipher.update(JSON.stringify(data), 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return iv.toString('hex') + ':' + encrypted;
}

export function decryptCredentials(encrypted: string): Record<string, string> {
  const [ivHex, data] = encrypted.split(':');
  const iv = Buffer.from(ivHex, 'hex');
  const decipher = crypto.createDecipheriv('aes-256-cbc', getKey(), iv);
  let decrypted = decipher.update(data, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return JSON.parse(decrypted);
}

export interface PostResult {
  platform: string;
  success: boolean;
  error?: string;
  externalId?: string;
}

interface DiscordWebhookResponse {
  id?: string;
}

interface TwitterTweetResponse {
  data?: { id?: string };
}

interface RedditTokenResponse {
  access_token?: string;
  expires_in?: number;
  error?: string;
}

interface RedditSubmitResponse {
  json?: {
    errors?: string[][];
    data?: { url?: string };
  };
}

export async function postToDiscord(webhookUrl: string, content: string): Promise<PostResult> {
  try {
    const discordPattern = /^https:\/\/(discord\.com|discordapp\.com)\/api\/webhooks\//;
    if (!discordPattern.test(webhookUrl)) {
      return { platform: 'Discord', success: false, error: 'Invalid Discord webhook URL' };
    }
    const embed = {
      title: "♜ ChessScout.net",
      description: content,
      color: 0x81b64c,
      footer: { text: "ChessScout — Smart Chess Coaching" },
      url: "https://chessscout.net",
    };
    const res = await fetch(webhookUrl + '?wait=true', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ embeds: [embed] }),
    });
    if (!res.ok) {
      const errText = await res.text();
      return { platform: 'Discord', success: false, error: `HTTP ${res.status}: ${errText}` };
    }
    const data = await res.json() as DiscordWebhookResponse;
    return { platform: 'Discord', success: true, externalId: data.id };
  } catch (err: unknown) {
    return { platform: 'Discord', success: false, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}

export async function postToTwitter(
  creds: { apiKey: string; apiSecret: string; accessToken: string; accessTokenSecret: string },
  tweetText: string
): Promise<PostResult> {
  try {
    const url = 'https://api.twitter.com/2/tweets';
    const method = 'POST';
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const nonce = crypto.randomBytes(16).toString('hex');

    const params: Record<string, string> = {
      oauth_consumer_key: creds.apiKey,
      oauth_nonce: nonce,
      oauth_signature_method: 'HMAC-SHA1',
      oauth_timestamp: timestamp,
      oauth_token: creds.accessToken,
      oauth_version: '1.0',
    };

    const paramString = Object.keys(params).sort()
      .map(k => `${encodeURIComponent(k)}=${encodeURIComponent(params[k])}`)
      .join('&');

    const signatureBase = `${method}&${encodeURIComponent(url)}&${encodeURIComponent(paramString)}`;
    const signingKey = `${encodeURIComponent(creds.apiSecret)}&${encodeURIComponent(creds.accessTokenSecret)}`;
    const signature = crypto.createHmac('sha1', signingKey).update(signatureBase).digest('base64');

    const authHeader = 'OAuth ' + Object.entries({
      ...params,
      oauth_signature: signature,
    }).map(([k, v]) => `${encodeURIComponent(k)}="${encodeURIComponent(v)}"`).join(', ');

    const res = await fetch(url, {
      method,
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ text: tweetText }),
    });

    if (!res.ok) {
      const errText = await res.text();
      return { platform: 'Twitter/X', success: false, error: `HTTP ${res.status}: ${errText}` };
    }
    const data = await res.json() as TwitterTweetResponse;
    return { platform: 'Twitter/X', success: true, externalId: data.data?.id };
  } catch (err: unknown) {
    return { platform: 'Twitter/X', success: false, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}

let redditAccessToken: string | null = null;
let redditTokenExpiry = 0;

async function getRedditToken(clientId: string, clientSecret: string, username: string, password: string): Promise<string> {
  if (redditAccessToken && Date.now() < redditTokenExpiry) return redditAccessToken;

  const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const res = await fetch('https://www.reddit.com/api/v1/access_token', {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': 'ChessScout/1.0',
    },
    body: `grant_type=password&username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}`,
  });

  if (!res.ok) throw new Error(`Reddit auth failed: ${res.status}`);
  const data = await res.json() as RedditTokenResponse;
  if (data.error) throw new Error(`Reddit auth error: ${data.error}`);

  redditAccessToken = data.access_token ?? null;
  redditTokenExpiry = Date.now() + ((data.expires_in ?? 3600) - 60) * 1000;
  return redditAccessToken!;
}

export async function postToReddit(
  creds: { clientId: string; clientSecret: string; username: string; password: string },
  subreddit: string,
  title: string,
  body: string
): Promise<PostResult> {
  const platformLabel = `Reddit (${subreddit})`;
  try {
    const token = await getRedditToken(creds.clientId, creds.clientSecret, creds.username, creds.password);

    const res = await fetch('https://oauth.reddit.com/api/submit', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'ChessScout/1.0',
      },
      body: new URLSearchParams({
        sr: subreddit,
        kind: 'self',
        title,
        text: body,
        api_type: 'json',
      }).toString(),
    });

    if (!res.ok) {
      const errText = await res.text();
      return { platform: platformLabel, success: false, error: `HTTP ${res.status}: ${errText}` };
    }

    const data = await res.json() as RedditSubmitResponse;
    const errors = data.json?.errors;
    if (errors && errors.length > 0) {
      return { platform: platformLabel, success: false, error: errors.map(e => e.join(': ')).join('; ') };
    }

    const postUrl = data.json?.data?.url;
    return { platform: platformLabel, success: true, externalId: postUrl };
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : 'Unknown error';
    if (errMsg.includes('Reddit auth')) {
      redditAccessToken = null;
      redditTokenExpiry = 0;
    }
    return { platform: platformLabel, success: false, error: errMsg };
  }
}
