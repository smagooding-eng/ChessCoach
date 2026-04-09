import { pgTable, text, serial, timestamp, integer, boolean, varchar } from "drizzle-orm/pg-core";

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
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const puzzleAttemptsTable = pgTable("puzzle_attempts", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull(),
  puzzleId: integer("puzzle_id").notNull(),
  solved: boolean("solved").notNull(),
  timeMs: integer("time_ms"),
  attemptedAt: timestamp("attempted_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Puzzle = typeof puzzlesTable.$inferSelect;
export type PuzzleAttempt = typeof puzzleAttemptsTable.$inferSelect;
