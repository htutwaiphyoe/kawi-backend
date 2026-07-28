import { Worker } from "bullmq";
import cron from "node-cron";
import db from "@/db";
import {
  connection,
  emailQueue,
  EMAIL_QUEUE,
  PASSWORD_RESET_JOB,
  ORDER_CONFIRMATION_JOB,
  ORDER_STATUS_JOB,
  type PasswordResetJob,
  type OrderConfirmationJob,
  type OrderStatusJob,
} from "@/libs/queue";
import { sendMail } from "@/libs/mailer";
import {
  buildPasswordResetEmail,
  buildOrderConfirmationEmail,
  buildOrderStatusEmail,
} from "@/utils/mail";
import { cleanupExpiredTokens } from "@/jobs/cleanup";
import { env } from "@/libs/env";
import { logger } from "@/libs/logger";

const worker = new Worker(
  EMAIL_QUEUE,
  async (job) => {
    if (job.name === PASSWORD_RESET_JOB) {
      const { to, resetUrl } = job.data as PasswordResetJob;
      await sendMail({ to, ...buildPasswordResetEmail(resetUrl) });
    }

    if (job.name === ORDER_CONFIRMATION_JOB) {
      const { to, ...order } = job.data as OrderConfirmationJob;
      await sendMail({ to, ...buildOrderConfirmationEmail(order) });
    }

    if (job.name === ORDER_STATUS_JOB) {
      const { to, ...order } = job.data as OrderStatusJob;
      await sendMail({ to, ...buildOrderStatusEmail(order) });
    }
  },
  { connection },
);

worker.on("completed", (job) => {
  logger.info(`Email job ${job.id} (${job.name}) completed`);
});

worker.on("failed", (job, err) => {
  logger.error(
    { err, attempts: job?.attemptsMade },
    `Email job ${job?.id} (${job?.name}) failed`,
  );
});

logger.info("Email worker started");

const cleanupTask = cron.schedule(env.CLEANUP_CRON, () => {
  cleanupExpiredTokens().catch((err) =>
    logger.error({ err }, "Token cleanup failed"),
  );
});

logger.info(`Token cleanup scheduled (${env.CLEANUP_CRON})`);

const shutdown = async (signal: string) => {
  logger.info(`${signal} received, shutting down worker...`);

  const forceExit = setTimeout(() => {
    logger.error("Forced shutdown after timeout");
    process.exit(1);
  }, 10000);
  forceExit.unref();

  try {
    cleanupTask.stop();
    await worker.close();
    await emailQueue.close();
    await db.$client.end();
    logger.info("Worker shutdown complete");
    process.exit(0);
  } catch (err) {
    logger.error({ err }, "Error during worker shutdown");
    process.exit(1);
  }
};

process.on("SIGTERM", () => shutdown("SIGTERM"));

process.on("SIGINT", () => shutdown("SIGINT"));
