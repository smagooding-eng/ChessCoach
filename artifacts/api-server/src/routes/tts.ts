import { Router } from "express";
import OpenAI from "openai";
import { logger } from "../lib/logger";

const router = Router();

const openai = new OpenAI({
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
});

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

    const response = await openai.chat.completions.create({
      model: "gpt-audio",
      modalities: ["text", "audio"],
      audio: { voice: selectedVoice, format: "mp3" },
      messages: [
        {
          role: "system",
          content:
            "You are a warm, knowledgeable chess coach narrating a lesson. Read the following text exactly as written — do not add, remove, or rephrase anything. Use a natural, conversational tone with slight emphasis on chess terms and key concepts.",
        },
        {
          role: "user",
          content: `Read this aloud exactly as written:\n\n${trimmed}`,
        },
      ],
    });

    const audioData = (response.choices[0]?.message as any)?.audio?.data ?? "";

    if (!audioData) {
      res.status(500).json({ error: "No audio generated" });
      return;
    }

    const buffer = Buffer.from(audioData, "base64");

    res.set({
      "Content-Type": "audio/mpeg",
      "Content-Length": buffer.length.toString(),
      "Cache-Control": "public, max-age=3600",
    });
    res.send(buffer);
  } catch (err) {
    logger.error({ err }, "TTS generation failed");
    res.status(500).json({ error: "TTS generation failed" });
  }
});

export default router;
