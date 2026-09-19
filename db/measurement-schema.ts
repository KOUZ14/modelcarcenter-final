import { integer, sqliteTable, text, index } from "drizzle-orm/sqlite-core";
export const taskMeasurements = sqliteTable("task_measurements", {
  id: text("id").primaryKey(), name: text("name").notNull(), day: text("day").notNull(),
  step: text("step").notNull().default(""), result: text("result").notNull().default(""),
  count: integer("count"), durationMs: integer("duration_ms"),
}, table => [index("task_measurements_day").on(table.day, table.name)]);
