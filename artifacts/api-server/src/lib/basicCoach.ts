// The free review's move explanations, written without AI. chess.js looks at
// the position before and after each move and spots what happened: pieces
// left hanging, forks, pins, skewers, discovered attacks, threats, mates,
// king safety, opening principles, passed pawns and endgame play. The engine
// supplies the better move and the reply it expects, and we explain those
// too. Short, plain sentences in a neutral voice ("the knight on e5"), since
// both players read the same review. Pro reviews use the AI coach; this is
// also its fallback.

import { isBookPosition } from "./openingBook";
import { Chess, type Square } from "chess.js";

const VAL: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 100 };
const NAME: Record<string, string> = { p: "pawn", n: "knight", b: "bishop", r: "rook", q: "queen", k: "king" };
type Color = "w" | "b";
const other = (c: Color): Color => (c === "w" ? "b" : "w");
const SIDE: Record<Color, string> = { w: "White", b: "Black" };

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
  /** The previous move's classification (the opponent's move), to spot punishing it or missing the chance. */
  prevClassification?: string | null;
  /** The previous move (SAN), to tell a recapture from winning material. */
  prevSan?: string | null;
  /** Engine's best line from the position before the move (starts with bestMoveSan). */
  bestLine?: string[] | null;
  /** Engine's best line from the position after the move (the opponent's best reply and what follows). */
  replyLine?: string[] | null;
  /** The game's opening, for book moves. */
  openingName?: string | null;
}

// ── Engine lines: play them out and say what they lead to ────────────────
/** "13...Nxe5 14.dxe5 Qxd5" from a position and a list of moves. */
export function fmtLine(fen: string, line: string[], max = 4): string {
  const parts = fen.split(" ");
  let n = parseInt(parts[5] || "1", 10) || 1;
  let white = parts[1] !== "b";
  const out: string[] = [];
  line.slice(0, max).forEach((san, k) => {
    if (white) out.push(`${n}.${san}`);
    else out.push(k === 0 ? `${n}...${san}` : san);
    if (!white) n++;
    white = !white;
  });
  return out.join(" ");
}

interface LineOutcome { plies: number; got: string[]; lost: string[]; mateBy: Color | null; promoted: boolean; end: Chess | null; show: number }
/** Plays the line out and records what each side captured (from `me`'s point of view). */
function lineOutcome(fen: string, line: string[] | null | undefined, me: Color): LineOutcome {
  const res: LineOutcome = { plies: 0, got: [], lost: [], mateBy: null, promoted: false, end: null, show: 0 };
  const c = load(fen);
  if (!c || !line?.length) return res;
  const caps: { color: string; piece: string; to: string }[] = [];
  for (const san of line.slice(0, 6)) {
    let m;
    try { m = c.move(san); } catch { break; }
    if (!m) break;
    res.plies++;
    caps.push({ color: m.color, piece: m.captured ?? "", to: m.to });
    if (m.promotion) res.promoted = true;
    if (c.isCheckmate()) { res.mateBy = m.color as Color; break; }
  }
  // A capture on the line's last move may just be the start of a trade the
  // line doesn't show, so it doesn't count toward the result.
  // (A recapture on the square just taken on is the end of a trade, so it stays.)
  const tail = caps[caps.length - 1], prevPly = caps[caps.length - 2];
  if (!res.mateBy && caps.length >= 3 && tail.piece && !(prevPly?.piece && prevPly.to === tail.to)) caps.pop();
  let last = -1;
  caps.forEach((x, k) => { if (x.piece) { (x.color === me ? res.got : res.lost).push(x.piece); last = k; } });
  res.show = Math.min(res.plies, Math.max(3, last + 1));
  res.end = c;
  return res;
}
/** Net material from a line, in words ("a knight", "the exchange", "a piece for a pawn"), or null if even. */
function netWords(got: string[], lost: string[]): { text: string; value: number } | null {
  const g = got.map((x) => (x === "b" ? "n" : x)).sort();
  const l = lost.map((x) => (x === "b" ? "n" : x)).sort();
  for (let k = g.length - 1; k >= 0; k--) { const j = l.indexOf(g[k]); if (j >= 0) { l.splice(j, 1); g.splice(k, 1); } }
  const value = g.reduce((s2, x) => s2 + VAL[x], 0) - l.reduce((s2, x) => s2 + VAL[x], 0);
  if (Math.abs(value) < 1) return null;
  const word = (arr: string[]) => {
    const counts: Record<string, number> = {};
    for (const x of arr) counts[x] = (counts[x] ?? 0) + 1;
    const order = ["q", "r", "n", "p"];
    const nm: Record<string, [string, string]> = { q: ["the queen", "two queens"], r: ["a rook", "two rooks"], n: ["a piece", "two pieces"], p: ["a pawn", "two pawns"] };
    return order.filter((x) => counts[x]).map((x) => counts[x] === 1 ? nm[x][0] : counts[x] === 2 ? nm[x][1] : `${counts[x]} ${x === "p" ? "pawns" : "pieces"}`).join(" and ");
  };
  const gw = word(g), lw = word(l);
  if (gw === "a rook" && lw === "a piece") return { text: "the exchange", value };
  if (lw === "a rook" && gw === "a piece") return { text: "the exchange", value };
  if (value > 0) return { text: lw ? `${gw} for ${lw}` : gw, value };
  return { text: gw ? `${lw} for ${gw}` : lw, value };
}

// ── Bigger-picture checks ────────────────────────────────────────────────
const kingOf = (c: Chess, color: Color) => pieces(c).find((p) => p.type === "k" && p.color === color)!;
/** Squares next to the king that the other side attacks. */
function kingPressure(c: Chess, color: Color): number {
  const k = kingOf(c, color);
  if (!k) return 0;
  const f0 = FILES.indexOf(k.square[0]), r0 = parseInt(k.square[1]) - 1;
  let n = 0;
  for (let df = -1; df <= 1; df++) for (let dr = -1; dr <= 1; dr++) {
    const f = f0 + df, r = r0 + dr;
    if (f < 0 || f > 7 || r < 0 || r > 7) continue;
    n += c.attackers(sq(f, r), other(color)).length;
  }
  return n;
}
/** A piece of `color` that's attacked and has nowhere safe to go. */
function trapped(c: Chess, color: Color): { sq: Square; type: string } | null {
  const f = c.turn() === color ? c : flipTurn(c);
  if (!f) return null;
  for (const p of pieces(f)) {
    if (p.color !== color || p.type === "k" || p.type === "p" || VAL[p.type] < 3 || rel(p.square, color) < 5) continue;
    if (!f.attackers(p.square, other(color)).length) continue;
    const escapes = f.moves({ verbose: true }).filter((x) => x.from === p.square);
    const safe = escapes.some((x) => { const t = load(f.fen()); if (!t) return false; t.move(x.san); return !hanging(t, color).some((h) => h.sq === x.to) || !!x.captured; });
    if (!safe && hanging(f, color).some((h) => h.sq === p.square)) return { sq: p.square, type: p.type };
  }
  return null;
}
const developedMinors = (c: Chess, color: Color) => pieces(c).filter((p) => p.color === color && (p.type === "n" || p.type === "b") && rel(p.square, color) !== 1).length;
const kingCastledOrSafe = (c: Chess, color: Color) => { const k = kingOf(c, color); return !!k && (["g", "h", "b", "c", "a"].includes(k.square[0])); };


