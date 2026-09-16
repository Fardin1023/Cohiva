import { auth } from "@/lib/auth/server";
import connectMongoDB from "@/lib/mongodb";
import CohivaRtcRoom from "@/models/CohivaRtcRoom";

export async function GET(request: Request) {
  try {
    const { userId } = await auth();
    if (!userId) return Response.json({ error: "Unauthorized." }, { status: 401 });

    const callId = new URL(request.url).searchParams.get("callId")?.trim() || "";
    if (!callId) return Response.json({ error: "Meeting ID is required." }, { status: 400 });

    await connectMongoDB();
    const room = await CohivaRtcRoom.findOne({ callId }).lean();
    if (!room) return Response.json({ error: "Meeting not found." }, { status: 404 });

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
