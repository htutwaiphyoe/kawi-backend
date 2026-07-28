import { describe, it, expect, beforeEach } from "bun:test";
import { eq } from "drizzle-orm";
import db from "@/db";
import { usersTable } from "@/features/users/users.model";
import { generateToken } from "@/libs/token";
import { api, truncateAll, createUser } from "./helpers";

beforeEach(truncateAll);

const plantResetToken = async (userId: string, expiresAt: Date) => {
  const { token, tokenHash } = generateToken();
  await db
    .update(usersTable)
    .set({
      passwordResetTokenHash: tokenHash,
      passwordResetExpiresAt: expiresAt,
    })
    .where(eq(usersTable.id, userId));
  return token;
};

const resetHashOf = async (userId: string) => {
  const [u] = await db
    .select({ hash: usersTable.passwordResetTokenHash })
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);
  return u.hash;
};

describe("POST /auth/forgot-password", () => {
  it("returns a generic 200 and sets a reset token for a real account", async () => {
    const { email, user } = await createUser();
    const res = await api.post("/api/v1/auth/forgot-password").send({ email });
    expect(res.status).toBe(200);
    expect(res.body.message).toContain("If an account exists");
    expect(await resetHashOf(user.id)).toBeString();
  });

  it("returns the same 200 for an unknown email (no enumeration)", async () => {
    const res = await api
      .post("/api/v1/auth/forgot-password")
      .send({ email: "nobody@test.com" });
    expect(res.status).toBe(200);
    expect(res.body.message).toContain("If an account exists");
  });
});

describe("POST /auth/reset-password", () => {
  it("resets the password with a valid token", async () => {
    const { email, user, password } = await createUser();
    const token = await plantResetToken(user.id, new Date(Date.now() + 60_000));

    const res = await api
      .post("/api/v1/auth/reset-password")
      .send({ token, password: "newpassword123" });
    expect(res.status).toBe(200);

    const oldLogin = await api.post("/api/v1/auth/login").send({ email, password });
    expect(oldLogin.status).toBe(401);

    const newLogin = await api
      .post("/api/v1/auth/login")
      .send({ email, password: "newpassword123" });
    expect(newLogin.status).toBe(200);
  });

  it("rejects an invalid token with 400", async () => {
    const res = await api
      .post("/api/v1/auth/reset-password")
      .send({ token: "garbage", password: "newpassword123" });
    expect(res.status).toBe(400);
  });

  it("rejects a reused (already-consumed) token with 400", async () => {
    const { user } = await createUser();
    const token = await plantResetToken(user.id, new Date(Date.now() + 60_000));

    const first = await api
      .post("/api/v1/auth/reset-password")
      .send({ token, password: "newpassword123" });
    expect(first.status).toBe(200);

    const second = await api
      .post("/api/v1/auth/reset-password")
      .send({ token, password: "anotherpass123" });
    expect(second.status).toBe(400);
  });

  it("rejects an expired token with 400", async () => {
    const { user } = await createUser();
    const token = await plantResetToken(user.id, new Date(Date.now() - 1000));

    const res = await api
      .post("/api/v1/auth/reset-password")
      .send({ token, password: "newpassword123" });
    expect(res.status).toBe(400);
  });
});
