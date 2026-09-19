import { auth } from "@/lib/auth/server";
import connectMongoDB from "@/lib/mongodb";
import { finalizeMeetingInDatabase, hasMeetingExpired } from "@/lib/meetings/lifecycle";
import CohivaRtcRoom from "@/models/CohivaRtcRoom";

export async function GET(request: Request) {
  try {
    const { userId } = await auth();
    if (!userId) return Response.json({ error: "Unauthorized." }, { status: 401 });

    const callId = new URL(request.url).searchParams.get("callId")?.trim() || "";
    if (!callId) return Response.json({ error: "Meeting ID is required." }, { status: 400 });

    await connectMongoDB();
    const room = await CohivaRtcRoom.findOne({ callId });
    if (!room) return Response.json({ error: "Meeting not found." }, { status: 404 });

    if (!room.endedAt && hasMeetingExpired(room)) {
      const endedAt = room.timerEndsAt ? new Date(room.timerEndsAt) : new Date();
      await finalizeMeetingInDatabase(callId, endedAt);
      room.endedAt = endedAt;
    }

    return Response.json({
      success: true,
      room: {
        callId: room.callId,
        hostUserId: room.hostUserId,
        teacher: room.hostUserId === userId,
        kind: room.kind,
        title: room.title,
        description: room.description,
        startsAt: room.startsAt,
        startedAt: room.startedAt,
        timerEndsAt: room.timerEndsAt,
        accessMode: room.accessMode,
        durationMinutes: room.durationMinutes,
        maxParticipants: room.maxParticipants,
        endedAt: room.endedAt,
        permissions: room.permissions,
      },
    });
  } catch (error) {
    console.error("Read Cohiva meeting error:", error);
    return Response.json({ error: "Unable to load this meeting." }, { status: 500 });
  }
}
