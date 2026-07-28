import { describe, it, expect, beforeEach } from "bun:test";
import {
  api,
  truncateAll,
  createUser,
  seedAuthor,
  seedBook,
} from "./helpers";

beforeEach(truncateAll);

const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

describe("GET /authors", () => {
  it("is public and paginates", async () => {
    await seedAuthor();
    await seedAuthor();
    const res = await api.get("/api/v1/authors?limit=1");
    expect(res.status).toBe(200);
    expect(res.body.pagination.total).toBe(2);
    expect(res.body.pagination.totalPages).toBe(2);
    expect(res.body.authors).toHaveLength(1);
  });

  it("returns 404 for an unknown author", async () => {
    const res = await api.get("/api/v1/authors/00000000-0000-0000-0000-000000000000");
    expect(res.status).toBe(404);
  });
});

describe("GET /authors/:id/books", () => {
  it("returns the author's books, paginated", async () => {
    const author = await seedAuthor();
    await seedBook({ authorId: author.id });
    await seedBook({ authorId: author.id });
    await seedBook(); // different author

    const res = await api.get(`/api/v1/authors/${author.id}/books`);
    expect(res.status).toBe(200);
    expect(res.body.pagination.total).toBe(2);
  });
});

describe("POST /authors", () => {
  it("requires authentication", async () => {
    const res = await api.post("/api/v1/authors").send({ name: "A", email: "a@t.com" });
    expect(res.status).toBe(401);
  });

  it("forbids a plain user and allows a publisher", async () => {
    const user = await createUser("user");
    const forbidden = await api
      .post("/api/v1/authors")
      .set(bearer(user.token))
      .send({ name: "A", email: "a1@t.com" });
    expect(forbidden.status).toBe(403);

    const publisher = await createUser("publisher");
    const created = await api
      .post("/api/v1/authors")
      .set(bearer(publisher.token))
      .send({ name: "A", email: "a2@t.com" });
    expect(created.status).toBe(201);
  });
});

describe("author ownership + soft delete", () => {
  it("owner deletes; another publisher is forbidden; delete hides it", async () => {
    const owner = await createUser("publisher");
    const other = await createUser("publisher");
    const author = await seedAuthor({ createdBy: owner.user.id });

    const byOther = await api
      .delete(`/api/v1/authors/${author.id}`)
      .set(bearer(other.token));
    expect(byOther.status).toBe(403);

    const byOwner = await api
      .delete(`/api/v1/authors/${author.id}`)
      .set(bearer(owner.token));
    expect(byOwner.status).toBe(200);

    const gone = await api.get(`/api/v1/authors/${author.id}`);
    expect(gone.status).toBe(404);
  });
});
