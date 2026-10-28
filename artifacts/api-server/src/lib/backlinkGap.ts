// Competitor backlinks ("link gap"): pages on other sites that link to or
// recommend a competing chess tool -- "best chess apps" lists, alternatives
// posts, reviews, club / library resource pages, directories. Those sites
// already link to tools like ChessScout, so they're the best people to ask.
//
// A run:
//   1. Claude (web search) lists such pages for each competitor domain.
//   2. We open each page: is the competitor really linked there (verified)?
//      Does it already link to chessscout.net? Is there a published contact
//      email on that site (same rules as club outreach: only what the site
//      itself prints)?
// Pages can also be pasted in from an Ahrefs / Semrush export.
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { logger } from "./logger";
import { askClaude, claudeAvailable } from "./claude";
import { trackAiUsage, AI_FEATURES } from "./aiUsageTracker";
import { fetchText, findContactEmail, parseJsonLoose } from "./clubOutreach";

function rowsOf<T>(r: unknown): T[] { return Array.isArray(r) ? (r as T[]) : ((r as { rows?: T[] })?.rows ?? []); }

export const DEFAULT_COMPETITORS = ["aimchess.com", "decodechess.com", "chessvision.ai", "chessable.com", "noctie.ai"];
const SKIP_HOST = /(^|\.)(chess\.com|lichess\.org|chessscout\.net|reddit\.com|facebook\.com|x\.com|twitter\.com|youtube\.com|youtu\.be|instagram\.com|tiktok\.com|linkedin\.com|pinterest\.com|wikipedia\.org|apps\.apple\.com|play\.google\.com|quora\.com|medium\.com\/@)$/i;

let ready: Promise<void> | null = null;
export function ensureBacklinkTables(): Promise<void> {
  return (ready ??= (async () => {
    await db.execute(sql`CREATE TABLE IF NOT EXISTS backlink_targets (
      id SERIAL PRIMARY KEY,
      url VARCHAR NOT NULL UNIQUE,
      host VARCHAR NOT NULL,
      title VARCHAR,
      kind VARCHAR,
      competitors TEXT[] NOT NULL DEFAULT '{}',
      verified BOOLEAN,
      links_us BOOLEAN NOT NULL DEFAULT false,
      email VARCHAR,
      email_source VARCHAR,
      status VARCHAR NOT NULL DEFAULT 'new',
      notes TEXT,
      draft_subject TEXT,
      draft_body TEXT,
      source VARCHAR NOT NULL DEFAULT 'search',
      found_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      checked_at TIMESTAMPTZ
    )`);
    await db.execute(sql`CREATE TABLE IF NOT EXISTS backlink_settings (id VARCHAR PRIMARY KEY, value TEXT NOT NULL)`);
  })());
}

export async function getCompetitors(): Promise<string[]> {
  await ensureBacklinkTables();
  const [r] = rowsOf<{ value: string }>(await db.execute(sql`SELECT value FROM backlink_settings WHERE id = 'competitors'`));
  try { const v = r ? JSON.parse(r.value) : null; if (Array.isArray(v) && v.length) return v.map(String); } catch { /* default */ }
  return DEFAULT_COMPETITORS;
}
export async function setCompetitors(list: string[]): Promise<string[]> {
  await ensureBacklinkTables();
  const clean = [...new Set(list.map(normDomain).filter((d): d is string => !!d))].slice(0, 15);
  await db.execute(sql`INSERT INTO backlink_settings (id, value) VALUES ('competitors', ${JSON.stringify(clean)}) ON CONFLICT (id) DO UPDATE SET value = EXCLUDED.value`);
  return clean;
}

export function normDomain(v: string): string | null {
  const t = String(v || "").trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").split(/[/?#\s]/)[0];
  return /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(t) ? t : null;
}
const hostOf = (u: string) => { try { return new URL(u).hostname.replace(/^www\./, "").toLowerCase(); } catch { return null; } };
const sameSite = (host: string, domain: string) => host === domain || host.endsWith(`.${domain}`);

