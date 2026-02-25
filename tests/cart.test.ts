import { describe, it, expect, beforeEach } from "bun:test";
import { eq } from "drizzle-orm";
import db from "@/db";
import { booksTable } from "@/features/books/books.model";
import { ordersTable } from "@/features/orders/orders.model";
import { api, truncateAll, createUser, seedBook } from "./helpers";

beforeEach(truncateAll);

const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

const stockOf = async (id: string) => {
  const [book] = await db
    .select({ stock: booksTable.stock })
    .from(booksTable)
    .where(eq(booksTable.id, id))
    .limit(1);
  return book.stock;
};

const orderCount = async () => {
  const rows = await db.select({ id: ordersTable.id }).from(ordersTable);
  return rows.length;
};

const addItem = (token: string, bookId: string, quantity?: number) =>
  api
    .post("/api/v1/cart/items")
    .set(bearer(token))
    .send(quantity === undefined ? { bookId } : { bookId, quantity });

type CartLine = { id: string; bookId: string };

const itemIdFor = async (token: string, bookId: string) => {
  const res = await api.get("/api/v1/cart").set(bearer(token));
  const line = (res.body.cart.items as CartLine[]).find(
    (item) => item.bookId === bookId,
  );
  return line?.id ?? "00000000-0000-0000-0000-000000000000";
};

describe("GET /cart", () => {
  it("returns an empty cart for a new user", async () => {
    const { token } = await createUser();

    const res = await api.get("/api/v1/cart").set(bearer(token));

    expect(res.status).toBe(200);
    expect(res.body.cart).toEqual({
      items: [],
      subtotal: "0.00",
      itemCount: 0,
      hasUnavailableItems: false,
    });
  });

  it("requires authentication", async () => {
    const res = await api.get("/api/v1/cart");

    expect(res.status).toBe(401);
  });

  it("resolves title, cover and price from the book", async () => {
    const { token } = await createUser();
    const book = await seedBook({
      price: "12.50",
      stock: 4,
      coverUrl: "https://example.com/cover.jpg",
    });

    await addItem(token, book.id, 2);
    const res = await api.get("/api/v1/cart").set(bearer(token));

    expect(res.body.cart.items[0]).toEqual({
      id: expect.any(String),
      bookId: book.id,
      title: book.title,
      coverUrl: "https://example.com/cover.jpg",
      price: "12.50",
      quantity: 2,
      stock: 4,
      amount: "25.00",
      available: true,
    });
    expect(res.body.cart.subtotal).toBe("25.00");
    expect(res.body.cart.itemCount).toBe(2);
  });

  it("keeps money exact where float arithmetic would drift", async () => {
    const { token } = await createUser();
    const book = await seedBook({ price: "0.07", stock: 20 });

    await addItem(token, book.id, 10);
    const res = await api.get("/api/v1/cart").set(bearer(token));

    expect(res.body.cart.items[0].amount).toBe("0.70");
    expect(res.body.cart.subtotal).toBe("0.70");
  });

  it("sums a subtotal across several lines", async () => {
    const { token } = await createUser();
    const first = await seedBook({ price: "19.99", stock: 5 });
    const second = await seedBook({ price: "5.01", stock: 5 });

    await addItem(token, first.id, 2);
    await addItem(token, second.id, 1);

    const res = await api.get("/api/v1/cart").set(bearer(token));

    expect(res.body.cart.subtotal).toBe("44.99");
    expect(res.body.cart.itemCount).toBe(3);
  });

  it("flags a line whose quantity exceeds stock", async () => {
    const { token } = await createUser();
    const book = await seedBook({ stock: 5 });

    await addItem(token, book.id, 3);
    await db
      .update(booksTable)
      .set({ stock: 1 })
      .where(eq(booksTable.id, book.id));

    const res = await api.get("/api/v1/cart").set(bearer(token));

    expect(res.body.cart.items[0].available).toBe(false);
    expect(res.body.cart.hasUnavailableItems).toBe(true);
  });

  it("flags a line whose book was soft deleted", async () => {
    const { token } = await createUser();
    const book = await seedBook({ stock: 5 });

    await addItem(token, book.id, 1);
    await db
      .update(booksTable)
      .set({ deletedAt: new Date() })
      .where(eq(booksTable.id, book.id));

    const res = await api.get("/api/v1/cart").set(bearer(token));

    expect(res.body.cart.items[0].available).toBe(false);
    expect(res.body.cart.hasUnavailableItems).toBe(true);
  });
});

