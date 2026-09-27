/** Maintenance accepts its database explicitly; it does not need request auth. */
export async function pruneMeasurementRecords(database: D1Database, now = new Date()) {
  const cutoff = new Date(now.getTime() - 90 * 86400000).toISOString().slice(0, 10);
  await database.prepare("DELETE FROM task_measurements WHERE day < ?").bind(cutoff).run();
}
