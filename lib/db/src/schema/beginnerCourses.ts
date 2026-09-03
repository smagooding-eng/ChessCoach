import { pgTable, text, varchar, serial, timestamp, integer, boolean, jsonb } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// A step within a lesson. 'text' is pure explanation; 'board' shows a
// static position to illustrate a point (optionally with squares
// highlighted); 'practice' asks the learner to actually make a move on
// an interactive board, validated against expectedMoveSan.
export interface LessonStep {
  type: "text" | "board" | "practice" | "drill";
  text: string; // shown for every step type -- the explanation/instruction
  fen?: string; // board position, required for 'board' and 'practice' steps
  highlightSquares?: string[]; // squares to highlight, 'board' steps only
  expectedMoveSan?: string; // the move to validate against, 'practice' steps only
  // 'drill' steps: the learner makes ANY legal move with a randomly
  // placed piece, repeated 'reps' times with a fresh random position
  // each time -- for building real familiarity with a piece's full
  // range of movement, not just one memorized move.
  drillPiece?: "p" | "n" | "b" | "r" | "q" | "k";
  drillReps?: number;
}

export const beginnerCoursesTable = pgTable("beginner_courses", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  iconEmoji: text("icon_emoji").notNull().default("♟️"),
  orderIndex: integer("order_index").notNull().default(0),
  archived: boolean("archived").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const beginnerLessonsTable = pgTable("beginner_lessons", {
  id: serial("id").primaryKey(),
  courseId: integer("course_id").notNull().references(() => beginnerCoursesTable.id),
  title: text("title").notNull(),
  summary: text("summary").notNull(), // one-line hook shown on the lesson card
  steps: jsonb("steps").notNull().$type<LessonStep[]>(),
  orderIndex: integer("order_index").notNull().default(0),
  archived: boolean("archived").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const beginnerLessonProgressTable = pgTable("beginner_lesson_progress", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  lessonId: integer("lesson_id").notNull().references(() => beginnerLessonsTable.id),
  completed: boolean("completed").notNull().default(false),
  completedAt: timestamp("completed_at", { withTimezone: true }),
});

export const insertBeginnerCourseSchema = createInsertSchema(beginnerCoursesTable).omit({ id: true, createdAt: true });
export const insertBeginnerLessonSchema = createInsertSchema(beginnerLessonsTable).omit({ id: true, createdAt: true });
export type InsertBeginnerCourse = z.infer<typeof insertBeginnerCourseSchema>;
export type InsertBeginnerLesson = z.infer<typeof insertBeginnerLessonSchema>;
export type BeginnerCourse = typeof beginnerCoursesTable.$inferSelect;
export type BeginnerLesson = typeof beginnerLessonsTable.$inferSelect;
export type BeginnerLessonProgress = typeof beginnerLessonProgressTable.$inferSelect;
