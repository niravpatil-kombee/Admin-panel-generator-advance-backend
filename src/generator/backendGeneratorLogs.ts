import fs from "fs";
import path from "path";

const logsDir = path.join(__dirname, "../logs");
if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });

const successLogPath = path.join(logsDir, "generator-success.log");
const errorLogPath = path.join(logsDir, "generator-error.log");
const testlogPath = path.join(logsDir, "test.log");

// Reset logs on every generator run
fs.writeFileSync(successLogPath, "");
fs.writeFileSync(errorLogPath, "");
fs.writeFileSync(testlogPath, "");

export const logSuccess = (message: string) => {
  fs.appendFileSync(
    successLogPath,
    `[${new Date().toISOString()}] ${message}\n`
  );
};

export const logError = (message: string) => {
  fs.appendFileSync(errorLogPath, `[${new Date().toISOString()}] ${message}\n`);
};

export const logTest = (data: unknown) => {
  let message: string;

  if (data instanceof Error) {
    message = `${data.name}: ${data.message}\n${data.stack || ""}`;
  } else if (typeof data === "object") {
    try {
      message = JSON.stringify(data, null, 2); // pretty-print objects
    } catch {
      message = String(data); // fallback if circular reference
    }
  } else {
    message = String(data);
  }

  fs.appendFileSync(testlogPath, `[${new Date().toISOString()}] ${message}\n`);
};
