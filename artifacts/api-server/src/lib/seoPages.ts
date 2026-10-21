// Public, search-friendly pages (chessscout.net/play-chess-online,
// /chess-for-kids, ... and their translations at /es/..., /pt/..., etc.).
//
// The English copy below is the source of truth. A slow background job
// translates each translatable page into every site language with the same
// AI model the article engine uses, and stores the result in
// seo_translations. A page is only offered in a language (hreflang tags,
// sitemap, /xx/ address) once its translation exists, so nothing half-done
// is ever shown to search engines.
//
// Links inside the copy use "@key" for other pages here, so a translated
// page links to the same language's version of the other page.
//
// Keep every claim true: features, prices and limits must match the app.

import OpenAI from "openai";
import { createHash } from "crypto";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { logger } from "./logger";
import { pingIndexNow } from "./indexNow";
import { trackAiUsage, AI_FEATURES } from "./aiUsageTracker";

export const SITE_LANGS = ["en", "es", "pt", "fr", "de", "it", "nl", "pl", "ru", "uk", "tr", "ro", "cs", "hu", "el", "sv", "ar", "fa", "hi", "bn", "id", "vi", "th", "tl", "zh-CN", "zh-TW", "ja", "ko"] as const;
export const LANG_NAMES: Record<string, string> = {
  en: "English", es: "Spanish", pt: "Portuguese (Brazil)", fr: "French", de: "German", it: "Italian", nl: "Dutch", pl: "Polish", ru: "Russian",
  uk: "Ukrainian", tr: "Turkish", ro: "Romanian", cs: "Czech", hu: "Hungarian", el: "Greek", sv: "Swedish", ar: "Arabic", fa: "Persian (Farsi)",
  hi: "Hindi", bn: "Bengali", id: "Indonesian", vi: "Vietnamese", th: "Thai", tl: "Filipino (Tagalog)", "zh-CN": "Simplified Chinese",
  "zh-TW": "Traditional Chinese", ja: "Japanese", ko: "Korean",
};
/** URL prefix for a language: "es" -> "es", "zh-CN" -> "zh-cn". */
export const langPrefix = (lang: string) => lang.toLowerCase();
export const langFromPrefix = (p: string) => SITE_LANGS.find((l) => l.toLowerCase() === p.toLowerCase()) ?? null;

export interface SeoLink { label: string; href: string }
export interface SeoSection { h: string; p: string; links?: SeoLink[] }
export interface SeoFaq { q: string; a: string }
export interface SeoPage {
  key: string;
  path: string;            // English address
  translate: boolean;      // offered in other languages
  title: string;           // <title>, under ~65 characters
  description: string;     // meta description, under ~160 characters
  h1: string;
  intro: string;
  sections: SeoSection[];
  faq: SeoFaq[];
  cta: SeoLink;
  related: string[];       // keys of other pages to link at the bottom
  image?: string;          // og image file in /public
}

const SIGNUP = "/setup?signup=1";

