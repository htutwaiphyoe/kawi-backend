import { Queue, type ConnectionOptions } from "bullmq";
import { env } from "@/libs/env";

const url = new URL(env.REDIS_URL);

export const connection: ConnectionOptions = {
  host: url.hostname,
  port: Number(url.port) || 6379,
  db: url.pathname.length > 1 ? Number(url.pathname.slice(1)) : 0,
};

export type PasswordResetJob = {
  to: string;
  resetUrl: string;
};

export type OrderConfirmationJob = {
  to: string;
  orderId: string;
  total: string;
  items: { title: string; price: string; quantity: number }[];
};

export const EMAIL_QUEUE = "email";

export type OrderStatusJob = {
  to: string;
  orderId: string;
  status: string;
};

export const PASSWORD_RESET_JOB = "password-reset";

export const ORDER_CONFIRMATION_JOB = "order-confirmation";

export const ORDER_STATUS_JOB = "order-status";

export const emailQueue = new Queue(EMAIL_QUEUE, {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: "exponential", delay: 5000 },
    removeOnComplete: true,
    removeOnFail: 100,
  },
});
