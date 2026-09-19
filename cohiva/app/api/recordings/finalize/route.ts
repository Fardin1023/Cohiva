import { del, head } from "@vercel/blob";
import { NextResponse } from "next/server";

import { auth } from "@/lib/auth/server";
import connectMongoDB from "@/lib/mongodb";
import {
  RECORDING_MAX_BYTES,
  usesVercelBlobRecordings,
} from "@/lib/recordings/backend";
import CohivaRtcRoom from "@/models/CohivaRtcRoom";
import MeetingRecording from "@/models/MeetingRecording";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const validCallId = (value: string) => /^[A-Za-z0-9_-]{3,120}$/.test(value);

const parseRecordingId = (pathname: string, callId: string) => {
  const escapedCallId = callId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(
    `^recordings/${escapedCallId}/([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\\.webm$`,
    "i"
  ).exec(pathname);
  return match?.[1] || "";
};

export async function POST(request: Request) {
  if (!usesVercelBlobRecordings()) {
    return NextResponse.json(
      { error: "Vercel Blob recording storage is not enabled." },
      { status: 400 }
    );
  }

  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  let body: {
    callId?: string;
    durationMs?: number;
    pathname?: string;
    url?: string;
    etag?: string;
  } = {};

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const callId = `${body.callId || ""}`.trim();
  const pathname = `${body.pathname || ""}`.trim();
  if (!validCallId(callId)) {
    return NextResponse.json({ error: "Invalid meeting id." }, { status: 400 });
  }

  const recordingId = parseRecordingId(pathname, callId);
  if (!recordingId) {
    return NextResponse.json({ error: "Invalid recording pathname." }, { status: 400 });
  }

  await connectMongoDB();

  const room = await CohivaRtcRoom.findOne({ callId })
    .select({ hostUserId: 1, title: 1 })
    .lean();

  if (!room) {
    return NextResponse.json({ error: "Meeting not found." }, { status: 404 });
  }
  if (room.hostUserId !== userId) {
    return NextResponse.json(
      { error: "Only the meeting host can save a recording." },
      { status: 403 }
    );
  }

  const existing = await MeetingRecording.findOne({ recordingId, hostUserId: userId }).lean();
  if (existing) {
    return NextResponse.json({ success: true, recording: { id: existing.recordingId } });
  }

  try {
    const metadata = await head(pathname);
    const mimeType = metadata.contentType?.split(";")[0]?.trim().toLowerCase() || "";

    if (mimeType !== "video/webm") {
      return NextResponse.json(
        { error: "Uploaded recording is not a WebM video." },
        { status: 415 }
      );
    }

    if (!Number.isFinite(metadata.size) || metadata.size <= 0) {
      return NextResponse.json({ error: "The recording was empty." }, { status: 400 });
    }

    if (metadata.size > RECORDING_MAX_BYTES) {
      await del(pathname).catch(() => {});
      return NextResponse.json({ error: "Recording is too large." }, { status: 413 });
    }

    const durationMs = Number.isFinite(Number(body.durationMs))
      ? Math.max(
          0,
          Math.min(12 * 60 * 60 * 1000, Math.round(Number(body.durationMs)))
        )
      : 0;

    let recording;
    try {
      recording = await MeetingRecording.create({
        recordingId,
        callId,
        hostUserId: userId,
        title: room.title || "Cohiva Meeting",
        mimeType: "video/webm",
        extension: "webm",
        sizeBytes: metadata.size,
        durationMs,
        storageProvider: "vercel-blob",
        blobPathname: metadata.pathname,
        blobUrl: metadata.url,
        blobEtag: metadata.etag || body.etag || "",
      });
    } catch (createError: any) {
      // The Blob completion callback and this browser-driven finalize request
      // may arrive at nearly the same time. If the callback won the race,
      // treat the duplicate key as success rather than surfacing a false 500.
      if (createError?.code !== 11000) throw createError;

      recording = await MeetingRecording.findOne({
        recordingId,
        hostUserId: userId,
      });
      if (!recording) throw createError;
    }

    return NextResponse.json({
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
  } catch (error) {
    console.error("Finalize Cohiva Blob recording error:", error);
    return NextResponse.json(
      { error: "Cohiva could not finalize this recording." },
      { status: 500 }
    );
  }
}
