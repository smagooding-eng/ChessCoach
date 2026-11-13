// Free AI for admin work (SEO articles and translations, marketing copy,
// outreach drafts and searches, bulk puzzle explanations), so it stops using
// paid OpenAI credits. Players' own features (game reviews, courses, the
// coach) are not routed here.
//
// Providers, tried in this order when their key is set:
//   1. Google Gemini (aistudio.google.com/apikey): free Flash models, and the
//      only one that can search the web (Google Search grounding).
//   2. Groq (console.groq.com/keys): free open models (gpt-oss, Llama), very fast.
// Keys are pasted into Admin › AI usage (kept in the database), or set as
// GEMINI_API_KEY / GROQ_API_KEY on the server. With no free key, callers keep
// using what they used before.
//
// Note: on Gemini's free tier Google may use what's sent to improve its products.
// Only admin content (no player data) is sent.
import { AsyncLocalStorage } from "node:async_hooks";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { logger } from "./logger";
import { trackAiUsage, type AiFeature } from "./aiUsageTracker";

export type FreeProvider = "gemini" | "groq";
const GEMINI = "https://generativelanguage.googleapis.com/v1beta";
const GROQ = "https://api.groq.com/openai/v1";

function rowsOf<T>(r: unknown): T[] { return Array.isArray(r) ? (r as T[]) : ((r as { rows?: T[] })?.rows ?? []); }

let ready: Promise<void> | null = null;
function ensureTable(): Promise<void> {
  if (!ready) {
    ready = db.execute(sql`CREATE TABLE IF NOT EXISTS free_ai_settings (provider VARCHAR PRIMARY KEY, api_key TEXT NOT NULL, model TEXT, updated_at TIMESTAMPTZ NOT NULL DEFAULT now())`)
      .then(() => undefined)
      .catch((err) => { ready = null; throw err; });
  }
  return ready;
}

interface Conf { key: string; model: string | null; fromEnv: boolean }
let cache: { at: number; conf: Partial<Record<FreeProvider, Conf>> } | null = null;

async function config(): Promise<Partial<Record<FreeProvider, Conf>>> {
  if (cache && Date.now() - cache.at < 60_000) return cache.conf;
  const conf: Partial<Record<FreeProvider, Conf>> = {};
  try {
    await ensureTable();
    for (const r of rowsOf<{ provider: FreeProvider; api_key: string; model: string | null }>(await db.execute(sql`SELECT provider, api_key, model FROM free_ai_settings`))) {
      conf[r.provider] = { key: r.api_key, model: r.model, fromEnv: false };
    }
  } catch (err) { logger.warn({ err: err instanceof Error ? err.message : err }, "[free-ai] settings read failed"); }
  if (!conf.gemini && process.env.GEMINI_API_KEY) conf.gemini = { key: process.env.GEMINI_API_KEY, model: process.env.GEMINI_MODEL || null, fromEnv: true };
  if (!conf.groq && process.env.GROQ_API_KEY) conf.groq = { key: process.env.GROQ_API_KEY, model: process.env.GROQ_MODEL || null, fromEnv: true };
  cache = { at: Date.now(), conf };
  return conf;
}

/** Is any free provider set up? Admin features use it first when it is. */
export async function freeAiAvailable(opts: { webSearch?: boolean } = {}): Promise<boolean> {
  const c = await config();
  return opts.webSearch ? !!c.gemini : !!(c.gemini || c.groq);
}

// ── Picking a model the key can use (free model names change often) ─────────

