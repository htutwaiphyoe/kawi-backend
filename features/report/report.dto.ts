import { z } from "zod";

export const reportQuerySchema = z.object({
  tzOffset: z.coerce
    .number("TzOffset must be a number")
    .int("TzOffset must be a whole number of minutes")
    .min(-840, "TzOffset must be at least -840")
    .max(840, "TzOffset must be at most 840")
    .default(0),
});

export type ReportQuery = z.infer<typeof reportQuerySchema>;
