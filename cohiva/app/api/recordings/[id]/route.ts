import { createReadStream } from "node:fs";
import { rm, stat } from "node:fs/promises";
import { Readable } from "node:stream";

import { del, issueSignedToken, presignUrl } from "@vercel/blob";
import { NextResponse } from "next/server";

import { auth } from "@/lib/auth/server";
import connectMongoDB from "@/lib/mongodb";
import { getRecordingPath } from "@/lib/recordings/storage";
import MeetingRecording from "@/models/MeetingRecording";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const safeFileName = (title: string) =>
  `${title || "Cohiva Meeting"}`
    .replace(/[^a-z0-9 _-]/gi, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 80) || "cohiva-recording";

const getOwnedRecording = async (recordingId: string, userId: string) => {
  await connectMongoDB();
  return MeetingRecording.findOne({ recordingId, hostUserId: userId }).lean();
};

const createBlobReadUrl = async (pathname: string) => {
  const validUntil = Date.now() + 6 * 60 * 60_000;
  const token = await issueSignedToken({
    operations: ["get"],
  });
  const { presignedUrl } = await presignUrl(token, {
    pathname,
    operation: "get",
    access: "private",
    validUntil,
  });
  return { presignedUrl, validUntil };
};

const serveFilesystemRecording = async (
  request: Request,
  recording: any
) => {
  const filePath = getRecordingPath(recording.recordingId, recording.extension || "webm");

  let fileStats;
  try {
    fileStats = await stat(filePath);
  } catch {
    return new Response("Recording file not found", { status: 404 });
  }

  const total = fileStats.size;
  const range = request.headers.get("range");
  const download = new URL(request.url).searchParams.get("download") === "1";
  const baseHeaders: Record<string, string> = {
    "Content-Type": recording.mimeType || "video/webm",
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, no-store",
    "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${safeFileName(recording.title)}.${recording.extension || "webm"}"`,
  };

  if (!range) {
    const stream = createReadStream(filePath);
    return new Response(Readable.toWeb(stream) as ReadableStream, {
      status: 200,
      headers: {
        ...baseHeaders,
        "Content-Length": String(total),
      },
    });
  }

  const match = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
  if (!match) {
    return new Response("Invalid range", {
      status: 416,
      headers: { "Content-Range": `bytes */${total}` },
    });
  }

  let start = match[1] ? Number(match[1]) : 0;
  let end = match[2] ? Number(match[2]) : total - 1;

  if (!match[1] && match[2]) {
    const suffixLength = Math.min(total, Number(match[2]));
    start = total - suffixLength;
    end = total - 1;
  }

  if (
    !Number.isInteger(start) ||
    !Number.isInteger(end) ||
    start < 0 ||
    end < start ||
    start >= total
  ) {
    return new Response("Invalid range", {
      status: 416,
      headers: { "Content-Range": `bytes */${total}` },
    });
  }

  end = Math.min(end, total - 1);
  const stream = createReadStream(filePath, { start, end });

  return new Response(Readable.toWeb(stream) as ReadableStream, {
    status: 206,
    headers: {
      ...baseHeaders,
      "Content-Length": String(end - start + 1),
      "Content-Range": `bytes ${start}-${end}/${total}`,
    },
  });
};

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { userId } = await auth();
  if (!userId) return new Response("Unauthorized", { status: 401 });

  const { id } = await context.params;
  const recording = await getOwnedRecording(id, userId);
  if (!recording) return new Response("Not found", { status: 404 });

  if (recording.storageProvider === "vercel-blob" && recording.blobPathname) {
    try {
      const { presignedUrl, validUntil } = await createBlobReadUrl(recording.blobPathname);
      const wantsJson = new URL(request.url).searchParams.get("format") === "json";

      if (wantsJson) {
        return NextResponse.json(
          {
            success: true,
            url: presignedUrl,
            expiresAt: new Date(validUntil).toISOString(),
            fileName: `${safeFileName(recording.title)}.${recording.extension || "webm"}`,
          },
          { headers: { "Cache-Control": "private, no-store" } }
        );
      }

      return NextResponse.redirect(presignedUrl, 307);
    } catch (error) {
      console.error("Create Cohiva recording access URL error:", error);
      return new Response("Recording is temporarily unavailable", { status: 503 });
    }
  }

  return serveFilesystemRecording(request, recording);
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { id } = await context.params;
  const recording = await getOwnedRecording(id, userId);
  if (!recording) {
    return Response.json({ error: "Recording not found." }, { status: 404 });
  }

  try {
    if (recording.storageProvider === "vercel-blob" && recording.blobPathname) {
      await del(recording.blobPathname);
    } else {
      const filePath = getRecordingPath(recording.recordingId, recording.extension || "webm");
      await rm(filePath, { force: true }).catch(() => {});
    }

    await MeetingRecording.deleteOne({ _id: recording._id, hostUserId: userId });
    return Response.json({ success: true });
  } catch (error) {
    console.error("Delete Cohiva recording error:", error);
    return Response.json(
      { error: "Unable to delete the recording right now." },
      { status: 500 }
    );
  }
}
