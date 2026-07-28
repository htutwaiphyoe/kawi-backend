import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { usersTable, userRoleEnum } from "./users.model";

export const updateUserSchema = createInsertSchema(usersTable, {
  name: () =>
    z
      .string("Name is required")
      .min(1, "Name is required")
      .max(255, "Name must be at most 255 characters"),
  dob: () => z.iso.date("DOB must be a valid date (YYYY-MM-DD)").optional(),
  profileUrl: () => z.url("Profile URL must be a valid URL").optional(),
})
  .pick({
    name: true,
    dob: true,
    profileUrl: true,
  })
  .partial()
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field is required to update.",
  });

export type UpdateUserBody = z.infer<typeof updateUserSchema>;

export const updateUserRoleSchema = z.object({
  role: z.enum(userRoleEnum.enumValues),
});

export type UpdateUserRoleBody = z.infer<typeof updateUserRoleSchema>;