export const SEO_PAGES: SeoPage[] = [
  {
    key: "home", path: "/", translate: true, image: "og-default.jpg",
    title: "ChessScout.net — Play Chess Online. Get Better.",
    description: "Play chess live or daily against real people and bots, join tournaments, and get every game reviewed, including your Chess.com and Lichess games. Free.",
    h1: "Play chess online. Get better with every game.",
    intro: "ChessScout.net is a free place to play chess and improve. Play live and daily games against real people, practice against bots rated 400 to 3000, join tournaments and solve unlimited puzzles. Your games, including the ones you play on Chess.com and Lichess, get reviewed so you can see what to fix.",
    sections: [
      { h: "Play live, daily or against bots", p: "Start a live game against a real opponent, play daily games where you have time to think between moves, or challenge a friend with a link. Ten practice bots, from 400 to 3000, give live feedback on your moves.", links: [{ label: "Play chess online", href: "@play-chess-online" }, { label: "Chess tournaments", href: "@chess-tournaments" }] },
      { h: "Get your games reviewed", p: "Every game you play here can be reviewed with Stockfish for free. Link your Chess.com or Lichess account and those games come in too, so all your chess is in one place.", links: [{ label: "Analyze your chess games", href: "@chess-game-analysis" }] },
      { h: "Scout your next opponent", p: "Type any Chess.com or Lichess username to see their record, the openings they play as White and Black, and your head-to-head results before you sit down to play.", links: [{ label: "Scout a chess opponent", href: "@scout-chess-opponent" }, { label: "What top players play", href: "/players" }] },
      { h: "Chess for kids and complete beginners", p: "Chess for Kids teaches children one piece at a time through nine colorful worlds, and the Beginner Path takes adults from the rules to their first real games. ChessScout.net is Teacher Approved on Google Play.", links: [{ label: "Chess for kids", href: "@chess-for-kids" }, { label: "Learn chess", href: "@learn-chess" }] },
      { h: "Train with puzzles, openings and traps", p: "Solve unlimited puzzles, drill your openings with the Opening Trainer, and practice classic opening traps from both sides of the board.", links: [{ label: "Chess puzzles", href: "@chess-puzzles" }, { label: "Chess openings", href: "/chess-openings" }, { label: "Chess traps", href: "/chess-traps" }] },
      { h: "In your language, on any device", p: "ChessScout.net works in any web browser and as an Android app on Google Play, in 28 languages." },
    ],
    faq: [
      { q: "Is ChessScout.net free?", a: "Yes. Playing live and daily games, tournaments, practice bots, unlimited puzzles, game review with Stockfish, opponent scouting, Chess for Kids and the Beginner Path are all free. Pro costs $5 a month and adds the AI coach, AI scouting reports, personalized courses and Scan Position." },
      { q: "Does it work with Chess.com and Lichess?", a: "Yes. Link your Chess.com or Lichess username and your games from there are imported and reviewed alongside the games you play on ChessScout.net." },
      { q: "Is there an app?", a: "Yes. ChessScout.net is on Google Play for Android, and it works in any browser on iPhone, iPad and computers." },
    ],
    cta: { label: "Start playing free", href: SIGNUP },
    related: ["play-chess-online", "chess-for-kids", "chess-game-analysis", "chess-puzzles"],
  },
  {
    key: "play-chess-online", path: "/play-chess-online", translate: true, image: "og-challenge-v2.jpg",
    title: "Play Chess Online Free — Live, Daily & vs Bots | ChessScout.net",
    description: "Play chess online for free: live games against real people, daily games, tournaments, challenges with friends and practice bots from 400 to 3000.",
    h1: "Play chess online, free",
    intro: "Play a live game against a real opponent, a daily game you can move in whenever you have a minute, or a practice bot at exactly your level. Everything on this page is free, with no card needed.",
    sections: [
      { h: "Live games against real people", p: "Pick a time control and get paired with another player. Play ranked games to build your rating or casual games just for fun." },
      { h: "Daily games", p: "Daily games give you time to think between moves, so you can play on your phone around school, work or family. You get a notification when it's your move." },
      { h: "Challenge a friend", p: "Create a challenge and send the link to anyone. They can open it on any phone or computer and play you straight away." },
      { h: "Practice bots from 400 to 3000", p: "Ten bots, from a gentle 400 to a 3000 that plays like a top engine. Each move you make gets live feedback, so you learn while you play." },
      { h: "Tournaments", p: "Join arena and knockout tournaments, or create your own for your club, class or friends and share the link.", links: [{ label: "Chess tournaments", href: "@chess-tournaments" }] },
      { h: "Review every game", p: "After the game, open the review to see your best moves, your mistakes and what you should have played instead.", links: [{ label: "Game analysis", href: "@chess-game-analysis" }] },
    ],
    faq: [
      { q: "Is it really free to play chess here?", a: "Yes. Live games, daily games, challenges, tournaments and practice bots are all free." },
      { q: "Can I play on my phone?", a: "Yes. Play in any mobile browser, or install the Android app from Google Play." },
      { q: "Can I play against a friend?", a: "Yes. Create a challenge, send the link, and the game starts when your friend opens it." },
    ],
    cta: { label: "Play now, free", href: SIGNUP },
    related: ["chess-tournaments", "chess-puzzles", "chess-game-analysis", "learn-chess"],
  },
  {
    key: "chess-for-kids", path: "/chess-for-kids", translate: true, image: "og-default.jpg",
    title: "Chess for Kids — Fun, Free Lessons & Games | ChessScout.net",
    description: "Chess for Kids teaches children chess one piece at a time through nine colorful worlds with friendly characters. Free, and Teacher Approved on Google Play.",
    h1: "Chess for kids, one piece at a time",
    intro: "Chess for Kids turns learning chess into a journey through nine colorful worlds. Each world teaches one idea, with a friendly character as a guide, short levels and plenty of stars to collect. It's free, and ChessScout.net is Teacher Approved on Google Play.",
    sections: [
      { h: "Nine worlds to explore", p: "Pawn Village, Knight Forest, Bishop Hills, Rook Castle, Queen Palace and King Garden teach how each piece moves. Capture Cove, Check Mountain and Checkmate Castle then teach how to win pieces, give check and finish the game." },
      { h: "Short levels, real progress", p: "Every level is a small puzzle on a real board. Children learn by moving the pieces themselves, not by reading rules." },
      { h: "From first moves to first games", p: "Once the worlds are done, kids can play practice bots starting at 400, solve puzzles, and play games against family and friends with a challenge link.", links: [{ label: "Play chess online", href: "@play-chess-online" }, { label: "Chess puzzles", href: "@chess-puzzles" }] },
      { h: "For parents and teachers", p: "It works in any browser and as an Android app on Google Play, in 28 languages. Teachers and clubs can run their own tournaments for a class or group.", links: [{ label: "Chess tournaments", href: "@chess-tournaments" }] },
    ],
    faq: [
      { q: "What age is Chess for Kids for?", a: "It's designed for young beginners who are just learning how the pieces move. Older children who know the rules can go straight to puzzles, bots and games." },
      { q: "Is Chess for Kids free?", a: "Yes. Chess for Kids is free, and children can start playing without an account." },
      { q: "Is ChessScout.net Teacher Approved?", a: "Yes, ChessScout.net is Teacher Approved on Google Play." },
    ],
    cta: { label: "Start Chess for Kids free", href: "/kids" },
    related: ["learn-chess", "chess-puzzles", "play-chess-online", "chess-tournaments"],
  },
  {
    key: "learn-chess", path: "/learn-chess", translate: true, image: "og-learn.jpg",
    title: "Learn Chess Free — From the Rules to Your First Win | ChessScout.net",
    description: "Learn chess from scratch with the free Beginner Path: interactive lessons, then practice bots from 400, puzzles, opening traps and real games.",
    h1: "Learn chess from scratch, free",
    intro: "The Beginner Path takes you from how the pieces move to playing real games with confidence. Every lesson is interactive: you learn each idea by playing it on the board.",
    sections: [
      { h: "The Beginner Path", p: "Short units cover how the pieces move, checkmate, simple tactics and how to start a game well. Each lesson ends with exercises on a real board." },
      { h: "Practice against a bot at your level", p: "Start against the 400 bot and move up as you win. Every move gets live feedback, so you see your mistakes the moment you make them.", links: [{ label: "Play chess online", href: "@play-chess-online" }] },
      { h: "Puzzles for every level", p: "Puzzles train the patterns that win games: forks, pins, skewers and checkmates. You can solve as many as you like.", links: [{ label: "Chess puzzles", href: "@chess-puzzles" }] },
      { h: "Don't fall for the classic traps", p: "Learn the opening traps beginners fall into most, and practice both setting them and avoiding them.", links: [{ label: "Chess opening traps", href: "/chess-traps" }] },
      { h: "Teaching a child?", p: "Chess for Kids teaches the same ideas through nine colorful worlds made for young beginners.", links: [{ label: "Chess for kids", href: "@chess-for-kids" }] },
    ],
    faq: [
      { q: "Can I learn chess as a complete beginner?", a: "Yes. The Beginner Path starts with how each piece moves and assumes no experience." },
      { q: "Is the Beginner Path free?", a: "Yes. The Beginner Path is free and you can start it without an account. Practice bots and puzzles are free too." },
      { q: "How do I practice what I learn?", a: "Play the practice bots starting at 400, solve puzzles, and when you're ready, play real people in live or daily games." },
    ],
    cta: { label: "Start learning free", href: "/beginner" },
    related: ["chess-for-kids", "chess-puzzles", "play-chess-online", "chess-game-analysis"],
  },
  {
    key: "chess-puzzles", path: "/chess-puzzles", translate: true, image: "og-puzzle-v2.jpg",
    title: "Free Chess Puzzles — Unlimited, Every Level | ChessScout.net",
    description: "Solve unlimited free chess puzzles: mates in 1, 2 and 3, forks, pins, skewers and endgames. Track your puzzle rating as you improve.",
    h1: "Unlimited chess puzzles, free",
    intro: "Puzzles are the fastest way to get better at spotting tactics in your own games. Solve as many as you like, pick the themes you want to work on, and watch your puzzle rating climb.",
    sections: [
      { h: "Pick a theme", p: "Work on mate in 1, mate in 2, mate in 3, forks, pins, skewers or endgames, or mix them all together." },
      { h: "A puzzle rating that follows you", p: "Every puzzle you solve updates your puzzle rating, so you always get puzzles that are hard enough to teach you something." },
      { h: "Understand the answer", p: "When a puzzle beats you, step through the solution move by move. Pro members also get a plain-language explanation of why it works." },
      { h: "Then use it in a game", p: "Tactics stick when you use them. Play a practice bot or a real opponent and look for the patterns you've just trained.", links: [{ label: "Play chess online", href: "@play-chess-online" }] },
    ],
    faq: [
      { q: "Are the puzzles really unlimited?", a: "Yes. Puzzles are unlimited on the free plan." },
      { q: "What level are the puzzles?", a: "From beginner to advanced. Your puzzle rating decides how hard the next one is." },
      { q: "Can kids use the puzzles?", a: "Yes. Young beginners can also start with Chess for Kids, which teaches the ideas puzzles are built on." },
    ],
    cta: { label: "Solve puzzles free", href: SIGNUP },
    related: ["learn-chess", "play-chess-online", "chess-for-kids", "chess-game-analysis"],
  },
  {
    key: "chess-tournaments", path: "/chess-tournaments", translate: true, image: "og-tournaments.jpg",
    title: "Free Online Chess Tournaments — Join or Host | ChessScout.net",
    description: "Join free online chess tournaments or create your own for a club, school or group of friends. Arena and knockout formats, live or daily.",
    h1: "Online chess tournaments: join one or run your own",
    intro: "Play in arena and knockout tournaments, live or daily, ranked or casual. Running a club, a class or a group chat? Create a tournament in a minute and share the link.",
    sections: [
      { h: "Arena and knockout formats", p: "Arena tournaments let you play as many games as you can in the time, scoring points for each result. Knockout tournaments pair players in a bracket until one is left." },
      { h: "Live or daily", p: "Live tournaments are played in one sitting. Daily tournaments run over days, so players in different time zones and busy schedules can take part." },
      { h: "Host your own", p: "Creating a tournament is free. Pick the format and time control, then share the link with your club, class or friends." },
      { h: "Review your tournament games", p: "Every tournament game can be reviewed afterwards, so each event teaches you something.", links: [{ label: "Game analysis", href: "@chess-game-analysis" }] },
    ],
    faq: [
      { q: "Are the tournaments free?", a: "Yes. Joining and creating tournaments is free. Some special tournaments are for Pro members." },
      { q: "Can a school or club run a private tournament?", a: "Yes. Create a tournament and share the link only with your group." },
      { q: "Can I play tournament games on my phone?", a: "Yes, in any mobile browser or the Android app." },
    ],
    cta: { label: "See tournaments", href: "/tournaments" },
    related: ["play-chess-online", "chess-for-kids", "chess-game-analysis", "scout-chess-opponent"],
  },
  {
    key: "chess-game-analysis", path: "/chess-game-analysis", translate: true, image: "og-default.jpg",
    title: "Free Chess Game Analysis for Chess.com & Lichess | ChessScout.net",
    description: "Import your Chess.com and Lichess games and review them with Stockfish for free. See your mistakes, the better moves, and the weaknesses you keep repeating.",
    h1: "Analyze your chess games, including Chess.com and Lichess",
    intro: "Link your Chess.com or Lichess username and your games come in automatically. Review any game with Stockfish for free, and see the weaknesses that show up in your reviewed games.",
    sections: [
      { h: "Your games from anywhere", p: "Games you play on ChessScout.net, Chess.com and Lichess sit side by side, so you can review all of your chess in one place. Importing is free and unlimited." },
      { h: "Stockfish review, free", p: "Step through any game and see where you went wrong, how much each mistake cost, and the move you should have played." },
      { h: "Weaknesses from your games", p: "As you review games, ChessScout.net shows the kinds of mistakes you make most, such as missed tactics, opening trouble or endgame slips." },
      { h: "Go deeper with Pro", p: "Pro ($5 a month) adds an AI coach that explains each game in plain language, finds the patterns across all your games, and builds personalized courses from your own mistakes. Scan Position turns a photo of a board into a position you can analyze." },
    ],
    faq: [
      { q: "Can I analyze my Chess.com games for free?", a: "Yes. Importing your Chess.com games and reviewing them with Stockfish is free and unlimited." },
      { q: "Does it work with Lichess?", a: "Yes. Link your Lichess username the same way." },
      { q: "How is this different from Chess.com game review?", a: "Chess.com reviews one game at a time. ChessScout.net also looks across your games to show the mistakes you keep repeating." },
    ],
    cta: { label: "Analyze my games free", href: SIGNUP },
    related: ["scout-chess-opponent", "play-chess-online", "chess-puzzles", "learn-chess"],
  },
  {
    key: "scout-chess-opponent", path: "/scout-chess-opponent", translate: true, image: "og-players.jpg",
    title: "Scout Any Chess Opponent — Chess.com & Lichess | ChessScout.net",
    description: "Look up any Chess.com or Lichess player: their record, the openings they play as White and Black, and your head-to-head results. Free and unlimited.",
    h1: "Scout your opponent before you play",
    intro: "Type any Chess.com or Lichess username to see how they play: their results, their favorite openings with each color, and your games against them. Scouting is free and unlimited.",
    sections: [
      { h: "Their openings, with both colors", p: "See what they open with as White and how they answer 1.e4 and 1.d4 as Black, with their results in each line, so you can prepare something they don't like." },
      { h: "Record and form", p: "Their recent results and ratings in each time control show you who you're up against." },
      { h: "Head-to-head", p: "If you've played them before, your previous games are listed so you can see what worked." },
      { h: "AI scouting reports with Pro", p: "Pro adds a written report on your opponent's weaknesses and a plan to prepare against them." },
      { h: "See what the top players play", p: "Browse the repertoires of top Chess.com players and streamers, built from their real games.", links: [{ label: "Top players' openings", href: "/players" }] },
    ],
    faq: [
      { q: "Is opponent scouting free?", a: "Yes. Opponent stats, openings and head-to-head are free and unlimited." },
      { q: "Which sites can I scout players from?", a: "Chess.com and Lichess." },
      { q: "Do I need the player's permission?", a: "No. Scouting uses games that are already public on Chess.com and Lichess." },
    ],
    cta: { label: "Scout a player free", href: SIGNUP },
    related: ["chess-game-analysis", "chess-tournaments", "play-chess-online", "chess-puzzles"],
  },
  // English-only pages (their own app pages already exist).
  {
    key: "pricing", path: "/pricing", translate: false, image: "og-pricing.jpg",
    title: "Pricing — ChessScout.net",
    description: "ChessScout.net pricing: a free plan and a $5/month Pro plan. See exactly what's included in each.",
    h1: "Simple pricing",
    intro: "Free forever, or $5 a month for everything. No trial to track, no credits to count. Cancel anytime.",
    sections: [
      { h: "Free", p: "Unlimited game import and Stockfish review, unlimited opponent scouts (stats), unlimited puzzles, weaknesses from your reviewed games, unlimited practice bots and Opening Trainer, unlimited Local Play, live and daily games, creating tournaments, the Beginner Path and Chess for Kids." },
      { h: "Pro: $5 a month", p: "Everything in Free, plus the AI coach on every game you review, personalized courses from your mistakes, AI scouting reports, full AI weakness analysis across your games, Scan Position from a photo, AI puzzle explanations and natural-voice lessons, free entry to every Pro tournament, and hosting Pro tournaments that earn $1 per new Pro signup." },
    ],
    faq: [
      { q: "Can I cancel anytime?", a: "Yes, from your account settings, with no phone call and no retention flow." },
      { q: "Is there a free trial?", a: "There's no trial to track: the free plan is free forever, and Pro is $5 a month when you want it." },
    ],
    cta: { label: "Get started free", href: SIGNUP },
    related: ["chess-game-analysis", "play-chess-online", "scout-chess-opponent"],
  },
];

