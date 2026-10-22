// The free review's move explanations, written without AI. chess.js looks at
// the position before and after each move and spots what happened: pieces
// left hanging, forks, pins, skewers, discovered attacks, threats, mates,
// king safety, opening principles, passed pawns and endgame play. The engine
// supplies the better move and the reply it expects, and we explain those
// too. Short, plain sentences in a neutral voice ("the knight on e5"), since
// both players read the same review. Pro reviews use the AI coach; this is
// also its fallback.

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
}

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
  if (hits.length === 1) {
    const t = hits[0];
    out.push(m.piece === "p" ? `Kicks the ${NAME[t.type]} on ${t.sq} with the pawn.` : pick(seed, [`Attacks the ${NAME[t.type]} on ${t.sq}, gaining time.`, `Goes after the ${NAME[t.type]} on ${t.sq}.`]));
  } else if (hits.length >= 2) {
    out.push(`Puts pressure on ${hits[0].sq} and ${hits[1].sq} at the same time.`);
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
  else if (m.piece === "p" && isPassed(after, to, me) && rel(to, me) >= 5) out.push("Pushes the passed pawn closer to promotion.");
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
  if (m.piece === "p" && out.length === 0) {
    const mob = (c: Chess) => {
      const f = c.turn() === me ? c : flipTurn(c);
      if (!f) return { b: 0, q: 0 };
      const ms = f.moves({ verbose: true });
      return { b: ms.filter((x) => x.piece === "b").length, q: ms.filter((x) => x.piece === "q").length };
    };
    const a = mob(before), b = mob(after);
    if (b.b - a.b >= 2) out.push("Opens a line for the bishop.");
    else if (b.q - a.q >= 2) out.push("Opens a path for the queen.");
  }
  if (endgame && m.piece === "k" && rel(to, me) >= 3) out.push(pick(seed, ["Brings the king into the game, which matters a lot in the endgame.", "An active king is a strength in the endgame."]));
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
  if (i.inBook || i.classification === "book") return openingLine(m, seed);

  const out: string[] = [];
  const reply = apply(i.fenAfter, i.replySan);
  const bestText = (san: string | null) => {
    if (!san || san === i.san) return null;
    const mo = motifs(i.fenBefore, san, me);
    if (mo.lead === "checkmate") return `${san} was checkmate.`;
    return mo.tags.length ? `${san} was stronger, ${mo.tags.slice(0, 2).join(" and ")}.` : `${san} was stronger.`;
  };

  if (bad) {
    if (pov(i.cpAfter) <= -9000) {
      const n = mateIn(i.cpAfter);
      out.push(`This allows a forced checkmate${n > 1 ? ` in ${n}` : ""}${i.replySan ? `, starting with ${i.replySan}` : ""}.`);
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

      if (lost) {
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
    const bt = bestText(i.bestMoveSan);
    if (bt && !out.join(" ").includes(i.bestMoveSan ?? "§")) out.push(bt);
    return out.slice(0, 2).join(" ");
  }

  // ── Good moves ───────────────────────────────────────────────────────────
  const mo = motifs(i.fenBefore, i.san, me, i.prevSan);
  const myNext = flipTurn(after);
  const threat = myNext ? threats(myNext) : null;

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
    const head = first.startsWith("with ") ? (first.includes("discovered") ? "Discovered check" : "Check") : `${VERB[w] ?? w}${first.slice(w.length)}`;
    const tail = rest.length ? `, ${rest[0]}` : "";
    const loud = /fork|skewer|discovered/.test(first + tail);
    out.push(`${head}${tail}${loud ? "!" : "."}`);
  } else if (threat?.mate && !out.length) {
    out.push(`Threatens ${threat.mate}, checkmate.`);
  } else if (threat?.wins && !out.length) {
    out.push(`Threatens to win the ${NAME[threat.wins.type]} on ${threat.wins.sq}.`);
  }
  if (out.length && i.prevClassification && ["mistake", "blunder", "missed_win"].includes(i.prevClassification) && (m.captured || mo.tags.length)) {
    out[0] = `Punishes the mistake. ${out[0]}`;
  }
  if (m.promotion) out.push(`Promotes to a ${NAME[m.promotion]}.`);
  if (m.flags.includes("k") || m.flags.includes("q")) out.push("Castles, getting the king safe and connecting the rooks.");
  if (m.captured && VAL[m.captured] === VAL[m.piece] && pov(i.cpAfter) >= 200 && out.length < 2) out.push("Trading pieces when ahead brings the win closer.");

  if (out.length < 2 && !m.captured) {
    const castled = m.flags.includes("k") || m.flags.includes("q");
    for (const idea of quietIdeas(before, after, m, me, opening, endgame, seed)) {
      if (out.length >= 2) break;
      if (castled && /rooks|castle/.test(idea)) continue;
      const sqs = idea.match(/[a-h][1-8]/g) ?? [];
      if (out.includes(idea) || sqs.some((x) => out.join(" ").includes(x))) continue;
      out.push(idea);
    }
  }
  if (!out.length && endgame) {
    if (m.piece === "k") out.push(pick(seed, ["Brings the king into the game, which matters a lot in the endgame.", "An active king is a strength in the endgame."]));
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
  } else if (i.classification === "great" && out.length < 2) {
    out.unshift("A great find.");
  }
  if (lead && out.length < 2 && !bad && i.classification !== "good" && pov(i.cpBefore) < 300) out.push(lead);
  return out.slice(0, 2).join(" ");
}

/**
 * Saved engine-only reviews: rewrite each move's explanation with the free
 * coach when the review is read, so games reviewed before it existed get the
 * same plain-language text. AI-coached reviews are returned untouched.
 */
export function refreshBasicReview(moves: unknown, aiCoach: boolean): unknown {
  if (aiCoach || !Array.isArray(moves)) return moves;
  type M = { fen?: string; san?: string; color?: "white" | "black"; classification?: string; evalAfterCp?: number; betterMove?: string | null; explanation?: string; pros?: string[]; cons?: string[]; moveIndex?: number };
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
      });
      return text ? { ...m, explanation: text, pros: [], cons: [] } : m;
    } catch { return m; }
  });
}
