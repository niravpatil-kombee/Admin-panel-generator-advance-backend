import fs from "fs";
import path from "path";
import { logSuccess } from "./backendGeneratorLogs"; // Assuming this is your success logger

// Define paths for the generated files
const UTILS_PATH = path.join(__dirname, "../../generated-backend/src/utils");
const LOGS_PATH = path.join(__dirname, "../../generated-backend/logs");
const BASE_PATH  = path.join(__dirname, "../../generated-backend");

/**
 * Generates the main logger configuration file (logger.ts)
 * This file sets up Winston with New Relic enrichment and different transports.
 */
const generateLoggerFile = () => {
  const content = `
import winston from 'winston';
import newrelicFormatter from '@newrelic/winston-enricher';

const { combine, timestamp, json, colorize, printf, errors } = winston.format;

// Get the New Relic log formatter
const newrelicLogsFormatter = newrelicFormatter(winston);

/**
 * Main application logger configuration
 */
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: combine(
    errors({ stack: true }), // Log the full stack trace
    timestamp(),
    json(),
    newrelicLogsFormatter() // Adds New Relic context (trace.id, etc.)
  ),
  transports: [
    // We will only log to files in production.
    // In development, logs go to the console.
    // The New Relic agent will forward logs automatically from both.
  ],
  // Handle uncaught exceptions and rejections
  exceptionHandlers: [
    new winston.transports.File({ filename: 'logs/exceptions.log' }),
  ],
  rejectionHandlers: [
    new winston.transports.File({ filename: 'logs/rejections.log' }),
  ],
});

// If we're not in production, add a colorful, human-readable console logger.
if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: combine(
      colorize(),
      timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
      printf((info) => \`\${info.timestamp} \${info.level}: \${info.message}\`)
    ),
  }));
} else {
    // In production, write to combined and error log files.
    logger.add(new winston.transports.File({ filename: 'logs/error.log', level: 'error' }));
    logger.add(new winston.transports.File({ filename: 'logs/combined.log' }));
}

export default logger;
`;
  const filePath = path.join(UTILS_PATH, "logger.ts");
  fs.writeFileSync(filePath, content.trim());
  logSuccess(`✅ Logger configuration generated: ${filePath}`);
};

/**
 * Generates the middleware file for logging HTTP requests (logging.middleware.ts)
 * This uses Morgan to automatically log every incoming API call via Winston.
 */
const generateMiddlewareFile = () => {
  const content = `
import { Request, Response, NextFunction } from "express";
import logger from "./logger";

export function requestLogger(req: Request, res: Response, next: NextFunction) {
  const start = Date.now();

  const oldSend = res.send;
  let responseBody: any;

  // capture response body
  res.send = function (body?: any): Response {
    responseBody = body;
    return oldSend.apply(res, arguments as any);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;

    // Format request/response as pretty JSON
    const formatJSON = (obj: any) => {
      try {
        if (typeof obj === "string") {
          return JSON.stringify(JSON.parse(obj), null, 2); // prettify JSON string
        }
        return JSON.stringify(obj, null, 2); // prettify objects/arrays
      } catch {
        return obj; // fallback if not JSON
      }
    };

    const message = \`\${req.method} \${req.originalUrl} \${res.statusCode} \${duration}ms\`;

    logger.http(message, {
      request: {
        headers: req.headers,
        body: formatJSON(req.body),
        query: req.query,
        params: req.params,
      },
      response: {
        status: res.statusCode,
        body: formatJSON(responseBody),
      },
      meta: {
        duration,
        ip: req.ip,
      },
    });
  });

  next();
}
`;
  const filePath = path.join(UTILS_PATH, "requestLogger.ts");
  fs.writeFileSync(filePath, content.trim());
  logSuccess(`✅ Logging middleware generated: ${filePath}`);
};

const generateNewRelicConfig = () => {
    const newRelicConfigContent = `
'use strict';

exports.config = {
  app_name: [process.env.NEW_RELIC_APP_NAME || 'My Node API'],
  license_key: process.env.NEW_RELIC_LICENSE_KEY, // required
  logging: { level: 'info' },
  allow_all_headers: true,
  attributes: {
    exclude: ['request.headers.cookie','request.headers.authorization']
  },
  // (optional) ensure logs-in-context stays on if you ever tweak defaults
  application_logging: {
    forwarding: { enabled: true }
  }
};

  `;
  
    const filePath = path.join(BASE_PATH, "newrelic.js");
    fs.writeFileSync(filePath, newRelicConfigContent.trim());
    logSuccess(`✅ New Relic config generated: ${filePath}`);
  };

/**
 * The main generator function to be called.
 * It orchestrates the creation of all logging-related files and folders.
 */
export const generateLogManagement = () => {
  // 1. Create the necessary directories if they don't exist
  if (!fs.existsSync(UTILS_PATH)) {
    fs.mkdirSync(UTILS_PATH, { recursive: true });
  }
  if (!fs.existsSync(LOGS_PATH)) {
    fs.mkdirSync(LOGS_PATH, { recursive: true });
  }

  // 2. Generate the individual files
  generateLoggerFile();
  generateMiddlewareFile();
  generateNewRelicConfig();

  logSuccess("✅ All log management files have been generated successfully.");
};