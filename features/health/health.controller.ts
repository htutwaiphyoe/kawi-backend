import type { Request, Response } from "express";
import { sql } from "drizzle-orm";
import db from "@/db";

export const healthCheck = async (_req: Request, res: Response) => {
  try {
    await db.execute(sql`SELECT 1`);
    res.status(200).json({
      status: "ok",
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    });
  } catch {
    res.status(503).json({
      status: "error",
      message: "Database unavailable.",
    });
  }
};
