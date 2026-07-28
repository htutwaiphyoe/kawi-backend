import express from "express";
import { authenticate } from "@/middlewares/authenticate";
import { validate } from "@/middlewares/validate";
import { idParamSchema, bookIdParamSchema } from "@/libs/validators";
import { createReviewSchema, updateReviewSchema } from "./reviews.dto";
import {
  createReview,
  getReviews,
  updateReview,
  deleteReview,
} from "./reviews.controller";

export const bookReviewsRouter = express.Router({
  mergeParams: true,
});

bookReviewsRouter.get("/", validate("params", bookIdParamSchema), getReviews);

bookReviewsRouter.post(
  "/",
  authenticate,
  validate("params", bookIdParamSchema),
  validate("body", createReviewSchema),
  createReview,
);

export const reviewsRouter = express.Router();

reviewsRouter.patch(
  "/:id",
  authenticate,
  validate("params", idParamSchema),
  validate("body", updateReviewSchema),
  updateReview,
);

reviewsRouter.delete(
  "/:id",
  authenticate,
  validate("params", idParamSchema),
  deleteReview,
);
