import { drizzle } from "drizzle-orm/node-postgres";
import { env } from "@/libs/env";

const db = drizzle(env.DATABASE_URL);

export type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export default db;
