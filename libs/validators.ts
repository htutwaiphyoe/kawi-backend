import { z } from "zod";

export const uuidSchema = z.uuid().brand<"Uuid">();

export type Uuid = z.infer<typeof uuidSchema>;

export const idParamSchema = z.object({ id: uuidSchema });

export const bookIdParamSchema = z.object({ bookId: uuidSchema });
