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

const env = { ...parseEnvFile(path.resolve(envFile)), ...process.env };
const errors = [];
const warnings = [];

const required = [
  "MONGODB_URI",
  "COHIVA_RTC_SECRET",
  "COHIVA_RTC_PUBLIC_URL",
  "COHIVA_RTC_INTERNAL_URL",
  "SMTP_HOST",
  "SMTP_PORT",
  "SMTP_FROM",
  "COHIVA_RECORDING_STORAGE",
  "NEXT_PUBLIC_COHIVA_RECORDING_STORAGE",
];

for (const key of required) {
  if (!String(env[key] || "").trim()) errors.push(`${key} is required.`);
}

const appUrl = String(env.COHIVA_APP_URL || "").trim();
const vercelProductionUrl = String(env.VERCEL_PROJECT_PRODUCTION_URL || "").trim();
if (!appUrl && !vercelProductionUrl) {
  warnings.push("Set COHIVA_APP_URL in Vercel for stable password-reset links. Vercel's production URL is used as fallback at runtime.");
}

const placeholderPatterns = [
  /replace-with/i,
  /example\.com/i,
  /203\.0\.113\./,
  /USER:PASSWORD/,
  /YOUR_CLUSTER/i,
  /your-project/i,
];

for (const key of [
  "MONGODB_URI",
  "COHIVA_APP_URL",
  "COHIVA_RTC_SECRET",
  "COHIVA_RTC_PUBLIC_URL",
  "COHIVA_RTC_INTERNAL_URL",
  "SMTP_HOST",
  "SMTP_PASS",
  "SMTP_FROM",
]) {
  const value = String(env[key] || "");
  if (value && placeholderPatterns.some((pattern) => pattern.test(value))) {
    errors.push(`${key} still contains an example/placeholder value.`);
  }
}

const validateUrl = (key, protocols) => {
  const value = String(env[key] || "").trim();
  if (!value) return;
  try {
    const parsed = new URL(value);
    if (!protocols.includes(parsed.protocol)) {
      errors.push(`${key} must use ${protocols.join(" or ")}.`);
    }
  } catch {
    errors.push(`${key} is not a valid URL.`);
  }
};

validateUrl("COHIVA_APP_URL", ["https:"]);
validateUrl("COHIVA_RTC_PUBLIC_URL", ["wss:"]);
validateUrl("COHIVA_RTC_INTERNAL_URL", ["https:"]);

if (String(env.COHIVA_RTC_SECRET || "").length < 32) {
  errors.push("COHIVA_RTC_SECRET must be at least 32 characters.");
}

if (env.COHIVA_RECORDING_STORAGE !== "vercel-blob") {
  errors.push("COHIVA_RECORDING_STORAGE must be vercel-blob for the Vercel deployment.");
}
if (env.NEXT_PUBLIC_COHIVA_RECORDING_STORAGE !== "vercel-blob") {
  errors.push("NEXT_PUBLIC_COHIVA_RECORDING_STORAGE must be vercel-blob for the Vercel deployment.");
}

const smtpPort = Number(env.SMTP_PORT);
if (!Number.isInteger(smtpPort) || smtpPort < 1 || smtpPort > 65535) {
  errors.push("SMTP_PORT must be a valid TCP port.");
}
if (!['true', 'false'].includes(String(env.SMTP_SECURE || 'false').toLowerCase())) {
  errors.push("SMTP_SECURE must be true or false.");
}
if (Boolean(env.SMTP_USER) !== Boolean(env.SMTP_PASS)) {
  errors.push("SMTP_USER and SMTP_PASS must either both be set or both be empty.");
}

try {
  const ws = new URL(String(env.COHIVA_RTC_PUBLIC_URL || ""));
  const control = new URL(String(env.COHIVA_RTC_INTERNAL_URL || ""));
  if (ws.hostname && control.hostname && ws.hostname !== control.hostname) {
    warnings.push("COHIVA_RTC_PUBLIC_URL and COHIVA_RTC_INTERNAL_URL use different hosts. Verify this is intentional.");
  }
} catch {}

for (const key of ["NEXT_PUBLIC_STREAM_API_KEY", "STREAM_API_SECRET", "COHIVA_RECORDINGS_DIR"]) {
  if (String(env[key] || "").trim()) {
    warnings.push(`${key} is not used by the Vercel web deployment and should be removed there.`);
  }
}

if (!env.BLOB_READ_WRITE_TOKEN && !process.env.VERCEL) {
  warnings.push("No BLOB_READ_WRITE_TOKEN is present locally. That is fine when Vercel Private Blob uses project OIDC, but local Blob testing needs credentials (for example via `vercel env pull`).");
}

if (!fs.existsSync(envFile)) {
  warnings.push(`${envFile} was not found; preflight used only the current shell environment.`);
}

if (warnings.length) {
  console.log("\nWarnings:");
  for (const warning of warnings) console.log(`  - ${warning}`);
}

if (errors.length) {
  console.error("\nVercel preflight failed:");
  for (const error of errors) console.error(`  - ${error}`);
  process.exit(1);
}

console.log("\nCohiva Vercel preflight passed.");
