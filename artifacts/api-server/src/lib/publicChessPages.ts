// Public opening and trap pages (chessscout.net/chess-openings/<slug>,
// /chess-traps/<slug>). Opening pages are built from the real games behind
// the public player pages: how often top Chess.com players choose each
// opening and how they score with it. Trap pages show the app's trap
// lessons (moves and notes) to anyone, without the training board.

import { db, chessTrapsTable } from "@workspace/db";
import { eq, asc } from "drizzle-orm";
import { sql } from "drizzle-orm";
import type { PlayerData } from "./publicPlayers";

export const slugify = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/['’]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);

// Short, factual notes for the openings people search for most. Openings
// not listed here still get a page (from the game data) without a note.
const OPENING_NOTES: Record<string, { moves: string; note: string }> = {
  "Sicilian Defense": { moves: "1.e4 c5", note: "Black answers 1.e4 with a flank pawn instead of meeting it in the center, which leads to sharp, unbalanced positions where both sides play for a win. It is the most popular reply to 1.e4 at top level." },
  "French Defense": { moves: "1.e4 e6", note: "Black prepares ...d5 to challenge the center at once, accepting a slightly cramped position and a light-squared bishop that can be hard to activate, in return for a very solid pawn chain." },
  "Caro Kann Defense": { moves: "1.e4 c6", note: "Black prepares ...d5 while keeping the light-squared bishop free to develop, giving a solid structure that is hard to break down. A favorite of players who want safety against 1.e4." },
  "Pirc Defense": { moves: "1.e4 d6 2.d4 Nf6 3.Nc3 g6", note: "Black lets White build a broad center and plans to attack it later with pieces and pawn breaks, with the bishop on g7." },
  "Modern Defense": { moves: "1.e4 g6", note: "Black fianchettoes the king's bishop first and keeps the pawn structure flexible, often transposing to the Pirc." },
  "Alekhine Defense": { moves: "1.e4 Nf6", note: "Black's knight invites White's pawns forward, aiming to show later that the advanced pawns are targets rather than strengths." },
  "Scandinavian Defense": { moves: "1.e4 d5", note: "Black challenges e4 immediately. After 2.exd5 Black recaptures with the queen or the knight, getting simple development and an easy plan." },
  "Italian Game": { moves: "1.e4 e5 2.Nf3 Nc6 3.Bc4", note: "White develops the bishop to c4, aiming at Black's weakest square, f7. It ranges from quiet maneuvering lines to sharp gambits and is one of the first openings most players learn." },
  "Ruy Lopez": { moves: "1.e4 e5 2.Nf3 Nc6 3.Bb5", note: "Also called the Spanish Game. White puts pressure on the knight that defends e5, building long-term pressure. It has been a main line at world championship level for over a century." },
  "Scotch Game": { moves: "1.e4 e5 2.Nf3 Nc6 3.d4", note: "White opens the center straight away, leading to open positions with quick piece play." },
  "Four Knights Game": { moves: "1.e4 e5 2.Nf3 Nc6 3.Nc3 Nf6", note: "Both sides develop their knights first. Solid and symmetrical, it is a good choice for players who want sound development without much theory." },
  "Petrov Defense": { moves: "1.e4 e5 2.Nf3 Nf6", note: "Also called the Russian Game. Black counterattacks e4 instead of defending e5, a very solid choice at the highest level." },
  "Philidor Defense": { moves: "1.e4 e5 2.Nf3 d6", note: "Black defends e5 with a pawn, keeping a compact but somewhat passive position." },
  "Kings Gambit": { moves: "1.e4 e5 2.f4", note: "White offers the f-pawn to open lines and attack. One of the oldest and most romantic openings, it leads to sharp play from the first moves." },
  "Vienna Game": { moves: "1.e4 e5 2.Nc3", note: "White develops the queen's knight and keeps the option of a later f4 push, often leading to attacking positions." },
  "Bishops Opening": { moves: "1.e4 e5 2.Bc4", note: "White develops the bishop toward f7 before committing the knight, keeping options open." },
  "Queens Gambit": { moves: "1.d4 d5 2.c4", note: "White offers the c-pawn to deflect Black's d-pawn from the center. Black can accept or decline; both lead to classical, strategic positions." },
  "Queens Gambit Declined": { moves: "1.d4 d5 2.c4 e6", note: "Black keeps the d5 pawn supported with ...e6, a solid classical defense that has been played at every level for over a hundred years." },
  "Queens Gambit Accepted": { moves: "1.d4 d5 2.c4 dxc4", note: "Black takes the pawn, usually planning to give it back for free development and a quick ...c5 break." },
  "Slav Defense": { moves: "1.d4 d5 2.c4 c6", note: "Black supports d5 with the c-pawn, keeping the light-squared bishop free. Solid and popular at all levels." },
  "London System": { moves: "1.d4 with Bf4, e3, Nf3 and c3", note: "White sets up the same solid structure against almost anything, so it needs little theory. Very popular with club players and online." },
  "Kings Indian Defense": { moves: "1.d4 Nf6 2.c4 g6 3.Nc3 Bg7", note: "Black lets White take the center, then strikes back with ...e5 or ...c5, often leading to opposite-side attacks." },
  "Nimzo Indian Defense": { moves: "1.d4 Nf6 2.c4 e6 3.Nc3 Bb4", note: "Black pins the c3 knight to fight for e4, often giving up the bishop pair to damage White's pawn structure. One of Black's most respected defenses." },
  "Queens Indian Defense": { moves: "1.d4 Nf6 2.c4 e6 3.Nf3 b6", note: "Black fianchettoes the queen's bishop to control e4, a flexible and solid choice." },
  "Grunfeld Defense": { moves: "1.d4 Nf6 2.c4 g6 3.Nc3 d5", note: "Black lets White build a big pawn center, then attacks it with pieces and the ...c5 break." },
  "Dutch Defense": { moves: "1.d4 f5", note: "Black fights for e4 with the f-pawn, leading to unbalanced positions with chances on the kingside." },
  "Benoni Defense": { moves: "1.d4 Nf6 2.c4 c5", note: "Black challenges White's center from the side, accepting a structural weakness for active piece play." },
  "English Opening": { moves: "1.c4", note: "White controls d5 from the flank. It is flexible and often transposes into 1.d4 openings or reversed Sicilian positions." },
  "Reti Opening": { moves: "1.Nf3", note: "White develops a knight first and decides on the pawn structure later, keeping many transpositions available." },
  "Bird Opening": { moves: "1.f4", note: "White grabs control of e5 with the f-pawn, often leading to a Dutch Defense structure with an extra tempo." },
  "Kings Indian Attack": { moves: "1.Nf3, g3, Bg2, O-O, d3 and e4", note: "White uses a set-up rather than a fixed move order, similar to the King's Indian Defense with colors reversed." },
  "Catalan Opening": { moves: "1.d4 Nf6 2.c4 e6 3.g3", note: "White combines the Queen's Gambit with a kingside fianchetto, putting long-term pressure on Black's queenside." },
  "Owen Defense": { moves: "1.e4 b6", note: "Black fianchettoes the queen's bishop straight away to pressure e4." },
  "Nimzowitsch Defense": { moves: "1.e4 Nc6", note: "Black develops the queen's knight first, an unusual but playable way to avoid main-line theory." },
};

function noteFor(name: string): { moves: string; note: string } | null {
  const key = name.replace(/['’]/g, "").replace(/\bDefence\b/, "Defense").trim();
  return OPENING_NOTES[key] ?? null;
}

interface Tally { games: number; wins: number; draws: number; losses: number }
export interface OpeningSummary { slug: string; name: string; games: number; players: number; asWhite: Tally; asBlack: Tally; moves: string | null }
export interface OpeningDetail extends OpeningSummary {
  note: string | null;
  topPlayers: { slug: string; name: string; title: string | null; color: "white" | "black"; games: number; score: number }[];
}

const blank = (): Tally => ({ games: 0, wins: 0, draws: 0, losses: 0 });
const add = (t: Tally, r: Tally) => { t.games += r.games; t.wins += r.wins; t.draws += r.draws; t.losses += r.losses; };
export const scoreOf = (t: Tally) => (t.games ? Math.round(((t.wins + t.draws * 0.5) / t.games) * 100) : 0);

let cache: { at: number; list: OpeningDetail[] } | null = null;

async function buildOpenings(): Promise<OpeningDetail[]> {
  if (cache && Date.now() - cache.at < 30 * 60 * 1000) return cache.list;
  const r = await db.execute(sql`SELECT slug, data FROM public_players WHERE data IS NOT NULL`);
  const rows = ((r as unknown as { rows?: unknown[] }).rows ?? []) as { slug: string; data: PlayerData }[];
  const map = new Map<string, OpeningDetail>();
  for (const { slug, data } of rows) {
    const who = data.name || data.username;
    for (const [color, list] of [["white", data.asWhite?.openings ?? []], ["black", data.asBlack?.openings ?? []]] as const) {
      for (const o of list) {
        if (!o?.name) continue;
        const s = slugify(o.name);
        if (!s) continue;
        let d = map.get(s);
        if (!d) { d = { slug: s, name: o.name, games: 0, players: 0, asWhite: blank(), asBlack: blank(), moves: noteFor(o.name)?.moves ?? null, note: noteFor(o.name)?.note ?? null, topPlayers: [] }; map.set(s, d); }
        add(color === "white" ? d.asWhite : d.asBlack, o);
        d.games += o.games;
        d.topPlayers.push({ slug, name: who, title: data.title, color, games: o.games, score: scoreOf(o) });
      }
    }
  }
  const list = [...map.values()].map((d) => {
    d.players = new Set(d.topPlayers.map((p) => p.slug)).size;
    d.topPlayers = d.topPlayers.sort((a, b) => b.games - a.games).slice(0, 15);
    return d;
  })
    // Enough real games behind it to say something.
    .filter((d) => d.players >= 3 && d.games >= 60)
    .sort((a, b) => b.games - a.games);
  cache = { at: Date.now(), list };
  return list;
}

export async function listOpenings(): Promise<OpeningSummary[]> {
  return (await buildOpenings()).map(({ note: _n, topPlayers: _t, ...s }) => s);
}
export async function getOpening(slug: string): Promise<OpeningDetail | null> {
  return (await buildOpenings()).find((o) => o.slug === slug) ?? null;
}

// ── Traps ────────────────────────────────────────────────────────────────
export interface PublicTrap {
  slug: string; name: string; category: string; difficulty: string; trapSide: string; summary: string;
  explanation?: string; startingFen?: string; moves?: string[]; moveNotes?: string[]; criticalMoveIndex?: number; safeMoves?: string[];
}

export async function listTraps(): Promise<PublicTrap[]> {
  const rows = await db.select().from(chessTrapsTable).where(eq(chessTrapsTable.archived, false)).orderBy(asc(chessTrapsTable.orderIndex));
  return rows.map((t) => ({ slug: slugify(t.name), name: t.name, category: t.category, difficulty: t.difficulty, trapSide: t.trapSide, summary: t.summary }));
}

export async function getTrap(slug: string): Promise<(PublicTrap & { id: number }) | null> {
  const rows = await db.select().from(chessTrapsTable).where(eq(chessTrapsTable.archived, false)).orderBy(asc(chessTrapsTable.orderIndex));
  const t = rows.find((x) => slugify(x.name) === slug);
  if (!t) return null;
  return {
    id: t.id, slug, name: t.name, category: t.category, difficulty: t.difficulty, trapSide: t.trapSide, summary: t.summary,
    explanation: t.explanation, startingFen: t.startingFen, moves: t.trapLineSan ?? [], moveNotes: t.moveNotes ?? [],
    criticalMoveIndex: t.criticalMoveIndex, safeMoves: t.safeMovesSan ?? [],
  };
}