// ── Board helpers ─────────────────────────────────────────────────────────
function load(fen: string): Chess | null { try { return new Chess(fen); } catch { return null; } }
function apply(fen: string, san: string | null) {
  if (!san) return null;
  const c = load(fen);
  if (!c) return null;
  try { const m = c.move(san); return m ? { c, m } : null; } catch { return null; }
}
/** The same position with the other side to move (for "what does this threaten?"). */
function flipTurn(c: Chess): Chess | null {
  const f = c.fen().split(" ");
  f[1] = f[1] === "w" ? "b" : "w";
  f[3] = "-";
  return load(f.join(" "));
}
const pieces = (c: Chess) => c.board().flat().filter((p): p is NonNullable<typeof p> => !!p);
const material = (c: Chess, color: Color) => pieces(c).filter((p) => p.color === color && p.type !== "k").reduce((s, p) => s + VAL[p.type], 0);
const nonPawnMaterial = (c: Chess) => pieces(c).filter((p) => p.type !== "k" && p.type !== "p").reduce((s, p) => s + VAL[p.type], 0);

/** Pieces of `color` the other side can win: attacked and undefended, or attacked by something cheaper. */
function hanging(c: Chess, color: Color): { sq: Square; type: string }[] {
  const out: { sq: Square; type: string; v: number }[] = [];
  for (const p of pieces(c)) {
    if (p.color !== color || p.type === "k") continue;
    const attackers = c.attackers(p.square, other(color));
    if (!attackers.length) continue;
    const defenders = c.attackers(p.square, color);
    const cheapest = Math.min(...attackers.map((s) => VAL[c.get(s)?.type ?? "q"]));
    if (!defenders.length || cheapest < VAL[p.type]) out.push({ sq: p.square, type: p.type, v: VAL[p.type] });
  }
  return out.sort((a, b) => b.v - a.v);
}

/** Enemy pieces that the piece on `from` attacks and that matter (king, bigger, or undefended). */
function targets(c: Chess, from: Square): { sq: Square; type: string }[] {
  const me = c.get(from);
  if (!me) return [];
  const res: { sq: Square; type: string; v: number }[] = [];
  for (const p of pieces(c)) {
    if (p.color === me.color) continue;
    if (!c.attackers(p.square, me.color).includes(from)) continue;
    const defended = c.attackers(p.square, p.color).length > 0;
    if (p.type === "k" || VAL[p.type] > VAL[me.type] || !defended) res.push({ sq: p.square, type: p.type, v: VAL[p.type] });
  }
  return res.sort((a, b) => b.v - a.v);
}

const FILES = "abcdefgh";
const sq = (f: number, r: number) => `${FILES[f]}${r + 1}` as Square;
const DIRS: Record<string, [number, number][]> = {
  b: [[1, 1], [1, -1], [-1, 1], [-1, -1]],
  r: [[1, 0], [-1, 0], [0, 1], [0, -1]],
  q: [[1, 1], [1, -1], [-1, 1], [-1, -1], [1, 0], [-1, 0], [0, 1], [0, -1]],
};

/** Pins and skewers by the slider on `from`: the first enemy piece in a line, and what's behind it. */
function lines(c: Chess, from: Square): { kind: "pin" | "skewer"; front: { sq: Square; type: string }; back: { sq: Square; type: string } }[] {
  const me = c.get(from);
  if (!me || !DIRS[me.type]) return [];
  const out: { kind: "pin" | "skewer"; front: { sq: Square; type: string }; back: { sq: Square; type: string } }[] = [];
  const f0 = FILES.indexOf(from[0]), r0 = parseInt(from[1]) - 1;
  for (const [df, dr] of DIRS[me.type]) {
    let f = f0 + df, r = r0 + dr;
    let front: { sq: Square; type: string; color: string } | null = null;
    while (f >= 0 && f < 8 && r >= 0 && r < 8) {
      const p = c.get(sq(f, r));
      if (p) {
        if (!front) { if (p.color === me.color) break; front = { sq: sq(f, r), type: p.type, color: p.color }; }
        else {
          if (p.color === me.color) break;
          if (p.type === "k" || VAL[p.type] > VAL[front.type]) out.push({ kind: "pin", front, back: { sq: sq(f, r), type: p.type } });
          else if ((front.type === "k" || VAL[front.type] > VAL[p.type]) && VAL[p.type] >= 3) out.push({ kind: "skewer", front, back: { sq: sq(f, r), type: p.type } });
          break;
        }
      }
      f += df; r += dr;
    }
  }
  return out.filter((l) => l.front.type !== "p" && (VAL[l.front.type] > VAL[me.type] || l.front.type === "k" || l.back.type === "k" || !c.attackers(l.front.sq, other(me.color as Color)).length));
}

/** Moves the side to move in `c` could make next that mate, or win material. */
function threats(c: Chess): { mate: string | null; wins: { san: string; type: string; sq: Square } | null } {
  let mate: string | null = null;
  let wins: { san: string; type: string; sq: Square } | null = null;
  const mover = c.turn();
  const loose = hanging(c, other(mover));
  for (const m of c.moves({ verbose: true })) {
    if (m.san.includes("#")) { mate = m.san; break; }
  }
  if (loose.length && VAL[loose[0].type] >= 3) {
    const cap = c.moves({ verbose: true }).find((m) => m.to === loose[0].sq);
    if (cap) wins = { san: cap.san, type: loose[0].type, sq: loose[0].sq };
  }
  return { mate, wins };
}

const mateIn = (cp: number) => Math.max(1, 10000 - Math.abs(cp));
const list = (names: string[]) => names.length <= 1 ? names.join("") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
/** Pick one wording, the same one every time for the same move. */
function pick(seed: string, options: string[]): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return options[Math.abs(h) % options.length];
}

