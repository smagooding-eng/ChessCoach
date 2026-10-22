// The free review's move explanations, written without AI: chess.js looks at
// the position before and after each move (what was left hanging, forks,
// checks, mates, captures, development) and the engine supplies the better
// move and the reply. Short, plain sentences in a neutral voice ("the knight
// on e5"), since the same text is read by both players. Pro reviews use the
// AI coach instead; this is also its fallback.

import { Chess, type Square } from "chess.js";

const VAL: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 100 };
const NAME: Record<string, string> = { p: "pawn", n: "knight", b: "bishop", r: "rook", q: "queen", k: "king" };
type Color = "w" | "b";
const other = (c: Color): Color => (c === "w" ? "b" : "w");

export interface BasicCoachInput {
  fenBefore: string;
  fenAfter: string;
  san: string;
  classification: string;
  playerColor: "white" | "black";
  moveIndex: number;
  /** Engine evals, White's point of view (mate encoded as ±(10000 - n)). */
  cpBefore: number;
  cpAfter: number;
  /** Engine's best move in the position before (SAN). */
  bestMoveSan: string | null;
  /** Engine's best reply for the other side after the move (SAN). */
  replySan: string | null;
  inBook: boolean;
}

function load(fen: string): Chess | null { try { return new Chess(fen); } catch { return null; } }

/** Pieces of `color` that the other side can win: attacked and undefended, or attacked by something cheaper. */
function hanging(c: Chess, color: Color): { sq: Square; type: string }[] {
  const out: { sq: Square; type: string; v: number }[] = [];
  for (const row of c.board()) for (const p of row) {
    if (!p || p.color !== color || p.type === "k") continue;
    const attackers = c.attackers(p.square, other(color));
    if (!attackers.length) continue;
    const defenders = c.attackers(p.square, color);
    const cheapest = Math.min(...attackers.map((s) => VAL[c.get(s)?.type ?? "q"]));
    if (!defenders.length || cheapest < VAL[p.type]) out.push({ sq: p.square, type: p.type, v: VAL[p.type] });
  }
  return out.sort((a, b) => b.v - a.v);
}

/** Enemy pieces a piece on `from` attacks that are worth going after (king, bigger pieces, or undefended ones). */
function targets(c: Chess, from: Square): { sq: Square; type: string }[] {
  const me = c.get(from);
  if (!me) return [];
  const res: { sq: Square; type: string; v: number }[] = [];
  for (const row of c.board()) for (const p of row) {
    if (!p || p.color === me.color) continue;
    if (!c.attackers(p.square, me.color).includes(from)) continue;
    const defended = c.attackers(p.square, p.color).length > 0;
    if (p.type === "k" || VAL[p.type] > VAL[me.type] || !defended) res.push({ sq: p.square, type: p.type, v: VAL[p.type] });
  }
  return res.sort((a, b) => b.v - a.v);
}

function apply(fen: string, san: string | null) {
  if (!san) return null;
  const c = load(fen);
  if (!c) return null;
  try { const m = c.move(san); return m ? { c, m } : null; } catch { return null; }
}

const mateIn = (cp: number) => Math.max(1, 10000 - Math.abs(cp));
const list = (names: string[]) => names.length <= 1 ? names.join("") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;

function openingLine(m: { piece: string; to: string; san: string; flags: string }, moveIndex: number): string {
  if (m.flags.includes("k") || m.flags.includes("q")) return "Castles, getting the king safe and connecting the rooks.";
  if (m.piece === "p" && ["d4", "e4", "d5", "e5", "c4", "c5"].includes(m.to)) return "A classic opening move that claims space in the center.";
  if (m.piece === "n" || m.piece === "b") return `Develops the ${NAME[m.piece]} toward the center.`;
  if (m.piece === "p") return moveIndex < 4 ? "A known opening move." : "A standard pawn move in this opening.";
  return "A standard move in this opening.";
}

