import fs from "node:fs";
import path from "node:path";

const envFile = process.env.COHIVA_RTC_PREFLIGHT_ENV || ".env.rtc";
const parse = (filePath) => {
  if (!fs.existsSync(filePath)) return {};
  const out = {};
  for (const raw of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const match = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(line);
    if (!match) continue;
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    out[match[1]] = value;
  }
  return out;
};

const env = { ...parse(path.resolve(envFile)), ...process.env };
const errors = [];
const required = [
  "MONGODB_URI",
  "COHIVA_RTC_DOMAIN",
  "COHIVA_PUBLIC_IP",
  "COHIVA_RTC_SECRET",
  "COHIVA_RTC_ALLOWED_ORIGINS",
  "COHIVA_TURN_URLS",
  "COHIVA_TURN_SECRET",
];
for (const key of required) if (!String(env[key] || "").trim()) errors.push(`${key} is required.`);

if (String(env.COHIVA_RTC_SECRET || "").length < 32) errors.push("COHIVA_RTC_SECRET must be at least 32 characters.");
if (String(env.COHIVA_TURN_SECRET || "").length < 32) errors.push("COHIVA_TURN_SECRET must be at least 32 characters.");
if (env.COHIVA_RTC_SECRET && env.COHIVA_RTC_SECRET === env.COHIVA_TURN_SECRET) errors.push("COHIVA_RTC_SECRET and COHIVA_TURN_SECRET must be different.");

const origins = String(env.COHIVA_RTC_ALLOWED_ORIGINS || "").split(",").map((v) => v.trim()).filter(Boolean);
for (const origin of origins) {
  try {
    const url = new URL(origin);
    if (url.protocol !== "https:") errors.push(`RTC allowed origin must use HTTPS: ${origin}`);
  } catch {
    errors.push(`Invalid RTC allowed origin: ${origin}`);
  }
}

const turnUrls = String(env.COHIVA_TURN_URLS || "").split(",").map((v) => v.trim()).filter(Boolean);
if (turnUrls.some((url) => !/^turns?:/i.test(url))) errors.push("Every COHIVA_TURN_URLS entry must start with turn: or turns:.");

const ip = String(env.COHIVA_PUBLIC_IP || "").trim();
if (/^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(ip)) errors.push("COHIVA_PUBLIC_IP must be a public address, not a private/loopback address.");

if (errors.length) {
  console.error("\nRTC preflight failed:");
  for (const error of errors) console.error(`  - ${error}`);
  process.exit(1);
}
console.log("\nCohiva RTC preflight passed.");
