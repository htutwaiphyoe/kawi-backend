import { describe, it, expect, beforeEach } from "bun:test";
import { eq } from "drizzle-orm";
import db from "@/db";
import { booksTable } from "@/features/books/books.model";
import { ordersTable } from "@/features/orders/orders.model";
import { ADDRESS, api, truncateAll, createUser, seedBook } from "./helpers";

beforeEach(truncateAll);

const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

const stockOf = async (id: string) => {
  const [b] = await db
    .select({ stock: booksTable.stock })
    .from(booksTable)
    .where(eq(booksTable.id, id))
    .limit(1);
  return b.stock;
};

describe("POST /orders", () => {
  it("creates an order, decrements stock, and snapshots items", async () => {
    const { token } = await createUser();
    const book = await seedBook({ price: "9.99", stock: 5 });

    const res = await api
      .post("/api/v1/orders")
      .set(bearer(token))
      .send({ address: ADDRESS, items: [{ bookId: book.id, quantity: 2 }] });

    expect(res.status).toBe(201);
    expect(res.body.order.total).toBe("19.98");
    expect(res.body.order.items).toHaveLength(1);
    expect(res.body.order.items[0].price).toBe("9.99");
    expect(res.body.order.items[0].title).toBe(book.title);
    expect(await stockOf(book.id)).toBe(3);
  });

  it("rejects insufficient stock and rolls back (stock unchanged)", async () => {
    const { token } = await createUser();
    const ok = await seedBook({ stock: 5 });
    const short = await seedBook({ stock: 1 });

    const res = await api
      .post("/api/v1/orders")
      .set(bearer(token))
      .send({ address: ADDRESS, items: [
          { bookId: ok.id, quantity: 1 },
          { bookId: short.id, quantity: 2 },
        ],
      });

    expect(res.status).toBe(400);
    // the first item's decrement must be rolled back
    expect(await stockOf(ok.id)).toBe(5);
    expect(await stockOf(short.id)).toBe(1);
  });

  it("snapshots the shipping address onto the order", async () => {
    const { token } = await createUser();
    const book = await seedBook({ stock: 3 });

    const created = await api
      .post("/api/v1/orders")
      .set(bearer(token))
      .send({ address: ADDRESS, items: [{ bookId: book.id, quantity: 1 }] });

    expect(created.status).toBe(201);
    expect(created.body.order.shippingAddress).toEqual(ADDRESS);

    const fetched = await api
      .get(`/api/v1/orders/${created.body.order.id}`)
      .set(bearer(token));

    expect(fetched.body.order.shippingAddress).toEqual(ADDRESS);
  });

  it("rejects an order with no shipping address (400)", async () => {
    const { token } = await createUser();
    const book = await seedBook({ stock: 3 });

    const res = await api
      .post("/api/v1/orders")
      .set(bearer(token))
      .send({ items: [{ bookId: book.id, quantity: 1 }] });

    expect(res.status).toBe(400);
  });

  it("rejects an incomplete shipping address (400)", async () => {
    const { token } = await createUser();
    const book = await seedBook({ stock: 3 });

    const res = await api
      .post("/api/v1/orders")
      .set(bearer(token))
      .send({
        address: { ...ADDRESS, city: "" },
        items: [{ bookId: book.id, quantity: 1 }],
      });

    expect(res.status).toBe(400);
  });

  it("rejects an empty item list (400)", async () => {
    const { token } = await createUser();
    const res = await api.post("/api/v1/orders").set(bearer(token)).send({ address: ADDRESS, items: [] });
    expect(res.status).toBe(400);
  });
});

