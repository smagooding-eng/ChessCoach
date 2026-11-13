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

async function callGemini(c: Conf, prompt: string, o: FreeAskOpts): Promise<FreeAiResult & { usage: { prompt_tokens: number; completion_tokens: number } }> {
  const model = await modelFor("gemini", c);
  const body: Record<string, unknown> = {
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: {
      // Newer Flash models think before answering and that counts here, so leave room for it.
      maxOutputTokens: Math.max(2048, (o.maxTokens ?? 4000) * 3),
      // Search grounding can't be combined with JSON mode, so the prompt asks for JSON instead.
      ...(o.json && !o.webSearch ? { responseMimeType: "application/json" } : {}),
    },
  };
  if (o.system) body.systemInstruction = { parts: [{ text: o.system }] };
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

async function callGroq(c: Conf, prompt: string, o: FreeAskOpts): Promise<FreeAiResult & { usage: { prompt_tokens: number; completion_tokens: number } }> {
  const model = await modelFor("groq", c);
  const messages = [...(o.system ? [{ role: "system", content: o.system }] : []), { role: "user", content: prompt }];
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
      const r = p === "gemini" ? await callGemini(conf, prompt, o) : await callGroq(conf, prompt, o);
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

/** Checks the key works (lists its models), picks a model, then saves it. */
export async function saveFreeAiKey(provider: FreeProvider, key: string): Promise<{ model: string }> {
  const k = key.trim();
  if (k.length < 10) throw new Error("That key looks too short");
  const model = pickModel(provider, await listModels(provider, k));
  if (!model) throw new Error(`The key works but has no usable ${provider} model`);
  // A tiny test call so a key without free access shows up now, not later.
  const test = provider === "gemini"
    ? await callGemini({ key: k, model, fromEnv: false }, "Reply with OK.", { feature: "admin_marketing", maxTokens: 200 })
    : await callGroq({ key: k, model, fromEnv: false }, "Reply with OK.", { feature: "admin_marketing", maxTokens: 200 });
  void test;
  await ensureTable();
  await db.execute(sql`INSERT INTO free_ai_settings (provider, api_key, model, updated_at) VALUES (${provider}, ${k}, ${model}, now())
    ON CONFLICT (provider) DO UPDATE SET api_key = EXCLUDED.api_key, model = EXCLUDED.model, updated_at = now()`);
  cache = null;
  return { model };
}

export async function removeFreeAiKey(provider: FreeProvider): Promise<void> {
  await ensureTable();
  await db.execute(sql`DELETE FROM free_ai_settings WHERE provider = ${provider}`);
  cache = null;
}
