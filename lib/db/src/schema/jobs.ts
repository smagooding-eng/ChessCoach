import { sql } from "drizzle-orm";
import { index, jsonb, pgTable, timestamp, varchar } from "drizzle-orm/pg-core";

export const backgroundJobsTable = pgTable(
  "background_jobs",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    userId: varchar("user_id").notNull(),
    type: varchar("type").notNull(),
    status: varchar("status").notNull().default("pending"),
    targetUsername: varchar("target_username"),
    result: jsonb("result"),
    error: varchar("error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => [
    index("idx_jobs_user_type").on(table.userId, table.type),
    index("idx_jobs_status").on(table.status),
  ],
);
