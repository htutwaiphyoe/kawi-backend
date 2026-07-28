import express from "express";
import { authenticate } from "@/middlewares/authenticate";
import { authorize } from "@/middlewares/authorize";
import { validate } from "@/middlewares/validate";
import { idParamSchema } from "@/libs/validators";
import { createOrderSchema, updateOrderStatusSchema } from "./orders.dto";
import {
  createOrder,
  getOrders,
  getOrderById,
  cancelOrder,
  updateOrderStatus,
} from "./orders.controller";

const router = express.Router();

router.use(authenticate);

router.post("/", validate("body", createOrderSchema), createOrder);

router.get("/", getOrders);

router.get("/:id", validate("params", idParamSchema), getOrderById);

router.patch(
  "/:id/cancel",
  validate("params", idParamSchema),
  cancelOrder,
);

router.patch(
  "/:id/status",
  authorize("admin"),
  validate("params", idParamSchema),
  validate("body", updateOrderStatusSchema),
  updateOrderStatus,
);

export default router;
