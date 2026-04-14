import { sql } from "drizzle-orm";
import { boolean, index, jsonb, pgTable, text, timestamp, varchar } from "drizzle-orm/pg-core";

export const growthCredentialsTable = pgTable("growth_credentials", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  platform: varchar("platform").notNull().unique(),
  credentials: text("credentials").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const growthCampaignsTable = pgTable("growth_campaigns", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name").notNull(),
  theme: varchar("theme").notNull(),
  platforms: jsonb("platforms").notNull().$type<string[]>(),
  frequency: varchar("frequency").notNull(),
  customNote: text("custom_note"),
  status: varchar("status").notNull().default("active"),
  nextRunAt: timestamp("next_run_at", { withTimezone: true }),
  lastRunAt: timestamp("last_run_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  index("idx_campaigns_status").on(table.status),
  index("idx_campaigns_next_run").on(table.nextRunAt),
]);

export const growthPostLogTable = pgTable("growth_post_log", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  campaignId: varchar("campaign_id"),
  platform: varchar("platform").notNull(),
  content: text("content").notNull(),
  title: text("title"),
  status: varchar("status").notNull().default("pending"),
  error: text("error"),
  externalId: varchar("external_id"),
  postedAt: timestamp("posted_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("idx_post_log_campaign").on(table.campaignId),
  index("idx_post_log_platform").on(table.platform),
  index("idx_post_log_posted").on(table.postedAt),
]);

export const emailDripLogTable = pgTable("email_drip_log", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  dripType: varchar("drip_type").notNull(),
  sentAt: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("idx_drip_user_type").on(table.userId, table.dripType),
]);
