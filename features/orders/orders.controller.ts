import type { Request, Response } from "express";
import type { Uuid } from "@/libs/validators";
import { getCurrentUser } from "@/libs/user";
import {
  ordersQuerySchema,
  type CreateOrderBody,
  type UpdateOrderStatusBody,
} from "./orders.dto";
import * as ordersService from "./orders.service";

export const createOrder = async (
  req: Request<{}, unknown, CreateOrderBody>,
  res: Response,
) => {
  const currentUser = getCurrentUser(req);

  const order = await ordersService.createOrder({
    userId: currentUser.id,
    body: req.body,
  });

  res.status(201).json({ status: "success", order });
};

export const getOrders = async (req: Request, res: Response) => {
  const currentUser = getCurrentUser(req);

  const query = ordersQuerySchema.parse(req.query);

  const { orders, total } = await ordersService.getOrders(currentUser, query);

  res.status(200).json({
    status: "success",
    pagination: {
      page: query.page,
      limit: query.limit,
      total,
      totalPages: Math.ceil(total / query.limit),
    },
    orders,
  });
};

export const getOrderById = async (
  req: Request<{ id: Uuid }>,
  res: Response,
) => {
  const currentUser = getCurrentUser(req);

  const order = await ordersService.getOrder(req.params.id, currentUser);

  res.status(200).json({ status: "success", order });
};

export const cancelOrder = async (
  req: Request<{ id: Uuid }>,
  res: Response,
) => {
  const currentUser = getCurrentUser(req);

  const order = await ordersService.cancelOrder(req.params.id, currentUser);

  res.status(200).json({ status: "success", order });
};

export const updateOrderStatus = async (
  req: Request<{ id: Uuid }, unknown, UpdateOrderStatusBody>,
  res: Response,
) => {
  const order = await ordersService.updateOrderStatus(
    req.params.id,
    req.body.status,
  );

  res.status(200).json({ status: "success", order });
};