async function listModels(provider: FreeProvider, key: string): Promise<string[]> {
  if (provider === "gemini") {
    const r = await fetch(`${GEMINI}/models?pageSize=200`, { headers: { "x-goog-api-key": key } });
    if (!r.ok) throw new Error(`Gemini ${r.status}: ${(await r.text().catch(() => "")).slice(0, 200)}`);
    const d = (await r.json()) as { models?: { name: string; supportedGenerationMethods?: string[] }[] };
    return (d.models ?? []).filter((m) => m.supportedGenerationMethods?.includes("generateContent")).map((m) => m.name.replace(/^models\//, ""));
  }
  const r = await fetch(`${GROQ}/models`, { headers: { authorization: `Bearer ${key}` } });
  if (!r.ok) throw new Error(`Groq ${r.status}: ${(await r.text().catch(() => "")).slice(0, 200)}`);
  const d = (await r.json()) as { data?: { id: string; active?: boolean }[] };
  return (d.data ?? []).filter((m) => m.active !== false).map((m) => m.id);
}

function pickModel(provider: FreeProvider, models: string[]): string | null {
  if (provider === "gemini") {
    if (models.includes("gemini-flash-latest")) return "gemini-flash-latest";
    const flash = models.filter((m) => /flash/.test(m) && !/(lite|image|tts|audio|live|preview|exp|thinking|embedding)/.test(m));
    flash.sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
    return flash[0] ?? models.find((m) => /flash/.test(m)) ?? null;
  }
  const prefer = ["openai/gpt-oss-120b", "llama-3.3-70b-versatile", "moonshotai/kimi-k2-instruct", "qwen/qwen3-32b", "openai/gpt-oss-20b"];
  return prefer.find((m) => models.includes(m)) ?? models.find((m) => !/(whisper|guard|tts|orpheus|playai|prompt-guard)/i.test(m)) ?? null;
}

async function modelFor(provider: FreeProvider, c: Conf): Promise<string> {
  if (c.model) return c.model;
  const m = pickModel(provider, await listModels(provider, c.key));
  if (!m) throw new Error(`No usable ${provider} model for this key`);
  c.model = m;
  if (!c.fromEnv) await db.execute(sql`UPDATE free_ai_settings SET model = ${m} WHERE provider = ${provider}`).catch(() => {});
  return m;
}

// ── Calls ─────────────────────────────────────────────────────────────────

export interface FreeAiResult { text: string; provider: FreeProvider; model: string }

type Msg = { role: "system" | "user" | "assistant"; content: string };
const toMsgs = (prompt: string, system?: string): Msg[] => [...(system ? [{ role: "system" as const, content: system }] : []), { role: "user", content: prompt }];

async function callGemini(c: Conf, msgs: Msg[], o: FreeAskOpts): Promise<FreeAiResult & { usage: { prompt_tokens: number; completion_tokens: number } }> {
  const model = await modelFor("gemini", c);
  const system = msgs.filter((m) => m.role === "system").map((m) => m.content).join("\n\n");
  const body: Record<string, unknown> = {
    contents: msgs.filter((m) => m.role !== "system").map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] })),
    generationConfig: {
      // Newer Flash models think before answering and that counts here, so leave room for it.
      maxOutputTokens: Math.max(2048, (o.maxTokens ?? 4000) * 3),
      // Search grounding can't be combined with JSON mode, so the prompt asks for JSON instead.
      ...(o.json && !o.webSearch ? { responseMimeType: "application/json" } : {}),
    },
  };
  if (system) body.systemInstruction = { parts: [{ text: system }] };
  if (o.webSearch) body.tools = [{ google_search: {} }];
  const r = await fetch(`${GEMINI}/models/${encodeURIComponent(model)}:generateContent`, {
    method: "POST", headers: { "content-type": "application/json", "x-goog-api-key": c.key }, body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`Gemini ${r.status}: ${(await r.text().catch(() => "")).slice(0, 300)}`);
  const d = (await r.json()) as {
    candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] } }[];
    usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
  };
  const text = (d.candidates?.[0]?.content?.parts ?? []).filter((p) => !p.thought && typeof p.text === "string").map((p) => p.text).join("");
  return { text, provider: "gemini", model, usage: { prompt_tokens: d.usageMetadata?.promptTokenCount ?? 0, completion_tokens: d.usageMetadata?.candidatesTokenCount ?? 0 } };
}