export function basicExplanation(i: BasicCoachInput): string {
  const me: Color = i.playerColor === "white" ? "w" : "b";
  const pov = (cp: number) => (me === "w" ? cp : -cp);
  const played = apply(i.fenBefore, i.san);
  if (!played) return "";
  const { m } = played;
  const after = played.c;
  const before = load(i.fenBefore);
  const bad = ["inaccuracy", "mistake", "blunder", "missed_win"].includes(i.classification);

  if (after.isCheckmate()) return "Checkmate. The game is over.";
  if (i.inBook || i.classification === "book") return openingLine(m, i.moveIndex);

  const parts: string[] = [];
  const reply = apply(i.fenAfter, i.replySan);
  const best = apply(i.fenBefore, i.bestMoveSan);

  if (bad) {
    // 1. Walks into mate.
    if (pov(i.cpAfter) <= -9000) {
      const n = mateIn(i.cpAfter);
      parts.push(`This allows checkmate${n > 1 ? ` in ${n}` : ""}${i.replySan ? `, starting with ${i.replySan}` : ""}.`);
    }
    // 2. Had a mate and missed it.
    else if (pov(i.cpBefore) >= 9000 && i.bestMoveSan) {
      const n = mateIn(i.cpBefore);
      parts.push(`There was a forced checkmate${n > 1 ? ` in ${n}` : ""}, starting with ${i.bestMoveSan}.`);
    }
    else {
      // 3. Leaves something hanging (and the engine takes it).
      const hung = hanging(after, me).filter((h) => VAL[h.type] >= 3);
      const takes = reply?.m.captured ? reply.m.to : null;
      const lost = hung.find((h) => h.sq === takes) ?? hung[0];
      // 4. The reply is a fork.
      const forked = reply && !reply.m.captured ? targets(reply.c, reply.m.to as Square).filter((t) => t.type !== "p") : [];
      // 5. Missed a free piece.
      const bestWins = best?.m.captured && before ? hanging(before, other(me)).find((h) => h.sq === best.m.to) : null;
      // 6. A piece was already under attack and still is.
      const stillHung = before ? hanging(before, me).filter((h) => VAL[h.type] >= 3 && h.sq !== m.from).find((h) => hung.some((x) => x.sq === h.sq)) : null;

      if (lost && (lost.sq === takes || !reply)) {
        parts.push(lost.sq === m.to
          ? `The ${NAME[lost.type]} on ${lost.sq} can simply be taken${i.replySan && takes === lost.sq ? ` with ${i.replySan}` : ""}.`
          : `This leaves the ${NAME[lost.type]} on ${lost.sq} unprotected${i.replySan && takes === lost.sq ? `, and ${i.replySan} wins it` : ""}.`);
      } else if (forked.length >= 2 && i.replySan) {
        parts.push(`It allows ${i.replySan}, forking the ${list(forked.slice(0, 2).map((t) => NAME[t.type]))}.`);
      } else if (stillHung) {
        parts.push(`The ${NAME[stillHung.type]} on ${stillHung.sq} was under attack and still is.`);
      } else if (bestWins && i.bestMoveSan) {
        parts.push(`${i.bestMoveSan} would have won the ${NAME[bestWins.type]} on ${bestWins.sq}.`);
      } else if (pov(i.cpBefore) >= 150 && pov(i.cpAfter) < 80) {
        parts.push("This lets most of the advantage slip away.");
      } else if (pov(i.cpBefore) > -80 && pov(i.cpAfter) <= -150) {
        parts.push("This hands the opponent the better position.");
      } else if (i.classification === "inaccuracy") {
        parts.push("A small slip, not a disaster.");
      } else {
        parts.push("This makes the position noticeably worse.");
      }
    }
    if (i.bestMoveSan && !parts.join(" ").includes(i.bestMoveSan)) {
      const why = best?.c.isCheckmate() ? " (checkmate)" : best?.m.captured ? `, taking the ${NAME[best.m.captured]}` : best?.c.isCheck() ? ", with check" : "";
      parts.push(`${i.bestMoveSan} was stronger${why}.`);
    }
    return parts.slice(0, 2).join(" ");
  }

  // Good, best, great, brilliant, excellent.
  if (pov(i.cpAfter) >= 9000) {
    const n = mateIn(i.cpAfter);
    parts.push(n <= 1 ? "Sets up checkmate next move." : `Sets up a forced checkmate in ${n}.`);
  }
  const forks = targets(after, m.to as Square).filter((t) => t.type !== "p");
  const savedBefore = before ? hanging(before, me).filter((h) => VAL[h.type] >= 3) : [];
  const saved = savedBefore.find((h) => h.sq === m.from) ?? savedBefore.find((h) => !hanging(after, me).some((x) => x.sq === h.sq));

  if (i.classification === "brilliant" && m.captured == null && VAL[m.piece] >= 3) parts.push(`A brilliant sacrifice: the ${NAME[m.piece]} is offered for a strong attack.`);
  else if (i.classification === "brilliant") parts.push("A brilliant move that is hard to find.");
  const forkText = forks.length >= 2 ? list(forks.slice(0, 2).map((t) => NAME[t.type])) : null;
  if (m.captured) {
    const wonFree = before ? hanging(before, other(me)).some((h) => h.sq === m.to) : false;
    const head = wonFree ? `Wins the ${NAME[m.captured]} on ${m.to}` : VAL[m.captured] === VAL[m.piece] ? `Trades ${NAME[m.piece]} for ${NAME[m.captured]}` : `Takes the ${NAME[m.captured]} on ${m.to}`;
    parts.push(forkText ? `${head}, forking the ${forkText}!` : `${head}.`);
  } else if (forkText) {
    parts.push(`Forks the ${forkText}!`);
  }
  if (saved && !m.captured) parts.push(saved.sq === m.from ? `Moves the ${NAME[saved.type]} out of danger.` : `Protects the ${NAME[saved.type]} on ${saved.sq}.`);
  if (m.promotion) parts.push(`Promotes to a ${NAME[m.promotion]}.`);
  if (m.flags.includes("k") || m.flags.includes("q")) parts.push("Castles, getting the king safe and connecting the rooks.");
  if (after.isCheck() && !parts.some((p) => p.includes("checkmate") || p.includes("king"))) parts.push("Check!");
  if (!parts.length && i.moveIndex < 30 && (m.piece === "n" || m.piece === "b") && (m.from[1] === "1" || m.from[1] === "8")) parts.push(`Develops the ${NAME[m.piece]}.`);
  if (!parts.length && m.piece === "p" && ["d4", "e4", "d5", "e5"].includes(m.to)) parts.push("Claims space in the center.");

  if (!parts.length) {
    parts.push(i.classification === "great" ? "A great find: the one move that keeps everything under control."
      : i.classification === "best" ? "The engine's top choice."
      : i.classification === "excellent" ? "Very close to the engine's top choice."
      : i.bestMoveSan ? `A reasonable move; ${i.bestMoveSan} was slightly more precise.` : "A reasonable move.");
  } else if (i.classification === "great" && parts.length < 2) {
    parts.unshift("A great find.");
  }
  return parts.slice(0, 2).join(" ");
}

