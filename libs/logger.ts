import pino from "pino";
import pretty from "pino-pretty";
import { env } from "@/libs/env";

export const logger =
  env.NODE_ENV === "test"
    ? pino({ level: "silent" })
    : env.NODE_ENV === "development"
      ? pino(pretty({ colorize: true, translateTime: "SYS:HH:MM:ss" }))
      : pino();
