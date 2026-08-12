import { sql } from "drizzle-orm";
import { text, timestamp, pgTable, varchar, boolean } from "drizzle-orm/pg-core";

export const seoArticlesTable = pgTable("seo_articles", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  slug: varchar("slug").notNull().unique(),
  title: text("title").notNull(),
  targetKeyword: text("target_keyword").notNull(),
  metaDescription: text("meta_description").notNull(),
  content: text("content").notNull(), // markdown
  published: boolean("published").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type SeoArticle = typeof seoArticlesTable.$inferSelect;
