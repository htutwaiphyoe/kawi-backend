import { afterAll } from "bun:test";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import db from "@/db";
import { emailQueue } from "@/libs/queue";

await migrate(db, { migrationsFolder: "./drizzle" });

afterAll(async () => {
  await emailQueue.obliterate({ force: true }).catch(() => {});
  await emailQueue.close();
  await db.$client.end();
});
