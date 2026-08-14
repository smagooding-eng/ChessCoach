import { pgTable, text, serial, timestamp, integer, boolean, varchar, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const puzzlesTable = pgTable("puzzles", {
  id: serial("id").primaryKey(),
  lichessId: text("lichess_id"),
  fen: text("fen").notNull(),
  moves: text("moves").notNull(),
  rating: integer("rating").notNull().default(1200),
  themes: text("themes"),
  source: text("source").notNull().default("lichess"),
  gameId: integer("game_id"),
  moveNumber: integer("move_number"),
  explanation: text("explanation"),
  archived: boolean("archived").notNull().default(false),
  postedToFacebook: boolean("posted_to_facebook").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  // Partial (WHERE lichessId IS NOT NULL) since game-derived puzzles
  // (source "personal") don't have one.
  uniqueIndex("puzzles_lichess_id_unique")
    .on(table.lichessId)
    .where(sql`${table.lichessId} IS NOT NULL`),
]);

export const puzzleAttemptsTable = pgTable("puzzle_attempts", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull(),
  puzzleId: integer("puzzle_id").notNull(),
  solved: boolean("solved").notNull(),
  timeMs: integer("time_ms"),
  attemptedAt: timestamp("attempted_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("puzzle_attempts_user_puzzle_unique").on(table.userId, table.puzzleId),
]);

export type Puzzle = typeof puzzlesTable.$inferSelect;
export type PuzzleAttempt = typeof puzzleAttemptsTable.$inferSelect;
