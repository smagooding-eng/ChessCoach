import { pgTable, text, serial, timestamp, real, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const weaknessesTable = pgTable("weaknesses", {
  id: serial("id").primaryKey(),
  username: text("username").notNull(),
  category: text("category").notNull(),
  severity: text("severity").notNull(),
  description: text("description").notNull(),
  frequency: real("frequency").notNull().default(0),
  examples: text("examples").array().notNull().default([]),
  relatedGameIds: integer("related_game_ids").array().notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertWeaknessSchema = createInsertSchema(weaknessesTable).omit({ id: true, createdAt: true });
export type InsertWeakness = z.infer<typeof insertWeaknessSchema>;
export type Weakness = typeof weaknessesTable.$inferSelect;