/** What a move does that's worth saying (used for the played move and for the better one). */
function motifs(fenBefore: string, san: string, me: Color, prevSan?: string | null): { lead: string | null; tags: string[] } {
  const r = apply(fenBefore, san);
  const before = load(fenBefore);
  if (!r || !before) return { lead: null, tags: [] };
  const { c, m } = r;
  const tags: string[] = [];
  if (c.isCheckmate()) return { lead: "checkmate", tags: ["mate"] };
  // A piece that can just be taken back isn't really forking or pinning anything.
  const safe = !hanging(c, me).some((h) => h.sq === m.to);
  const t = safe ? targets(c, m.to as Square).filter((x) => x.type !== "p") : [];
  if (t.length >= 2) tags.push(`forking the ${list(t.slice(0, 2).map((x) => NAME[x.type]))}`);
  for (const l of safe ? lines(c, m.to as Square) : []) {
    tags.push(l.kind === "pin" ? `pinning the ${NAME[l.front.type]} to the ${NAME[l.back.type]}` : `skewering the ${NAME[l.front.type]} and the ${NAME[l.back.type]}`);
  }
  // Discovered: a piece behind the one that moved now gives check or hits something.
  if (c.isCheck() && !c.attackers(c.board().flat().find((p) => p?.type === "k" && p.color !== me)!.square, me).includes(m.to as Square)) tags.push("with a discovered check");
  if (m.captured) {
    // Recapture: the opponent just took something on this square.
    const prevTo = prevSan && prevSan.includes("x") ? (prevSan.replace(/[+#=QRBN]*$/, "").match(/([a-h][1-8])$/)?.[1] ?? null) : null;
    const recapture = prevTo === m.to;
    const free = !recapture && hanging(before, other(me)).some((h) => h.sq === m.to);
    tags.unshift(recapture ? `recapturing the ${NAME[m.captured]}` : free ? `winning the ${NAME[m.captured]}` : `taking the ${NAME[m.captured]}`);
  }
  if (c.isCheck() && !tags.some((x) => x.includes("check"))) tags.push("with check");
  const myLoose = hanging(before, me).filter((h) => VAL[h.type] >= 3);
  if (!m.captured && myLoose.length && !hanging(c, me).some((h) => h.sq === myLoose[0].sq)) tags.push(myLoose[0].sq === m.from ? `getting the ${NAME[myLoose[0].type]} to safety` : `protecting the ${NAME[myLoose[0].type]} on ${myLoose[0].sq}`);
  return { lead: tags[0] ?? null, tags };
}

// ── Positional ideas for quiet moves ─────────────────────────────────────
const rel = (sqr: string, color: Color) => (color === "w" ? parseInt(sqr[1]) : 9 - parseInt(sqr[1]));
const pawnsOn = (c: Chess, color: Color, fileIdx: number) => pieces(c).filter((p) => p.color === color && p.type === "p" && FILES.indexOf(p.square[0]) === fileIdx);
function isPassed(c: Chess, square: string, color: Color): boolean {
  const f = FILES.indexOf(square[0]);
  return !pieces(c).some((p) => p.color !== color && p.type === "p" && Math.abs(FILES.indexOf(p.square[0]) - f) <= 1 && rel(p.square, color) > rel(square, color));
}
function canCastle(c: Chess, color: Color): boolean {
  const f = c.turn() === color ? c : flipTurn(c);
  if (!f) return false;
  try { return f.moves().some((x) => x === "O-O" || x === "O-O-O"); } catch { return false; }
}
function rooksConnected(c: Chess, color: Color): boolean {
  const back = color === "w" ? 0 : 7;
  const rooks = pieces(c).filter((p) => p.color === color && p.type === "r" && parseInt(p.square[1]) - 1 === back).map((p) => FILES.indexOf(p.square[0])).sort();
  if (rooks.length < 2) return false;
  for (let f = rooks[0] + 1; f < rooks[1]; f++) if (c.get(sq(f, back))) return false;
  return true;
}

/** Plain reasons a quiet move is useful, most important first. */
function quietIdeas(before: Chess, after: Chess, m: { piece: string; from: string; to: string; captured?: string }, me: Color, opening: boolean, endgame: boolean, seed: string): string[] {
  const them = other(me);
  const out: string[] = [];
  const to = m.to as Square;
  // Attacks something (with tempo).
  const hits = targets(after, to).filter((t) => t.type !== "k");
  const outnumbered = (c: Chess, square: Square) => c.attackers(square, me).length > c.attackers(square, them).length;
  for (const p of pieces(after)) {
    if (p.color !== them || p.type === "k" || hits.some((h) => h.sq === p.square)) continue;
    if (after.attackers(p.square, me).includes(to) && after.attackers(p.square, me).length >= 2 && outnumbered(after, p.square) && !outnumbered(before, p.square)) hits.push({ sq: p.square, type: p.type });
  }
  if (hits.length === 1 && after.attackers(hits[0].sq, me).length >= 2 && outnumbered(after, hits[0].sq) && after.attackers(hits[0].sq, them).length >= 1) {
    out.push(`Piles up on the ${NAME[hits[0].type]} on ${hits[0].sq}: it's now attacked more times than it's defended.`);
  } else if (hits.length === 1) {
    const t = hits[0];
    out.push(m.piece === "p" ? `Kicks the ${NAME[t.type]} on ${t.sq} with the pawn.` : pick(seed, [`Attacks the ${NAME[t.type]} on ${t.sq}, gaining time.`, `Goes after the ${NAME[t.type]} on ${t.sq}.`]));
  } else if (hits.length >= 2) {
    out.push(pick(seed, [`Attacks ${hits[0].sq} and ${hits[1].sq} at the same time.`, `A double attack on ${hits[0].sq} and ${hits[1].sq}.`]));
  }
  // Defends a piece that was under attack.
  const defended = pieces(after).find((p) => p.color === me && p.type !== "k" && p.square !== to && after.attackers(p.square, them).length > 0
    && after.attackers(p.square, me).includes(to) && !before.attackers(p.square, me).includes(m.from as Square));
  if (defended) out.push(`Defends the ${NAME[defended.type]} on ${defended.square}.`);
  // Passed pawn.
  const myPawns = (c: Chess) => pieces(c).filter((p) => p.color === me && p.type === "p");
  const newPassed = myPawns(after).find((p) => isPassed(after, p.square, me) && !myPawns(before).some((q) => q.square === p.square && isPassed(before, q.square, me)) && p.square !== to)
    ?? (m.piece === "p" && isPassed(after, to, me) && !isPassed(before, m.from, me) ? { square: to } : null);
  if (newPassed) out.push(`Creates a passed pawn on ${newPassed.square}.`);
  else if (m.piece === "p" && !("promotion" in m && (m as { promotion?: string }).promotion) && isPassed(after, to, me) && rel(to, me) >= 5) out.push(rel(to, me) === 7 ? "The pawn is one step from promoting." : "Pushes the passed pawn closer to promotion.");
  // Castling prep and connected rooks.
  if (!canCastle(before, me) && canCastle(after, me)) out.push("Clears the way to castle.");
  if (!rooksConnected(before, me) && rooksConnected(after, me)) out.push("Connects the rooks.");
  // Files and batteries.
  if (m.piece === "r" || m.piece === "q") {
    const f = FILES.indexOf(to[0]);
    const mine = pawnsOn(after, me, f).length, theirs = pawnsOn(after, them, f).length;
    const partner = pieces(after).find((p) => p.color === me && p.square !== to && (p.type === "r" || p.type === "q") && p.square[0] === to[0]);
    if (partner && (m.piece === "r" || partner.type === "r")) out.push(`Doubles up on the ${to[0]}-file.`);
    else if (m.piece === "r" && mine === 0 && theirs === 0) out.push(`Takes the open ${to[0]}-file.`);
    else if (m.piece === "r" && mine === 0) out.push(`Puts the rook on the half-open ${to[0]}-file.`);
    else if (m.piece === "r" && rel(to, me) === 7) out.push("Puts the rook on the seventh rank.");
  }
  // Outposts, long diagonals, centralizing.
  if (m.piece === "n" && rel(to, me) >= 4 && rel(to, me) <= 6 && after.attackers(to, me).some((s) => after.get(s)?.type === "p")
    && !pieces(after).some((p) => p.color === them && p.type === "p" && Math.abs(FILES.indexOf(p.square[0]) - FILES.indexOf(to[0])) === 1 && rel(p.square, me) > rel(to, me))) {
    out.push(`Plants the knight on a strong outpost on ${to}.`);
  } else if (m.piece === "b" && ["b2", "g2", "b7", "g7"].includes(to)) out.push("Puts the bishop on the long diagonal.");
  else if ((m.piece === "n" || m.piece === "q") && ["d4", "e4", "d5", "e5"].includes(to) && !endgame) out.push(`Centralizes the ${NAME[m.piece]}.`);
  // Pawn ideas.
  if (m.piece === "p" && !opening && !endgame) {
    const kingSide = pieces(after).find((p) => p.color === me && p.type === "k");
    if (kingSide && ["h3", "h6", "g3", "g6", "a3", "a6"].includes(to) && Math.abs(FILES.indexOf(kingSide.square[0]) - FILES.indexOf(to[0])) <= 1 && rel(kingSide.square, me) === 1)
      out.push("Gives the king some breathing room against back-rank checks.");
    const enemyMinors = pieces(before).filter((p) => p.color === them && (p.type === "n" || p.type === "b"));
    const flip = flipTurn(before);
    const covered = flip ? flip.moves({ verbose: true }).filter((x) => enemyMinors.some((e) => e.square === x.from) && after.attackers(x.to as Square, me).includes(to)) : [];
    if (covered.length && ["a3", "h3", "a6", "h6"].includes(to)) out.push(`Takes the ${covered[0].to} square away from the ${NAME[covered[0].piece]}.`);
    if (rel(to, me) === 5 && ["c", "d", "e", "f"].includes(to[0])) out.push("Gains space.");
  }
  // A pawn move that frees a bishop or the queen.
  if (m.piece === "p" && out.length === 0 && !(m as { promotion?: string }).promotion) {
    const mob = (c: Chess) => {
      const f = c.turn() === me ? c : flipTurn(c);
      const per: Record<string, number> = {};
      let q = 0;
      if (!f) return { per, q };
      for (const x of f.moves({ verbose: true })) { if (x.piece === "b") per[x.from] = (per[x.from] ?? 0) + 1; if (x.piece === "q") q++; }
      return { per, q };
    };
    const a = mob(before), b = mob(after);
    const freed = Object.keys(b.per).find((k) => b.per[k] - (a.per[k] ?? 0) >= 2);
    const blocked = Object.keys(a.per).find((k) => a.per[k] - (b.per[k] ?? 0) >= 3);
    if (freed) out.push(`Opens the diagonal for the bishop on ${freed}${blocked ? `, though it shuts in the one on ${blocked}` : ""}.`);
    else if (b.q - a.q >= 2) out.push("Opens a path for the queen.");
  }
  if (endgame && m.piece === "r") {
    const passers = pieces(after).filter((p) => p.type === "p" && p.square[0] === to[0] && isPassed(after, p.square, p.color as Color));
    const behind = passers.find((p) => (p.color === "w" ? parseInt(to[1]) < parseInt(p.square[1]) : parseInt(to[1]) > parseInt(p.square[1])));
    if (behind) out.push(behind.color === me ? "Puts the rook behind the passed pawn, where it supports the push." : "Puts the rook behind the enemy passed pawn, where it slows it down best.");
  }
  if (endgame && m.piece === "k") {
    const ek = kingOf(after, them);
    const df = Math.abs(FILES.indexOf(ek.square[0]) - FILES.indexOf(to[0])), dr = Math.abs(parseInt(ek.square[1]) - parseInt(to[1]));
    const onlyPawns = nonPawnMaterial(after) === 0;
    if (onlyPawns && ((df === 0 && dr === 2) || (dr === 0 && df === 2))) out.push("Takes the opposition, a key idea in king-and-pawn endgames.");
  }
  const centerDist = (x: string) => Math.max(Math.abs(FILES.indexOf(x[0]) - 3.5), Math.abs(parseInt(x[1]) - 4.5));
  if (endgame && m.piece === "k" && rel(to, me) >= 3 && centerDist(to) < centerDist(m.from) && !out.some((x) => x.includes("opposition"))) out.push(pick(seed, ["Brings the king into the game, which matters a lot in the endgame.", "An active king is a strength in the endgame."]));
  return out;
}

/** Long-term costs of a move that isn't a tactical blunder. */
function weaknesses(before: Chess, after: Chess, m: { piece: string; from: string; to: string; captured?: string; flags: string }, me: Color, opening: boolean): string[] {
  const out: string[] = [];
  const files = [...new Set([FILES.indexOf(m.to[0]), FILES.indexOf(m.from[0])])];
  for (const f of files) if (pawnsOn(after, me, f).length >= 2 && pawnsOn(before, me, f).length < 2) out.push(`This leaves doubled pawns on the ${FILES[f]}-file.`);
  const iso = pieces(after).find((p) => p.color === me && p.type === "p" && pawnsOn(after, me, FILES.indexOf(p.square[0]) - 1).length === 0 && pawnsOn(after, me, FILES.indexOf(p.square[0]) + 1).length === 0
    && !(pawnsOn(before, me, FILES.indexOf(p.square[0]) - 1).length === 0 && pawnsOn(before, me, FILES.indexOf(p.square[0]) + 1).length === 0));
  if (iso) out.push(`This leaves an isolated pawn on ${iso.square}.`);
  if (m.piece === "n" && /[ah]/.test(m.to[0]) && !m.captured) out.push("A knight on the edge of the board controls fewer squares.");
  if (opening && m.piece === "p" && /[ah]/.test(m.to[0]) && !m.captured) out.push("Edge pawn moves in the opening don't help development or the center.");
  if (!opening && ["n", "b", "q"].includes(m.piece) && rel(m.to, me) === 1 && rel(m.from, me) > 1 && !m.captured) out.push(`Retreats the ${NAME[m.piece]} to a passive square.`);
  if (m.captured && m.piece === "b" && m.captured === "n" && opening) out.push("Gives up the bishop pair.");
  return out;
}

function openingLine(m: { piece: string; from: string; to: string; san: string; flags: string }, seed: string): string {
  if (m.flags.includes("k") || m.flags.includes("q")) return pick(seed, ["Castles, getting the king safe and connecting the rooks.", "Castling: the king is tucked away and the rooks can work together."]);
  if (m.piece === "p" && ["d4", "e4", "d5", "e5"].includes(m.to)) return pick(seed, ["A classic opening move that claims space in the center.", "Stakes a claim in the center, opening lines for the bishops and queen."]);
  if (m.piece === "p" && ["c4", "c5", "f4", "f5"].includes(m.to)) return "Fights for the center from the side.";
  if (m.piece === "n") return pick(seed, ["Develops the knight toward the center.", "Brings the knight out, where it eyes the center."]);
  if (m.piece === "b") return pick(seed, ["Develops the bishop to an active square.", "Gets the bishop into the game."]);
  if (m.piece === "p" && ["g3", "g6", "b3", "b6"].includes(m.to)) return "Prepares to put the bishop on the long diagonal.";
  return pick(seed, ["A known move in this opening.", "Standard opening theory."]);
}

export function basicExplanation(i: BasicCoachInput): string {
  const me: Color = i.playerColor === "white" ? "w" : "b";
  const them = other(me);
  const pov = (cp: number) => (me === "w" ? cp : -cp);
  const played = apply(i.fenBefore, i.san);
  if (!played) return "";
  const { m } = played;
  const after = played.c;
  const before = load(i.fenBefore);
  if (!before) return "";
  const seed = i.fenBefore + i.san;
  const bad = ["inaccuracy", "mistake", "blunder", "missed_win"].includes(i.classification);
  const endgame = nonPawnMaterial(after) <= 14;
  const opening = i.moveIndex < 20;
  const lead = (pov(i.cpAfter) >= 300) ? `${SIDE[me]} is clearly better now.` : null;

  if (after.isCheckmate()) return pick(seed, ["Checkmate. The game is over.", "Checkmate! Nothing can stop it."]);
  if (after.isStalemate()) {
    return pov(i.cpBefore) >= 200
      ? `Stalemate: ${SIDE[them]} has no legal moves but isn't in check, so the game is a draw. A winning position slips away; always check that the opponent has a move.`
      : `Stalemate: ${SIDE[them]} has no legal moves but isn't in check, so the game is a draw.`;
  }
  if (after.isInsufficientMaterial()) return "Neither side has enough material left to checkmate, so the game is a draw.";
  if (after.isThreefoldRepetition()) return "The same position has now appeared three times, so the game is drawn by repetition.";
  if (i.inBook || i.classification === "book") {
    let base = openingLine(m, seed);
    if (m.captured) {
      const t = motifs(i.fenBefore, i.san, me, i.prevSan).tags[0] ?? `taking the ${NAME[m.captured]}`;
      const v = t.split(" ")[0];
      base = `${({ recapturing: "Recaptures", winning: "Wins", taking: "Takes" } as Record<string, string>)[v] ?? "Takes"}${t.slice(v.length)}.`;
      if (/gambit/i.test(i.openingName ?? "") && /c4|c5|f4|f5|e4|e5|d4|d5/.test(m.to) && i.moveIndex <= 5 && !t.startsWith("recapturing")) base = `Accepts the gambit and ${t.replace(/^taking/, "takes").replace(/^winning/, "wins")}.`;
    }
    if (/known move|Standard opening/.test(base)) base = quietIdeas(before, after, m, me, true, false, seed)[0] ?? base;
    return i.openingName && i.moveIndex === 4 ? `${base} This is the ${i.openingName.replace(/^The\s+/i, "")}.` : base;
  }

  const out: string[] = [];
  const reply = apply(i.fenAfter, i.replySan);
  const bestText = (san: string | null) => {
    if (!san || san === i.san) return null;
    const mo = motifs(i.fenBefore, san, me);
    if (mo.lead === "checkmate") return `${san} was checkmate.`;
    const line = i.bestLine?.length && i.bestLine[0] === san ? i.bestLine : null;
    const lo = line ? lineOutcome(i.fenBefore, line, me) : null;
    if (lo?.mateBy === me && pov(i.cpBefore) >= 9000) return `${fmtLine(i.fenBefore, line!, 5)} would have forced checkmate.`;
    const net = lo ? netWords(lo.got, lo.lost) : null;
    const before0 = load(i.fenBefore);
    const already = before0 ? material(before0, me) - material(before0, them) : 0;
    if (net && net.value >= 1 && lo && lo.plies >= 2 && !(mo.tags[0] ?? "").startsWith("recapturing")) {
      return `${fmtLine(i.fenBefore, line!, lo.show)} would have won ${net.text}.`;
    }
    void already;
    return mo.tags.length ? `${san} was stronger, ${mo.tags.slice(0, 2).join(" and ")}.` : `${san} was stronger.`;
  };
  // What the opponent's best reply leads to (the punishment), in one sentence.
  const replyText = () => {
    const line = i.replyLine?.length ? i.replyLine : i.replySan ? [i.replySan] : null;
    if (!line || line.length < 2) return null;
    const lo = lineOutcome(i.fenAfter, line, me);
    if (lo.mateBy === them && pov(i.cpAfter) <= -9000) return `After ${fmtLine(i.fenAfter, line, lo.plies)}, it's checkmate.`;
    const net = netWords(lo.got, lo.lost);
    if (net && net.value <= -1) return `After ${fmtLine(i.fenAfter, line, lo.show)}, ${SIDE[me]} is ${net.text} down.`;
    return null;
  };

  if (bad) {
    const rm = lineOutcome(i.fenAfter, i.replyLine, me);
    const bm = lineOutcome(i.fenBefore, i.bestLine, me);
    if (rm.mateBy === them && pov(i.cpAfter) <= -9000) {
      out.push(rm.plies === 1 ? `This allows ${fmtLine(i.fenAfter, i.replyLine!, 1)}, checkmate.` : `This allows a forced checkmate: ${fmtLine(i.fenAfter, i.replyLine!, rm.plies)}.`);
    } else if (pov(i.cpAfter) <= -9000) {
      const n = mateIn(i.cpAfter);
      out.push(`This allows a forced checkmate${n > 1 ? ` in ${n}` : ""}${i.replySan ? `, starting with ${i.replySan}` : ""}.`);
    } else if (bm.mateBy === me && pov(i.cpBefore) >= 9000 && i.bestLine?.[0] === i.bestMoveSan) {
      out.push(bm.plies === 1 ? `${i.bestMoveSan} was checkmate.` : `There was a forced checkmate: ${fmtLine(i.fenBefore, i.bestLine!, bm.plies)}.`);
    } else if (pov(i.cpBefore) >= 9000) {
      const n = mateIn(i.cpBefore);
      out.push(`There was a forced checkmate${n > 1 ? ` in ${n}` : ""}${i.bestMoveSan ? `, starting with ${i.bestMoveSan}` : ""}.`);
    } else {
      const hung = hanging(after, me).filter((h) => VAL[h.type] >= 3);
      const takes = reply?.m.captured ? (reply.m.to as Square) : null;
      const lost = hung.find((h) => h.sq === takes) ?? (reply ? null : hung[0]);
      const replyMo = reply && i.replySan ? motifs(i.fenAfter, i.replySan, them) : null;
      const replyTactic = replyMo?.tags.find((t) => /fork|pin|skewer|discovered/.test(t));
      const theirThreat = before ? threats(flipTurn(before) ?? before) : null; // what the opponent was threatening
      const bestWins = before && i.bestMoveSan ? (() => { const b = apply(i.fenBefore, i.bestMoveSan); return b?.m.captured ? hanging(before, them).find((h) => h.sq === b.m.to) : null; })() : null;

      const tradeDown = lost && lost.sq === m.to && m.captured ? VAL[m.piece] - VAL[m.captured] : null;
      if (lost && tradeDown !== null && tradeDown <= 0) {
        // An even (or better) trade isn't the problem; fall through to the line.
        out.push(pick(seed, ["This makes the position noticeably worse.", "This move costs real ground."]));
      } else if (lost && tradeDown !== null) {
        out.push(`This gives up the ${NAME[m.piece]} for just a ${NAME[m.captured!]}${i.replySan && takes === lost.sq ? `: ${i.replySan} takes back` : ""}.`);
      } else if (lost) {
        out.push(lost.sq === m.to
          ? pick(seed, [`The ${NAME[lost.type]} on ${lost.sq} can simply be taken${i.replySan && takes === lost.sq ? ` with ${i.replySan}` : ""}.`, `This puts the ${NAME[lost.type]} where it can be taken for free${i.replySan && takes === lost.sq ? ` (${i.replySan})` : ""}.`])
          : pick(seed, [`This leaves the ${NAME[lost.type]} on ${lost.sq} unprotected${i.replySan && takes === lost.sq ? `, and ${i.replySan} wins it` : ""}.`, `The ${NAME[lost.type]} on ${lost.sq} is left hanging${i.replySan && takes === lost.sq ? `: ${i.replySan} picks it up` : ""}.`]));
      } else if (replyTactic && i.replySan) {
        out.push(`It allows ${i.replySan}, ${replyTactic}.`);
      } else if (theirThreat?.wins && hanging(after, me).some((h) => h.sq === theirThreat.wins!.sq)) {
        out.push(`The ${NAME[theirThreat.wins.type]} on ${theirThreat.wins.sq} was under attack and still is.`);
      } else if (bestWins && i.bestMoveSan) {
        out.push(`${i.bestMoveSan} would have won the ${NAME[bestWins.type]} on ${bestWins.sq} for free.`);
      } else if (reply?.m.captured && i.replySan && (reply.m.captured === "p" || (reply.m.captured === "r" && VAL[reply.m.piece] === 3))) {
        out.push(reply.m.captured === "p" ? `It lets ${i.replySan} win a pawn.` : `It lets ${i.replySan} win the exchange (a rook for a minor piece).`);
      } else if (i.prevClassification && ["mistake", "blunder", "missed_win"].includes(i.prevClassification) && i.bestMoveSan) {
        out.push(`The opponent had just slipped, and this misses the chance to punish it.`);
      } else if (opening && m.piece === "q" && !m.captured && i.moveIndex < 14) {
        out.push("Bringing the queen out this early lets the opponent gain time by attacking it.");
      } else if (opening && m.piece === "k" && !(m.flags.includes("k") || m.flags.includes("q")) && /[KQkq]/.test(i.fenBefore.split(" ")[2])) {
        out.push("Moving the king gives up the right to castle and leaves it exposed.");
      } else if (opening && pieces(before).filter((p) => p.color === me && (p.type === "n" || p.type === "b") && p.square[1] === (me === "w" ? "1" : "8")).length >= 2 && (m.piece === "n" || m.piece === "b") && m.from[1] !== (me === "w" ? "1" : "8") && !m.captured) {
        out.push("Moving the same piece again while others are still undeveloped loses time.");
      } else if (m.piece === "p" && ["f", "g", "h"].includes(m.from[0]) && pieces(before).some((p) => p.color === me && p.type === "k" && ["g", "h"].includes(p.square[0]))) {
        out.push("Pushing a pawn in front of the castled king weakens its shelter.");
      } else if (trapped(after, me) && !trapped(before, me)) {
        const t = trapped(after, me)!;
        out.push(`This leaves the ${NAME[t.type]} on ${t.sq} trapped, with nowhere safe to go.`);
      } else if (opening && i.moveIndex >= 14 && !kingCastledOrSafe(after, me) && canCastle(before, me) && !(m.flags.includes("k") || m.flags.includes("q"))) {
        out.push("The king is still in the center; castling would have been safer.");
      } else if (weaknesses(before, after, m, me, opening).length) {
        out.push(weaknesses(before, after, m, me, opening)[0]);
      } else if (pov(i.cpBefore) >= 150 && pov(i.cpAfter) < 80) {
        out.push(pick(seed, ["This lets most of the advantage slip away.", "A winning position becomes level again."]));
      } else if (pov(i.cpBefore) > -80 && pov(i.cpAfter) <= -150) {
        out.push(pick(seed, ["This hands the opponent the better position.", `After this, ${SIDE[them]} is clearly better.`]));
      } else if (i.classification === "inaccuracy") {
        out.push(pick(seed, ["A small slip, not a disaster.", "Playable, but it gives away a little.", "Not a big mistake, but there was more."]));
      } else {
        out.push(pick(seed, ["This makes the position noticeably worse.", "This move costs real ground."]));
      }
    }
    const rt = replyText();
    if (rt) {
      const vague = /costs real ground|noticeably worse|gives away a little|small slip|Not a big mistake|slip away|level again|better position|clearly better/.test(out[0] ?? "");
      const alreadySaid = /checkmate/.test(out[0] ?? "") || (!!i.replySan && (out[0] ?? "").includes(i.replySan) && !/checkmate/.test(rt));
      if (vague) out[0] = rt;
      else if (!alreadySaid) out.splice(1, 0, rt);
    }
    const bt = bestText(i.bestMoveSan);
    if (bt && !out.join(" ").includes(i.bestMoveSan ?? "§")) out.push(bt);
    return out.slice(0, 3).join(" ");
  }

  // ── Good moves ───────────────────────────────────────────────────────────
  const mo = motifs(i.fenBefore, i.san, me, i.prevSan);
  const myNext = flipTurn(after);
  const threat = myNext ? threats(myNext) : null;

  const rl0 = lineOutcome(i.fenAfter, i.replyLine, me);
  const rl = { ...rl0, mateBy: (rl0.mateBy === me && pov(i.cpAfter) >= 9000) || (rl0.mateBy === them && pov(i.cpAfter) <= -9000) ? rl0.mateBy : null };
  const onlyMove = before.moves().length === 1;
  if (rl.mateBy === them) {
    // Already lost: say so plainly instead of praising the move.
    const doom = `${fmtLine(i.fenAfter, i.replyLine!, rl.plies)} ${rl.plies === 1 ? "is" : "ends in"} checkmate.`;
    if (onlyMove) return `The only legal move, and ${doom}`;
    const what = mo.tags.length ? `${mo.tags[0][0].toUpperCase()}${mo.tags[0].slice(1)}` : "The best try";
    return `${what}, but ${doom}`;
  }
  if (onlyMove) out.push("The only legal move.");
  else if (before.isCheck()) {
    const checkers = before.attackers(kingOf(before, me).square, them);
    if (m.captured && checkers.includes(m.to as Square)) { /* the capture tag says it */ }
    else if (m.piece === "k") out.push(pick(seed, ["Steps out of check.", "Gets the king out of check."]));
    else out.push(`Blocks the check with the ${NAME[m.piece]}.`);
  }
  if (rl.mateBy === me) {
    const sac = hanging(after, me).some((h) => h.sq === m.to) && VAL[m.piece] >= 3 && (!m.captured || VAL[m.captured] < VAL[m.piece]);
    const how = sac ? `A ${NAME[m.piece]} sacrifice!` : mo.tags.length ? `${mo.tags[0][0].toUpperCase()}${mo.tags[0].slice(1)}${mo.tags[1] ? `, ${mo.tags[1]}` : ""}.` : "";
    out.push(`${how ? `${how} ` : ""}After ${fmtLine(i.fenAfter, i.replyLine!, rl.plies)}, it's checkmate.`);
    return out.slice(0, 2).join(" ");
  }
  if (pov(i.cpAfter) >= 9000) {
    const n = mateIn(i.cpAfter);
    out.push(n <= 1 ? "Sets up checkmate next move." : `Sets up a forced checkmate in ${n}.`);
  }
  if (i.classification === "brilliant") {
    out.push(m.captured == null && VAL[m.piece] >= 3 ? `A brilliant sacrifice: the ${NAME[m.piece]} is offered for a powerful attack.` : "A brilliant move that most players would miss.");
  }
  if (mo.tags.length) {
    const VERB: Record<string, string> = { taking: "Takes", winning: "Wins", recapturing: "Recaptures", forking: "Forks", pinning: "Pins", skewering: "Skewers", getting: "Gets", protecting: "Protects" };
    const [first, ...rest] = mo.tags.slice(0, 2);
    const w = first.split(" ")[0];
    const isCheck = first.startsWith("with ");
    const head = isCheck ? (first.includes("discovered") ? "Discovered check" : rest.length ? "Gives check" : "Gives check, forcing a reply") : `${VERB[w] ?? w}${first.slice(w.length)}`;
    const tail = rest.length ? (isCheck ? ` while ${rest[0]}` : `, ${rest[0]}`) : "";
    const loud = /fork|skewer|discovered/.test(first + tail);
    out.push(`${head}${tail}${loud ? "!" : "."}`);
  } else if (threat?.mate && !out.length) {
    out.push(`Threatens ${threat.mate}, checkmate.`);
  } else if (threat?.wins && !out.length) {
    out.push(`Threatens to win the ${NAME[threat.wins.type]} on ${threat.wins.sq}.`);
  }
  // A threat the opponent had (mate, or winning something) that this move deals with.
  if (out.length < 2 && !mo.tags.some((t) => /safety|protecting/.test(t))) {
    const fb = flipTurn(before);
    const was = fb ? threats(fb) : null;
    const now = threats(after);
    if (was?.mate && !now.mate) out.push(`Stops ${was.mate}, which was a checkmate threat.`);
    else if (was?.wins && !(now.wins && now.wins.sq === (was.wins.sq === m.from ? m.to : was.wins.sq)) && was.wins.sq !== m.to && !m.captured) out.push(was.wins.sq === m.from ? `Gets the ${NAME[was.wins.type]} out of danger.` : `Deals with the threat to the ${NAME[was.wins.type]} on ${was.wins.sq}.`);
  }
  if (out.length && i.prevClassification && ["mistake", "blunder", "missed_win"].includes(i.prevClassification) && (m.captured || mo.tags.length)) {
    out[0] = `Punishes the mistake. ${out[0]}`;
  }
  if (m.promotion) out.push(`Promotes to a ${NAME[m.promotion]}.`);
  if (m.flags.includes("k") || m.flags.includes("q")) out.push("Castles, getting the king safe and connecting the rooks.");
  if (m.captured && VAL[m.captured] === VAL[m.piece] && pov(i.cpAfter) >= 200 && out.length < 2) out.push("Trading pieces when ahead brings the win closer.");

  // Bigger-picture wins.
  const trap = trapped(after, them);
  if (trap && !trapped(before, them) && out.length < 2) out.push(`Traps the ${NAME[trap.type]} on ${trap.sq}!`);
  if (m.captured && out.length < 2) {
    const newlyLoose = hanging(after, them).find((h) => VAL[h.type] >= 3 && !hanging(before, them).some((x) => x.sq === h.sq));
    if (newlyLoose) {
      const lostDefender = before.attackers(newlyLoose.sq, them).length > after.attackers(newlyLoose.sq, them).length;
      const hitsIt = after.attackers(newlyLoose.sq, me).includes(m.to as Square);
      if (lostDefender) out.push(`It also removes the defender of the ${NAME[newlyLoose.type]} on ${newlyLoose.sq}.`);
      else if (hitsIt) out.push(`And now the ${NAME[newlyLoose.type]} on ${newlyLoose.sq} is under attack too.`);
    }
  }
  if (out.length < 2 && i.replyLine && i.replyLine.length >= 3) {
    const lo = lineOutcome(i.fenAfter, i.replyLine, me);
    const net = netWords(lo.got, lo.lost);
    // Only when the opponent's best answer isn't itself a capture: then the gain comes from our follow-up.
    if (net && net.value >= 2 && !m.captured && !i.replyLine[0].includes("x")) out.push(`The point: after ${fmtLine(i.fenAfter, i.replyLine, lo.show)}, ${SIDE[me]} wins ${net.text}.`);
  }
  if (out.length < 2 && !m.captured && kingPressure(after, them) - kingPressure(before, them) >= 2 && !endgame) out.push("Adds pressure around the enemy king.");
  if (out.length < 2 && !m.captured) {
    const castled = m.flags.includes("k") || m.flags.includes("q");
    for (const idea of quietIdeas(before, after, m, me, opening, endgame, seed)) {
      if (out.length >= 2) break;
      if (castled && /rooks|castle/.test(idea)) continue;
      if (mo.tags.some((t) => /fork|pin|skewer/.test(t)) && /^(Attacks|Goes after|Kicks|Piles|A double attack)/.test(idea)) continue;
      const sqs = idea.match(/[a-h][1-8]/g) ?? [];
      if (out.includes(idea) || sqs.some((x) => out.join(" ").includes(x))) continue;
      out.push(idea);
    }
  }
  if (!out.length && endgame) {
    if (m.piece === "k") { /* nothing worth saying beyond quietIdeas */ }
    else if (m.piece === "p") {
      const file = m.to[0];
      const passed = !pieces(after).some((p) => p.color === them && p.type === "p" && Math.abs(FILES.indexOf(p.square[0]) - FILES.indexOf(file)) <= 1 && (me === "w" ? p.square[1] > m.to[1] : p.square[1] < m.to[1]));
      if (passed) out.push("Pushes the passed pawn closer to promotion.");
    } else if (m.piece === "r" && material(after, me) - material(after, them) >= 0) out.push("Activates the rook.");
  }
  if (!out.length && opening) {
    if ((m.piece === "n" || m.piece === "b") && (m.from[1] === "1" || m.from[1] === "8")) out.push(pick(seed, [`Develops the ${NAME[m.piece]}.`, `Brings the ${NAME[m.piece]} into play.`]));
    else if (m.piece === "p" && ["d4", "e4", "d5", "e5"].includes(m.to)) out.push("Claims space in the center.");
    else if (m.piece === "r" && /[de]/.test(m.to[0])) out.push("Puts the rook on a central file.");
  }
  if (!out.length) {
    out.push(i.classification === "great" ? "A great find: the one move that keeps everything under control."
      : i.classification === "best" ? pick(seed, ["The engine's top choice.", "Exactly what the position needed.", "The best move here."])
      : i.classification === "excellent" ? pick(seed, ["Very close to the engine's top choice.", "An excellent, accurate move."])
      : i.bestMoveSan && i.bestMoveSan !== i.san ? `A reasonable move; ${i.bestMoveSan} was slightly more precise.` : "A reasonable move.");
    if (["best", "excellent", "great"].includes(i.classification) && i.replyLine && i.replyLine.length >= 2) out.push(`Main line: ${fmtLine(i.fenAfter, i.replyLine, 4)}.`);
  } else if (i.classification === "great" && out.length < 2) {
    out.unshift("A great find.");
  }
  if (lead && out.length < 2 && !bad && i.classification !== "good" && pov(i.cpBefore) < 300) out.push(lead);
  if (out.length < 2 && opening && i.moveIndex >= 8 && developedMinors(after, me) - developedMinors(after, them) >= 2) out.push(`${SIDE[me]} is now well ahead in development.`);
  return out.slice(0, 2).join(" ");
}

/**
 * Saved engine-only reviews: rewrite each move's explanation with the free
 * coach when the review is read, so games reviewed before it existed get the
 * same plain-language text. AI-coached reviews are returned untouched.
 */
/**
 * Saved reviews: mark the opening moves that are in the opening book as
 * "book" (reviews made before the book was widened stopped it after a move
 * or two). Only from the first move, only while every move so far is book,
 * and never over a real mistake.
 */
export function markBookMoves(moves: unknown): unknown {
  if (!Array.isArray(moves)) return moves;
  const BAD = new Set(["inaccuracy", "mistake", "blunder", "missed_win"]);
  let inBook = true;
  return (moves as { fen?: string; san?: string; classification?: string }[]).map((m) => {
    if (!inBook || !m?.fen || !m.san) { inBook = false; return m; }
    try {
      const c = new Chess(m.fen);
      c.move(m.san);
      if (!isBookPosition(c.fen())) { inBook = false; return m; }
      if (m.classification && BAD.has(m.classification)) { inBook = false; return m; }
      return m.classification === "book" ? m : { ...m, classification: "book" };
    } catch { inBook = false; return m; }
  });
}

export function refreshBasicReview(moves: unknown, aiCoach: boolean, openingName: string | null = null): unknown {
  if (aiCoach || !Array.isArray(moves)) return moves;
  type M = { fen?: string; san?: string; color?: "white" | "black"; classification?: string; evalAfterCp?: number; betterMove?: string | null; explanation?: string; pros?: string[]; cons?: string[]; moveIndex?: number; bestLineSan?: string[]; replyLineSan?: string[] };
  const all = moves as M[];
  const GOOD = new Set(["best", "brilliant", "great", "excellent", "checkmate"]);
  const clean = (s?: string | null) => (s ? s.split(/\s+[—–-]\s+/)[0].trim() : null);
  return all.map((m, i) => {
    try {
      if (!m || !m.fen || !m.san || typeof m.evalAfterCp !== "number" || !m.color || !m.classification) return m;
      const c = new Chess(m.fen);
      const r = c.move(m.san);
      if (!r) return m;
      const prev = all[i - 1];
      const next = all[i + 1];
      const replySan = next ? (next.classification && GOOD.has(next.classification) ? next.san ?? null : clean(next.betterMove)) : null;
      const text = basicExplanation({
        fenBefore: m.fen, fenAfter: c.fen(), san: m.san, classification: m.classification, playerColor: m.color,
        moveIndex: typeof m.moveIndex === "number" ? m.moveIndex : i,
        cpBefore: i === 0 ? 20 : typeof prev?.evalAfterCp === "number" ? prev.evalAfterCp : m.evalAfterCp,
        cpAfter: m.evalAfterCp, bestMoveSan: clean(m.betterMove), replySan, inBook: m.classification === "book",
        prevClassification: prev?.classification ?? null,
        prevSan: prev?.san ?? null,
        bestLine: m.bestLineSan ?? null, replyLine: m.replyLineSan ?? null, openingName,
      });
      return text ? { ...m, explanation: text, pros: [], cons: [] } : m;
    } catch { return m; }
  });
}

/**
 * Content tags for one move (for the admin Content Studio): the tactic it
 * plays (fork, pin, skewer, discovered attack), a sacrifice, check, mate,
 * promotion, and the phase. Purely from the board, no engine.
 */
export function contentTags(fenBefore: string, san: string, color: "white" | "black", prevSan: string | null = null): string[] {
  const me: Color = color === "white" ? "w" : "b";
  const r = apply(fenBefore, san);
  if (!r) return [];
  const { c, m } = r;
  const out = new Set<string>();
  if (c.isCheckmate()) out.add("checkmate");
  else if (c.isCheck()) out.add("check");
  if (m.promotion) out.add("promotion");
  const mo = motifs(fenBefore, san, me, prevSan);
  for (const t of mo.tags) {
    if (t.startsWith("forking")) out.add("fork");
    else if (t.startsWith("pinning")) out.add("pin");
    else if (t.startsWith("skewering")) out.add("skewer");
    else if (t.includes("discovered")) out.add("discovered");
  }
  // A sacrifice: a piece (not a pawn) left where it can be taken for less than it's worth.
  if (VAL[m.piece] >= 3 && hanging(c, me).some((h) => h.sq === m.to) && (!m.captured || VAL[m.captured] < VAL[m.piece])) out.add("sacrifice");
  if (nonPawnMaterial(c) <= 14) out.add("endgame");
  return [...out];
}
