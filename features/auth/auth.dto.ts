import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { usersTable } from "@/features/users/users.model";

export const signupSchema = createInsertSchema(usersTable, {
  name: () =>
    z
      .string("Name is required")
      .min(1, "Name is required")
      .max(255, "Name must be at most 255 characters"),
  email: () => z.email("Email must be a valid email"),
  password: () =>
    z
      .string("Password is required")
      .min(8, "Password must be at least 8 characters"),
  dob: () => z.iso.date("DOB must be a valid date (YYYY-MM-DD)").optional(),
  profileUrl: () => z.url("Profile URL must be a valid URL").optional(),
}).pick({
  name: true,
  email: true,
  password: true,
  dob: true,
  profileUrl: true,
});

export type SignupBody = z.infer<typeof signupSchema>;

export const loginSchema = z.object({
  email: z.email("Email must be a valid email"),
  password: z.string("Password is required").min(1, "Password is required"),
});

export type LoginBody = z.infer<typeof loginSchema>;

export const forgotPasswordSchema = z.object({
  email: z.email("Email must be a valid email"),
});

export type ForgotPasswordBody = z.infer<typeof forgotPasswordSchema>;

export const resetPasswordSchema = z.object({
  token: z.string("Token is required").min(1, "Token is required"),
  password: z
    .string("Password is required")
    .min(8, "Password must be at least 8 characters"),
});

export type ResetPasswordBody = z.infer<typeof resetPasswordSchema>;
