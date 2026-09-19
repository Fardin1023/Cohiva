const appUrl = process.env.COHIVA_APP_URL?.replace(/\/$/, "");
const rtcUrl = process.env.COHIVA_RTC_PUBLIC_URL;

if (!appUrl || !rtcUrl) {
  console.error("Set COHIVA_APP_URL and COHIVA_RTC_PUBLIC_URL before running the smoke check.");
  process.exit(1);
}

let rtcHealthUrl;
try {
  const parsed = new URL(rtcUrl);
  parsed.protocol = parsed.protocol === "wss:" ? "https:" : "http:";
  parsed.pathname = "/health";
  parsed.search = "";
  rtcHealthUrl = parsed.toString();
} catch {
  console.error("COHIVA_RTC_PUBLIC_URL is invalid.");
  process.exit(1);
}

const checks = [
  ["web", `${appUrl}/api/health`],
  ["rtc", rtcHealthUrl],
];

let failed = false;
for (const [name, url] of checks) {
  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(10_000),
      headers: { "User-Agent": "CohivaProductionSmoke/1.0" },
    });
    if (!response.ok) {
      failed = true;
      console.error(`${name}: FAIL (${response.status}) ${url}`);
    } else {
      console.log(`${name}: OK ${url}`);
    }
  } catch (error) {
    failed = true;
    console.error(`${name}: FAIL ${url}`, error instanceof Error ? error.message : error);
  }
}

if (failed) process.exit(1);
console.log("Cohiva production smoke check passed.");