export const VS_PAGES: { path: string; title: string; description: string; competitor: string; intro: string; rows: { feature: string; us: string; them: string }[]; note: string }[] = [
  {
    path: "/vs/aimchess", competitor: "Aimchess", title: "ChessScout.net vs Aimchess — Honest Comparison",
    description: "How ChessScout.net compares to Aimchess on price, features, and opponent scouting.",
    intro: "Aimchess is a well-established chess analytics tool that diagnoses weaknesses across six dimensions (opening accuracy, time management, resourcefulness, endgame conversion, advantage capitalization, and blunder prevention) and builds training around them. Here's how it compares to ChessScout.net, honestly.",
    rows: [
      { feature: "Price", us: "$5/mo, cancel anytime", them: "~$8–14/mo (varies by billing)" },
      { feature: "Free tier", us: "Yes", them: "Limited free reports" },
      { feature: "Imports Chess.com & Lichess", us: "Yes", them: "Yes" },
      { feature: "Opponent scouting", us: "Yes", them: "Yes" },
      { feature: "Puzzles from your own games", us: "Yes", them: "Yes" },
      { feature: "Scan a board photo mid-game", us: "Yes", them: "No" },
      { feature: "Practice bots", us: "Yes", them: "No" },
    ],
    note: "Aimchess has been around longer and has a deep, well-regarded training system across more dimensions than ChessScout.net currently covers. Where ChessScout.net is different: it's priced lower, has a genuinely free tier (not just a limited trial report), and includes Scan Position and Practice Bots, which Aimchess doesn't offer. If you want the deepest, most established weakness-diagnosis system and don't mind paying more for it, Aimchess is a real option worth considering.",
  },
  {
    path: "/vs/improve-my-chess", competitor: "Improve My Chess", title: "ChessScout.net vs Improve My Chess — Honest Comparison",
    description: "How ChessScout.net compares to Improve My Chess on price, features, and opponent scouting.",
    intro: "Improve My Chess uses Stockfish plus an AI (Claude) to explain your blunders in plain English, and offers opponent scouting and personalized drills through a credit-based system — every feature spends from the same credit pool. Here's how it compares to ChessScout.net, honestly.",
    rows: [
      { feature: "Price", us: "$5/mo, cancel anytime", them: "£4.99/mo or £39/yr, credit-based" },
      { feature: "Free tier", us: "Unlimited puzzles + limits elsewhere", them: "\"Try the core experience\" tier" },
      { feature: "Plain-English blunder explanations", us: "Yes", them: "Yes" },
      { feature: "Opponent scouting", us: "Yes", them: "Yes" },
      { feature: "Personalized drills from your mistakes", us: "Yes", them: "Yes" },
      { feature: "Scan a board photo mid-game", us: "Yes", them: "No" },
      { feature: "Practice bots", us: "Yes", them: "No" },
      { feature: "Fixed monthly price (no credit tracking)", us: "Yes", them: "No" },
    ],
    note: "Improve My Chess is a genuinely similar product with a similar philosophy — using AI to explain mistakes in plain language rather than raw engine output. The biggest practical difference is pricing structure: ChessScout.net has one flat monthly price with generous free-tier limits, while Improve My Chess uses a shared credit pool where every analysis and scout draws down the same balance. If you'd rather pay a flat rate and not think about credits, that's where ChessScout.net differs most.",
  },
  {
    path: "/vs/free-chess-analysis", competitor: "Free Chess.com/Lichess Analysis", title: "ChessScout.net vs Free Chess.com Analysis — Honest Comparison",
    description: "How ChessScout.net compares to free game review on Chess.com and Lichess.",
    intro: "Chess.com's Game Review and Lichess's built-in analysis are both genuinely good, and free. So why pay for anything? Here's the honest answer.",
    rows: [
      { feature: "Reviews a single game", us: "Yes", them: "Yes" },
      { feature: "Finds patterns across ALL your games", us: "Yes", them: "No" },
      { feature: "Opponent scouting before you play", us: "Yes", them: "No" },
      { feature: "Puzzles built from your own blunders", us: "Yes", them: "No" },
      { feature: "Scan a board photo mid-game", us: "Yes", them: "No" },
      { feature: "Cost", us: "Free tier, $5/mo for full access", them: "Free (Lichess) / free with daily limit (Chess.com)" },
    ],
    note: "If you only ever play one important game and want it reviewed, Chess.com or Lichess's free tools genuinely do that well — there's no need to pay for a single-game review. ChessScout.net exists for a different question: not 'what happened in this game' but 'what do I keep doing wrong across all my games.' That's the gap free single-game review doesn't fill.",
  },
];

