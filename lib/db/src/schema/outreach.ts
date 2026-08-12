import { sql } from "drizzle-orm";
import { text, timestamp, pgTable, varchar } from "drizzle-orm/pg-core";

export const outreachLeadsTable = pgTable("outreach_leads", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  platform: varchar("platform").notNull(), // reddit | twitter | discord | forum | other
  sourceUrl: text("source_url"),
  context: text("context").notNull(), // what the prospect actually said/asked — the raw material for a tailored reply
  draftContent: text("draft_content"),
  status: varchar("status").notNull().default("new"), // new | drafted | posted | skipped
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type OutreachLead = typeof outreachLeadsTable.$inferSelect;
