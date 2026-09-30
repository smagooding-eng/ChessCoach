import { sql } from "drizzle-orm";
import { pgTable, varchar, text, timestamp, index } from "drizzle-orm/pg-core";

// One row per browser/device a user has granted notification permission
// on -- a single user can have several (phone + desktop), which is why
// this isn't just a column on usersTable. endpoint is the actual unique
// identity of a subscription (the browser vendor's push service URL for
// that specific device); p256dh/auth are the encryption keys the Web
// Push standard requires to encrypt the payload for that device.
export const pushSubscriptionsTable = pgTable("push_subscriptions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  endpoint: text("endpoint").notNull().unique(),
  p256dh: text("p256dh").notNull(),
  auth: text("auth").notNull(),
  // Free-text browser/OS hint from the client at subscribe time (e.g.
  // "Chrome on Windows") -- display-only, for the admin panel to show
  // what a user's device list looks like, not parsed or relied on.
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  // Updated on every successful send, and left alone on failures.
  // Distinguishes "this device stopped receiving pushes a while ago"
  // (likely uninstalled/revoked, worth pruning eventually) from a
  // healthy, currently-working subscription -- separate from createdAt,
  // which never changes after the first subscribe.
  lastSuccessAt: timestamp("last_success_at", { withTimezone: true }),
}, (table) => [
  index("idx_push_subscriptions_user").on(table.userId),
]);

export type PushSubscription = typeof pushSubscriptionsTable.$inferSelect;
