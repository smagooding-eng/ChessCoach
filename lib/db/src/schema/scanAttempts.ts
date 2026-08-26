import { sql } from "drizzle-orm";
import { pgTable, varchar, boolean, timestamp } from "drizzle-orm/pg-core";

// Tracks every Scan Position attempt (the AI photo-recognition flow only
// -- the manual "build your own position" editor doesn't call this route
// at all, so it's naturally unlimited and never logged here). Only rows
// with success=true count toward the free daily limit -- a failed scan
// (couldn't recognize the position) doesn't cost the user their quota.
export const scanAttemptsTable = pgTable("scan_attempts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  success: boolean("success").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
