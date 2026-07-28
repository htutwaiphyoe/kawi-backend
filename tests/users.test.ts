import { describe, it, expect, beforeEach } from "bun:test";
import { api, truncateAll, createUser } from "./helpers";

beforeEach(truncateAll);

const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

describe("PATCH /users/:id (update profile)", () => {
  it("lets a user update themselves but not others", async () => {
    const a = await createUser();
    const b = await createUser();

    const self = await api
      .patch(`/api/v1/users/${a.user.id}`)
      .set(bearer(a.token))
      .send({ name: "Renamed" });
    expect(self.status).toBe(200);
    expect(self.body.user.name).toBe("Renamed");

    const other = await api
      .patch(`/api/v1/users/${b.user.id}`)
      .set(bearer(a.token))
      .send({ name: "Hacked" });
    expect(other.status).toBe(403);
  });
});

describe("account deactivation", () => {
  it("lets a user deactivate their own account", async () => {
    const user = await createUser();
    const res = await api
      .patch(`/api/v1/users/${user.user.id}/deactivate`)
      .set(bearer(user.token));
    expect(res.status).toBe(200);

    // /me re-checks the DB and now rejects the deactivated account
    const me = await api.get("/api/v1/users/me").set(bearer(user.token));
    expect(me.status).toBe(401);
  });

  it("forbids deactivating another user (non-admin)", async () => {
    const a = await createUser();
    const b = await createUser();
    const res = await api
      .patch(`/api/v1/users/${b.user.id}/deactivate`)
      .set(bearer(a.token));
    expect(res.status).toBe(403);
  });

  it("refuses to deactivate an admin account", async () => {
    const admin = await createUser("admin");
    const res = await api
      .patch(`/api/v1/users/${admin.user.id}/deactivate`)
      .set(bearer(admin.token));
    expect(res.status).toBe(403);
  });

  it("lets an admin deactivate then reactivate a user", async () => {
    const admin = await createUser("admin");
    const user = await createUser();

    const deactivate = await api
      .patch(`/api/v1/users/${user.user.id}/deactivate`)
      .set(bearer(admin.token));
    expect(deactivate.status).toBe(200);

    const reactivate = await api
      .patch(`/api/v1/users/${user.user.id}/reactivate`)
      .set(bearer(admin.token));
    expect(reactivate.status).toBe(200);
  });

  it("forbids a non-admin from reactivating", async () => {
    const admin = await createUser("admin");
    const user = await createUser();
    await api
      .patch(`/api/v1/users/${user.user.id}/deactivate`)
      .set(bearer(admin.token));

    const other = await createUser();
    const res = await api
      .patch(`/api/v1/users/${user.user.id}/reactivate`)
      .set(bearer(other.token));
    expect(res.status).toBe(403);
  });
});

describe("role management", () => {
  it("lets an admin change a user's role", async () => {
    const admin = await createUser("admin");
    const user = await createUser();
    const res = await api
      .patch(`/api/v1/users/${user.user.id}/role`)
      .set(bearer(admin.token))
      .send({ role: "publisher" });
    expect(res.status).toBe(200);
    expect(res.body.user.role).toBe("publisher");
  });

  it("forbids a non-admin from changing roles", async () => {
    const a = await createUser();
    const b = await createUser();
    const res = await api
      .patch(`/api/v1/users/${b.user.id}/role`)
      .set(bearer(a.token))
      .send({ role: "admin" });
    expect(res.status).toBe(403);
  });

  it("forbids an admin from changing their own role", async () => {
    const admin = await createUser("admin");
    const res = await api
      .patch(`/api/v1/users/${admin.user.id}/role`)
      .set(bearer(admin.token))
      .send({ role: "user" });
    expect(res.status).toBe(403);
  });
});