export const pageByKey = (key: string) => SEO_PAGES.find((p) => p.key === key) ?? null;
export const TRANSLATABLE = SEO_PAGES.filter((p) => p.translate);

/** Address of a page in a language ("/es/chess-for-kids", "/es"). */
export function localizedPath(page: Pick<SeoPage, "path">, lang: string): string {
  if (lang === "en") return page.path;
  return `/${langPrefix(lang)}${page.path === "/" ? "" : page.path}`;
}

type Translatable = Pick<SeoPage, "title" | "description" | "h1" | "intro" | "sections" | "faq" | "cta">;
const textOf = (p: SeoPage): Translatable => ({ title: p.title, description: p.description, h1: p.h1, intro: p.intro, sections: p.sections, faq: p.faq, cta: p.cta });
export const hashOf = (p: SeoPage) => createHash("sha1").update(JSON.stringify(textOf(p))).digest("hex").slice(0, 16);

export async function ensureSeoTranslationsTable() {
  await db.execute(sql`CREATE TABLE IF NOT EXISTS seo_translations (
    page_key VARCHAR NOT NULL,
    lang VARCHAR NOT NULL,
    source_hash VARCHAR NOT NULL,
    content JSONB NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (page_key, lang)
  )`);
}

const rowsOf = <T>(r: unknown): T[] => (Array.isArray(r) ? (r as T[]) : ((r as { rows?: T[] })?.rows ?? []));

