import express from "express";
import { authenticate } from "@/middlewares/authenticate";
import { authorize } from "@/middlewares/authorize";
import { validate } from "@/middlewares/validate";
import { idParamSchema } from "@/libs/validators";
import { updateUserSchema, updateUserRoleSchema } from "./users.dto";
import {
  getMe,
  getUserById,
  updateUser,
  deactivateUser,
  reactivateUser,
  updateUserRole,
} from "./users.controller";

const router = express.Router();

router.use(authenticate);

router.get("/me", getMe);

router.get("/:id", validate("params", idParamSchema), getUserById);

router.patch(
  "/:id",
  validate("params", idParamSchema),
  validate("body", updateUserSchema),
  updateUser,
);

router.patch(
  "/:id/deactivate",
  validate("params", idParamSchema),
  deactivateUser,
);

router.patch(
  "/:id/reactivate",
  authorize("admin"),
  validate("params", idParamSchema),
  reactivateUser,
);

router.patch(
  "/:id/role",
  authorize("admin"),
  validate("params", idParamSchema),
  validate("body", updateUserRoleSchema),
  updateUserRole,
);

export default router;
