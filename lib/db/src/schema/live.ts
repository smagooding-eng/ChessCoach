import { pgTable, varchar, integer, real, text, timestamp, primaryKey, index } from "drizzle-orm/pg-core";

// These three tables were previously created only via raw `CREATE TABLE IF
// NOT EXISTS` SQL in index.ts, with no corresponding Drizzle schema. That
// meant `drizzle-kit push` had no record of them and interpreted their
// existence as "not part of the desired schema" — proposing to DROP them
// (with real data loss) the first time push ran against a database old
// enough to have them. Defining them here matches the exact structure
// already created, so push recognizes them as already correct and leaves
// them alone. The raw CREATE TABLE IF NOT EXISTS calls in index.ts can stay
// (harmless — they no-op once the tables exist) or be removed in favor of
// this schema being the source of truth going forward.

export const userLiveRatingsTable = pgTable("user_live_ratings", {
  userId: varchar("user_id").notNull(),
  timeControl: varchar("time_control").notNull(),
  rating: real("rating").notNull().default(1500),
  rd: real("rd").notNull().default(350),
  vol: real("vol").notNull().default(0.06),
  gamesPlayed: integer("games_played").notNull().default(0),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  primaryKey({ columns: [table.userId, table.timeControl] }),
]);

export const botPersonasTable = pgTable("bot_personas", {
  id: varchar("id").primaryKey(),
  username: varchar("username").notNull(),
  rating: integer("rating").notNull(),
  country: varchar("country"),
  title: varchar("title"),
  avatar: varchar("avatar"),
  memberSinceYear: integer("member_since_year"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const liveGamesTable = pgTable("live_games", {
  id: varchar("id").primaryKey(),
  mode: varchar("mode").notNull(),
  timeControl: varchar("time_control").notNull(),
  whiteUserId: varchar("white_user_id"),
  blackUserId: varchar("black_user_id"),
  whiteUsername: varchar("white_username").notNull(),
  blackUsername: varchar("black_username").notNull(),
  whitePersonaId: varchar("white_persona_id"),
  blackPersonaId: varchar("black_persona_id"),
  result: varchar("result").notNull(),
  termination: varchar("termination").notNull(),
  pgn: text("pgn").notNull(),
  whiteRatingBefore: real("white_rating_before"),
  blackRatingBefore: real("black_rating_before"),
  whiteRatingAfter: real("white_rating_after"),
  blackRatingAfter: real("black_rating_after"),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
  finishedAt: timestamp("finished_at", { withTimezone: true }).notNull(),
}, (table) => [
  index("idx_live_games_white_user").on(table.whiteUserId, table.finishedAt),
  index("idx_live_games_black_user").on(table.blackUserId, table.finishedAt),
]);
