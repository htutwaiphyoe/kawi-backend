import type { Request, Response } from "express";
import type { Uuid } from "@/libs/validators";
import { getCurrentUser } from "@/libs/user";
import type {
  AddCartItemBody,
  CheckoutBody,
  UpdateCartItemBody,
} from "./cart.dto";
import * as cartService from "./cart.service";

export const getCart = async (req: Request, res: Response) => {
  const currentUser = getCurrentUser(req);

  const cart = await cartService.getCart(currentUser.id);

  res.status(200).json({ status: "success", cart });
};

export const addCartItem = async (
  req: Request<{}, unknown, AddCartItemBody>,
  res: Response,
) => {
  const currentUser = getCurrentUser(req);

  const cart = await cartService.addCartItem({
    userId: currentUser.id,
    body: req.body,
  });

  res.status(201).json({ status: "success", cart });
};

export const updateCartItem = async (
  req: Request<{ id: Uuid }, unknown, UpdateCartItemBody>,
  res: Response,
) => {
  const currentUser = getCurrentUser(req);

  const cart = await cartService.updateCartItem({
    userId: currentUser.id,
    itemId: req.params.id,
    body: req.body,
  });

  res.status(200).json({ status: "success", cart });
};

export const removeCartItem = async (
  req: Request<{ id: Uuid }>,
  res: Response,
) => {
  const currentUser = getCurrentUser(req);

  const cart = await cartService.removeCartItem({
    userId: currentUser.id,
    itemId: req.params.id,
  });

  res.status(200).json({ status: "success", cart });
};

export const clearCart = async (req: Request, res: Response) => {
  const currentUser = getCurrentUser(req);

  const cart = await cartService.clearCart(currentUser.id);

  res.status(200).json({ status: "success", cart });
};

export const checkout = async (
  req: Request<{}, unknown, CheckoutBody>,
  res: Response,
) => {
  const currentUser = getCurrentUser(req);

  const order = await cartService.checkout({
    userId: currentUser.id,
    body: req.body,
  });

  res.status(201).json({ status: "success", order });
};
