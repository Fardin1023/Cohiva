import { auth } from "@/lib/auth/server";
import connectMongoDB from "@/lib/mongodb";
import { endRtcMeeting } from "@/lib/rtc/server";
import CohivaRtcRoom from "@/models/CohivaRtcRoom";
import MeetingAttendance from "@/models/MeetingAttendance";

const HEARTBEAT_TIMEOUT_MS = 55_000;

const finalizeAttendance = async (callId: string, endedAt: Date) => {
  const records = await MeetingAttendance.find({
    callId,
    isPresent: true,
  });

  for (const record of records) {
    let leftAt = endedAt;

    if (record.lastHeartbeatAt) {
      const heartbeatAt = new Date(record.lastHeartbeatAt);
      if (endedAt.getTime() - heartbeatAt.getTime() > HEARTBEAT_TIMEOUT_MS) {
        leftAt = heartbeatAt;
      }
    }

    const startedAt = record.activeSessionStartedAt
      ? new Date(record.activeSessionStartedAt)
      : null;
    const durationSeconds = startedAt
      ? Math.max(0, Math.floor((leftAt.getTime() - startedAt.getTime()) / 1000))
      : 0;

    record.totalSeconds = Number(record.totalSeconds || 0) + durationSeconds;
    record.lastLeftAt = leftAt;
    record.lastHeartbeatAt = leftAt;
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
  }
};

export async function POST(request: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return Response.json({ error: "Unauthorized." }, { status: 401 });
    }

    const body = await request.json();
    const callId = typeof body.callId === "string" ? body.callId.trim() : "";
    if (!callId) {
      return Response.json({ error: "Meeting ID is required." }, { status: 400 });
    }

    await connectMongoDB();
    const room = await CohivaRtcRoom.findOne({ callId });
    if (!room) {
      return Response.json({ error: "Meeting not found." }, { status: 404 });
    }
    if (room.hostUserId !== userId) {
      return Response.json(
        { error: "Only the host can end this meeting." },
        { status: 403 }
      );
    }

    const endedAt = new Date();
    room.endedAt = endedAt;
    await room.save();

    try {
      await finalizeAttendance(callId, endedAt);
    } catch (attendanceError) {
      console.error("Attendance finalization error:", attendanceError);
    }

    try {
      await endRtcMeeting(callId);
    } catch (rtcError) {
      console.error("RTC end broadcast error:", rtcError);
    }

    return Response.json({ success: true, endedAt: endedAt.toISOString() });
  } catch (error) {
    console.error("End Cohiva meeting error:", error);
    return Response.json({ error: "Unable to end this meeting." }, { status: 500 });
  }
}
