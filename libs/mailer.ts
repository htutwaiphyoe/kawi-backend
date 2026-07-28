import nodemailer, { type Transporter } from "nodemailer";
import { env } from "@/libs/env";

let transporter: Transporter | null = null;

const getTransporter = (): Transporter => {
  if (!env.SMTP_HOST) {
    throw new Error(
      "SMTP is not configured (set SMTP_HOST / SMTP_USER / SMTP_PASS).",
    );
  }

  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT ?? 587,
      auth: env.SMTP_USER
        ? { user: env.SMTP_USER, pass: env.SMTP_PASS }
        : undefined,
    });
  }

  return transporter;
};

export const sendMail = async (opts: {
  to: string;
  subject: string;
  html: string;
  text: string;
}): Promise<void> => {
  const from = env.EMAIL_FROM ?? env.SMTP_USER ?? "no-reply@bookstore.dev";
  await getTransporter().sendMail({ from, ...opts });
};
