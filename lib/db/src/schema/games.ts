import { pgTable, text, serial, timestamp, integer, boolean, real } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const gamesTable = pgTable("games", {
  id: serial("id").primaryKey(),
  username: text("username").notNull(),
  pgn: text("pgn").notNull(),
  whiteUsername: text("white_username").notNull(),
  blackUsername: text("black_username").notNull(),
  whiteRating: integer("white_rating").notNull().default(0),
  blackRating: integer("black_rating").notNull().default(0),
  result: text("result").notNull(),
  timeControl: text("time_control").notNull(),
  opening: text("opening"),
  eco: text("eco"),
  playedAt: timestamp("played_at", { withTimezone: true }).notNull(),
  url: text("url"),
  analyzed: boolean("analyzed").notNull().default(false),
  analysisNotes: text("analysis_notes"),
  chesscomGameId: text("chesscom_game_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertGameSchema = createInsertSchema(gamesTable).omit({ id: true, createdAt: true });
export type InsertGame = z.infer<typeof insertGameSchema>;
export type Game = typeof gamesTable.$inferSelect;
