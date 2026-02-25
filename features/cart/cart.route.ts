import express from "express";
import { authenticate } from "@/middlewares/authenticate";
import { validate } from "@/middlewares/validate";
import { idParamSchema } from "@/libs/validators";
import {
  addCartItemSchema,
  checkoutSchema,
  updateCartItemSchema,
} from "./cart.dto";
import {
  getCart,
  addCartItem,
  updateCartItem,
  removeCartItem,
  clearCart,
  checkout,
} from "./cart.controller";

const router = express.Router();

router.use(authenticate);

router.get("/", getCart);

router.delete("/", clearCart);

router.post("/items", validate("body", addCartItemSchema), addCartItem);

router.patch(
  "/items/:id",
  validate("params", idParamSchema),
  validate("body", updateCartItemSchema),
  updateCartItem,
);

router.delete(
  "/items/:id",
  validate("params", idParamSchema),
  removeCartItem,
);

router.post("/checkout", validate("body", checkoutSchema), checkout);

export default router;
