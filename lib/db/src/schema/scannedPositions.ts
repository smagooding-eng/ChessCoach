import { pgTable, text, serial, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";

export const scannedPositionsTable = pgTable("scanned_positions", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  fen: text("fen").notNull(),
  label: text("label"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertScannedPositionSchema = createInsertSchema(scannedPositionsTable).omit({ id: true, createdAt: true });