/** Languages each page is available in (English always; others once translated from the current English). */
export async function availableLangs(): Promise<Record<string, string[]>> {
  const out: Record<string, string[]> = {};
  for (const p of SEO_PAGES) out[p.key] = ["en"];
  try {
    const r = rowsOf<{ page_key: string; lang: string; source_hash: string }>(await db.execute(sql`SELECT page_key, lang, source_hash FROM seo_translations`));
    for (const row of r) {
      const p = pageByKey(row.page_key);
      if (p?.translate && row.source_hash === hashOf(p) && SITE_LANGS.includes(row.lang as never)) out[p.key].push(row.lang);
    }
  } catch (err) { logger.warn({ err }, "[seo-pages] langs lookup failed"); }
  for (const k of Object.keys(out)) out[k].sort((a, b) => SITE_LANGS.indexOf(a as never) - SITE_LANGS.indexOf(b as never));
  return out;
}

export interface ResolvedSeoPage extends Translatable {
  key: string; lang: string; path: string; image?: string;
  alternates: { lang: string; path: string }[];
  related: { label: string; href: string }[];
  fallback: boolean;
}

/** A page in a language, with "@key" links turned into that language's addresses. */
export async function getSeoPage(key: string, lang: string): Promise<ResolvedSeoPage | null> {
  const page = pageByKey(key);
  if (!page) return null;
  const langs = (await availableLangs())[key] ?? ["en"];
  let text: Translatable = textOf(page);
  let useLang = "en";
  if (lang !== "en" && page.translate && langs.includes(lang)) {
    try {
      const r = rowsOf<{ content: Translatable }>(await db.execute(sql`SELECT content FROM seo_translations WHERE page_key = ${key} AND lang = ${lang}`));
      if (r[0]?.content) { text = r[0].content; useLang = lang; }
    } catch { /* English */ }
  }
  const all = await availableLangs();
  const href = (h: string) => {
    if (!h.startsWith("@")) return h;
    const target = pageByKey(h.slice(1));
    if (!target) return "/";
    return localizedPath(target, (all[target.key] ?? ["en"]).includes(useLang) ? useLang : "en");
  };
  const fix = (l: SeoLink): SeoLink => ({ label: l.label, href: href(l.href) });
  const relatedTitles = await Promise.all(page.related.map(async (k) => {
    const t = pageByKey(k);
    if (!t) return null;
    let label = t.h1;
    if (useLang !== "en" && (all[k] ?? []).includes(useLang)) {
      try {
        const r = rowsOf<{ content: Translatable }>(await db.execute(sql`SELECT content FROM seo_translations WHERE page_key = ${k} AND lang = ${useLang}`));
        if (r[0]?.content?.h1) label = r[0].content.h1;
      } catch { /* keep English */ }
    }
    return { label, href: href(`@${k}`) };
  }));
  return {
    key, lang: useLang, path: localizedPath(page, useLang), image: page.image,
    title: text.title, description: text.description, h1: text.h1, intro: text.intro,
    sections: text.sections.map((s) => ({ ...s, links: s.links?.map(fix) })),
    faq: text.faq, cta: fix(text.cta),
    alternates: langs.map((l) => ({ lang: l, path: localizedPath(page, l) })),
    related: relatedTitles.filter(Boolean) as { label: string; href: string }[],
    fallback: lang !== useLang,
  };
}

