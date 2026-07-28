import type { Request, Response } from "express";
import type { Uuid } from "@/libs/validators";
import { getCurrentUser } from "@/libs/user";
import {
  booksQuerySchema,
  type CreateBookBody,
  type UpdateBookBody,
} from "./books.dto";
import * as booksService from "./books.service";

export const getBooks = async (req: Request, res: Response) => {
  const query = booksQuerySchema.parse(req.query);

  const { books, total } = await booksService.getBooks(query);

  res.status(200).json({
    status: "success",
    pagination: {
      page: query.page,
      limit: query.limit,
      total,
      totalPages: Math.ceil(total / query.limit),
    },
    books,
  });
};

export const getBookById = async (
  req: Request<{ id: Uuid }>,
  res: Response,
) => {
  const book = await booksService.getBook(req.params.id);

  res.status(200).json({ status: "success", book });
};

export const getBooksByAuthor = async (
  req: Request<{ id: Uuid }>,
  res: Response,
) => {
  const query = booksQuerySchema.parse(req.query);

  const { books, total } = await booksService.getBooksByAuthor(
    req.params.id,
    query,
  );

  res.status(200).json({
    status: "success",
    pagination: {
      page: query.page,
      limit: query.limit,
      total,
      totalPages: Math.ceil(total / query.limit),
    },
    books,
  });
};

export const createBook = async (
  req: Request<{}, unknown, CreateBookBody>,
  res: Response,
) => {
  const currentUser = getCurrentUser(req);

  const book = await booksService.createBook({
    userId: currentUser.id,
    body: req.body,
  });

  res.status(201).json({ status: "success", book });
};

export const updateBook = async (
  req: Request<{ id: Uuid }, unknown, UpdateBookBody>,
  res: Response,
) => {
  const currentUser = getCurrentUser(req);

  const book = await booksService.updateBook({
    id: req.params.id,
    user: currentUser,
    body: req.body,
  });

  res.status(200).json({ status: "success", book });
};

export const deleteBook = async (req: Request<{ id: Uuid }>, res: Response) => {
  const currentUser = getCurrentUser(req);

  await booksService.deleteBook({ id: req.params.id, user: currentUser });

  res.status(200).json({ status: "success" });
};