describe("GET /orders — date range", () => {
  const placeOn = async (token: string, createdAt: string) => {
    const book = await seedBook({ stock: 5 });

    const created = await api
      .post("/api/v1/orders")
      .set(bearer(token))
      .send({ address: ADDRESS, items: [{ bookId: book.id, quantity: 1 }] });

    const orderId = created.body.order.id as string;

    await db
      .update(ordersTable)
      .set({ createdAt: new Date(createdAt) })
      .where(eq(ordersTable.id, orderId));

    return orderId;
  };

  const idsFrom = (res: { body: { orders: { id: string }[] } }) =>
    res.body.orders.map((order) => order.id);

  it("filters by from, to, and both together", async () => {
    const admin = await createUser("admin");

    const january = await placeOn(admin.token, "2026-01-10T09:00:00.000Z");
    const february = await placeOn(admin.token, "2026-02-15T09:00:00.000Z");
    const march = await placeOn(admin.token, "2026-03-20T09:00:00.000Z");

    const fromOnly = await api
      .get("/api/v1/orders?from=2026-02-01")
      .set(bearer(admin.token));
    expect(fromOnly.status).toBe(200);
    expect(idsFrom(fromOnly).sort()).toEqual([february, march].sort());

    const toOnly = await api
      .get("/api/v1/orders?to=2026-02-28")
      .set(bearer(admin.token));
    expect(idsFrom(toOnly).sort()).toEqual([january, february].sort());

    const both = await api
      .get("/api/v1/orders?from=2026-02-01&to=2026-02-28")
      .set(bearer(admin.token));
    expect(idsFrom(both)).toEqual([february]);
    expect(both.body.pagination.total).toBe(1);
  });

  it("treats to as inclusive of the whole day", async () => {
    const admin = await createUser("admin");

    const lateInTheDay = await placeOn(
      admin.token,
      "2026-02-15T23:59:59.000Z",
    );
    await placeOn(admin.token, "2026-02-16T00:00:01.000Z");

    const res = await api
      .get("/api/v1/orders?from=2026-02-15&to=2026-02-15")
      .set(bearer(admin.token));

    expect(res.status).toBe(200);
    expect(idsFrom(res)).toEqual([lateInTheDay]);
  });

  it("combines the date range with the status filter", async () => {
    const admin = await createUser("admin");

    const cancelled = await placeOn(admin.token, "2026-02-10T09:00:00.000Z");
    const pending = await placeOn(admin.token, "2026-02-11T09:00:00.000Z");
    await placeOn(admin.token, "2026-05-01T09:00:00.000Z");

    await api
      .patch(`/api/v1/orders/${cancelled}/cancel`)
      .set(bearer(admin.token));

    const res = await api
      .get("/api/v1/orders?from=2026-02-01&to=2026-02-28&status=pending")
      .set(bearer(admin.token));

    expect(res.status).toBe(200);
    expect(idsFrom(res)).toEqual([pending]);
  });

  it("scopes the range to the caller's own orders for a non-admin", async () => {
    const admin = await createUser("admin");
    const customer = await createUser();

    const mine = await placeOn(customer.token, "2026-02-10T09:00:00.000Z");
    const theirs = await placeOn(admin.token, "2026-02-11T09:00:00.000Z");

    const asCustomer = await api
      .get("/api/v1/orders?from=2026-02-01&to=2026-02-28")
      .set(bearer(customer.token));
    expect(idsFrom(asCustomer)).toEqual([mine]);

    const asAdmin = await api
      .get("/api/v1/orders?from=2026-02-01&to=2026-02-28")
      .set(bearer(admin.token));
    expect(idsFrom(asAdmin).sort()).toEqual([mine, theirs].sort());
  });

  it("rejects a malformed, impossible, or inverted range (400)", async () => {
    const { token } = await createUser("admin");

    for (const query of [
      "from=10-02-2026",
      "from=2026-2-1",
      "to=not-a-date",
      "from=2026-02-31",
      "from=2026-13-01",
      "from=2026-03-01&to=2026-02-01",
    ]) {
      const res = await api.get(`/api/v1/orders?${query}`).set(bearer(token));
      expect(res.status).toBe(400);
      expect(res.body.status).toBe("error");
    }
  });

  it("resolves the range in the caller's timezone when tzOffset is given", async () => {
    const admin = await createUser("admin");

    const lateOnTheThirtieth = await placeOn(
      admin.token,
      "2026-07-30T18:26:00.000Z",
    );
    const earlyOnTheThirtyFirst = await placeOn(
      admin.token,
      "2026-07-30T20:00:00.000Z",
    );

    const utc = await api
      .get("/api/v1/orders?from=2026-07-30&to=2026-07-30")
      .set(bearer(admin.token));
    expect(idsFrom(utc).sort()).toEqual(
      [lateOnTheThirtieth, earlyOnTheThirtyFirst].sort(),
    );

    const bangkok = await api
      .get("/api/v1/orders?from=2026-07-30&to=2026-07-30&tzOffset=-420")
      .set(bearer(admin.token));
    expect(idsFrom(bangkok)).toEqual([]);

    const bangkokNextDay = await api
      .get("/api/v1/orders?from=2026-07-31&to=2026-07-31&tzOffset=-420")
      .set(bearer(admin.token));
    expect(idsFrom(bangkokNextDay).sort()).toEqual(
      [lateOnTheThirtieth, earlyOnTheThirtyFirst].sort(),
    );
  });

  it("shifts the range west for a positive tzOffset", async () => {
    const admin = await createUser("admin");

    const beforeNewYorkMidnight = await placeOn(
      admin.token,
      "2026-07-31T03:00:00.000Z",
    );
    await placeOn(admin.token, "2026-07-31T05:00:00.000Z");

    const newYork = await api
      .get("/api/v1/orders?from=2026-07-30&to=2026-07-30&tzOffset=240")
      .set(bearer(admin.token));

    expect(idsFrom(newYork)).toEqual([beforeNewYorkMidnight]);
  });

  it("rejects an out-of-range tzOffset (400)", async () => {
    const { token } = await createUser("admin");

    for (const query of ["tzOffset=999", "tzOffset=abc", "tzOffset=1.5"]) {
      const res = await api.get(`/api/v1/orders?${query}`).set(bearer(token));
      expect(res.status).toBe(400);
    }
  });

  it("returns every order when no range is given", async () => {
    const admin = await createUser("admin");

    await placeOn(admin.token, "2020-01-01T09:00:00.000Z");
    await placeOn(admin.token, "2030-01-01T09:00:00.000Z");

    const res = await api.get("/api/v1/orders").set(bearer(admin.token));

    expect(res.status).toBe(200);
    expect(res.body.pagination.total).toBe(2);
  });
});

