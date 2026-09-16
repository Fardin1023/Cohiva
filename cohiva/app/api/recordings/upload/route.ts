import { randomUUID } from "node:crypto";
import { createWriteStream } from "node:fs";
import { rename, rm } from "node:fs/promises";
import path from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";

import { auth } from "@/lib/auth/server";
import connectMongoDB from "@/lib/mongodb";
import {
  ensureRecordingsDirectory,
  getRecordingPath,
} from "@/lib/recordings/storage";
import CohivaRtcRoom from "@/models/CohivaRtcRoom";
import MeetingRecording from "@/models/MeetingRecording";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_RECORDING_BYTES = 1_500_000_000;

export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }

  const callId = new URL(request.url).searchParams.get("callId")?.trim() || "";
  if (!callId || !/^[A-Za-z0-9_-]{3,120}$/.test(callId)) {
    return Response.json({ error: "Invalid meeting id." }, { status: 400 });
  }

  const contentType = request.headers.get("content-type")?.split(";")[0].trim() || "";
  if (contentType !== "video/webm") {
    return Response.json(
      { error: "Cohiva recordings must be uploaded as WebM video." },
      { status: 415 }
    );
  }

  if (!request.body) {
    return Response.json({ error: "Recording data is missing." }, { status: 400 });
  }

  await connectMongoDB();

  const room = await CohivaRtcRoom.findOne({ callId })
    .select({ hostUserId: 1, title: 1 })
    .lean();

  if (!room) {
    return Response.json({ error: "Meeting not found." }, { status: 404 });
  }

  if (room.hostUserId !== userId) {
    return Response.json(
      { error: "Only the meeting host can save a recording." },
      { status: 403 }
    );
  }

  const durationHeader = Number(request.headers.get("x-cohiva-duration-ms") || 0);
  const durationMs = Number.isFinite(durationHeader)
    ? Math.max(0, Math.min(12 * 60 * 60 * 1000, Math.round(durationHeader)))
    : 0;

  const recordingId = randomUUID();
  const directory = await ensureRecordingsDirectory();
  const finalPath = getRecordingPath(recordingId, "webm");
  const temporaryPath = path.join(directory, `${recordingId}.uploading`);

  let sizeBytes = 0;

  const counter = new Transform({
    transform(chunk, _encoding, callback) {
      sizeBytes += chunk.length;
      if (sizeBytes > MAX_RECORDING_BYTES) {
        callback(new Error("Recording is too large."));
        return;
      }
      callback(null, chunk);
    },
  });

  try {
    await pipeline(
      Readable.fromWeb(request.body as never),
      counter,
      createWriteStream(temporaryPath, { flags: "wx" })
    );

    if (sizeBytes <= 0) {
      throw new Error("The recording was empty.");
    }

    await rename(temporaryPath, finalPath);

    try {
      const recording = await MeetingRecording.create({
        recordingId,
        callId,
        hostUserId: userId,
        title: room.title || "Cohiva Meeting",
        mimeType: "video/webm",
        extension: "webm",
        sizeBytes,
        durationMs,
      });

      return Response.json({
        success: true,
        recording: {
          id: recording.recordingId,
          callId: recording.callId,
          title: recording.title,
          mimeType: recording.mimeType,
          sizeBytes: recording.sizeBytes,
          durationMs: recording.durationMs,
          createdAt: recording.createdAt,
        },
      });
    } catch (databaseError) {
      await rm(finalPath, { force: true }).catch(() => {});
      throw databaseError;
    }
  } catch (error) {
    await rm(temporaryPath, { force: true }).catch(() => {});
    console.error("Save Cohiva recording error:", error);
    return Response.json(
      {
        error:
          error instanceof Error && error.message === "Recording is too large."
            ? error.message
            : "Cohiva could not save this recording.",
      },
      { status: error instanceof Error && error.message === "Recording is too large." ? 413 : 500 }
    );
  }
}
