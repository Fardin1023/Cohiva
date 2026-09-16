import { auth } from "@/lib/auth/server";
import connectMongoDB from "@/lib/mongodb";
import CohivaRtcRoom from "@/models/CohivaRtcRoom";
import MeetingAttendance from "@/models/MeetingAttendance";
import { NextRequest } from "next/server";

const HEARTBEAT_TIMEOUT_MS = 55_000;

const csvCell = (value: unknown) =>
  `"${String(value ?? "").replaceAll('"', '""')}"`;

const formatDuration = (seconds: number) => {
  const safe = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const secs = safe % 60;

  if (hours > 0) return `${hours}h ${minutes}m ${secs}s`;
  if (minutes > 0) return `${minutes}m ${secs}s`;
  return `${secs}s`;
};

const toIso = (value: unknown) => {
  if (!value) return "";
  const date = new Date(value as string | Date);
  return Number.isFinite(date.getTime()) ? date.toISOString() : "";
};

const closeStaleRecord = async (record: any, now: Date) => {
  if (!record.isPresent || !record.lastHeartbeatAt) return false;

  const heartbeatAt = new Date(record.lastHeartbeatAt);
  if (now.getTime() - heartbeatAt.getTime() <= HEARTBEAT_TIMEOUT_MS) {
    return false;
  }

  const leftAt = heartbeatAt;
  const startedAt = record.activeSessionStartedAt
    ? new Date(record.activeSessionStartedAt)
    : null;
  const durationSeconds = startedAt
    ? Math.max(0, Math.floor((leftAt.getTime() - startedAt.getTime()) / 1000))
    : 0;

  record.totalSeconds = Number(record.totalSeconds || 0) + durationSeconds;
  record.lastLeftAt = leftAt;
  record.activeSessionStartedAt = null;
  record.isPresent = false;

  if (Array.isArray(record.sessions)) {
    for (let index = record.sessions.length - 1; index >= 0; index -= 1) {
      const session = record.sessions[index];
      if (!session.leftAt) {
        session.leftAt = leftAt;
        session.durationSeconds = durationSeconds;
        break;
      }
    }
  }

  await record.save();
  return true;
};

export async function GET(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return Response.json({ error: "Unauthorized." }, { status: 401 });
    }

    const callId = request.nextUrl.searchParams.get("callId")?.trim() || "";
    if (!callId) {
      return Response.json({ error: "callId is required." }, { status: 400 });
    }

    await connectMongoDB();

    const room = await CohivaRtcRoom.findOne({ callId, hostUserId: userId })
      .select({ _id: 1 })
      .lean();

    if (!room) {
      return Response.json(
        { error: "Only the meeting creator can export attendance." },
        { status: 403 }
      );
    }

    const records = await MeetingAttendance.find({ callId }).sort({ firstJoinedAt: 1 });
    const now = new Date();
    const rows: string[][] = [];

    for (const record of records) {
      await closeStaleRecord(record, now);

      const heartbeatFresh =
        record.isPresent &&
        record.lastHeartbeatAt &&
        now.getTime() - new Date(record.lastHeartbeatAt).getTime() <= HEARTBEAT_TIMEOUT_MS;

      const liveSeconds =
        heartbeatFresh && record.activeSessionStartedAt
          ? Math.max(
              0,
              Math.floor(
                (now.getTime() - new Date(record.activeSessionStartedAt).getTime()) / 1000
              )
            )
          : 0;

      const totalSeconds = Number(record.totalSeconds || 0) + liveSeconds;

      rows.push([
        String(record.name || "Participant"),
        heartbeatFresh ? "Present" : "Left",
        toIso(record.firstJoinedAt),
        toIso(record.lastJoinedAt),
        heartbeatFresh ? "" : toIso(record.lastLeftAt),
        String(Number(record.joinCount || 0)),
        String(totalSeconds),
        formatDuration(totalSeconds),
      ]);
    }

    const csvRows = [
      [
        "Name",
        "Status",
        "First joined",
        "Last joined",
        "Last left",
        "Join count",
        "Total duration (seconds)",
        "Total duration",
      ],
      ...rows,
    ];

    const csv = `\uFEFF${csvRows.map((row) => row.map(csvCell).join(",")).join("\r\n")}`;
    const safeCallId = callId.replace(/[^a-zA-Z0-9_-]/g, "-");

    return new Response(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="cohiva-attendance-${safeCallId}.csv"`,
        "Cache-Control": "no-store, max-age=0",
      },
    });
  } catch (error) {
    console.error("Cohiva attendance export error:", error);
    return Response.json({ error: "Unable to export attendance." }, { status: 500 });
  }
}