// ── Translation job ───────────────────────────────────────────────────────
function sameShape(a: Translatable, b: Translatable): boolean {
  if (!b || typeof b.title !== "string" || typeof b.description !== "string" || typeof b.h1 !== "string" || typeof b.intro !== "string") return false;
  if (!Array.isArray(b.sections) || b.sections.length !== a.sections.length) return false;
  if (!Array.isArray(b.faq) || b.faq.length !== a.faq.length) return false;
  for (let i = 0; i < a.sections.length; i++) {
    const s = b.sections[i];
    if (typeof s?.h !== "string" || typeof s?.p !== "string") return false;
    if ((a.sections[i].links?.length ?? 0) !== (s.links?.length ?? 0)) return false;
  }
  return b.faq.every((f) => typeof f?.q === "string" && typeof f?.a === "string") && typeof b.cta?.label === "string";
}

async function translatePage(page: SeoPage, lang: string): Promise<Translatable | null> {
  const src = textOf(page);
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const prompt = `Translate this web page for ChessScout.net from English into ${LANG_NAMES[lang]}. It will be published as the ${LANG_NAMES[lang]} version of the page and read by chess players and parents searching in ${LANG_NAMES[lang]}.

Rules:
- Natural, fluent ${LANG_NAMES[lang]} a native speaker would write, using the chess terms players in that language actually use (for example the usual local names for checkmate, fork, pin, opening, tournament).
- Keep these exactly as they are: ChessScout.net, Chess.com, Lichess, Stockfish, Google Play, Android, Pro, numbers, prices ($5), and chess notation like 1.e4.
- "title" stays under 65 characters and "description" under 160 characters. Put the main search phrase a ${LANG_NAMES[lang]} speaker would type (for example "play chess online" or "chess for kids") naturally near the start of the title.
- Do not add or remove claims, features, numbers or sentences. Translate meaning, not word for word.
- Keep the JSON structure exactly the same: same keys, same number of sections, faq items and links. Translate only text values; never change any "href".

Return only the translated JSON.

${JSON.stringify(src)}`;
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-5.6-luna",
      max_completion_tokens: 4000,
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
    });
    void trackAiUsage({ userId: undefined, feature: AI_FEATURES.SEO_ARTICLE, model: "gpt-5.6-luna", usage: response.usage });
    const out = JSON.parse(response.choices[0]?.message?.content ?? "{}") as Translatable;
    if (!sameShape(src, out)) return null;
    // Links: keep our hrefs whatever came back.
    out.sections = out.sections.map((s, i) => ({ h: s.h, p: s.p, ...(src.sections[i].links ? { links: src.sections[i].links!.map((l, j) => ({ label: s.links?.[j]?.label || l.label, href: l.href })) } : {}) }));
    out.cta = { label: out.cta.label, href: src.cta.href };
    return out;
  } catch (err) {
    logger.warn({ err, key: page.key, lang }, "[seo-pages] translation failed");
    return null;
  }
}

