import { sql } from "drizzle-orm";
import { pgTable, varchar, timestamp, integer } from "drizzle-orm/pg-core";

// Landing page funnel tracking -- deliberately separate from pageViewsTable
// (which just logs raw page visits) since this tracks specific funnel
// steps: did the visitor start Mia, skip her, click signup, or leave
// without doing anything. This lets the admin panel show exactly where
// people drop off the landing page.
export const landingFunnelEventsTable = pgTable("landing_funnel_events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  visitorId: varchar("visitor_id").notNull(),
  eventType: varchar("event_type").notNull(), // 'landing_view' | 'mia_started' | 'mia_skipped' | 'signup_clicked' | 'signup_completed'
  // 'web' = regular browser tab, 'app' = installed PWA (standalone display
  // mode / iOS "Add to Home Screen"). Defaults to 'web' for any row written
  // before this column existed, since that's what every visit was at the
  // time -- the PWA install flow launched later.
  platform: varchar("platform").notNull().default("web"),
  // Milliseconds since page load, captured at the moment an exit_<section>
  // event fires. Null for every other event type, where it isn't
  // meaningful. Lets the admin panel answer "when" someone left a
  // section, not just "where" -- e.g. the average time on page before
  // people abandon the Hero specifically.
  elapsedMs: integer("elapsed_ms"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type LandingFunnelEvent = typeof landingFunnelEventsTable.$inferSelect;
