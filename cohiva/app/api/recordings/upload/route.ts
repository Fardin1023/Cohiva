import { randomUUID } from "node:crypto";
import { createWriteStream } from "node:fs";
import { rename, rm } from "node:fs/promises";
import path from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";

import { head } from "@vercel/blob";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextResponse } from "next/server";

import { auth } from "@/lib/auth/server";
import connectMongoDB from "@/lib/mongodb";
import {
  RECORDING_MAX_BYTES,
  usesVercelBlobRecordings,
} from "@/lib/recordings/backend";
import {
  ensureRecordingsDirectory,
  getRecordingPath,
} from "@/lib/recordings/storage";
import CohivaRtcRoom from "@/models/CohivaRtcRoom";
import MeetingRecording from "@/models/MeetingRecording";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const validCallId = (value: string) => /^[A-Za-z0-9_-]{3,120}$/.test(value);
const validRecordingPath = (pathname: string, callId: string) => {
  const escapedCallId = callId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(
    `^recordings/${escapedCallId}/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\\.webm$`,
    "i"
  ).test(pathname);
};

const verifyHost = async (callId: string, userId: string) => {
  await connectMongoDB();
  const room = await CohivaRtcRoom.findOne({ callId })
    .select({ hostUserId: 1, title: 1 })
    .lean();

  if (!room) throw new Error("Meeting not found.");
  if (room.hostUserId !== userId) {
    throw new Error("Only the meeting host can save a recording.");
  }

  return room;
};

const handleBlobClientUpload = async (request: Request) => {
  if (!usesVercelBlobRecordings()) {
    return NextResponse.json(
      { error: "Vercel Blob recording storage is not enabled." },
      { status: 400 }
    );
  }

  const body = (await request.json()) as HandleUploadBody;

  try {
    const response = await handleUpload({
      request,
      body,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        const { userId } = await auth();
        if (!userId) throw new Error("Unauthorized.");

        let payload: { callId?: string; durationMs?: number } = {};
        try {
          payload = clientPayload ? JSON.parse(clientPayload) : {};
        } catch {
          throw new Error("Invalid recording upload metadata.");
        }

        const callId = `${payload.callId || ""}`.trim();
        if (!validCallId(callId)) throw new Error("Invalid meeting id.");
        if (!validRecordingPath(pathname, callId)) {
          throw new Error("Invalid recording pathname.");
        }

        await verifyHost(callId, userId);

        const durationMs = Number.isFinite(Number(payload.durationMs))
          ? Math.max(
              0,
              Math.min(12 * 60 * 60 * 1000, Math.round(Number(payload.durationMs)))
            )
          : 0;

        return {
          allowedContentTypes: ["video/webm"],
          maximumSizeInBytes: RECORDING_MAX_BYTES,
          addRandomSuffix: false,
          validUntil: Date.now() + 30 * 60_000,
          tokenPayload: JSON.stringify({ callId, userId, durationMs }),
        };
      },
      onUploadCompleted: async ({ blob, tokenPayload }) => {
        // Production fallback: if the browser closes after the direct upload but
        // before /api/recordings/finalize returns, the Blob callback still records
        // the upload in MongoDB. The normal finalize route is idempotent.
        try {
          const payload = JSON.parse(tokenPayload || "{}") as {
            callId?: string;
            userId?: string;
            durationMs?: number;
          };
          const callId = `${payload.callId || ""}`.trim();
          const userId = `${payload.userId || ""}`.trim();
          if (!validCallId(callId) || !userId || !validRecordingPath(blob.pathname, callId)) {
            return;
          }

          await connectMongoDB();
          const room = await CohivaRtcRoom.findOne({ callId })
            .select({ hostUserId: 1, title: 1 })
            .lean();
          if (!room || room.hostUserId !== userId) return;

          const metadata = await head(blob.pathname);
          const recordingId = blob.pathname.split("/").pop()?.replace(/\.webm$/i, "") || "";
          if (!recordingId || metadata.size <= 0 || metadata.size > RECORDING_MAX_BYTES) return;

          await MeetingRecording.findOneAndUpdate(
            { recordingId },
            {
              $setOnInsert: {
                recordingId,
                callId,
                hostUserId: userId,
                title: room.title || "Cohiva Meeting",
                mimeType: "video/webm",
                extension: "webm",
                sizeBytes: metadata.size,
                durationMs: Math.max(
                  0,
                  Math.min(12 * 60 * 60 * 1000, Math.round(Number(payload.durationMs) || 0))
                ),
                storageProvider: "vercel-blob",
                blobPathname: metadata.pathname,
                blobUrl: metadata.url,
                blobEtag: metadata.etag || "",
              },
            },
            { upsert: true, new: true, setDefaultsOnInsert: true }
          );
        } catch (callbackError) {
          console.error("Cohiva Blob upload completion callback error:", callbackError);
          throw callbackError;
        }
      },
    });

    return NextResponse.json(response);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to prepare recording upload.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
};

const handleFilesystemUpload = async (request: Request) => {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }

  const callId = new URL(request.url).searchParams.get("callId")?.trim() || "";
  if (!callId || !validCallId(callId)) {
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

  const room = await verifyHost(callId, userId);

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
      if (sizeBytes > RECORDING_MAX_BYTES) {
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

    if (sizeBytes <= 0) throw new Error("The recording was empty.");
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
        storageProvider: "filesystem",
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
    const tooLarge = error instanceof Error && error.message === "Recording is too large.";
    return Response.json(
      {
        error: tooLarge ? "Recording is too large." : "Cohiva could not save this recording.",
      },
      { status: tooLarge ? 413 : 500 }
    );
  }
};

export async function POST(request: Request) {
  const contentType = request.headers.get("content-type") || "";
  if (contentType.toLowerCase().includes("application/json")) {
    return handleBlobClientUpload(request);
  }

  if (usesVercelBlobRecordings()) {
    return Response.json(
      {
        error:
          "Direct recording uploads are disabled on this deployment. Use Cohiva's Vercel Blob upload flow.",
      },
      { status: 400 }
    );
  }

  return handleFilesystemUpload(request);
}
