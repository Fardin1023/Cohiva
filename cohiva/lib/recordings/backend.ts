import "server-only";

export const RECORDING_MAX_BYTES = 1_500_000_000;

export const usesVercelBlobRecordings = () =>
  process.env.COHIVA_RECORDING_STORAGE?.trim().toLowerCase() === "vercel-blob" ||
  process.env.VERCEL === "1";

export const sanitizeRecordingPathSegment = (value: string) =>
  value.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 120);
