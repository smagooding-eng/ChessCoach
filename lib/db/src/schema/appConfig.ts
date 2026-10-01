import { pgTable, varchar, text, timestamp } from "drizzle-orm/pg-core";

// Generic key-value store for global, admin-controlled flags that need
// to apply to every user identically -- not a per-account preference
// stored in each browser's localStorage (that's what SettingsContext.tsx
// is for), but a single shared value every client reads the same way.
// The dashboard redesign toggle is the first use of this; the table is
// generic on purpose so a future global flag doesn't need its own table.
export const appConfigTable = pgTable("app_config", {
  key: varchar("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  // The admin user id who last changed it -- a simple audit trail, not
  // enforced/required anywhere, just handy context if a value's origin
  // is ever in question.
  updatedBy: varchar("updated_by"),
});

export type AppConfig = typeof appConfigTable.$inferSelect;
