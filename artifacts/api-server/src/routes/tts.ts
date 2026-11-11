import { Router } from "express";
import OpenAI from "openai";
import { createHash } from "crypto";
import { logger } from "../lib/logger";

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

router.get("/tts/voices", (_req, res) => {
  res.json({ premium: !!ELEVEN_KEY, best: ELEVEN_KEY ? "premium" : "ash" });
});

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
    // "premium" without a premium key: OpenAI's best narrator.
    const selectedVoice: Voice = validVoices.includes(voice as Voice) ? (voice as Voice) : (studio || voice === "premium") ? "ash" : "nova";

    const key = createHash("sha1").update(`${premium ? "eleven:" + ELEVEN_VOICE : selectedVoice}\u0000${kids ? "kids" : creator ? "creator" : studio ? "studio" : ""}\u0000${trimmed}`).digest("hex");
    let buffer = cacheGet(key);
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
    }

    res.set({
      "Content-Type": "audio/mpeg",
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
