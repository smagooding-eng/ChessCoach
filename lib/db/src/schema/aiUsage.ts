import { sql } from "drizzle-orm";
import { pgTable, varchar, integer, timestamp } from "drizzle-orm/pg-core";

// Every OpenAI call, anywhere in the app, gets one row here via
// trackAiUsage() in lib/aiUsageTracker.ts. userId is nullable because a
// few call sites (SEO article generation, puzzle seeding) run as
// background jobs with no user attached -- those still matter for total
// spend, just not for "which customer is this costing me money on."
// feature is a short fixed slug per call site (see AI_FEATURES in
// aiUsageTracker.ts) rather than a free-text label, so the admin
// breakdown can group cleanly instead of fragmenting into near-duplicate
// strings over time.
export const aiUsageEventsTable = pgTable("ai_usage_events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id"),
  feature: varchar("feature").notNull(),
  model: varchar("model").notNull(),
  promptTokens: integer("prompt_tokens").notNull().default(0),
  completionTokens: integer("completion_tokens").notNull().default(0),
  totalTokens: integer("total_tokens").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type AiUsageEvent = typeof aiUsageEventsTable.$inferSelect;
