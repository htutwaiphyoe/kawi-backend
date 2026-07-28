import { app } from "@/app";
import db from "@/db";
import { emailQueue } from "@/libs/queue";
import { env } from "@/libs/env";
import { logger } from "@/libs/logger";

const server = app.listen(env.PORT, () => {
  logger.info(`Server is listening on port: ${env.PORT}`);
});

const shutdown = (signal: string) => {
  logger.info(`${signal} received, shutting down...`);

  const forceExit = setTimeout(() => {
    logger.error("Forced shutdown after timeout");
    process.exit(1);
  }, 10000);
  forceExit.unref();

  server.close(async () => {
    try {
      await emailQueue.close();
      await db.$client.end();
      logger.info("Shutdown complete");
      process.exit(0);
    } catch (err) {
      logger.error({ err }, "Error during shutdown");
      process.exit(1);
    }
  });
};

process.on("SIGTERM", () => shutdown("SIGTERM"));

process.on("SIGINT", () => shutdown("SIGINT"));
