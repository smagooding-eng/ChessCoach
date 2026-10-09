import { sql } from "drizzle-orm";
import { pgTable, varchar, integer, text, timestamp, index, boolean } from "drizzle-orm/pg-core";

// Deliberately a separate table from liveGamesTable, not a variant of
// it. liveGamesTable only ever stores FINISHED games -- the live
// WebSocket server holds in-progress state in memory, which works
// because a live game's two players are expected to be continuously
// connected for its ~5-15 minute duration. Correspondence games are the
// opposite: a game can sit untouched for days between moves, so its
// in-progress state has to be the database itself, not server memory --
// there is no persistent connection to hold it in between moves.
export const correspondenceGamesTable = pgTable("correspondence_games", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  timeControl: varchar("time_control").notNull(), // 'corr_1d' | 'corr_3d' | 'corr_7d'
  mode: varchar("mode").notNull().default("casual"), // 'casual' | 'ranked'
  whiteUserId: varchar("white_user_id").notNull(),
  blackUserId: varchar("black_user_id").notNull(),
  whiteUsername: varchar("white_username").notNull(),
  blackUsername: varchar("black_username").notNull(),
  whiteIsBot: integer("white_is_bot").notNull().default(0), // 0/1 -- no bot personas play correspondence yet, reserved for later
  blackIsBot: integer("black_is_bot").notNull().default(0),
  pgn: text("pgn").notNull().default(""),
  fen: text("fen").notNull(),
  turnUserId: varchar("turn_user_id").notNull(), // whose move it currently is
  // Per-move time bank in ms -- NOT a continuously-ticking match clock
  // like live play's. Correspondence clocks only count down while it's
  // that player's turn, and reset to the full time-control amount every
  // time they move (a "1 day per move" allowance, not a shared 1-day
  // budget for the whole game). Elapsed time against whichever bank is
  // currently active is computed from lastMoveAt at read time, not
  // ticked by a timer -- there's nothing to tick when no one's connected.
  whiteBankMs: integer("white_bank_ms").notNull(),
  blackBankMs: integer("black_bank_ms").notNull(),
  lastMoveAt: timestamp("last_move_at", { withTimezone: true }).notNull().defaultNow(),
  status: varchar("status").notNull().default("active"), // 'active' | 'finished'
  result: varchar("result"), // 'white' | 'black' | 'draw', set on finish
  termination: varchar("termination"), // 'checkmate' | 'stalemate' | 'draw_50' | 'resignation' | 'timeout', set on finish
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  // Ranked games: each side's daily rating before/after (null for casual).
  whiteRatingBefore: integer("white_rating_before"),
  blackRatingBefore: integer("black_rating_before"),
  whiteRatingAfter: integer("white_rating_after"),
  blackRatingAfter: integer("black_rating_after"),
  // Rows written into the main games table when the game ends, so it shows
  // in Games / Analysis like any imported game.
  whiteGamesId: integer("white_games_id"),
  blackGamesId: integer("black_games_id"),
  drawOfferFrom: varchar("draw_offer_from"), // 'white' | 'black' while an offer stands
  lowTimeNotifiedAt: timestamp("low_time_notified_at", { withTimezone: true }),
}, (table) => [
  index("idx_correspondence_white_user").on(table.whiteUserId, table.status),
  index("idx_correspondence_black_user").on(table.blackUserId, table.status),
]);

// A user who wants a correspondence game at a given time control but
// has no one to play yet. create-game either pairs with an existing
// queued row (delete it, start a game) or inserts a new one and the
// player waits. No lobby, no browsing -- purely a first-come-first-served
// pairing table, matched automatically the next time someone else at the
// same time control tries to start a game, or by a bot fallback after
// (No bot fallback: daily games are fine to wait for a real opponent; the
// player gets a push notification when one is found.)
export const correspondenceQueueTable = pgTable("correspondence_queue", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  username: varchar("username").notNull(),
  timeControl: varchar("time_control").notNull(),
  mode: varchar("mode").notNull().default("casual"),
  rating: integer("rating").notNull().default(1200),
  joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
});

// "Challenge a friend" links, for live and daily games. The creator gets a
// short code to share; whoever opens it and accepts plays them.
export const gameChallengesTable = pgTable("game_challenges", {
  code: varchar("code").primaryKey(),
  creatorUserId: varchar("creator_user_id").notNull(),
  creatorUsername: varchar("creator_username").notNull(),
  kind: varchar("kind").notNull(), // 'live' | 'daily'
  timeControl: varchar("time_control").notNull(),
  mode: varchar("mode").notNull().default("casual"),
  color: varchar("color").notNull().default("random"), // creator's colour: 'random' | 'white' | 'black'
  status: varchar("status").notNull().default("open"), // 'open' | 'accepted' | 'started' | 'cancelled' | requests: 'requested' | 'approved' | 'declined'
  // Open link: anyone can use it, again and again. Each use creates a
  // request row (parentCode = this code) that the creator must accept.
  open: boolean("open").notNull().default(false),
  parentCode: varchar("parent_code"),
  acceptedByUserId: varchar("accepted_by_user_id"),
  acceptedByUsername: varchar("accepted_by_username"),
  gameId: varchar("game_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});

export type GameChallenge = typeof gameChallengesTable.$inferSelect;

export type CorrespondenceGame = typeof correspondenceGamesTable.$inferSelect;
