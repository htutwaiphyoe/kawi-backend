import { beforeEach, describe, expect, it } from "bun:test";
import { eq } from "drizzle-orm";
import db from "@/db";
import { ordersTable } from "@/features/orders/orders.model";
import { ADDRESS, api, createUser, seedBook, truncateAll } from "./helpers";

beforeEach(truncateAll);

const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

const placeOrder = async (
  token: string,
  options: { price: string; createdAt?: string; status?: string } = {
    price: "10.00",
  },
) => {
  const book = await seedBook({ price: options.price, stock: 5 });

  const created = await api
    .post("/api/v1/orders")
    .set(bearer(token))
    .send({ address: ADDRESS, items: [{ bookId: book.id, quantity: 1 }] });

  const orderId = created.body.order.id as string;

  if (options.createdAt) {
    await db
      .update(ordersTable)
      .set({ createdAt: new Date(options.createdAt) })
      .where(eq(ordersTable.id, orderId));
  }

  return orderId;
};

const advance = async (token: string, orderId: string, status: string) => {
  await api
    .patch(`/api/v1/orders/${orderId}/status`)
    .set(bearer(token))
    .send({ status });
};

const fetchReport = async (token: string, query = "") => {
  const res = await api.get(`/api/v1/report${query}`).set(bearer(token));

  expect(res.status).toBe(200);

  return res.body.report;
};

describe("GET /report", () => {
  it("requires an admin", async () => {
    const anonymous = await api.get("/api/v1/report");
    expect(anonymous.status).toBe(401);

    const customer = await createUser();
    const asCustomer = await api
      .get("/api/v1/report")
      .set(bearer(customer.token));
    expect(asCustomer.status).toBe(403);

    const publisher = await createUser("publisher");
    const asPublisher = await api
      .get("/api/v1/report")
      .set(bearer(publisher.token));
    expect(asPublisher.status).toBe(403);
  });

  it("counts only paid and shipped orders as revenue", async () => {
    const admin = await createUser("admin");

    const paid = await placeOrder(admin.token, { price: "10.00" });
    const shipped = await placeOrder(admin.token, { price: "25.50" });
    const cancelled = await placeOrder(admin.token, { price: "99.99" });
    await placeOrder(admin.token, { price: "40.00" });

    await advance(admin.token, paid, "paid");
    await advance(admin.token, shipped, "paid");
    await advance(admin.token, shipped, "shipped");
    await api
      .patch(`/api/v1/orders/${cancelled}/cancel`)
      .set(bearer(admin.token));

    const report = await fetchReport(admin.token);

    expect(report.orders.allTime.revenue).toBe("35.50");
    expect(report.orders.allTime.orders).toBe(2);

    expect(report.orders.awaiting.value).toBe("40.00");
    expect(report.orders.awaiting.orders).toBe(1);

    expect(report.orders.byStatus).toEqual({
      pending: 1,
      paid: 1,
      shipped: 1,
      cancelled: 1,
    });
    expect(report.orders.placed).toBe(4);
  });

  it("reports zero revenue as a numeric string, not null", async () => {
    const admin = await createUser("admin");

    const report = await fetchReport(admin.token);

    expect(report.orders.allTime.revenue).toBe("0");
    expect(report.orders.today.revenue).toBe("0");
    expect(report.orders.awaiting.value).toBe("0");
    expect(report.orders.placed).toBe(0);
  });

  it("scopes today and this month to the caller's timezone", async () => {
    const admin = await createUser("admin");

    const order = await placeOrder(admin.token, { price: "12.00" });
    await advance(admin.token, order, "paid");

    const now = new Date();
    const SEVEN_HOURS = 7 * 60 * 60_000;

    const utc = await fetchReport(admin.token);
    const bangkok = await fetchReport(admin.token, "?tzOffset=-420");

    expect(utc.since.day).toBe(`${now.toISOString().slice(0, 10)}T00:00:00.000Z`);

    const bangkokDay = new Date(now.getTime() + SEVEN_HOURS)
      .toISOString()
      .slice(0, 10);
    expect(bangkok.since.day).toBe(
      new Date(
        Date.parse(`${bangkokDay}T00:00:00.000Z`) - SEVEN_HOURS,
      ).toISOString(),
    );

    expect(new Date(bangkok.since.month).getTime()).toBeLessThanOrEqual(
      new Date(bangkok.since.day).getTime(),
    );

    // "now" falls inside today in either timezone
    expect(utc.orders.today.orders).toBe(1);
    expect(bangkok.orders.today.orders).toBe(1);
  });

  it("excludes orders from before today and before this month", async () => {
    const admin = await createUser("admin");

    const old = await placeOrder(admin.token, {
      price: "77.00",
      createdAt: "2020-02-05T09:00:00.000Z",
    });
    await advance(admin.token, old, "paid");

    const report = await fetchReport(admin.token);

    expect(report.orders.allTime.revenue).toBe("77.00");
    expect(report.orders.today.revenue).toBe("0");
    expect(report.orders.today.orders).toBe(0);
    expect(report.orders.month.orders).toBe(0);
  });

  it("summarises the catalog and the customer base", async () => {
    const admin = await createUser("admin");
    await createUser();

    await seedBook({ stock: 3 });
    await seedBook({ stock: 0 });

    const report = await fetchReport(admin.token);

    expect(report.catalog.books.total).toBe(2);
    expect(report.catalog.books.addedSince).toBe(2);
    expect(report.catalog.books.outOfStock).toBe(1);

    expect(report.catalog.authors.total).toBeGreaterThanOrEqual(1);

    expect(report.customers.total).toBe(2);
    expect(report.customers.joinedSince).toBe(2);
  });

  it("rejects an out-of-range tzOffset (400)", async () => {
    const admin = await createUser("admin");

    for (const query of ["?tzOffset=999", "?tzOffset=abc"]) {
      const res = await api.get(`/api/v1/report${query}`).set(bearer(admin.token));
      expect(res.status).toBe(400);
    }
  });
});

