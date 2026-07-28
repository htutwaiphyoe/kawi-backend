import { describe, it, expect, beforeEach } from "bun:test";
import { eq } from "drizzle-orm";
import db from "@/db";
import { booksTable } from "@/features/books/books.model";
import { api, truncateAll, createUser, seedBook } from "./helpers";

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
      .send({ items: [{ bookId: book.id, quantity: 2 }] });

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
      .send({
        items: [
          { bookId: ok.id, quantity: 1 },
          { bookId: short.id, quantity: 2 },
        ],
      });

    expect(res.status).toBe(400);
    // the first item's decrement must be rolled back
    expect(await stockOf(ok.id)).toBe(5);
    expect(await stockOf(short.id)).toBe(1);
  });

  it("rejects an empty item list (400)", async () => {
    const { token } = await createUser();
    const res = await api.post("/api/v1/orders").set(bearer(token)).send({ items: [] });
    expect(res.status).toBe(400);
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
      .send({ items: [{ bookId: book.id, quantity: 1 }] });
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
      .send({ items: [{ bookId: book.id, quantity: 2 }] });
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
