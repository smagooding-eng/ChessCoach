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

const CACHE_MAX_ENTRIES = 400;
const CACHE_MAX_BYTES = 80 * 1024 * 1024;
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

async function speakFast(text: string, voice: string): Promise<Buffer> {
  const r = await openai.audio.speech.create({
    model: "gpt-4o-mini-tts",
    voice: voice as any,
    input: text,
    instructions: NARRATION_STYLE,
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
  try {
    const { text, voice } = req.body as { text?: string; voice?: string };

    if (!text || text.trim().length === 0) {
      res.status(400).json({ error: "text is required" });
      return;
    }

    const trimmed = text.slice(0, 4096);
    const validVoices = ["alloy", "echo", "fable", "nova", "onyx", "shimmer"] as const;
    type Voice = typeof validVoices[number];
    const selectedVoice: Voice = validVoices.includes(voice as Voice) ? (voice as Voice) : "nova";

    const key = createHash("sha1").update(`${selectedVoice}\u0000${trimmed}`).digest("hex");
    let buffer = cacheGet(key);
    if (!buffer) {
      try {
        buffer = await speakFast(trimmed, selectedVoice);
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
    res.status(500).json({ error: "TTS generation failed" });
  }
});

export default router;
