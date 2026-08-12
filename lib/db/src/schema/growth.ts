import { sql } from "drizzle-orm";
import { timestamp, pgTable, uniqueIndex, varchar } from "drizzle-orm/pg-core";

export const emailDripLogTable = pgTable("email_drip_log", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  dripType: varchar("drip_type").notNull(),
  sentAt: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("idx_drip_user_type").on(table.userId, table.dripType),
]);
