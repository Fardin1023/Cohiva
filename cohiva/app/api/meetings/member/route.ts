import { auth } from "@/lib/auth/server";
import connectMongoDB from "@/lib/mongodb";
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
    const room = await CohivaRtcRoom.findOne({ callId }).lean();
    if (!room) return Response.json({ error: "Meeting not found." }, { status: 404 });
    if (room.endedAt) return Response.json({ error: "This meeting has ended." }, { status: 410 });

    let allowed = room.hostUserId === userId || room.accessMode === "open" || room.memberUserIds?.includes(userId);
    if (!allowed && room.accessMode === "approval") {
      const approved = await MeetingJoinRequest.exists({ callId, userId, status: "approved" });
      allowed = Boolean(approved);
    }
    if (!allowed) return Response.json({ error: room.accessMode === "locked" ? "This meeting is locked." : "Host approval is required." }, { status: 403 });
    await CohivaRtcRoom.updateOne({ callId }, { $addToSet: { memberUserIds: userId } });
    return Response.json({ success: true });
  } catch (error) {
    console.error("Prepare Cohiva membership error:", error);
    return Response.json({ error: "Unable to prepare meeting membership." }, { status: 500 });
  }
}