describe("GET /orders/:id", () => {
  it("lets the owner view but forbids another user (403)", async () => {
    const owner = await createUser();
    const other = await createUser();
    const book = await seedBook({ stock: 5 });

    const created = await api
      .post("/api/v1/orders")
      .set(bearer(owner.token))
      .send({ address: ADDRESS, items: [{ bookId: book.id, quantity: 1 }] });
    const orderId = created.body.order.id;

    const asOwner = await api.get(`/api/v1/orders/${orderId}`).set(bearer(owner.token));
    expect(asOwner.status).toBe(200);

    const asOther = await api.get(`/api/v1/orders/${orderId}`).set(bearer(other.token));
    expect(asOther.status).toBe(403);
  });
});

describe("PATCH /orders/:id/cancel", () => {
  it("cancels a pending order and restocks; a second cancel is 409", async () => {
    const { token } = await createUser();
    const book = await seedBook({ stock: 5 });

    const created = await api
      .post("/api/v1/orders")
      .set(bearer(token))
      .send({ address: ADDRESS, items: [{ bookId: book.id, quantity: 2 }] });
    const orderId = created.body.order.id;
    expect(await stockOf(book.id)).toBe(3);

    const cancel = await api
      .patch(`/api/v1/orders/${orderId}/cancel`)
      .set(bearer(token));
    expect(cancel.status).toBe(200);
    expect(cancel.body.order.status).toBe("cancelled");
    expect(await stockOf(book.id)).toBe(5); // restocked

    const again = await api
      .patch(`/api/v1/orders/${orderId}/cancel`)
      .set(bearer(token));
    expect(again.status).toBe(409);
  });
});
