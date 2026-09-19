import { auth } from "@/lib/auth/server";
import connectMongoDB from "@/lib/mongodb";
import { finalizeMeetingInDatabase, hasMeetingExpired } from "@/lib/meetings/lifecycle";
import { getRtcRoomStats } from "@/lib/rtc/server";
import MeetingJoinRequest from "@/models/MeetingJoinRequest";
import CohivaRtcRoom from "@/models/CohivaRtcRoom";

export async function POST(request: Request) {
  try {
    const { userId } = await auth();
    if (!userId) return Response.json({ error: "Unauthorized." }, { status: 401 });

    const body = await request.json();
    const callId = typeof body.callId === "string" ? body.callId.trim() : "";
    if (!callId) return Response.json({ error: "Meeting ID is required." }, { status: 400 });

    await connectMongoDB();
    const room = await CohivaRtcRoom.findOne({ callId });
    if (!room) return Response.json({ error: "Meeting not found." }, { status: 404 });
    if (room.endedAt) return Response.json({ error: "This meeting has ended." }, { status: 410 });

    if (hasMeetingExpired(room)) {
      await finalizeMeetingInDatabase(
        callId,
        room.timerEndsAt ? new Date(room.timerEndsAt) : new Date()
      );
      return Response.json({ error: "This meeting has ended." }, { status: 410 });
    }

    const isHost = room.hostUserId === userId;
    if (!isHost && !room.startedAt) {
      return Response.json(
        { error: "The host has not started this meeting yet.", waitingForHost: true },
        { status: 409 }
      );
    }

    let allowed =
      isHost ||
      room.accessMode === "open" ||
      room.memberUserIds?.includes(userId);

    if (!allowed && room.accessMode === "approval") {
      const approved = await MeetingJoinRequest.exists({
        callId,
        userId,
        status: "approved",
      });
      allowed = Boolean(approved);
    }

    if (!allowed) {
      return Response.json(
        {
          error:
            room.accessMode === "locked"
              ? "This meeting is locked."
              : "Host approval is required.",
        },
        { status: 403 }
      );
    }

    if (!isHost) {
      try {
        const stats = await getRtcRoomStats(callId);
        const participants = Array.isArray(stats?.participants) ? stats.participants : [];
        const alreadyConnected = participants.some(
          (participant: any) => String(participant?.userId || "") === userId
        );
        const participantCount = Number(stats?.participantCount || 0);
        if (!alreadyConnected && participantCount >= Number(room.maxParticipants || 20)) {
          return Response.json(
            {
              error: `This meeting is full (${participantCount}/${room.maxParticipants}).`,
            },
            { status: 409 }
          );
        }
      } catch {
        // The RTC join action remains the final race-safe capacity gate.
      }
    }

    await CohivaRtcRoom.updateOne(
      { callId, endedAt: null },
      { $addToSet: { memberUserIds: userId } }
    );

    return Response.json({
      success: true,
      startedAt: room.startedAt,
      timerEndsAt: room.timerEndsAt,
    });
  } catch (error) {
    console.error("Prepare Cohiva membership error:", error);
    return Response.json({ error: "Unable to prepare meeting membership." }, { status: 500 });
  }
}
