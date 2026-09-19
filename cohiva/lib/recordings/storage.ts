import "server-only";

import path from "node:path";
import { mkdir } from "node:fs/promises";

export const getRecordingsDirectory = () => {
  const configured = process.env.COHIVA_RECORDINGS_DIR?.trim();

  if (configured) {
    return path.resolve(configured);
  }

  if (
    process.env.NODE_ENV === "production" &&
    process.env.COHIVA_ALLOW_EPHEMERAL_RECORDINGS !== "true"
  ) {
    throw new Error(
      "COHIVA_RECORDINGS_DIR is required in production so recordings use persistent storage."
    );
  }

  return path.join(process.cwd(), "storage", "recordings");
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
