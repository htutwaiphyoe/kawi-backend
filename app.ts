import express from "express";
import helmet from "helmet";
import cors from "cors";
import { pinoHttp } from "pino-http";
import cookieParser from "cookie-parser";
import compression from "compression";
import { env } from "@/libs/env";
import { logger } from "@/libs/logger";
import { apiLimiter, authLimiter } from "@/middlewares/rate-limit";
import healthRouter from "@/features/health/health.route";
import bookRouter, { authorBooksRouter } from "@/features/books/books.route";
import authorRouter from "@/features/authors/authors.route";
import authRouter from "@/features/auth/auth.route";
import userRouter from "@/features/users/users.route";
import orderRouter from "@/features/orders/orders.route";
import {
  bookReviewsRouter,
  reviewsRouter,
} from "@/features/reviews/reviews.route";
import { errorHandler, notFoundHandler } from "@/middlewares/error-handler";

export const app = express();

app.set("trust proxy", 1);

app.use(
  pinoHttp({
    logger,
    autoLogging: { ignore: (req) => req.url === "/health" },
  }),
);

app.use(helmet());

app.use(cors({ origin: env.CORS_ORIGIN, credentials: true }));

app.use(compression());

app.use(express.json({ limit: "10kb" }));

app.use(cookieParser());

app.use("/health", healthRouter);

app.use(apiLimiter);

app.use("/api/v1/books", bookRouter);

app.use("/api/v1/authors", authorRouter);

app.use("/api/v1/auth", authLimiter, authRouter);

app.use("/api/v1/users", userRouter);

app.use("/api/v1/orders", orderRouter);

app.use("/api/v1/authors/:id/books", authorBooksRouter);

app.use("/api/v1/books/:bookId/reviews", bookReviewsRouter);

app.use("/api/v1/reviews", reviewsRouter);

app.use(notFoundHandler);

app.use(errorHandler);
