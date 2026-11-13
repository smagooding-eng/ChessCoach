import { Router } from "express";
import OpenAI from "openai";
import { createHash } from "crypto";
import { logger } from "../lib/logger";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { aiScope, freeVoicesAvailable, speakFree } from "../lib/freeAi";

const router = Router();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Narration was slow because every request went through the chat-completions
// "gpt-audio" model, which writes a text reply AND voices it before anything comes
// back. The dedicated speech endpoint is built for exactly this and returns audio
// in a fraction of the time. The old path stays as a fallback if speech fails.
// Identical text is also cached in memory, so replaying a step or a second
// learner hitting the same lesson page is instant.
const NARRATION_STYLE =
  "You are a warm, knowledgeable chess coach narrating a lesson. Natural, conversational tone with slight emphasis on chess terms and key concepts.";

// Chess for Kids: the same speech endpoint, read the way a kind teacher talks
// to a young child -- warm, smiling, unhurried.
const KIDS_STYLE =
  "You are a warm, gentle, playful friend talking to a child aged 5 to 8. Speak a little slowly and very clearly, with a smile in your voice. Sound natural and human: friendly and encouraging, lively on exciting words like 'Wow' or 'Checkmate', soft and kind when something goes wrong. Never sound robotic or rushed.";

// Content Studio voiceovers: one confident, energetic narrator for short videos.
const STUDIO_STYLE =
  "You are a charismatic chess content creator narrating a short vertical video. Confident, upbeat and natural, like a top chess YouTuber: clear diction, real energy on exciting moments, a quick but never rushed pace, no sing-song, never robotic. Say chess moves crisply (for example 'knight f3', 'bishop takes c6').";

// The Studio's Creator tone: more personality, reacts out loud.
const CREATOR_STYLE =
  "You are a fun, high-energy chess creator on TikTok and Reels, talking straight to the viewer like a friend, not a teacher. Expressive and reactive: genuine excitement on great moves, a groan on blunders, a little playful drama and suspense before reveals, a punchy, quick pace with natural pauses at ellipses. Never lecture, never monotone, never robotic. Say chess moves crisply (for example 'knight f3', 'bishop takes c6').";

