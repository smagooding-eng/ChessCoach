// Same-day reviews: the message about one freshly reviewed game, built from its review
// (the member's side only): the move that decided it. A loss names their costliest move,
// a win their best one (or the opponent's slip they made count), a draw the win they
// missed if there was one. Push text, and an email for members without push.
import { emailLayout, emailP, escapeHtml, EMAIL } from "./emailTheme";

interface RM { moveIndex: number; san: string; color: "white" | "black"; classification: string; cpLoss?: number; betterMove?: string | null }
export interface NotifyGame {
  id: number; result: string | null; username: string | null;
  white_username: string; black_username: string; review_data: unknown;
}
export interface GameMessage { title: string; body: string; url: string; subject: string; html: (name: string | null, unsubUrl: string) => string }

const BAD = ["blunder", "missed_win", "mistake"];
const label = (m: RM) => `${Math.floor(m.moveIndex / 2) + 1}${m.color === "white" ? "." : "..."} ${m.san}`;
/** The engine's move instead of m, numbered like the game ("23.Qxf7+"), or null. */
const better = (m: RM) => {
  const b = (m.betterMove ?? "").split(/\s+[—–-]\s+/)[0].trim();
  return b && b !== m.san && /^[KQRBNa-hO][\w+#=-]*$/.test(b) ? `${Math.floor(m.moveIndex / 2) + 1}${m.color === "white" ? "." : "..."}${b}` : null;
};
const worst = (ms: RM[]) => ms.filter((m) => BAD.includes(m.classification))
  .sort((a, b) => BAD.indexOf(a.classification) - BAD.indexOf(b.classification) || (b.cpLoss ?? 0) - (a.cpLoss ?? 0))[0];

/** The games of the session the message is about (their side's results), for a line like
 *  "4 games today: 3 wins, 1 loss." Only used when there was more than one. */
export interface SessionTally { games: number; wins: number; losses: number; draws: number }
const tallyLine = (t: SessionTally) => {
  const parts = [t.wins && `${t.wins} win${t.wins > 1 ? "s" : ""}`, t.losses && `${t.losses} loss${t.losses > 1 ? "es" : ""}`, t.draws && `${t.draws} draw${t.draws > 1 ? "s" : ""}`].filter(Boolean);
  return `${t.games} games today${parts.length ? `: ${parts.join(", ")}` : ""}.`;
};

/** The message for one reviewed game, or null when the review can't say anything specific. */
export function gameMessage(g: NotifyGame, side: "white" | "black" | null, session?: SessionTally | null): GameMessage | null {
  const rd = g.review_data as { moves?: RM[]; whiteAccuracy?: number; blackAccuracy?: number } | RM[] | null;
  const moves = (Array.isArray(rd) ? rd : rd?.moves ?? []).filter((m) => m && typeof m.moveIndex === "number");
  if (!side || !moves.length) return null;
  const opp = side === "white" ? g.black_username : g.white_username;
  const mine = moves.filter((m) => m.color === side), theirs = moves.filter((m) => m.color !== side);
  const acc = !Array.isArray(rd) ? (side === "white" ? rd?.whiteAccuracy : rd?.blackAccuracy) : undefined;
  const accText = typeof acc === "number" && acc > 0 ? ` You played at ${Math.round(acc)}% accuracy.` : "";
  // ?from=quick: the review page notes that the member came back from this message
  const url = `/games/${g.id}?from=quick`;

  // The email subject names the actual move (the push title stays short).
  let title: string, body: string, lead: string, subject: string | null = null;
  if (g.result === "win") {
    const star = mine.find((m) => m.classification === "brilliant") ?? mine.find((m) => m.classification === "great");
    const slip = worst(theirs);
    title = `You beat ${opp}`;
    if (star) { body = `${label(star)} was your best move of the game. See why.`; lead = `<strong>${escapeHtml(label(star))}</strong> was your best move of the game.`; subject = `${label(star)}: your best move against ${opp}`; }
    else if (slip) { body = `${opp} slipped with ${label(slip)}, and you made it count. See how.`; lead = `${escapeHtml(opp)} slipped with <strong>${escapeHtml(label(slip))}</strong>, and you made it count.`; subject = `${opp} slipped with ${label(slip)}, and you made it count`; }
    else { body = `Every move graded.${accText}`; lead = `Every move is graded.${accText}`; }
  } else if (g.result === "loss") {
    const turn = worst(mine);
    if (!turn) return null;
    title = `Your game vs ${opp}: the turning point`;
    const b = better(turn);
    body = b ? `${label(turn)} turned it. ${b} was the move.` : `${label(turn)} turned it. See what to play instead.`;
    lead = b ? `<strong>${escapeHtml(label(turn))}</strong> is where it turned. <strong>${escapeHtml(b)}</strong> was the move, and your review shows why.` : `<strong>${escapeHtml(label(turn))}</strong> is where it turned. Your review shows what to play instead.`;
    subject = b ? `You missed ${b} against ${opp}` : `${label(turn)} decided your game against ${opp}`;
  } else {
    const missed = mine.find((m) => m.classification === "missed_win") ?? worst(mine);
    if (!missed) return null;
    title = `Your draw with ${opp}`;
    const b = better(missed);
    body = missed.classification === "missed_win" ? (b ? `There was a win: ${b}. See it.` : `There was a win at ${label(missed)}. See it.`) : (b ? `${label(missed)} let the advantage go. ${b} kept it.` : `${label(missed)} let the advantage go. See the better move.`);
    subject = b ? (missed.classification === "missed_win" ? `You had a win against ${opp}: ${b}` : `${b} would have kept your edge against ${opp}`) : null;
    lead = missed.classification === "missed_win" ? `There was a win at <strong>${escapeHtml(label(missed))}</strong>.` : `<strong>${escapeHtml(label(missed))}</strong> let the advantage go.`;
  }
  // Several games in one sitting: say so first, then the game that decided the most.
  if (session && session.games > 1) {
    body = `${tallyLine(session)} Latest: ${body}`;
    lead = `${escapeHtml(tallyLine(session))} All reviewed. In your latest: ${lead}`;
  }
  return {
    title, body, url, subject: subject ?? title,
    html: (name, unsubUrl) => emailLayout({
      preheader: body,
      badge: "Reviewed the same day",
      title: name ? `${escapeHtml(name)}, ${escapeHtml(title.charAt(0).toLowerCase() + title.slice(1))}` : escapeHtml(title),
      subtitle: "Your coach went through it move by move, free.",
      body: emailP(`${lead}${accText && g.result !== "win" ? accText : ""}`, { center: true, mb: 22 }),
      cta: { label: "See the review &rarr;", href: `${EMAIL.site}${url}` },
      footerNote: "You're getting this because you linked your chess account to ChessScout.net. We review your new games the same day you play them, and email at most every few days.",
      unsubscribeUrl: unsubUrl,
    }),
  };
}
