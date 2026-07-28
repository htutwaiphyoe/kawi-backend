import rateLimit from "express-rate-limit";
import { env } from "@/libs/env";

const WINDOW_MS = 15 * 60 * 1000;

const skipInTest = () => env.NODE_ENV === "test";

export const apiLimiter = rateLimit({
  windowMs: WINDOW_MS,
  limit: 100,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  skip: skipInTest,
  message: {
    status: "error",
    message: "Too many requests, please try again later.",
  },
});

export const authLimiter = rateLimit({
  windowMs: WINDOW_MS,
  limit: 10,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  skip: skipInTest,
  message: {
    status: "error",
    message: "Too many attempts, please try again later.",
  },
});
