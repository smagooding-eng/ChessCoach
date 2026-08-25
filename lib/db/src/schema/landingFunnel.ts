import { sql } from "drizzle-orm";
import { pgTable, varchar, timestamp } from "drizzle-orm/pg-core";

// Landing page funnel tracking -- deliberately separate from pageViewsTable
// (which just logs raw page visits) since this tracks specific funnel
// steps: did the visitor start Mia, skip her, click signup, or leave
// without doing anything. This lets the admin panel show exactly where
// people drop off the landing page.
export const landingFunnelEventsTable = pgTable("landing_funnel_events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  visitorId: varchar("visitor_id").notNull(),
  eventType: varchar("event_type").notNull(), // 'landing_view' | 'mia_started' | 'mia_skipped' | 'signup_clicked' | 'signup_completed'
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type LandingFunnelEvent = typeof landingFunnelEventsTable.$inferSelect;