/** Save (or merge) a page; returns its id, or null if it's not a usable target. */
async function upsertTarget(url: string, competitor: string, extra: { title?: string; kind?: string; source: string }): Promise<number | null> {
  const clean = url.trim().replace(/#.*$/, "");
  const host = hostOf(clean);
  if (!host || !/^https?:\/\//i.test(clean) || SKIP_HOST.test(host) || sameSite(host, competitor)) return null;
  const rows = rowsOf<{ id: number }>(await db.execute(sql`
    INSERT INTO backlink_targets (url, host, title, kind, competitors, source)
    VALUES (${clean.slice(0, 1000)}, ${host}, ${extra.title?.slice(0, 300) ?? null}, ${extra.kind?.slice(0, 40) ?? null}, ARRAY[${competitor}]::text[], ${extra.source})
    ON CONFLICT (url) DO UPDATE SET
      competitors = (SELECT ARRAY(SELECT DISTINCT unnest(backlink_targets.competitors || EXCLUDED.competitors))),
      title = COALESCE(backlink_targets.title, EXCLUDED.title), kind = COALESCE(backlink_targets.kind, EXCLUDED.kind)
    RETURNING id`));
  return rows[0]?.id ?? null;
}

/** Open the page: which competitors does it really link to, does it link to us, and who to write to. */
async function checkTarget(id: number): Promise<void> {
  const [t] = rowsOf<{ url: string; host: string; title: string | null; email: string | null }>(await db.execute(sql`SELECT url, host, title, email FROM backlink_targets WHERE id = ${id}`));
  if (!t) return;
  const html = await fetchText(t.url);
  const all = await getCompetitors();
  let verified: boolean | null = null;
  let linked: string[] = [];
  let linksUs = false;
  let title = t.title;
  if (html) {
    const hrefs = [...html.matchAll(/href\s*=\s*["']([^"']+)["']/gi)].map((m) => m[1].toLowerCase());
    linked = all.filter((d) => hrefs.some((h) => h.includes(d)));
    verified = linked.length > 0;
    linksUs = hrefs.some((h) => h.includes("chessscout.net"));
    if (!title) title = html.match(/<title[^>]*>([^<]{1,300})<\/title>/i)?.[1]?.replace(/\s+/g, " ").trim() ?? null;
  }
  let email = t.email, emailSource: string | null = null;
  if (!email) {
    try {
      const origin = new URL(t.url).origin;
      const found = await findContactEmail({ name: t.host, website: origin, contactPage: t.url });
      if (found) { email = found.email; emailSource = found.sourceUrl; }
    } catch { /* no email */ }
  }
  await db.execute(sql`
    UPDATE backlink_targets SET verified = ${verified}, links_us = ${linksUs}, title = ${title},
      competitors = (SELECT ARRAY(SELECT DISTINCT x FROM unnest(competitors || ARRAY(SELECT jsonb_array_elements_text(${JSON.stringify(linked)}::jsonb))) AS x)),
      email = COALESCE(email, ${email}), email_source = COALESCE(email_source, ${emailSource}), checked_at = now()
    WHERE id = ${id}`);
}

function discoveryPrompt(domain: string): string {
  return `Find web pages on OTHER websites that link to or recommend ${domain}, a chess improvement tool.
We want pages where a similar tool could also be listed: "best chess apps / tools / websites / training sites" articles and listicles, "${domain} alternatives" or comparison posts, reviews of ${domain}, chess resource or link pages of clubs, schools, libraries, federations and coaches, app and tool directories, blog posts, newsletters and podcasts that feature it.
Exclude ${domain} itself, chess.com, lichess.org, social networks (Reddit, Facebook, X, YouTube, Instagram, TikTok, LinkedIn, Pinterest), app stores, Quora and Wikipedia.
Return up to 15 pages as JSON: {"results":[{"url":"https://...","title":"page title","kind":"listicle|alternatives|review|resource page|directory|blog|podcast|news|other"}]}
Use web search to find them. Your final message must be only the JSON object, with no other text.`;
}

// ── Runs ─────────────────────────────────────────────────────────────────────
export interface RunState { running: boolean; step: string; found: number; checked: number; startedAt: number | null; error: string | null }
const state: RunState = { running: false, step: "", found: 0, checked: 0, startedAt: null, error: null };
export function runState(): RunState { return { ...state }; }

async function checkMany(ids: number[]): Promise<void> {
  for (const id of ids) {
    state.step = `Checking pages… ${state.checked + 1} of ${ids.length}`;
    try { await checkTarget(id); } catch (err) { logger.warn({ err, id }, "[backlinks] check failed"); }
    state.checked++;
  }
}

/** Search for each competitor's backlinks, then check every page found. Runs in the background. */
export function startBacklinkRun(competitors?: string[]): boolean {
  if (state.running) return false;
  Object.assign(state, { running: true, step: "Starting…", found: 0, checked: 0, startedAt: Date.now(), error: null });
  void (async () => {
    try {
      await ensureBacklinkTables();
      if (!claudeAvailable()) throw new Error("Set ANTHROPIC_API_KEY on the server to search with Claude");
      const list = competitors?.length ? competitors : await getCompetitors();
      const ids = new Set<number>();
      for (const domain of list) {
        state.step = `Searching for pages that link to ${domain}…`;
        try {
          const r = await askClaude(discoveryPrompt(domain), { webSearch: true, maxSearches: 6, maxTokens: 4000 });
          void trackAiUsage({ feature: AI_FEATURES.OUTREACH_DISCOVERY, model: r.model, usage: { prompt_tokens: r.inputTokens, completion_tokens: r.outputTokens, total_tokens: r.inputTokens + r.outputTokens } });
          const parsed = parseJsonLoose(r.text) as { results?: { url?: string; title?: string; kind?: string }[] } | null;
          for (const p of parsed?.results ?? []) {
            if (!p?.url) continue;
            const id = await upsertTarget(p.url, domain, { title: p.title, kind: p.kind, source: "search" });
            if (id != null && !ids.has(id)) { ids.add(id); state.found++; }
          }
        } catch (err) {
          logger.warn({ err, domain }, "[backlinks] search failed");
        }
      }
      await checkMany([...ids]);
      state.step = `Done: ${state.found} pages found and checked.`;
    } catch (err) {
      state.error = err instanceof Error ? err.message : String(err);
      state.step = "";
    } finally {
      state.running = false;
    }
  })();
  return true;
}

/** Pages pasted from an Ahrefs / Semrush export (any text with URLs in it). */
export async function importBacklinks(competitor: string, text: string): Promise<{ added: number }> {
  await ensureBacklinkTables();
  const urls = [...new Set((text.match(/https?:\/\/[^\s",;<>]+/gi) ?? []).map((u) => u.replace(/[).,]+$/, "")))].slice(0, 500);
  const ids: number[] = [];
  for (const u of urls) {
    const id = await upsertTarget(u, competitor, { source: "import" });
    if (id != null) ids.push(id);
  }
  if (ids.length && !state.running) {
    Object.assign(state, { running: true, step: "Checking imported pages…", found: ids.length, checked: 0, startedAt: Date.now(), error: null });
    void checkMany(ids).finally(() => { state.running = false; state.step = `Done: ${ids.length} imported pages checked.`; });
  }
  return { added: ids.length };
}

export async function listTargets() {
  await ensureBacklinkTables();
  return rowsOf(await db.execute(sql`
    SELECT id, url, host, title, kind, competitors, verified, links_us AS "linksUs", email, email_source AS "emailSource",
      status, notes, draft_subject AS "draftSubject", draft_body AS "draftBody", source, found_at AS "foundAt", checked_at AS "checkedAt"
    FROM backlink_targets ORDER BY found_at DESC LIMIT 1000`));
}

export async function setTargetStatus(id: number, status: string, notes?: string): Promise<void> {
  await ensureBacklinkTables();
  await db.execute(sql`UPDATE backlink_targets SET status = ${status}, notes = COALESCE(${notes ?? null}, notes) WHERE id = ${id}`);
}

/** A short, personal outreach email for this page, written by Claude. */
export async function draftOutreach(id: number, sender: string): Promise<{ subject: string; body: string }> {
  await ensureBacklinkTables();
  const [t] = rowsOf<{ url: string; host: string; title: string | null; kind: string | null; competitors: string[] }>(await db.execute(sql`SELECT url, host, title, kind, competitors FROM backlink_targets WHERE id = ${id}`));
  if (!t) throw new Error("Not found");
  if (!claudeAvailable()) throw new Error("Set ANTHROPIC_API_KEY on the server to draft with Claude");
  const prompt = `Write a short, friendly outreach email from ${sender}, the founder of ChessScout.net, to the person who runs this page:
Page: ${t.title ?? t.url}
URL: ${t.url}
Type of page: ${t.kind ?? "unknown"}
It currently links to or recommends: ${t.competitors.join(", ")}

Ask them to consider adding ChessScout.net to the page. ChessScout.net is a chess improvement app: it imports your Chess.com and Lichess games and reviews them with Stockfish plus an AI coach that explains every move in plain English, scouts any opponent's openings and weaknesses before a game, scans a photo or screenshot of any board, and has puzzles, courses, live and daily games. There's a free plan.
Rules: under 120 words; mention their page specifically and naturally; one clear ask; no flattery, hype, made-up facts or statistics; plain text; sign off with "${sender}" and "ChessScout.net".
Return only JSON: {"subject":"...","body":"..."}`;
  const r = await askClaude(prompt, { maxTokens: 800 });
  void trackAiUsage({ feature: AI_FEATURES.OUTREACH_DRAFT, model: r.model, usage: { prompt_tokens: r.inputTokens, completion_tokens: r.outputTokens, total_tokens: r.inputTokens + r.outputTokens } });
  const d = parseJsonLoose(r.text) as { subject?: string; body?: string } | null;
  if (!d?.subject || !d?.body) throw new Error("Couldn't write a draft, try again.");
  await db.execute(sql`UPDATE backlink_targets SET draft_subject = ${d.subject}, draft_body = ${d.body} WHERE id = ${id}`);
  return { subject: d.subject, body: d.body };
}
