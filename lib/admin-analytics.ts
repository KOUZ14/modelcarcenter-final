export type AdminAnalyticsReport = {
  checkedAt: string;
  measurementEnabled: boolean;
  accounts: { total: number; verified: number; sellers: number };
  registrations: Array<{ day: string; accounts: number }>;
  activity: Array<{ day: string; name: string; events: number }>;
  traffic: {
    visitors: { 7: number; 30: number; 90: number };
    daily: Array<{ day: string; visitors: number; views: number }>;
    breakdown: Array<{ day: string; page: string; source: string; views: number }>;
  };
};

// Return aggregates only: no account identities or authentication/session data.
export async function getAdminAnalytics(db: D1Database, measurementEnabled: boolean, now = new Date()): Promise<AdminAnalyticsReport> {
  const today = now.toISOString().slice(0, 10);
  const start = new Date(`${today}T00:00:00.000Z`);
  start.setUTCDate(start.getUTCDate() - 89);
  const startDay = start.toISOString().slice(0, 10);
  const dayAgo = (days: number) => new Date(Date.parse(`${today}T00:00:00Z`) - days * 86400000).toISOString().slice(0, 10);
  const [accounts, registrations, activity, visitors, trafficDaily, breakdown] = await Promise.all([
    db.prepare(`SELECT COUNT(*) AS total,
      COALESCE(SUM(u.email_verified = 1), 0) AS verified,
      COALESCE(SUM(EXISTS(SELECT 1 FROM sellers s WHERE s.owner_user_id = u.id)), 0) AS sellers
      FROM "user" u`).first<AdminAnalyticsReport["accounts"]>(),
    db.prepare(`SELECT date(created_at / 1000, 'unixepoch') AS day, COUNT(*) AS accounts
      FROM "user" WHERE created_at >= ? AND created_at <= ?
      GROUP BY day ORDER BY day`).bind(start.getTime(), now.getTime()).all<AdminAnalyticsReport["registrations"][number]>(),
    db.prepare(`SELECT day, name, COUNT(*) AS events FROM task_measurements
      WHERE day >= ? AND day <= ? GROUP BY day, name ORDER BY day, name`)
      .bind(startDay, today).all<AdminAnalyticsReport["activity"][number]>(),
    db.prepare(`SELECT COUNT(DISTINCT CASE WHEN day >= ? THEN visitor_id END) AS week,
      COUNT(DISTINCT CASE WHEN day >= ? THEN visitor_id END) AS month,
      COUNT(DISTINCT visitor_id) AS quarter FROM traffic_measurements WHERE day >= ? AND day <= ?`)
      .bind(dayAgo(6), dayAgo(29), startDay, today).first<{ week: number; month: number; quarter: number }>(),
    db.prepare(`SELECT day, COUNT(*) AS views, COUNT(DISTINCT visitor_id) AS visitors
      FROM traffic_measurements WHERE day >= ? AND day <= ? GROUP BY day ORDER BY day`)
      .bind(startDay, today).all<AdminAnalyticsReport["traffic"]["daily"][number]>(),
    db.prepare(`SELECT day, page, source, COUNT(*) AS views FROM traffic_measurements
      WHERE day >= ? AND day <= ? GROUP BY day, page, source ORDER BY day`)
      .bind(startDay, today).all<AdminAnalyticsReport["traffic"]["breakdown"][number]>(),
  ]);
  return {
    checkedAt: now.toISOString(), measurementEnabled,
    accounts: accounts ?? { total: 0, verified: 0, sellers: 0 },
    registrations: registrations.results ?? [], activity: activity.results ?? [],
    traffic: {
      visitors: { 7: visitors?.week ?? 0, 30: visitors?.month ?? 0, 90: visitors?.quarter ?? 0 },
      daily: trafficDaily.results ?? [], breakdown: breakdown.results ?? [],
    },
  };
}

export function summarizeAdminAnalytics(report: AdminAnalyticsReport, days: 7 | 30 | 90) {
  const end = new Date(`${report.checkedAt.slice(0, 10)}T00:00:00.000Z`);
  const daily = Array.from({ length: days }, (_, index) => {
    const date = new Date(end);
    date.setUTCDate(date.getUTCDate() - days + index + 1);
    return { day: date.toISOString().slice(0, 10), accounts: 0, events: 0, views: 0, visitors: 0 };
  });
  const byDay = new Map(daily.map(row => [row.day, row]));
  const events: Record<string, number> = {};
  for (const row of report.registrations) {
    const day = byDay.get(row.day);
    if (day) day.accounts += row.accounts;
  }
  for (const row of report.activity) {
    const day = byDay.get(row.day);
    if (!day) continue;
    day.events += row.events;
    events[row.name] = (events[row.name] ?? 0) + row.events;
  }
  for (const row of report.traffic.daily) {
    const day = byDay.get(row.day);
    if (day) { day.views = row.views; day.visitors = row.visitors; }
  }
  const pages: Record<string, number> = {}, sources: Record<string, number> = {};
  for (const row of report.traffic.breakdown) {
    if (!byDay.has(row.day)) continue;
    pages[row.page] = (pages[row.page] ?? 0) + row.views;
    sources[row.source] = (sources[row.source] ?? 0) + row.views;
  }
  return {
    daily, events, start: daily[0].day, end: daily[daily.length - 1].day,
    newAccounts: daily.reduce((sum, row) => sum + row.accounts, 0),
    totalEvents: daily.reduce((sum, row) => sum + row.events, 0),
    views: daily.reduce((sum, row) => sum + row.views, 0),
    visitors: report.traffic.visitors[days], pages, sources,
  };
}