/**
 * Saved engine-only reviews: rewrite each move's explanation with the free
 * coach when the review is read, so games reviewed before it existed get the
 * same plain-language text. AI-coached reviews are returned untouched.
 */
export function refreshBasicReview(moves: unknown, aiCoach: boolean): unknown {
  if (aiCoach || !Array.isArray(moves)) return moves;
  type M = { fen?: string; san?: string; color?: "white" | "black"; classification?: string; evalAfterCp?: number; betterMove?: string | null; explanation?: string; pros?: string[]; cons?: string[]; moveIndex?: number };
  const list = moves as M[];
  const GOOD = new Set(["best", "brilliant", "great", "excellent", "checkmate"]);
  const clean = (s?: string | null) => (s ? s.split(/\s+[—–-]\s+/)[0].trim() : null);
  return list.map((m, i) => {
    try {
      if (!m || !m.fen || !m.san || typeof m.evalAfterCp !== "number" || !m.color || !m.classification) return m;
      const c = new Chess(m.fen);
      const r = c.move(m.san);
      if (!r) return m;
      const prev = list[i - 1];
      const next = list[i + 1];
      const replySan = next ? (next.classification && GOOD.has(next.classification) ? next.san ?? null : clean(next.betterMove)) : null;
      const text = basicExplanation({
        fenBefore: m.fen, fenAfter: c.fen(), san: m.san, classification: m.classification, playerColor: m.color,
        moveIndex: typeof m.moveIndex === "number" ? m.moveIndex : i,
        cpBefore: i === 0 ? 20 : typeof prev?.evalAfterCp === "number" ? prev.evalAfterCp : m.evalAfterCp,
        cpAfter: m.evalAfterCp, bestMoveSan: clean(m.betterMove), replySan, inBook: m.classification === "book",
      });
      return text ? { ...m, explanation: text, pros: [], cons: [] } : m;
    } catch { return m; }
  });
}
