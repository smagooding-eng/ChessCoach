import { pgTable, text, varchar, serial, timestamp, integer, boolean, jsonb } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// A single classic chess trap -- e.g. Scholar's Mate, Legal's Trap,
// Fried Liver Attack. Each trap has two training modes built from the
// same underlying data: "commit" (play the trapping side and execute
// the sequence against a bot playing the natural losing moves) and
// "avoid" (play the defending side; the bot sets the trap, and the
// critical moment is where the user must find the safe move instead
// of the natural-looking losing one).
export const chessTrapsTable = pgTable("chess_traps", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  // Opening family this trap belongs to, e.g. "Italian Game", "Caro-Kann".
  category: text("category").notNull(),
  difficulty: text("difficulty").notNull(), // 'beginner' | 'intermediate' | 'advanced'
  // Which side sets the trap -- determines whose moves the "commit"
  // mode has the user play, and whose moves "avoid" mode has the bot play.
  trapSide: text("trap_side").notNull(), // 'white' | 'black'
  summary: text("summary").notNull(), // one-line hook, shown on the card
  explanation: text("explanation").notNull(), // why the trap works, shown as the static fallback
  startingFen: text("starting_fen").notNull(),
  // The full move sequence in SAN, from startingFen, showing the trap
  // executed against the natural (losing) defense. Used directly for
  // "commit" mode -- the user plays the trapSide's moves, a fixed bot
  // plays the other side's scripted natural replies.
  trapLineSan: jsonb("trap_line_san").notNull().$type<string[]>(),
  // One short note per move, parallel array to trapLineSan -- explains
  // what that specific move does and why, shown live as training
  // progresses so the user isn't guessing blindly which piece to move.
  moveNotes: jsonb("move_notes").notNull().default([]).$type<string[]>(),
  // Index into trapLineSan of the critical mistake -- the move the
  // defender should NOT play. "Avoid" mode plays the bot's moves up to
  // (not including) this index, then asks the user to find a safe
  // alternative instead of falling into it.
  criticalMoveIndex: integer("critical_move_index").notNull(),
  // Accepted safe alternative(s) at the critical moment, in SAN. Any of
  // these counts as successfully avoiding the trap.
  safeMovesSan: jsonb("safe_moves_san").notNull().$type<string[]>(),
  orderIndex: integer("order_index").notNull().default(0),
  archived: boolean("archived").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Per-user completion tracking, separate per mode since committing and
// avoiding a trap are genuinely different skills.
export const trapProgressTable = pgTable("trap_progress", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  trapId: integer("trap_id").notNull().references(() => chessTrapsTable.id),
  mode: text("mode").notNull(), // 'commit' | 'avoid'
  completed: boolean("completed").notNull().default(false),
  attempts: integer("attempts").notNull().default(0),
  lastAttemptAt: timestamp("last_attempt_at", { withTimezone: true }),
});

export const insertChessTrapSchema = createInsertSchema(chessTrapsTable).omit({ id: true, createdAt: true });
export type InsertChessTrap = z.infer<typeof insertChessTrapSchema>;
export type ChessTrap = typeof chessTrapsTable.$inferSelect;
export type TrapProgress = typeof trapProgressTable.$inferSelect;
