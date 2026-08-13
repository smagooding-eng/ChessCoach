import { pgTable, text, serial, timestamp, integer, boolean, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const coursesTable = pgTable("courses", {
  id: serial("id").primaryKey(),
  username: text("username").notNull(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  category: text("category").notNull(),
  difficulty: text("difficulty").notNull(),
  totalLessons: integer("total_lessons").notNull().default(0),
  completedLessons: integer("completed_lessons").notNull().default(0),
  archived: boolean("archived").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export interface LessonChallenge {
  fen: string;
  expectedMove: string;
  hint: string;
  contextPgn?: string | null;
}

export const lessonsTable = pgTable("lessons", {
  id: serial("id").primaryKey(),
  courseId: integer("course_id").notNull().references(() => coursesTable.id),
  title: text("title").notNull(),
  content: text("content").notNull(),
  orderIndex: integer("order_index").notNull().default(0),
  completed: text("completed").notNull().default("false"),
  examplePgn: text("example_pgn"),
  fixExamplePgn: text("fix_example_pgn"),
  drillFen: text("drill_fen"),
  drillExpectedMove: text("drill_expected_move"),
  drillHint: text("drill_hint"),
  // Additional real-game positions teaching the same concept as the
  // primary drill above — when present, the lesson becomes a themed
  // multi-challenge sequence (Challenge 1/N, 2/N, ...) instead of a
  // single drill. Each entry is grounded in a different real mistake
  // from the player's own games, same as the primary drill.
  extraChallenges: jsonb("extra_challenges").$type<LessonChallenge[]>(),
  conceptTitle: text("concept_title"),
  archived: boolean("archived").notNull().default(false),
});

export const insertCourseSchema = createInsertSchema(coursesTable).omit({ id: true, createdAt: true });
export const insertLessonSchema = createInsertSchema(lessonsTable).omit({ id: true });
export type InsertCourse = z.infer<typeof insertCourseSchema>;
export type InsertLesson = z.infer<typeof insertLessonSchema>;
export type Course = typeof coursesTable.$inferSelect;
export type Lesson = typeof lessonsTable.$inferSelect;
