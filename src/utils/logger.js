import dotenv from "dotenv";
import winston from "winston";
import "winston-daily-rotate-file";
import path from "node:path";
import fs from "node:fs";

dotenv.config();

const logDir = "logs";

if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir);
}

const dailyRotateFileTransport = new winston.transports.DailyRotateFile({
  filename: path.join(logDir, "skopos-%DATE%.log"),
  datePattern: "YYYY-MM-DD",
  zippedArchive: true,
  maxSize: "20m",
  maxFiles: "14d",
});

const logLevel = process.env.LOG_LEVEL || (process.env.NODE_ENV === "development" ? "debug" : "info");

const logger = winston.createLogger({
  level: logLevel,
  format: winston.format.combine(
    winston.format.timestamp({
      format: "YYYY-MM-DD HH:mm:ss",
    }),
    winston.format.errors({ stack: true }),
    winston.format.splat(),
    winston.format.json(),
  ),
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(winston.format.colorize(), winston.format.simple()),
    }),
    dailyRotateFileTransport,
  ],
});

export default logger;
