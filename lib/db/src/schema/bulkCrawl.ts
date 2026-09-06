import { sql } from "drizzle-orm";
import { pgTable, varchar, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

// A simple resumable queue: usernames discovered from Chess.com
// leaderboards, plus every opponent found along the way (crawl
// expansion), each processed once. Living in Postgres rather than memory
// means the crawl survives a server restart/redeploy -- it just picks up
// wherever the queue says it left off.
export const bulkCrawlQueueTable = pgTable("bulk_crawl_queue", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: varchar("username").notNull(),
  platform: varchar("platform").notNull().default("chesscom"),
  status: varchar("status").notNull().default("pending"), // pending | done | failed
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("bulk_crawl_username_platform_unique").on(table.username, table.platform),
]);

export type BulkCrawlQueueRow = typeof bulkCrawlQueueTable.$inferSelect;
