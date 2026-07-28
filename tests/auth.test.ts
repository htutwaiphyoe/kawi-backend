import { describe, it, expect, beforeEach } from "bun:test";
import { api, truncateAll, createUser } from "./helpers";

beforeEach(truncateAll);

describe("POST /auth/signup", () => {
  it("creates a user and returns tokens", async () => {
    const res = await api
      .post("/api/v1/auth/signup")
      .send({ name: "Ann", email: "ann@test.com", password: "password123" });

    expect(res.status).toBe(201);
    expect(res.body.accessToken).toBeString();
    expect(res.body.refreshToken).toBeString();
    expect(res.body.user.email).toBe("ann@test.com");
    expect(res.body.user).not.toHaveProperty("password");
  });

  it("rejects a duplicate email with 409", async () => {
    const body = { name: "Ann", email: "dup@test.com", password: "password123" };
    await api.post("/api/v1/auth/signup").send(body);
    const res = await api.post("/api/v1/auth/signup").send(body);
    expect(res.status).toBe(409);
  });

  it("rejects an invalid body with 400", async () => {
    const res = await api
      .post("/api/v1/auth/signup")
      .send({ email: "not-an-email", password: "short" });
    expect(res.status).toBe(400);
  });
});

describe("POST /auth/login", () => {
  it("logs in with correct credentials", async () => {
    const { email, password } = await createUser();
    const res = await api.post("/api/v1/auth/login").send({ email, password });
    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeString();
  });

  it("rejects a wrong password with 401", async () => {
    const { email } = await createUser();
    const res = await api.post("/api/v1/auth/login").send({ email, password: "wrongpass" });
    expect(res.status).toBe(401);
  });

  it("returns the same error for an unknown email (no enumeration)", async () => {
    const res = await api
      .post("/api/v1/auth/login")
      .send({ email: "nobody@test.com", password: "password123" });
    expect(res.status).toBe(401);
  });
});

describe("GET /users/me", () => {
  it("requires authentication", async () => {
    const res = await api.get("/api/v1/users/me");
    expect(res.status).toBe(401);
  });

  it("returns the current user's profile", async () => {
    const { token, user } = await createUser();
    const res = await api
      .get("/api/v1/users/me")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.user.id).toBe(user.id);
  });
});

describe("POST /auth/refresh", () => {
  it("rotates the refresh token", async () => {
    const { email, password } = await createUser();
    const login = await api.post("/api/v1/auth/login").send({ email, password });
    const oldRefresh = login.body.refreshToken;

    const res = await api.post("/api/v1/auth/refresh").send({ refreshToken: oldRefresh });
    expect(res.status).toBe(200);
    expect(res.body.refreshToken).toBeString();
    expect(res.body.refreshToken).not.toBe(oldRefresh);
  });

  it("rejects reuse of a rotated (revoked) refresh token with 401", async () => {
    const { email, password } = await createUser();
    const login = await api.post("/api/v1/auth/login").send({ email, password });
    const oldRefresh = login.body.refreshToken;

    await api.post("/api/v1/auth/refresh").send({ refreshToken: oldRefresh });
    const reuse = await api.post("/api/v1/auth/refresh").send({ refreshToken: oldRefresh });
    expect(reuse.status).toBe(401);
  });
});
