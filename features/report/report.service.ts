import * as authorsService from "@/features/authors/authors.service";
import * as booksService from "@/features/books/books.service";
import * as ordersService from "@/features/orders/orders.service";
import * as usersService from "@/features/users/users.service";
import { localDayOf, localDayStart, localMonthStart } from "@/utils/day";
import type { ReportQuery } from "./report.dto";

const TREND_DAYS = 30;
const TOP_TITLES = 5;

const trendDays = (today: string, days: number) => {
  const start = new Date(`${today}T00:00:00.000Z`);

  start.setUTCDate(start.getUTCDate() - (days - 1));

  return Array.from({ length: days }, (_, index) => {
    const day = new Date(start);

    day.setUTCDate(day.getUTCDate() + index);

    return day.toISOString().slice(0, 10);
  });
};

export const getOverviewReport = async (query: ReportQuery) => {
  const now = new Date();

  const today = localDayOf(now, query.tzOffset);
  const dayStart = localDayStart(today, query.tzOffset);
  const monthStart = localMonthStart(now, query.tzOffset);

  const days = trendDays(today, TREND_DAYS);

  const [orders, byDay, topTitles, books, authors, customers] =
    await Promise.all([
      ordersService.getOrdersStats({ dayStart, monthStart }),
      ordersService.getRevenueByDay({
        since: localDayStart(days[0], query.tzOffset),
        tzOffset: query.tzOffset,
      }),
      ordersService.getTopTitles(TOP_TITLES),
      booksService.getBooksStats(monthStart),
      authorsService.getAuthorsStats(monthStart),
      usersService.getUsersStats(monthStart),
    ]);

  const measured = new Map(byDay.map((row) => [row.day, row]));

  const trend = days.map((day) => ({
    day,
    orders: measured.get(day)?.orders ?? 0,
    revenue: measured.get(day)?.revenue ?? "0",
  }));

  return {
    generatedAt: now.toISOString(),
    since: { day: dayStart.toISOString(), month: monthStart.toISOString() },
    orders,
    trend,
    topTitles,
    catalog: { books, authors },
    customers,
  };
};