describe("POST /cart/items", () => {
  it("adds a line and defaults quantity to 1", async () => {
    const { token } = await createUser();
    const book = await seedBook();

    const res = await addItem(token, book.id);

    expect(res.status).toBe(201);
    expect(res.body.cart.items).toHaveLength(1);
    expect(res.body.cart.items[0].quantity).toBe(1);
  });

  it("sums quantity when the same book is added twice", async () => {
    const { token } = await createUser();
    const book = await seedBook({ stock: 20 });

    await addItem(token, book.id, 2);
    const res = await addItem(token, book.id, 3);

    expect(res.body.cart.items).toHaveLength(1);
    expect(res.body.cart.items[0].quantity).toBe(5);
  });

  it("caps a summed quantity at 99 instead of breaking the check constraint", async () => {
    const { token } = await createUser();
    const book = await seedBook({ stock: 200 });

    await addItem(token, book.id, 60);
    const res = await addItem(token, book.id, 60);

    expect(res.status).toBe(201);
    expect(res.body.cart.items[0].quantity).toBe(99);
  });

  it("rejects a quantity below 1", async () => {
    const { token } = await createUser();
    const book = await seedBook();

    const res = await addItem(token, book.id, 0);

    expect(res.status).toBe(400);
  });

  it("rejects a quantity above 99", async () => {
    const { token } = await createUser();
    const book = await seedBook();

    const res = await addItem(token, book.id, 100);

    expect(res.status).toBe(400);
  });

  it("rejects an unknown book", async () => {
    const { token } = await createUser();

    const res = await addItem(token, "00000000-0000-0000-0000-000000000000");

    expect(res.status).toBe(400);
    expect(res.body.message).toBe("Book is unavailable.");
  });

  it("rejects a soft deleted book", async () => {
    const { token } = await createUser();
    const book = await seedBook({ deletedAt: new Date() });

    const res = await addItem(token, book.id);

    expect(res.status).toBe(400);
  });
});

describe("PATCH /cart/items/:id", () => {
  it("sets the quantity absolutely", async () => {
    const { token } = await createUser();
    const book = await seedBook({ price: "10.00", stock: 20 });

    await addItem(token, book.id, 5);
    const res = await api
      .patch(`/api/v1/cart/items/${await itemIdFor(token, book.id)}`)
      .set(bearer(token))
      .send({ quantity: 2 });

    expect(res.status).toBe(200);
    expect(res.body.cart.items[0].quantity).toBe(2);
    expect(res.body.cart.subtotal).toBe("20.00");
  });

  it("returns 404 for an item that is not in the cart", async () => {
    const { token } = await createUser();

    const res = await api
      .patch("/api/v1/cart/items/00000000-0000-0000-0000-000000000000")
      .set(bearer(token))
      .send({ quantity: 2 });

    expect(res.status).toBe(404);
  });
});

describe("DELETE /cart", () => {
  it("removes a single line", async () => {
    const { token } = await createUser();
    const first = await seedBook();
    const second = await seedBook();

    await addItem(token, first.id, 1);
    await addItem(token, second.id, 1);

    const res = await api
      .delete(`/api/v1/cart/items/${await itemIdFor(token, first.id)}`)
      .set(bearer(token));

    expect(res.status).toBe(200);
    expect(res.body.cart.items).toHaveLength(1);
    expect(res.body.cart.items[0].bookId).toBe(second.id);
  });

  it("returns 404 when removing a line twice", async () => {
    const { token } = await createUser();
    const book = await seedBook();

    await addItem(token, book.id, 1);
    const itemId = await itemIdFor(token, book.id);
    await api.delete(`/api/v1/cart/items/${itemId}`).set(bearer(token));

    const res = await api
      .delete(`/api/v1/cart/items/${itemId}`)
      .set(bearer(token));

    expect(res.status).toBe(404);
  });

  it("clears every line", async () => {
    const { token } = await createUser();
    const first = await seedBook();
    const second = await seedBook();

    await addItem(token, first.id, 1);
    await addItem(token, second.id, 2);

    const res = await api.delete("/api/v1/cart").set(bearer(token));

    expect(res.status).toBe(200);
    expect(res.body.cart.items).toHaveLength(0);
    expect(res.body.cart.itemCount).toBe(0);
  });
});

