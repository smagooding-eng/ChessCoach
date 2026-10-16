// Club outreach: finds chess organizations (clubs, school and college clubs,
// leagues, associations, tournament organizers, coaches) that publish a
// contact email on their OWN website, for the admin to contact one by one.
//
// How a run works:
//   1. Search the web (OpenAI web search) for organizations of one type in one
//      place, e.g. "scholastic chess club" in "Ohio". We only take names and
//      websites from this step, never emails.
//   2. Fetch that organization's site (home + contact/about pages) and take an
//      email only if it's printed there, preferring one on the club's own
//      domain or a role address (info@, contact@, secretary@...).
//   3. Check the domain accepts mail (MX record) and skip anything already
//      saved or on the do-not-contact list.
// Personal social profiles and member lists are never scraped.
import dns from "dns";
import OpenAI from "openai";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { logger } from "./logger";
import { trackAiUsage, AI_FEATURES } from "./aiUsageTracker";

function rowsOf<T>(r: unknown): T[] { return Array.isArray(r) ? (r as T[]) : ((r as { rows?: T[] })?.rows ?? []); }

export async function ensureClubOutreachTables(): Promise<void> {
  await db.execute(sql`CREATE TABLE IF NOT EXISTS club_contacts (
    id SERIAL PRIMARY KEY,
    email VARCHAR NOT NULL,
    org_name VARCHAR NOT NULL,
    org_type VARCHAR,
    city VARCHAR,
    region VARCHAR,
    country VARCHAR,
    website VARCHAR,
    source_url VARCHAR,
    status VARCHAR NOT NULL DEFAULT 'new',
    notes TEXT,
    run_id INTEGER,
    contacted_at TIMESTAMPTZ,
    contacted_template VARCHAR,
    found_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`);
  await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_club_contacts_email ON club_contacts (LOWER(email))`);
  await db.execute(sql`CREATE TABLE IF NOT EXISTS club_contact_dnc (
    email VARCHAR PRIMARY KEY,
    reason VARCHAR,
    added_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`);
  await db.execute(sql`CREATE TABLE IF NOT EXISTS club_outreach_runs (
    id SERIAL PRIMARY KEY,
    started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    finished_at TIMESTAMPTZ,
    searches TEXT,
    candidates INTEGER NOT NULL DEFAULT 0,
    added INTEGER NOT NULL DEFAULT 0,
    error TEXT,
    trigger VARCHAR NOT NULL DEFAULT 'manual'
  )`);
  await db.execute(sql`CREATE TABLE IF NOT EXISTS club_outreach_state (id VARCHAR PRIMARY KEY, cursor INTEGER NOT NULL DEFAULT 0)`);
  // Outreach sent through Resend (counted against the daily limit).
  await db.execute(sql`CREATE TABLE IF NOT EXISTS club_outreach_sends (
    id SERIAL PRIMARY KEY,
    contact_id INTEGER,
    email VARCHAR NOT NULL,
    template VARCHAR,
    resend_id VARCHAR,
    sent_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`);
}

// ── What to search for ──────────────────────────────────────────────────────

// Public, community chess: clubs anyone can join. Schools, colleges and
// scholastic-only programs are left out (see isSchool below).
const ORG_TYPES = [
  "public chess club open to adults and all ages",
  "community chess club that meets at a cafe, bar, library or community center",
  "chess club affiliated with US Chess, the English Chess Federation, Chess Canada or a national federation",
  "local or regional chess league for adult club teams",
  "state, county or regional chess association",
  "chess tournament organizer or director who runs open tournaments",
  "chess meetup group with its own website",
  "chess coach or private chess academy for adults and juniors",
];

const PLACES = [
  // United States (all states), then other English-speaking countries.
  "Alabama", "Alaska", "Arizona", "Arkansas", "California", "Colorado", "Connecticut", "Delaware", "Florida", "Georgia (US state)",
  "Hawaii", "Idaho", "Illinois", "Indiana", "Iowa", "Kansas", "Kentucky", "Louisiana", "Maine", "Maryland", "Massachusetts",
  "Michigan", "Minnesota", "Mississippi", "Missouri", "Montana", "Nebraska", "Nevada", "New Hampshire", "New Jersey", "New Mexico",
  "New York", "North Carolina", "North Dakota", "Ohio", "Oklahoma", "Oregon", "Pennsylvania", "Rhode Island", "South Carolina",
  "South Dakota", "Tennessee", "Texas", "Utah", "Vermont", "Virginia", "Washington State", "West Virginia", "Wisconsin", "Wyoming",
  "Washington, D.C.",
  "Ontario, Canada", "British Columbia, Canada", "Alberta, Canada", "Quebec, Canada",
  "London, UK", "Manchester, UK", "Birmingham, UK", "Scotland", "Wales", "Ireland",
  "New South Wales, Australia", "Victoria, Australia", "Queensland, Australia", "New Zealand",
];

/** Every (type, place) pair, in a fixed order the runs walk through. */
function searchAt(index: number): { type: string; place: string } {
  const total = ORG_TYPES.length * PLACES.length;
  const i = ((index % total) + total) % total;
  // Place-major so each run covers several types in a couple of places.
  return { place: PLACES[Math.floor(i / ORG_TYPES.length)], type: ORG_TYPES[i % ORG_TYPES.length] };
}

// ── Web search (names + websites only) ─────────────────────────────────────

interface Candidate { name: string; type?: string; city?: string; region?: string; country?: string; website: string; contactPage?: string }

const SEARCH_MODELS = [process.env.OUTREACH_SEARCH_MODEL, "gpt-5.6-luna", "gpt-4.1-mini"].filter(Boolean) as string[];

function parseJsonLoose(text: string): unknown {
  const cleaned = text.replace(/```json|```/g, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try { return JSON.parse(cleaned.slice(start, end + 1)); } catch { return null; }
}

async function searchOrganizations(type: string, place: string): Promise<Candidate[]> {
  if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is not set");
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const prompt = `Search the web for active ${type} organizations in ${place}.
Find up to 10 real ones that have their own official website (not a Facebook, Instagram, Reddit or Meetup page) where they publish a way to contact them.
Only public or community organizations that adults can join or play in. Do NOT include schools, school districts, school chess teams, colleges, universities, PTAs, or programs only for students.
Return ONLY JSON in this shape, using websites you actually found in search results:
{"results":[{"name":"...","type":"${type}","city":"...","region":"...","country":"...","website":"https://...","contactPage":"https://... (their contact or about page if you found it)"}]}
Do not include email addresses. Do not invent websites.`;
  let lastErr: unknown = null;
  for (const model of SEARCH_MODELS) {
    try {
      const resp = await openai.responses.create({ model, tools: [{ type: "web_search" }], input: prompt } as never) as unknown as {
        output_text?: string; usage?: { input_tokens?: number; output_tokens?: number; total_tokens?: number };
      };
      void trackAiUsage({
        feature: AI_FEATURES.OUTREACH_DISCOVERY, model,
        usage: { prompt_tokens: resp.usage?.input_tokens, completion_tokens: resp.usage?.output_tokens, total_tokens: resp.usage?.total_tokens },
      });
      const parsed = parseJsonLoose(resp.output_text ?? "") as { results?: Candidate[] } | null;
      const list = Array.isArray(parsed?.results) ? parsed!.results : [];
      return list.filter((c) => c && typeof c.website === "string" && /^https?:\/\//i.test(c.website) && typeof c.name === "string");
    } catch (err) {
      lastErr = err;
      logger.warn({ err: err instanceof Error ? err.message : err, model }, "[club-outreach] web search failed, trying next model");
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("Web search failed");
}

// Schools, colleges and student-only programs (we want public clubs).
const SCHOOL_NAME = /\b(school|schools|elementary|middle school|high school|junior high|isd|usd|district|k-?12|university|college|campus|students?|scholastic|pta|pto)\b/i;
const SCHOOL_HOST = /(\.edu(\.[a-z]{2})?$|\.k12\.|\.sch\.|\.ac\.(uk|nz|za)$|\.edu\.au$|schools?\b|isd\.|usd\d)/i;
function isSchool(c: { name: string; type?: string; website: string }, host: string): boolean {
  return SCHOOL_NAME.test(c.name) || SCHOOL_HOST.test(host) || /scholastic|school|college|university/i.test(c.type ?? '');
}

// ── Reading the organization's own site ────────────────────────────────────

const SOCIAL = /(facebook|instagram|twitter|x\.com|reddit|meetup|linkedin|tiktok|youtube|discord|lichess\.org|chess\.com)\b/i;
const BAD_LOCAL = /^(no-?reply|donotreply|do-not-reply|abuse|postmaster|privacy|legal|webmaster|hostmaster|root|admin@wix|support@squarespace|example|test|user|name|email|your|you)$/i;
const BAD_DOMAIN = /(example\.(com|org)|sentry|wixpress|squarespace|godaddy|wordpress\.com|domain\.com|email\.com|yourdomain|sentry\.io|cloudflare|googleusercontent|w3\.org|schema\.org)/i;
const ROLE_LOCAL = /^(info|contact|hello|club|chess|secretary|president|director|admin|office|events|tournaments?|td|membership|members|coach|team|general|enquiries|inquiries)/i;
const FREEMAIL = /@(gmail|yahoo|hotmail|outlook|aol|icloud|me|live|msn|protonmail|proton|comcast|verizon|att|sbcglobal|btinternet|bigpond|shaw|rogers|sympatico)\./i;

async function fetchText(url: string): Promise<string | null> {
  try {
    const r = await fetch(url, {
      headers: { "User-Agent": "ChessScoutClubFinder/1.0 (+https://chessscout.net; looking for published club contact details)", Accept: "text/html,*/*" },
      redirect: "follow",
      signal: AbortSignal.timeout(9000),
    });
    if (!r.ok) return null;
    const type = r.headers.get("content-type") || "";
    if (!/text\/html|text\/plain|application\/xhtml/i.test(type)) return null;
    const buf = await r.arrayBuffer();
    return new TextDecoder().decode(buf.slice(0, 400_000));
  } catch { return null; }
}

function extractEmails(html: string): string[] {
  const text = html
    .replace(/&#64;|&#x40;|\s*\[\s*at\s*\]\s*|\s*\(\s*at\s*\)\s*/gi, "@")
    .replace(/\s*\[\s*dot\s*\]\s*|\s*\(\s*dot\s*\)\s*/gi, ".");
  const found = new Set<string>();
  for (const m of text.matchAll(/mailto:([^"'?>\s]+)/gi)) found.add(decodeURIComponent(m[1]).trim().toLowerCase());
  for (const m of text.matchAll(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,24}/gi)) found.add(m[0].toLowerCase());
  return [...found].filter((e) => {
    const [local, domain] = e.split("@");
    if (!local || !domain) return false;
    if (BAD_LOCAL.test(local) || BAD_DOMAIN.test(domain)) return false;
    if (/\.(png|jpe?g|gif|webp|svg|css|js)$/i.test(domain)) return false;
    return e.length <= 120;
  });
}

function hostOf(url: string): string | null {
  try { return new URL(url).hostname.replace(/^www\./, "").toLowerCase(); } catch { return null; }
}

function pickEmail(emails: string[], siteHost: string): string | null {
  if (!emails.length) return null;
  const score = (e: string) => {
    const [local, domain] = e.split("@");
    let s = 0;
    if (domain === siteHost || siteHost.endsWith(`.${domain}`) || domain.endsWith(`.${siteHost}`)) s += 10;
    if (ROLE_LOCAL.test(local)) s += 5;
    if (/chess/i.test(e)) s += 3;
    if (FREEMAIL.test(e)) s -= 1;
    return s;
  };
  return [...emails].sort((a, b) => score(b) - score(a))[0];
}

const mxCache = new Map<string, boolean>();
async function acceptsMail(domain: string): Promise<boolean> {
  if (mxCache.has(domain)) return mxCache.get(domain)!;
  let ok = false;
  try { ok = (await dns.promises.resolveMx(domain)).length > 0; } catch { ok = false; }
  mxCache.set(domain, ok);
  return ok;
}

async function findContactEmail(c: Candidate): Promise<{ email: string; sourceUrl: string } | null> {
  if (SOCIAL.test(c.website)) return null;
  const host = hostOf(c.website);
  if (!host) return null;
  const base = new URL(c.website);
  const pages = [c.contactPage, c.website, `${base.origin}/contact`, `${base.origin}/contact-us`, `${base.origin}/about`]
    .filter((u): u is string => !!u && /^https?:\/\//i.test(u) && !SOCIAL.test(u));
  const seen = new Set<string>();
  for (const page of pages) {
    if (seen.has(page)) continue;
    seen.add(page);
    const html = await fetchText(page);
    if (!html) continue;
    const email = pickEmail(extractEmails(html).filter((e) => !SCHOOL_HOST.test(e.split("@")[1])), host);
    if (email && await acceptsMail(email.split("@")[1])) return { email, sourceUrl: page };
  }
  return null;
}

// ── A run ───────────────────────────────────────────────────────────────────

let running = false;
export function isDiscoveryRunning(): boolean { return running; }

/** Runs `searches` (type, place) searches from where the last run stopped. Returns the run id. */
export async function startDiscovery(opts: { searches: number; trigger: "manual" | "weekly" }): Promise<number | null> {
  if (running) return null;
  running = true;
  await ensureClubOutreachTables();
  const [run] = rowsOf<{ id: number }>(await db.execute(sql`INSERT INTO club_outreach_runs (trigger) VALUES (${opts.trigger}) RETURNING id`));
  void (async () => {
    let candidates = 0;
    let added = 0;
    const done: string[] = [];
    let error: string | null = null;
    try {
      const [st] = rowsOf<{ cursor: number }>(await db.execute(sql`SELECT cursor FROM club_outreach_state WHERE id = 'main'`));
      let cursor = Number(st?.cursor ?? 0);
      for (let n = 0; n < opts.searches; n++, cursor++) {
        const { type, place } = searchAt(cursor);
        done.push(`${type} · ${place}`);
        let list: Candidate[] = [];
        try { list = await searchOrganizations(type, place); }
        catch (err) { error = err instanceof Error ? err.message : "Web search failed"; break; }
        candidates += list.length;
        for (const c of list) {
          const host = hostOf(c.website);
          if (!host || isSchool(c, host)) continue;
          const [dup] = rowsOf<{ id: number }>(await db.execute(sql`SELECT id FROM club_contacts WHERE website ILIKE ${`%${host}%`} LIMIT 1`));
          if (dup) continue;
          const found = await findContactEmail(c);
          if (!found) continue;
          const [dnc] = rowsOf<{ email: string }>(await db.execute(sql`SELECT email FROM club_contact_dnc WHERE LOWER(email) = ${found.email}`));
          if (dnc) continue;
          const ins = rowsOf<{ id: number }>(await db.execute(sql`
            INSERT INTO club_contacts (email, org_name, org_type, city, region, country, website, source_url, run_id)
            VALUES (${found.email}, ${c.name.slice(0, 200)}, ${(c.type || type).slice(0, 120)}, ${c.city?.slice(0, 120) ?? null},
              ${c.region?.slice(0, 120) ?? null}, ${c.country?.slice(0, 120) ?? null}, ${c.website.slice(0, 500)}, ${found.sourceUrl.slice(0, 500)}, ${run.id})
            ON CONFLICT DO NOTHING RETURNING id`));
          if (ins.length) added++;
        }
        await db.execute(sql`INSERT INTO club_outreach_state (id, cursor) VALUES ('main', ${cursor + 1}) ON CONFLICT (id) DO UPDATE SET cursor = ${cursor + 1}`);
      }
    } catch (err) {
      error = err instanceof Error ? err.message : "Run failed";
      logger.error({ err }, "[club-outreach] run failed");
    } finally {
      await db.execute(sql`UPDATE club_outreach_runs SET finished_at = now(), candidates = ${candidates}, added = ${added},
        searches = ${done.join("\n")}, error = ${error} WHERE id = ${run.id}`).catch(() => {});
      running = false;
      logger.info({ runId: run.id, candidates, added, error }, "[club-outreach] run finished");
    }
  })();
  return run.id;
}

/** Weekly run (Mondays): a bigger batch than the manual button. */
export function startClubOutreachSchedule(): void {
  ensureClubOutreachTables().catch((err) => logger.warn({ err }, "[club-outreach] table setup failed"));
  setInterval(async () => {
    const d = new Date();
    if (d.getUTCDay() !== 1 || d.getUTCHours() !== 14) return;
    try {
      const [last] = rowsOf<{ started_at: string }>(await db.execute(sql`
        SELECT started_at FROM club_outreach_runs WHERE trigger = 'weekly' ORDER BY started_at DESC LIMIT 1`));
      if (last && Date.now() - new Date(last.started_at).getTime() < 6 * 86_400_000) return;
      await startDiscovery({ searches: 16, trigger: "weekly" });
    } catch (err) { logger.warn({ err }, "[club-outreach] weekly check failed"); }
  }, 15 * 60_000).unref();
}