let translating = false;
/** Translates up to `limit` missing or out-of-date (page, language) pairs. */
export async function translateMissing(limit: number): Promise<number> {
  if (translating || !process.env.OPENAI_API_KEY) return 0;
  translating = true;
  let done = 0;
  const published: string[] = [];
  try {
    const have = new Map<string, string>();
    for (const r of rowsOf<{ page_key: string; lang: string; source_hash: string }>(await db.execute(sql`SELECT page_key, lang, source_hash FROM seo_translations`))) have.set(`${r.page_key}|${r.lang}`, r.source_hash);
    // Home page first in every language, then the rest.
    const todo: [SeoPage, string][] = [];
    for (const page of TRANSLATABLE) for (const lang of SITE_LANGS) {
      if (lang === "en") continue;
      if (have.get(`${page.key}|${lang}`) !== hashOf(page)) todo.push([page, lang]);
    }
    for (const [page, lang] of todo.slice(0, limit)) {
      const t = await translatePage(page, lang);
      if (t) {
        await db.execute(sql`INSERT INTO seo_translations (page_key, lang, source_hash, content, updated_at)
          VALUES (${page.key}, ${lang}, ${hashOf(page)}, ${JSON.stringify(t)}::jsonb, now())
          ON CONFLICT (page_key, lang) DO UPDATE SET source_hash = EXCLUDED.source_hash, content = EXCLUDED.content, updated_at = now()`);
        published.push(localizedPath(page, lang));
        done++;
      }
    }
  } catch (err) {
    logger.warn({ err }, "[seo-pages] translation pass failed");
  } finally {
    translating = false;
    if (published.length) pingIndexNow(published);
  }
  return done;
}

/** First pass two minutes after boot, then a few pages every 20 minutes. */
export function startSeoTranslator() {
  setTimeout(() => { void translateMissing(8); }, 120_000);
  setInterval(() => { void translateMissing(6); }, 20 * 60 * 1000);
}