describe("cart isolation between users", () => {
  it("does not leak one user's cart into another's", async () => {
    const owner = await createUser();
    const other = await createUser();
    const book = await seedBook();

    await addItem(owner.token, book.id, 3);

    const res = await api.get("/api/v1/cart").set(bearer(other.token));

    expect(res.body.cart.items).toHaveLength(0);
  });

  it("does not let another user change or remove a line", async () => {
    const owner = await createUser();
    const other = await createUser();
    const book = await seedBook({ stock: 20 });

    await addItem(owner.token, book.id, 3);

    const itemId = await itemIdFor(owner.token, book.id);

    const patched = await api
      .patch(`/api/v1/cart/items/${itemId}`)
      .set(bearer(other.token))
      .send({ quantity: 1 });

    const removed = await api
      .delete(`/api/v1/cart/items/${itemId}`)
      .set(bearer(other.token));

    expect(patched.status).toBe(404);
    expect(removed.status).toBe(404);

    const ownerCart = await api.get("/api/v1/cart").set(bearer(owner.token));
    expect(ownerCart.body.cart.items[0].quantity).toBe(3);
  });
});

describe("POST /cart/checkout", () => {
  it("creates a pending order, decrements stock and clears the cart", async () => {
    const { token } = await createUser();
    const book = await seedBook({ price: "9.99", stock: 5 });

    await addItem(token, book.id, 2);
    const res = await api.post("/api/v1/cart/checkout").set(bearer(token));

    expect(res.status).toBe(201);
    expect(res.body.order.status).toBe("pending");
    expect(res.body.order.total).toBe("19.98");
    expect(res.body.order.items).toHaveLength(1);
    expect(res.body.order.items[0].title).toBe(book.title);
    expect(res.body.order.items[0].price).toBe("9.99");
    expect(await stockOf(book.id)).toBe(3);

    const cart = await api.get("/api/v1/cart").set(bearer(token));
    expect(cart.body.cart.items).toHaveLength(0);
  });

  it("rejects an empty cart", async () => {
    const { token } = await createUser();

    const res = await api.post("/api/v1/cart/checkout").set(bearer(token));

    expect(res.status).toBe(400);
    expect(res.body.message).toBe("Cart is empty.");
  });

  it("rolls back completely when one line has insufficient stock", async () => {
    const { token } = await createUser();
    const plenty = await seedBook({ stock: 5 });
    const short = await seedBook({ stock: 1 });

    await addItem(token, plenty.id, 1);
    await addItem(token, short.id, 2);

    const res = await api.post("/api/v1/cart/checkout").set(bearer(token));

    expect(res.status).toBe(400);
    expect(await orderCount()).toBe(0);
    expect(await stockOf(plenty.id)).toBe(5);
    expect(await stockOf(short.id)).toBe(1);

    const cart = await api.get("/api/v1/cart").set(bearer(token));
    expect(cart.body.cart.items).toHaveLength(2);
    expect(cart.body.cart.itemCount).toBe(3);
  });

  it("orders only the selected books and leaves the rest in the cart", async () => {
    const { token } = await createUser();
    const picked = await seedBook({ price: "10.00", stock: 5 });
    const alsoPicked = await seedBook({ price: "2.50", stock: 5 });
    const leftBehind = await seedBook({ price: "99.00", stock: 5 });

    await addItem(token, picked.id, 2);
    await addItem(token, alsoPicked.id, 1);
    await addItem(token, leftBehind.id, 3);

    const res = await api
      .post("/api/v1/cart/checkout")
      .set(bearer(token))
      .send({ itemIds: [await itemIdFor(token, picked.id), await itemIdFor(token, alsoPicked.id)] });

    expect(res.status).toBe(201);
    expect(res.body.order.items).toHaveLength(2);
    expect(res.body.order.total).toBe("22.50");

    expect(await stockOf(picked.id)).toBe(3);
    expect(await stockOf(alsoPicked.id)).toBe(4);
    expect(await stockOf(leftBehind.id)).toBe(5);

    const cart = await api.get("/api/v1/cart").set(bearer(token));
    expect(cart.body.cart.items).toHaveLength(1);
    expect(cart.body.cart.items[0].bookId).toBe(leftBehind.id);
    expect(cart.body.cart.items[0].quantity).toBe(3);
  });

  it("lets a user check out around an out of stock line", async () => {
    const { token } = await createUser();
    const fine = await seedBook({ price: "10.00", stock: 5 });
    const sold = await seedBook({ stock: 5 });

    await addItem(token, fine.id, 1);
    await addItem(token, sold.id, 4);
    await db
      .update(booksTable)
      .set({ stock: 0 })
      .where(eq(booksTable.id, sold.id));

    const blocked = await api.post("/api/v1/cart/checkout").set(bearer(token));
    expect(blocked.status).toBe(400);

    const res = await api
      .post("/api/v1/cart/checkout")
      .set(bearer(token))
      .send({ itemIds: [await itemIdFor(token, fine.id)] });

    expect(res.status).toBe(201);
    expect(res.body.order.items).toHaveLength(1);

    const cart = await api.get("/api/v1/cart").set(bearer(token));
    expect(cart.body.cart.items).toHaveLength(1);
    expect(cart.body.cart.items[0].bookId).toBe(sold.id);
  });

  it("rejects a book that is not in the cart", async () => {
    const { token } = await createUser();
    const inCart = await seedBook({ stock: 5 });
    const notInCart = await seedBook({ stock: 5 });

    await addItem(token, inCart.id, 1);

    const res = await api
      .post("/api/v1/cart/checkout")
      .set(bearer(token))
      .send({ itemIds: [await itemIdFor(token, inCart.id), "00000000-0000-0000-0000-000000000000"] });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe("Some items are not in your cart.");
    expect(await orderCount()).toBe(0);
    expect(await stockOf(inCart.id)).toBe(5);
  });

  it("rejects an empty selection", async () => {
    const { token } = await createUser();
    const book = await seedBook();

    await addItem(token, book.id, 1);

    const res = await api
      .post("/api/v1/cart/checkout")
      .set(bearer(token))
      .send({ itemIds: [] });

    expect(res.status).toBe(400);
  });

  it("ignores duplicate ids in the selection", async () => {
    const { token } = await createUser();
    const book = await seedBook({ price: "10.00", stock: 5 });

    await addItem(token, book.id, 2);

    const res = await api
      .post("/api/v1/cart/checkout")
      .set(bearer(token))
      .send({ itemIds: [await itemIdFor(token, book.id), await itemIdFor(token, book.id)] });

    expect(res.status).toBe(201);
    expect(res.body.order.items).toHaveLength(1);
    expect(res.body.order.total).toBe("20.00");
    expect(await stockOf(book.id)).toBe(3);
  });

  it("does not let a user select another user's cart line", async () => {
    const owner = await createUser();
    const other = await createUser();
    const book = await seedBook({ stock: 5 });

    await addItem(owner.token, book.id, 2);

    const res = await api
      .post("/api/v1/cart/checkout")
      .set(bearer(other.token))
      .send({ itemIds: [await itemIdFor(owner.token, book.id)] });

    expect(res.status).toBe(400);
    expect(await orderCount()).toBe(0);
    expect(await stockOf(book.id)).toBe(5);
  });

  it("satisfies the verified purchase gate for reviews", async () => {
    const { token } = await createUser();
    const book = await seedBook({ stock: 5 });

    await addItem(token, book.id, 1);
    await api.post("/api/v1/cart/checkout").set(bearer(token));

    const res = await api
      .post(`/api/v1/books/${book.id}/reviews`)
      .set(bearer(token))
      .send({ rating: 5, comment: "Bought through the cart." });

    expect(res.status).toBe(201);
  });
});
