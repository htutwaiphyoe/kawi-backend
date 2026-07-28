import type { Request, Response } from "express";
import type { Uuid } from "@/libs/validators";
import { getCurrentUser } from "@/libs/user";
import {
  authorsQuerySchema,
  type CreateAuthorBody,
  type UpdateAuthorBody,
} from "./authors.dto";
import * as authorsService from "./authors.service";

export const getAuthors = async (req: Request, res: Response) => {
  const query = authorsQuerySchema.parse(req.query);

  const { authors, total } = await authorsService.getAuthors(query);

  res.status(200).json({
    status: "success",
    pagination: {
      page: query.page,
      limit: query.limit,
      total,
      totalPages: Math.ceil(total / query.limit),
    },
    authors,
  });
};

export const getAuthorById = async (
  req: Request<{ id: Uuid }>,
  res: Response,
) => {
  const author = await authorsService.getAuthor(req.params.id);

  res.status(200).json({ status: "success", author });
};

export const createAuthor = async (
  req: Request<{}, unknown, CreateAuthorBody>,
  res: Response,
) => {
  const currentUser = getCurrentUser(req);

  const author = await authorsService.createAuthor({
    userId: currentUser.id,
    body: req.body,
  });

  res.status(201).json({ status: "success", author });
};

export const updateAuthor = async (
  req: Request<{ id: Uuid }, unknown, UpdateAuthorBody>,
  res: Response,
) => {
  const currentUser = getCurrentUser(req);

  const author = await authorsService.updateAuthor({
    id: req.params.id,
    user: currentUser,
    body: req.body,
  });

  res.status(200).json({ status: "success", author });
};

export const deleteAuthor = async (
  req: Request<{ id: Uuid }>,
  res: Response,
) => {
  const currentUser = getCurrentUser(req);

  await authorsService.deleteAuthor({
    id: req.params.id,
    user: currentUser,
  });

  res.status(200).json({ status: "success" });
};