describe("GET /report — charts", () => {
  it("returns a gap-free 30 day trend ending today", async () => {
    const admin = await createUser("admin");

    const report = await fetchReport(admin.token);

    expect(report.trend).toHaveLength(30);

    const days = report.trend.map((point: { day: string }) => point.day);
    expect(new Set(days).size).toBe(30);
    expect(days).toEqual([...days].sort());
    expect(days.at(-1)).toBe(new Date().toISOString().slice(0, 10));

    for (const point of report.trend) {
      expect(point.orders).toBe(0);
      expect(point.revenue).toBe("0");
    }
  });

  it("places settled revenue on the day it was earned", async () => {
    const admin = await createUser("admin");

    const today = await placeOrder(admin.token, { price: "20.00" });
    await advance(admin.token, today, "paid");

    const yesterdayAt = new Date();
    yesterdayAt.setUTCDate(yesterdayAt.getUTCDate() - 1);
    yesterdayAt.setUTCHours(12, 0, 0, 0);

    const earlier = await placeOrder(admin.token, {
      price: "5.00",
      createdAt: yesterdayAt.toISOString(),
    });
    await advance(admin.token, earlier, "paid");

    const report = await fetchReport(admin.token);
    const byDay = new Map(
      report.trend.map((point: { day: string; revenue: string }) => [
        point.day,
        point.revenue,
      ]),
    );

    expect(byDay.get(new Date().toISOString().slice(0, 10))).toBe("20.00");
    expect(byDay.get(yesterdayAt.toISOString().slice(0, 10))).toBe("5.00");
  });

  it("groups trend days in the caller's timezone", async () => {
    const admin = await createUser("admin");

    // 18:30 UTC yesterday is still yesterday in UTC, but already today in UTC+7
    const at = new Date();
    at.setUTCDate(at.getUTCDate() - 1);
    at.setUTCHours(18, 30, 0, 0);

    const order = await placeOrder(admin.token, {
      price: "9.00",
      createdAt: at.toISOString(),
    });
    await advance(admin.token, order, "paid");

    const utcDay = at.toISOString().slice(0, 10);
    const bangkokDay = new Date(at.getTime() + 7 * 60 * 60_000)
      .toISOString()
      .slice(0, 10);
    expect(bangkokDay).not.toBe(utcDay);

    const utc = await fetchReport(admin.token);
    const bangkok = await fetchReport(admin.token, "?tzOffset=-420");

    const revenueOn = (report: { trend: { day: string; revenue: string }[] }, day: string) =>
      report.trend.find((point) => point.day === day)?.revenue;

    expect(revenueOn(utc, utcDay)).toBe("9.00");
    expect(revenueOn(bangkok, bangkokDay)).toBe("9.00");
    expect(revenueOn(bangkok, utcDay)).toBe("0");
  });

  it("ranks the top titles by units sold, settled orders only", async () => {
    const admin = await createUser("admin");

    const popular = await seedBook({ price: "10.00", stock: 20 });
    const quiet = await seedBook({ price: "50.00", stock: 20 });
    const unpaid = await seedBook({ price: "99.00", stock: 20 });

    const big = await api
      .post("/api/v1/orders")
      .set(bearer(admin.token))
      .send({
        address: ADDRESS,
        items: [
          { bookId: popular.id, quantity: 6 },
          { bookId: quiet.id, quantity: 2 },
        ],
      });
    await advance(admin.token, big.body.order.id, "paid");

    await api
      .post("/api/v1/orders")
      .set(bearer(admin.token))
      .send({ address: ADDRESS, items: [{ bookId: unpaid.id, quantity: 9 }] });

    const report = await fetchReport(admin.token);

    expect(report.topTitles).toHaveLength(2);
    expect(report.topTitles[0].title).toBe(popular.title);
    expect(report.topTitles[0].units).toBe(6);
    expect(report.topTitles[0].revenue).toBe("60.00");
    expect(report.topTitles[1].units).toBe(2);
    expect(report.topTitles[1].revenue).toBe("100.00");
  });
});
