import type { Request, Response } from "express";
import type { Uuid } from "@/libs/validators";
import { getCurrentUser } from "@/libs/user";
import type { UpdateUserBody, UpdateUserRoleBody } from "./users.dto";
import * as usersService from "./users.service";

export const getMe = async (req: Request, res: Response) => {
  const { id } = getCurrentUser(req);

  const user = await usersService.getMe(id);

  res.status(200).json({ status: "success", user });
};

export const getUserById = async (
  req: Request<{ id: Uuid }>,
  res: Response,
) => {
  const user = await usersService.getUserById(req.params.id);

  res.status(200).json({ status: "success", user });
};

export const updateUser = async (
  req: Request<{ id: Uuid }, unknown, UpdateUserBody>,
  res: Response,
) => {
  const currentUser = getCurrentUser(req);

  const user = await usersService.updateUser({
    id: req.params.id,
    currentUser,
    body: req.body,
  });

  res.status(200).json({ status: "success", user });
};

export const deactivateUser = async (
  req: Request<{ id: Uuid }>,
  res: Response,
) => {
  const currentUser = getCurrentUser(req);

  const user = await usersService.deactivateUser({
    id: req.params.id,
    currentUser,
  });

  res.status(200).json({ status: "success", user });
};

export const reactivateUser = async (
  req: Request<{ id: Uuid }>,
  res: Response,
) => {
  const user = await usersService.reactivateUser(req.params.id);

  res.status(200).json({ status: "success", user });
};

export const updateUserRole = async (
  req: Request<{ id: Uuid }, unknown, UpdateUserRoleBody>,
  res: Response,
) => {
  const currentUser = getCurrentUser(req);

  const user = await usersService.updateUserRole({
    id: req.params.id,
    currentUser,
    role: req.body.role,
  });

  res.status(200).json({ status: "success", user });
};
