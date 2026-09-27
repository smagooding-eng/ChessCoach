import { sql } from "drizzle-orm";
import { pgTable, varchar, text, integer, timestamp } from "drizzle-orm/pg-core";

// Amazon affiliate shop -- admin-managed list of product links shown on
// the /shop page. Deliberately just links out to Amazon (with Shann's
// affiliate tag already baked into amazonUrl) rather than tracking
// inventory, checkout, or fulfillment of any kind -- there is none,
// Amazon handles the entire purchase.
export const shopItemsTable = pgTable("shop_items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  title: varchar("title").notNull(),
  description: text("description"),
  imageUrl: text("image_url"),
  amazonUrl: text("amazon_url").notNull(),
  // Display-only text (e.g. "$49.99" or "Around $50") -- not synced with
  // Amazon's live price in any way, since there's no product API
  // integration here. Admin updates this by hand if the price drifts
  // enough to matter.
  priceLabel: varchar("price_label"),
  // Lower sorts first. Lets the admin manually curate display order
  // (e.g. featuring one board over another) without relying on
  // insertion order or alphabetical sorting.
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type ShopItem = typeof shopItemsTable.$inferSelect;
