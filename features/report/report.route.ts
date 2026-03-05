import express from "express";
import { authenticate } from "@/middlewares/authenticate";
import { authorize } from "@/middlewares/authorize";
import { getOverviewReport } from "./report.controller";

const router = express.Router();

router.use(authenticate, authorize("admin"));

router.get("/", getOverviewReport);

export default router;
