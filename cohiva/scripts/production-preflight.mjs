import fs from "node:fs";
import path from "node:path";

const envFile = process.env.COHIVA_PREFLIGHT_ENV || ".env.production";

const parseEnvFile = (filePath) => {
  if (!fs.existsSync(filePath)) return {};
  const result = {};
  for (const rawLine of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const match = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(line);
    if (!match) continue;
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    result[match[1]] = value;
  }
  return result;
};

const fileEnv = parseEnvFile(path.resolve(envFile));
const env = { ...fileEnv, ...process.env };
const errors = [];
const warnings = [];

const required = [
  "MONGODB_URI",
  "COHIVA_APP_DOMAIN",
  "COHIVA_RTC_DOMAIN",
  "COHIVA_APP_URL",
  "COHIVA_RTC_SECRET",
  "COHIVA_RTC_PUBLIC_URL",
  "COHIVA_RTC_ALLOWED_ORIGINS",
  "COHIVA_PUBLIC_IP",
  "COHIVA_RECORDINGS_DIR",
  "SMTP_HOST",
  "SMTP_PORT",
  "SMTP_FROM",
  "COHIVA_TURN_URLS",
  "COHIVA_TURN_SECRET",
];

for (const key of required) {
  if (!String(env[key] || "").trim()) errors.push(`${key} is required.`);
}

const placeholderPatterns = [
  /replace-with/i,
  /example\.com/i,
  /192\.0\.2\./,
  /198\.51\.100\./,
  /203\.0\.113\./,
  /USER:PASSWORD/,
];
for (const key of [
  "MONGODB_URI",
  "COHIVA_APP_DOMAIN",
  "COHIVA_RTC_DOMAIN",
  "COHIVA_APP_URL",
  "COHIVA_RTC_SECRET",
  "COHIVA_RTC_PUBLIC_URL",
  "COHIVA_PUBLIC_IP",
  "SMTP_HOST",
  "SMTP_PASS",
  "SMTP_FROM",
  "COHIVA_TURN_URLS",
  "COHIVA_TURN_SECRET",
]) {
  const value = String(env[key] || "");
  if (value && placeholderPatterns.some((pattern) => pattern.test(value))) {
    errors.push(`${key} still contains an example/placeholder value.`);
  }
}

const validateUrl = (key, allowedProtocols) => {
  const value = String(env[key] || "").trim();
  if (!value) return;
  try {
    const parsed = new URL(value);
    if (!allowedProtocols.includes(parsed.protocol)) {
      errors.push(`${key} must use ${allowedProtocols.join(" or ")}.`);
    }
  } catch {
    errors.push(`${key} is not a valid URL.`);
  }
};

validateUrl("COHIVA_APP_URL", ["https:"]);
validateUrl("COHIVA_RTC_PUBLIC_URL", ["wss:"]);

try {
  const appUrl = new URL(String(env.COHIVA_APP_URL || ""));
  if (env.COHIVA_APP_DOMAIN && appUrl.hostname !== env.COHIVA_APP_DOMAIN) {
    errors.push("COHIVA_APP_DOMAIN must match the hostname in COHIVA_APP_URL.");
  }
} catch {}

try {
  const rtcUrl = new URL(String(env.COHIVA_RTC_PUBLIC_URL || ""));
  if (env.COHIVA_RTC_DOMAIN && rtcUrl.hostname !== env.COHIVA_RTC_DOMAIN) {
    errors.push("COHIVA_RTC_DOMAIN must match the hostname in COHIVA_RTC_PUBLIC_URL.");
  }
} catch {}

if (String(env.COHIVA_RTC_SECRET || "").length < 32) {
  errors.push("COHIVA_RTC_SECRET must be at least 32 characters.");
}

if (String(env.COHIVA_TURN_SECRET || "").length < 32) {
  errors.push("COHIVA_TURN_SECRET must be at least 32 characters.");
}

const smtpPort = Number(env.SMTP_PORT);
if (!Number.isInteger(smtpPort) || smtpPort < 1 || smtpPort > 65535) {
  errors.push("SMTP_PORT must be a valid TCP port.");
}
if (!["true", "false"].includes(String(env.SMTP_SECURE || "false").toLowerCase())) {
  errors.push("SMTP_SECURE must be true or false.");
}
if (Boolean(env.SMTP_USER) !== Boolean(env.SMTP_PASS)) {
  errors.push("SMTP_USER and SMTP_PASS must either both be set or both be empty.");
}

const recordingDir = String(env.COHIVA_RECORDINGS_DIR || "");
if (recordingDir && !path.isAbsolute(recordingDir)) {
  errors.push("COHIVA_RECORDINGS_DIR must be an absolute path in production.");
}

const appOrigin = (() => {
  try {
    return new URL(String(env.COHIVA_APP_URL || "")).origin;
  } catch {
    return "";
  }
})();

const allowedOrigins = String(env.COHIVA_RTC_ALLOWED_ORIGINS || "")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);
if (appOrigin && !allowedOrigins.includes(appOrigin)) {
  errors.push("COHIVA_RTC_ALLOWED_ORIGINS must include the COHIVA_APP_URL origin.");
}

const turnUrls = String(env.COHIVA_TURN_URLS || "")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);
if (turnUrls.some((value) => !/^turns?:/i.test(value))) {
  errors.push("Every COHIVA_TURN_URLS entry must start with turn: or turns:.");
}

const publicIp = String(env.COHIVA_PUBLIC_IP || "").trim();
if (/^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(publicIp)) {
  warnings.push("COHIVA_PUBLIC_IP looks private/loopback. Production mediasoup needs the VPS public IP.");
}

for (const key of ["NEXT_PUBLIC_STREAM_API_KEY", "STREAM_API_SECRET"]) {
  if (String(env[key] || "").trim()) {
    warnings.push(`${key} is obsolete and should be removed from the production environment.`);
  }
}

if (env.NODE_ENV && env.NODE_ENV !== "production") {
  warnings.push("NODE_ENV is not set to production.");
}

if (!fs.existsSync(envFile)) {
  warnings.push(`${envFile} was not found; preflight used only the current shell environment.`);
}

if (warnings.length) {
  console.log("\nWarnings:");
  for (const warning of warnings) console.log(`  - ${warning}`);
}

if (errors.length) {
  console.error("\nProduction preflight failed:");
  for (const error of errors) console.error(`  - ${error}`);
  process.exit(1);
}

console.log("\nCohiva production preflight passed.");
