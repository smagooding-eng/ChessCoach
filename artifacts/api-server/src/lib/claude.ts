// Claude (Anthropic Messages API), called directly over HTTPS so no extra
// package is needed. Used for outreach: finding clubs, libraries, press and
// creators with Claude's web search, and drafting outreach replies.
//
// Needs ANTHROPIC_API_KEY on the server. CLAUDE_MODEL picks the model
// (default claude-sonnet-5-5).

const API = "https://api.anthropic.com/v1/messages";
export const CLAUDE_MODEL = process.env.CLAUDE_MODEL || "claude-sonnet-5-5";
export const claudeAvailable = () => !!process.env.ANTHROPIC_API_KEY;

interface Block { type: string; text?: string; [k: string]: unknown }
interface Reply { content: Block[]; stop_reason: string; usage?: { input_tokens?: number; output_tokens?: number } }

export interface ClaudeResult { text: string; model: string; inputTokens: number; outputTokens: number; searches: number }

/**
 * One prompt in, Claude's final text out. With `webSearch`, Claude can search
 * the web (up to `maxSearches` searches) before answering.
 */
export async function askClaude(prompt: string, opts: { webSearch?: boolean; maxSearches?: number; maxTokens?: number; model?: string } = {}): Promise<ClaudeResult> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("ANTHROPIC_API_KEY is not set");
  const model = opts.model || CLAUDE_MODEL;
  const messages: { role: "user" | "assistant"; content: string | Block[] }[] = [{ role: "user", content: prompt }];
  const tools = opts.webSearch ? [{ type: "web_search_20250305", name: "web_search", max_uses: opts.maxSearches ?? 5 }] : undefined;
  let inputTokens = 0, outputTokens = 0, searches = 0;
  let text = "";
  // A long search turn can pause; send it back to let Claude finish (a few times at most).
  for (let round = 0; round < 4; round++) {
    const r = await fetch(API, {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model, max_tokens: opts.maxTokens ?? 4000, messages, ...(tools ? { tools } : {}) }),
    });
    if (!r.ok) {
      const body = await r.text().catch(() => "");
      throw new Error(`Claude API ${r.status}: ${body.slice(0, 300)}`);
    }
    const d = (await r.json()) as Reply;
    inputTokens += d.usage?.input_tokens ?? 0;
    outputTokens += d.usage?.output_tokens ?? 0;
    searches += d.content.filter((b) => b.type === "server_tool_use").length;
    text = d.content.filter((b) => b.type === "text" && typeof b.text === "string").map((b) => b.text).join("");
    if (d.stop_reason !== "pause_turn") break;
    messages.push({ role: "assistant", content: d.content });
  }
  return { text, model, inputTokens, outputTokens, searches };
}