async function callGroq(c: Conf, msgs: Msg[], o: FreeAskOpts): Promise<FreeAiResult & { usage: { prompt_tokens: number; completion_tokens: number } }> {
  const model = await modelFor("groq", c);
  const messages = msgs;
  const r = await fetch(`${GROQ}/chat/completions`, {
    method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${c.key}` },
    body: JSON.stringify({ model, messages, max_completion_tokens: o.maxTokens ?? 4000, ...(o.json ? { response_format: { type: "json_object" } } : {}) }),
  });
  if (!r.ok) throw new Error(`Groq ${r.status}: ${(await r.text().catch(() => "")).slice(0, 300)}`);
  const d = (await r.json()) as { choices?: { message?: { content?: string } }[]; usage?: { prompt_tokens?: number; completion_tokens?: number } };
  return { text: d.choices?.[0]?.message?.content ?? "", provider: "groq", model, usage: { prompt_tokens: d.usage?.prompt_tokens ?? 0, completion_tokens: d.usage?.completion_tokens ?? 0 } };
}

export interface FreeAskOpts { feature: AiFeature; maxTokens?: number; system?: string; json?: boolean; webSearch?: boolean; userId?: string | null }

/**
 * One prompt to a free model. Tries Gemini, then Groq (web search: Gemini only).
 * Throws if no free provider is set up or all of them fail (rate limit etc.),
 * so it never quietly falls back to paid credits.
 */
/** Text out of a model that may have wrapped its JSON in a ``` fence. */
export function stripFence(t: string): string {
  const m = t.trim().match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return m ? m[1] : t.trim();
}

export async function askFreeAi(prompt: string, o: FreeAskOpts): Promise<FreeAiResult> {
  const c = await config();
  const order: FreeProvider[] = o.webSearch ? ["gemini"] : ["gemini", "groq"];
  let lastErr: unknown = null;
  for (const p of order) {
    const conf = c[p];
    if (!conf) continue;
    try {
      const msgs = toMsgs(prompt, o.system);
      const r = p === "gemini" ? await callGemini(conf, msgs, o) : await callGroq(conf, msgs, o);
      if (!r.text.trim()) throw new Error(`${p} returned nothing`);
      void trackAiUsage({ userId: o.userId ?? null, feature: o.feature, model: `free:${r.model}`, usage: { ...r.usage, total_tokens: r.usage.prompt_tokens + r.usage.completion_tokens } });
      return { text: r.text, provider: r.provider, model: r.model };
    } catch (err) {
      lastErr = err;
      logger.warn({ provider: p, feature: o.feature, err: err instanceof Error ? err.message : err }, "[free-ai] call failed");
    }
  }
  if (!lastErr) throw new Error(o.webSearch ? "Add a free Gemini key in Admin › AI usage to search the web for free" : "No free AI key set (Admin › AI usage)");
  throw new Error(`Free AI failed (it may be at its daily limit, try again later): ${lastErr instanceof Error ? lastErr.message : String(lastErr)}`);
}

// ── Admin: status, save and remove keys ──────────────────────────────────────

export async function freeAiStatus() {
  const c = await config();
  const out: Record<FreeProvider, { set: boolean; fromEnv: boolean; model: string | null; keyHint: string | null }> = {
    gemini: { set: false, fromEnv: false, model: null, keyHint: null },
    groq: { set: false, fromEnv: false, model: null, keyHint: null },
  };
  for (const p of ["gemini", "groq"] as FreeProvider[]) {
    const x = c[p];
    if (x) out[p] = { set: true, fromEnv: x.fromEnv, model: x.model, keyHint: `…${x.key.slice(-4)}` };
  }
  return out;
}

/** Models worth trying for a provider, best first (free model names change often). */
function candidates(provider: FreeProvider, models: string[]): string[] {
  const first = pickModel(provider, models);
  const rest = provider === "gemini"
    ? models.filter((m) => /flash/.test(m) && !/(image|tts|audio|live|embedding|computer)/.test(m)).sort((a, b) => b.localeCompare(a, undefined, { numeric: true }))
    : models.filter((m) => !/(whisper|guard|tts|orpheus|playai)/i.test(m));
  return [...new Set([...(first ? [first] : []), ...rest])].slice(0, 8);
}

/**
 * Saves a key as soon as it's shown to be real (it can list its models), so the
 * save is quick. The likely models are then tried in the background with a tiny
 * request, and the first that answers is kept (Gemini's can take a while).
 */
export async function saveFreeAiKey(provider: FreeProvider, key: string): Promise<{ model: string | null; warning?: string }> {
  const k = key.trim().replace(/^["']|["']$/g, "").replace(/\s+/g, "");
  if (k.length < 10) throw new Error("That key looks too short");
  let models: string[];
  try { models = await listModels(provider, k); }
  catch (err) { throw new Error(`${provider === "gemini" ? "Google" : "Groq"} didn't accept that key: ${err instanceof Error ? err.message : String(err)}`); }
  const tries = candidates(provider, models);
  if (!tries.length) throw new Error(`The key works, but it has no text models available (${models.length} models listed)`);
  await ensureTable();
  await db.execute(sql`INSERT INTO free_ai_settings (provider, api_key, model, updated_at) VALUES (${provider}, ${k}, ${tries[0]}, now())
    ON CONFLICT (provider) DO UPDATE SET api_key = EXCLUDED.api_key, model = EXCLUDED.model, updated_at = now()`);
  cache = null;
  void (async () => {
    for (const m of tries) {
      try {
        const conf = { key: k, model: m, fromEnv: false };
        const msgs = toMsgs("Reply with OK.");
        await (provider === "gemini" ? callGemini(conf, msgs, { feature: "admin_marketing", maxTokens: 200 }) : callGroq(conf, msgs, { feature: "admin_marketing", maxTokens: 200 }));
        await db.execute(sql`UPDATE free_ai_settings SET model = ${m} WHERE provider = ${provider} AND api_key = ${k}`);
        cache = null;
        return;
      } catch { /* try the next model */ }
    }
  })();
  return { model: tries[0] };
}

export async function removeFreeAiKey(provider: FreeProvider): Promise<void> {
  await ensureTable();
  await db.execute(sql`DELETE FROM free_ai_settings WHERE provider = ${provider}`);
  cache = null;
}

// ── Anything you (an admin) start runs on free AI ─────────────────────────────
// Requests from an admin account carry this scope (set in app.ts), and so do the
// background jobs they start (scout reports, game reviews and courses made while
// building content). The game-analysis code's OpenAI client is wrapped so text
// calls in that scope go to the free provider instead. Players are never in it.

export const aiScope = new AsyncLocalStorage<{ admin: boolean; freeModel?: string }>();

/** The model actually used for the last free call in this scope (for the cost log). */
export function freeModelInScope(): string | undefined { return aiScope.getStore()?.freeModel; }

type ChatParams = { model?: string; messages?: { role: string; content: unknown }[]; max_completion_tokens?: number; max_tokens?: number; response_format?: { type?: string } };

function textOnly(p: ChatParams): Msg[] | null {
  const out: Msg[] = [];
  for (const m of p.messages ?? []) {
    if (typeof m.content !== "string") return null; // images, audio: leave to OpenAI
    const role = m.role === "developer" ? "system" : m.role;
    if (role !== "system" && role !== "user" && role !== "assistant") return null;
    out.push({ role, content: m.content });
  }
  return out.length ? out : null;
}

/** Wraps an OpenAI client: admin-scope text chat calls go to the free AI (OpenAI-shaped reply). */
export function adminFreeRouted<T extends { chat: { completions: { create: (...a: any[]) => any } } }>(client: T): T {
  const real = client.chat.completions.create.bind(client.chat.completions);
  const create = async (params: ChatParams & Record<string, unknown>, ...rest: unknown[]) => {
    const scope = aiScope.getStore();
    const msgs = scope?.admin && !(params as { stream?: boolean }).stream ? textOnly(params) : null;
    if (!scope || !msgs || !(await freeAiAvailable())) return real(params, ...rest);
    const c = await config();
    const json = params.response_format?.type === "json_object" || params.response_format?.type === "json_schema";
    const o: FreeAskOpts = { feature: "game_analysis" as AiFeature, maxTokens: params.max_completion_tokens ?? params.max_tokens ?? 4000, json };
    let lastErr: unknown = null;
    for (const p of ["gemini", "groq"] as FreeProvider[]) {
      const conf = c[p];
      if (!conf) continue;
      try {
        const r = p === "gemini" ? await callGemini(conf, msgs, o) : await callGroq(conf, msgs, o);
        if (!r.text.trim()) throw new Error(`${p} returned nothing`);
        scope.freeModel = `free:${r.model}`;
        return {
          id: `free-${Date.now()}`, object: "chat.completion", created: Math.floor(Date.now() / 1000), model: scope.freeModel,
          choices: [{ index: 0, finish_reason: "stop", message: { role: "assistant", content: json ? stripFence(r.text) : r.text } }],
          usage: { prompt_tokens: r.usage.prompt_tokens, completion_tokens: r.usage.completion_tokens, total_tokens: r.usage.prompt_tokens + r.usage.completion_tokens },
        };
      } catch (err) {
        lastErr = err;
        logger.warn({ provider: p, err: err instanceof Error ? err.message : err }, "[free-ai] admin call failed");
      }
    }
    throw new Error(`Free AI failed (it may be at its daily limit, try again later): ${lastErr instanceof Error ? lastErr.message : String(lastErr)}`);
  };
  // Proxies, so everything else on the client keeps working as before.
  const completions = new Proxy(client.chat.completions, { get: (t, k) => (k === "create" ? create : Reflect.get(t, k)) });
  const chat = new Proxy(client.chat, { get: (t, k) => (k === "completions" ? completions : Reflect.get(t, k)) });
  return new Proxy(client, { get: (t, k) => (k === "chat" ? chat : Reflect.get(t, k)) });
}

// ── Free voices for the Content Studio (admin only) ──────────────────────────
// Gemini's TTS models and Groq's Orpheus have small free daily limits, so lines
// are also kept for good in the voiceover cache (routes/tts.ts).

export const FREE_VOICES: { id: string; provider: FreeProvider; voice: string; label: string }[] = [
  { id: "free:gemini:Puck", provider: "gemini", voice: "Puck", label: "Free · Puck (upbeat)" },
  { id: "free:gemini:Fenrir", provider: "gemini", voice: "Fenrir", label: "Free · Fenrir (excitable)" },
  { id: "free:gemini:Charon", provider: "gemini", voice: "Charon", label: "Free · Charon (clear)" },
  { id: "free:gemini:Kore", provider: "gemini", voice: "Kore", label: "Free · Kore (firm)" },
  { id: "free:gemini:Leda", provider: "gemini", voice: "Leda", label: "Free · Leda (youthful)" },
  { id: "free:groq:troy", provider: "groq", voice: "troy", label: "Free · Troy (Groq)" },
  { id: "free:groq:austin", provider: "groq", voice: "austin", label: "Free · Austin (Groq)" },
  { id: "free:groq:daniel", provider: "groq", voice: "daniel", label: "Free · Daniel (Groq)" },
  { id: "free:groq:hannah", provider: "groq", voice: "hannah", label: "Free · Hannah (Groq)" },
];

export async function freeVoicesAvailable(): Promise<{ id: string; label: string }[]> {
  const c = await config();
  return FREE_VOICES.filter((v) => !!c[v.provider]).map(({ id, label }) => ({ id, label }));
}

function wavFromPcm(pcm: Buffer, rate = 24000, channels = 1, bits = 16): Buffer {
  const h = Buffer.alloc(44);
  h.write("RIFF", 0); h.writeUInt32LE(36 + pcm.length, 4); h.write("WAVE", 8);
  h.write("fmt ", 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(channels, 22);
  h.writeUInt32LE(rate, 24); h.writeUInt32LE(rate * channels * bits / 8, 28); h.writeUInt16LE(channels * bits / 8, 32); h.writeUInt16LE(bits, 34);
  h.write("data", 36); h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
}

/** The PCM samples and format of a WAV file (walks the chunks, so any header size works). */
function readWav(b: Buffer): { pcm: Buffer; rate: number; channels: number; bits: number } {
  let i = 12, rate = 24000, channels = 1, bits = 16;
  while (i + 8 <= b.length) {
    const id = b.toString("ascii", i, i + 4); let size = b.readUInt32LE(i + 4);
    if (id === "fmt ") { channels = b.readUInt16LE(i + 10); rate = b.readUInt32LE(i + 12); bits = b.readUInt16LE(i + 22); }
    if (id === "data") { if (size === 0 || size > b.length - i - 8) size = b.length - i - 8; return { pcm: b.subarray(i + 8, i + 8 + size), rate, channels, bits }; }
    i += 8 + size + (size % 2);
  }
  throw new Error("Unreadable audio from the free voice");
}

/** Pieces of at most `max` characters, split at sentence ends, then commas, then spaces. */
function chunkText(t: string, max: number): string[] {
  const out: string[] = [];
  let rest = t.trim();
  while (rest.length > max) {
    const part = rest.slice(0, max);
    const cut = Math.max(part.lastIndexOf(". "), part.lastIndexOf("! "), part.lastIndexOf("? "), part.lastIndexOf("… "));
    const at = cut > max * 0.4 ? cut + 1 : Math.max(part.lastIndexOf(", ") + 1, part.lastIndexOf(" "));
    const n = at > 0 ? at : max;
    out.push(rest.slice(0, n).trim()); rest = rest.slice(n).trim();
  }
  if (rest) out.push(rest);
  return out;
}

/** Speaks a line with a free voice; returns a WAV file. Throws when the free limit is used up. */
export async function speakFree(voiceId: string, text: string, style: string): Promise<Buffer> {
  const v = FREE_VOICES.find((x) => x.id === voiceId);
  if (!v) throw new Error("Unknown free voice");
  const c = (await config())[v.provider];
  if (!c) throw new Error(`Add a free ${v.provider === "gemini" ? "Gemini" : "Groq"} key in Admin › AI usage to use this voice`);
  if (v.provider === "gemini") {
    const models = await listModels("gemini", c.key);
    const tts = models.filter((m) => /tts/.test(m) && /flash/.test(m)).sort((a, b) => b.localeCompare(a, undefined, { numeric: true }))[0] ?? models.find((m) => /tts/.test(m));
    if (!tts) throw new Error("No Gemini voice model for this key");
    const r = await fetch(`${GEMINI}/models/${encodeURIComponent(tts)}:generateContent`, {
      method: "POST", headers: { "content-type": "application/json", "x-goog-api-key": c.key },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: `${style}\n\nSay exactly this, nothing else:\n${text}` }] }],
        generationConfig: { responseModalities: ["AUDIO"], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: v.voice } } } },
      }),
    });
    if (!r.ok) throw new Error(r.status === 429 ? "the free Gemini voice is at its daily limit (try a Groq voice, or tomorrow)" : `Gemini voice ${r.status}: ${(await r.text().catch(() => "")).slice(0, 200)}`);
    const d = (await r.json()) as { candidates?: { content?: { parts?: { inlineData?: { data?: string; mimeType?: string } }[] } }[] };
    const part = d.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data)?.inlineData;
    if (!part?.data) throw new Error("The free Gemini voice returned no audio");
    const rate = Number(/rate=(\d+)/.exec(part.mimeType ?? "")?.[1] ?? 24000);
    return wavFromPcm(Buffer.from(part.data, "base64"), rate);
  }
  // Groq Orpheus: up to 200 characters a request, so long lines are spoken in pieces and joined.
  const pieces: Buffer[] = [];
  let fmt = { rate: 24000, channels: 1, bits: 16 };
  for (const t of chunkText(text, 195)) {
    const r = await fetch(`${GROQ}/audio/speech`, {
      method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${c.key}` },
      body: JSON.stringify({ model: "canopylabs/orpheus-v1-english", voice: v.voice, input: t, response_format: "wav" }),
    });
    if (!r.ok) throw new Error(r.status === 429 ? "the free Groq voice is at its daily limit (try a Gemini voice, or tomorrow)" : `Groq voice ${r.status}: ${(await r.text().catch(() => "")).slice(0, 200)}`);
    const w = readWav(Buffer.from(await r.arrayBuffer()));
    fmt = w; pieces.push(w.pcm);
  }
  return wavFromPcm(Buffer.concat(pieces), fmt.rate, fmt.channels, fmt.bits);
}
