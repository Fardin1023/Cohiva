import "server-only";

import path from "node:path";
import { mkdir } from "node:fs/promises";

export const getRecordingsDirectory = () => {
  const configured = process.env.COHIVA_RECORDINGS_DIR?.trim();
  return configured
    ? path.resolve(configured)
    : path.join(process.cwd(), "storage", "recordings");
};

export const ensureRecordingsDirectory = async () => {
  const directory = getRecordingsDirectory();
  await mkdir(directory, { recursive: true });
  return directory;
};

export const getRecordingPath = (
  recordingId: string,
  extension = "webm"
) =>
  path.join(
    getRecordingsDirectory(),
    `${recordingId}.${extension.replace(/[^a-z0-9]/gi, "").toLowerCase() || "webm"}`
  );