// Premium voice (ElevenLabs) when a key is set on the server; otherwise OpenAI.
const ELEVEN_KEY = process.env.ELEVENLABS_API_KEY || "";
const ELEVEN_VOICE = process.env.ELEVENLABS_VOICE_ID || "pNInz6obpgDQGcFmaJgB";
async function speakEleven(text: string, lively = false): Promise<Buffer> {
  const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(ELEVEN_VOICE)}?output_format=mp3_44100_128`, {
    method: "POST",
    headers: { "xi-api-key": ELEVEN_KEY, "Content-Type": "application/json", Accept: "audio/mpeg" },
    body: JSON.stringify({ text, model_id: process.env.ELEVENLABS_MODEL || "eleven_multilingual_v2", voice_settings: lively ? { stability: 0.32, similarity_boost: 0.8, style: 0.6, use_speaker_boost: true } : { stability: 0.45, similarity_boost: 0.8, style: 0.35, use_speaker_boost: true } }),
  });
  if (!r.ok) throw new Error(`ElevenLabs ${r.status}`);
  return Buffer.from(await r.arrayBuffer());
}

router.get("/tts/voices", async (_req, res) => {
  // Free voices (Gemini / Groq keys from Admin › AI usage) are offered to admins only.
  const free = aiScope.getStore()?.admin ? await freeVoicesAvailable().catch(() => []) : [];
  res.json({ premium: !!ELEVEN_KEY, best: ELEVEN_KEY ? "premium" : "ash", free });
});

// Every voiceover line is also kept in the database, so the same line in the same
// voice is only ever paid for once, even after the server restarts.
let storeReady: Promise<void> | null = null;
function ensureStore(): Promise<void> {
  if (!storeReady) {
    storeReady = db.execute(sql`CREATE TABLE IF NOT EXISTS tts_audio_cache (k VARCHAR(64) PRIMARY KEY, mime VARCHAR(32) NOT NULL, audio BYTEA NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), used_at TIMESTAMPTZ NOT NULL DEFAULT now())`)
      .then(() => undefined).catch((err) => { storeReady = null; throw err; });
  }
  return storeReady;
}
async function storeGet(key: string): Promise<Buffer | undefined> {
  try {
    await ensureStore();
    const r = await db.execute(sql`UPDATE tts_audio_cache SET used_at = now() WHERE k = ${key} RETURNING audio`);
    const row = ((r as unknown as { rows?: { audio: Buffer }[] }).rows ?? [])[0];
    return row?.audio ? Buffer.from(row.audio) : undefined;
  } catch { return undefined; }
}
let puts = 0;
async function storePut(key: string, mime: string, buf: Buffer): Promise<void> {
  try {
    await ensureStore();
    await db.execute(sql`INSERT INTO tts_audio_cache (k, mime, audio) VALUES (${key}, ${mime}, ${buf}) ON CONFLICT (k) DO NOTHING`);
    // Keep it to a sensible size: lines not played for 120 days, and anything past the newest 5,000.
    if (++puts % 50 === 1) {
      await db.execute(sql`DELETE FROM tts_audio_cache WHERE used_at < now() - interval '120 days'
        OR k IN (SELECT k FROM tts_audio_cache ORDER BY used_at DESC OFFSET 5000)`);
    }
  } catch (err) { logger.warn({ err: err instanceof Error ? err.message : err }, "[tts] cache save failed"); }
}

const CACHE_MAX_ENTRIES = 400;
const CACHE_MAX_BYTES = 24 * 1024 * 1024; // the server has 512MB in all
const audioCache = new Map<string, Buffer>();
let cacheBytes = 0;

function cacheGet(key: string): Buffer | undefined {
  const hit = audioCache.get(key);
  if (hit) { audioCache.delete(key); audioCache.set(key, hit); } // LRU bump
  return hit;
}
function cachePut(key: string, buf: Buffer) {
  if (audioCache.has(key)) return;
  audioCache.set(key, buf);
  cacheBytes += buf.length;
  while (audioCache.size > CACHE_MAX_ENTRIES || cacheBytes > CACHE_MAX_BYTES) {
    const oldest = audioCache.keys().next().value as string | undefined;
    if (!oldest) break;
    cacheBytes -= audioCache.get(oldest)?.length ?? 0;
    audioCache.delete(oldest);
  }
}

async function speakFast(text: string, voice: string, style = NARRATION_STYLE): Promise<Buffer> {
  const r = await openai.audio.speech.create({
    model: "gpt-4o-mini-tts",
    voice: voice as any,
    input: text,
    instructions: style,
    response_format: "mp3",
  });
  return Buffer.from(await r.arrayBuffer());
}

async function speakLegacy(text: string, voice: string): Promise<Buffer> {
  const response = await openai.chat.completions.create({
    model: "gpt-audio",
    modalities: ["text", "audio"],
    audio: { voice: voice as any, format: "mp3" },
    messages: [
      {
        role: "system",
        content:
          "You are a warm, knowledgeable chess coach narrating a lesson. Read the following text exactly as written — do not add, remove, or rephrase anything. Use a natural, conversational tone with slight emphasis on chess terms and key concepts.",
      },
      { role: "user", content: `Read this aloud exactly as written:\n\n${text}` },
    ],
  });
  const audioData = (response.choices[0]?.message as any)?.audio?.data ?? "";
  return Buffer.from(audioData, "base64");
}

router.post("/tts/speak", async (req, res): Promise<void> => {
  let elevenReason = "";
  try {
    const { text, voice, style } = req.body as { text?: string; voice?: string; style?: string };
    const kids = style === "kids";
    const creator = style === "creator";
    const studio = style === "studio" || creator;

    if (!text || text.trim().length === 0) {
      res.status(400).json({ error: "text is required" });
      return;
    }

    const trimmed = text.slice(0, 4096);
    const validVoices = ["alloy", "ash", "ballad", "coral", "echo", "fable", "nova", "onyx", "sage", "shimmer", "verse"] as const;
    type Voice = typeof validVoices[number];
    const premium = voice === "premium" && !!ELEVEN_KEY;
    const freeVoice = typeof voice === "string" && voice.startsWith("free:") ? voice : null;
    if (freeVoice && !aiScope.getStore()?.admin) { res.status(403).json({ error: "TTS generation failed", reason: "Free voices are for the admin Content Studio" }); return; }
    const mime = freeVoice ? "audio/wav" : "audio/mpeg";
    // "premium" without a premium key: OpenAI's best narrator.
    const selectedVoice: Voice = validVoices.includes(voice as Voice) ? (voice as Voice) : (studio || voice === "premium") ? "ash" : "nova";

    const key = createHash("sha1").update(`${freeVoice ?? (premium ? "eleven:" + ELEVEN_VOICE : selectedVoice)}\u0000${kids ? "kids" : creator ? "creator" : studio ? "studio" : ""}\u0000${trimmed}`).digest("hex");
    let buffer = cacheGet(key) ?? await storeGet(key);
    if (buffer) cachePut(key, buffer);
    if (!buffer && freeVoice) {
      // Free voice: no paid fallback, the reason goes back to the Studio.
      try { buffer = await speakFree(freeVoice, trimmed, kids ? KIDS_STYLE : creator ? CREATOR_STYLE : studio ? STUDIO_STYLE : NARRATION_STYLE); }
      catch (err) { res.status(502).json({ error: "TTS generation failed", reason: (err as Error)?.message ?? "free voice failed" }); return; }
      cachePut(key, buffer);
      void storePut(key, mime, buffer);
    }
    if (!buffer) {
      try {
        if (premium) {
          try { buffer = await speakEleven(trimmed, creator); }
          catch (err) { elevenReason = (err as Error)?.message ?? "ElevenLabs failed"; logger.warn({ err }, "Premium TTS failed, using OpenAI"); buffer = await speakFast(trimmed, "ash", creator ? CREATOR_STYLE : STUDIO_STYLE); }
        } else buffer = await speakFast(trimmed, selectedVoice, kids ? KIDS_STYLE : creator ? CREATOR_STYLE : studio ? STUDIO_STYLE : NARRATION_STYLE);
      } catch (err) {
        logger.warn({ err }, "Fast TTS failed, falling back to gpt-audio");
        buffer = await speakLegacy(trimmed, selectedVoice);
      }
      if (!buffer.length) {
        res.status(500).json({ error: "No audio generated" });
        return;
      }
      cachePut(key, buffer);
      void storePut(key, mime, buffer);
    }

    res.set({
      "Content-Type": mime,
      "Content-Length": buffer.length.toString(),
      "Cache-Control": "public, max-age=86400",
    });
    res.send(buffer);
  } catch (err) {
    logger.error({ err }, "TTS generation failed");
    // Say why, so the Studio can show it (e.g. OpenAI out of credit, or the key missing).
    const e = err as { status?: number; code?: string; message?: string };
    const reason = !process.env.OPENAI_API_KEY ? "OPENAI_API_KEY isn't set on the server"
      : e?.status === 429 || e?.code === "insufficient_quota" ? "OpenAI says the account is out of credit or over its limit (429)"
      : e?.status === 401 ? "OpenAI rejected the API key (401)"
      : `${e?.status ?? ""} ${e?.code ?? e?.message ?? "unknown error"}`.trim();
    res.status(502).json({ error: "TTS generation failed", reason: elevenReason ? `${elevenReason}; then ${reason}` : reason });
  }
});

export default router;
