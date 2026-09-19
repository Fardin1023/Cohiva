import { auth } from "@/lib/auth/server";
import connectMongoDB from "@/lib/mongodb";
import { finalizeMeetingInDatabase, hasMeetingExpired } from "@/lib/meetings/lifecycle";
import { broadcastRtcEvent, getRtcRoomStats } from "@/lib/rtc/server";
import CohivaRtcRoom from "@/models/CohivaRtcRoom";

type MeetingAccessMode = "open" | "approval" | "locked";
const VALID_MODES = new Set<MeetingAccessMode>(["open", "approval", "locked"]);

const resolveEndedState = async (room: any, callId: string) => {
  if (room.endedAt) return true;
  if (!hasMeetingExpired(room)) return false;
  await finalizeMeetingInDatabase(
    callId,
    room.timerEndsAt ? new Date(room.timerEndsAt) : new Date()
  );
  return true;
};

export async function GET(request: Request) {
  try {
    const { userId } = await auth();
    if (!userId) return Response.json({ error: "Unauthorized." }, { status: 401 });

    const callId = new URL(request.url).searchParams.get("callId")?.trim() || "";
    if (!callId) return Response.json({ error: "Meeting ID is required." }, { status: 400 });

    await connectMongoDB();
    const room = await CohivaRtcRoom.findOne({ callId })
      .select({
        hostUserId: 1,
        accessMode: 1,
        startedAt: 1,
        timerEndsAt: 1,
        endedAt: 1,
      })
      .lean();

    if (!room) return Response.json({ error: "Meeting not found." }, { status: 404 });

    const ended = await resolveEndedState(room, callId);

    return Response.json({
      success: true,
      mode: room.accessMode || "approval",
      teacher: room.hostUserId === userId,
      started: Boolean(room.startedAt) && !ended,
      startedAt: room.startedAt ?? null,
      timerEndsAt: room.timerEndsAt ?? null,
      ended,
    });
  } catch (error) {
    console.error("Read Cohiva access error:", error);
    return Response.json({ error: "Unable to read meeting access settings." }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const { userId } = await auth();
    if (!userId) return Response.json({ error: "Unauthorized." }, { status: 401 });

    const body = await request.json();
    const callId = typeof body.callId === "string" ? body.callId.trim() : "";
    const mode = body.mode as MeetingAccessMode;
    if (!callId || !VALID_MODES.has(mode)) {
      return Response.json({ error: "Invalid access settings." }, { status: 400 });
    }

    await connectMongoDB();
    const room = await CohivaRtcRoom.findOne({ callId });
    if (!room) return Response.json({ error: "Meeting not found." }, { status: 404 });
    if (room.hostUserId !== userId) {
      return Response.json(
        { error: "Only the meeting host can change access settings." },
        { status: 403 }
      );
    }
    if (await resolveEndedState(room, callId)) {
      return Response.json({ error: "This meeting has ended." }, { status: 410 });
    }

    room.accessMode = mode;
    await room.save();

    try {
      await broadcastRtcEvent({
        callId,
        event: "cohiva.access.updated",
        data: { mode },
      });
    } catch (error) {
      console.error("Cohiva access broadcast error:", error);
    }

    return Response.json({ success: true, mode });
  } catch (error) {
    console.error("Update Cohiva access error:", error);
    return Response.json({ error: "Unable to update meeting access settings." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { userId } = await auth();
    if (!userId) return Response.json({ error: "Unauthorized." }, { status: 401 });

    const body = await request.json();
    const callId = typeof body.callId === "string" ? body.callId.trim() : "";
    if (!callId || body.action !== "prepare-open-join") {
      return Response.json({ error: "Invalid meeting access request." }, { status: 400 });
    }

    await connectMongoDB();
    const room = await CohivaRtcRoom.findOne({ callId });
    if (!room) return Response.json({ error: "Meeting not found." }, { status: 404 });
    if (await resolveEndedState(room, callId)) {
      return Response.json({ error: "This meeting has ended." }, { status: 410 });
    }

    if (room.hostUserId === userId) {
      return Response.json({ success: true, mode: room.accessMode });
    }

    if (!room.startedAt) {
      return Response.json(
        { error: "The host has not started this meeting yet.", waitingForHost: true },
        { status: 409 }
      );
    }

    if (room.accessMode !== "open") {
      return Response.json(
        {
          error:
            room.accessMode === "locked"
              ? "This meeting is currently locked."
              : "This meeting requires host approval.",
          mode: room.accessMode,
        },
        { status: 403 }
      );
    }

    try {
      const stats = await getRtcRoomStats(callId);
      const participants = Array.isArray(stats?.participants) ? stats.participants : [];
      const alreadyConnected = participants.some(
        (participant: any) => String(participant?.userId || "") === userId
      );
      const participantCount = Number(stats?.participantCount || 0);
      if (!alreadyConnected && participantCount >= Number(room.maxParticipants || 20)) {
        return Response.json(
          { error: `This meeting is full (${participantCount}/${room.maxParticipants}).` },
          { status: 409 }
        );
      }
    } catch {
      // Final capacity enforcement occurs inside the RTC join action.
    }

    await CohivaRtcRoom.updateOne(
      { callId, endedAt: null },
      { $addToSet: { memberUserIds: userId } }
    );

    return Response.json({ success: true, mode: "open" });
  } catch (error) {
    console.error("Prepare open meeting join error:", error);
    return Response.json({ error: "Unable to prepare meeting access." }, { status: 500 });
  }
}
