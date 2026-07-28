import express from "express";
import { validate } from "@/middlewares/validate";
import { authenticate } from "@/middlewares/authenticate";
import { authorize } from "@/middlewares/authorize";
import { idParamSchema } from "@/libs/validators";
import {
  createBook,
  deleteBook,
  getBookById,
  getBooks,
  getBooksByAuthor,
  updateBook,
} from "./books.controller";
import {
  booksQuerySchema,
  createBookSchema,
  updateBookSchema,
} from "./books.dto";

const router = express.Router();

router.get("/", validate("query", booksQuerySchema), getBooks);

router.get("/:id", validate("params", idParamSchema), getBookById);

router.post(
  "/",
  authenticate,
  authorize("admin", "publisher"),
  validate("body", createBookSchema),
  createBook,
);

router.patch(
  "/:id",
  authenticate,
  authorize("admin", "publisher"),
  validate("params", idParamSchema),
  validate("body", updateBookSchema),
  updateBook,
);

router.delete(
  "/:id",
  authenticate,
  authorize("admin", "publisher"),
  validate("params", idParamSchema),
  deleteBook,
);

export default router;

export const authorBooksRouter = express.Router({ mergeParams: true });

authorBooksRouter.get("/", validate("params", idParamSchema), getBooksByAuthor);
