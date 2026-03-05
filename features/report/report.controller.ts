import type { Request, Response } from "express";
import { reportQuerySchema } from "./report.dto";
import * as reportService from "./report.service";

export const getOverviewReport = async (req: Request, res: Response) => {
  const query = reportQuerySchema.parse(req.query);

  const report = await reportService.getOverviewReport(query);

  res.status(200).json({ status: "success", report });
};
