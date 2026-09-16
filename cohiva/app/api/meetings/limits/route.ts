import { auth } from "@/lib/auth/server";
import connectMongoDB from "@/lib/mongodb";
import { clampMeetingDurationMinutes, clampMeetingParticipants } from "@/lib/cohivaMeetingConfig";
import { broadcastRtcEvent, getRtcRoomStats } from "@/lib/rtc/server";
import CohivaRtcRoom from "@/models/CohivaRtcRoom";

export async function GET(request: Request) {
  try {
    const { userId } = await auth();
    if (!userId) return Response.json({ error: "Unauthorized." }, { status: 401 });
    const callId = new URL(request.url).searchParams.get("callId")?.trim() || "";
    if (!callId) return Response.json({ error: "Meeting ID is required." }, { status: 400 });
    await connectMongoDB();
    const room = await CohivaRtcRoom.findOne({ callId }).select({ hostUserId: 1, durationMinutes: 1, maxParticipants: 1 }).lean();
    if (!room) return Response.json({ error: "Meeting not found." }, { status: 404 });
    let participantCount = 0;
    try { participantCount = Number((await getRtcRoomStats(callId))?.participantCount || 0); } catch {}
    return Response.json({ success: true, teacher: room.hostUserId === userId, durationMinutes: room.durationMinutes, maxParticipants: room.maxParticipants, participantCount });
  } catch (error) {
    console.error("Read meeting limits error:", error);
    return Response.json({ error: "Unable to read meeting limits." }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const { userId } = await auth();
    if (!userId) return Response.json({ error: "Unauthorized." }, { status: 401 });
    const body = await request.json();
    const callId = typeof body.callId === "string" ? body.callId.trim() : "";
    if (!callId) return Response.json({ error: "Meeting ID is required." }, { status: 400 });
    const durationMinutes = clampMeetingDurationMinutes(body.durationMinutes);
    const maxParticipants = clampMeetingParticipants(body.maxParticipants);
    await connectMongoDB();
    const room = await CohivaRtcRoom.findOne({ callId });
    if (!room) return Response.json({ error: "Meeting not found." }, { status: 404 });
    if (room.hostUserId !== userId) return Response.json({ error: "Only the host can change meeting limits." }, { status: 403 });
    let participantCount = 0;
    try { participantCount = Number((await getRtcRoomStats(callId))?.participantCount || 0); } catch {}
    if (participantCount > maxParticipants) return Response.json({ error: `The participant limit cannot be lower than the ${participantCount} people currently in the meeting.` }, { status: 409 });
    room.durationMinutes = durationMinutes;
    room.maxParticipants = maxParticipants;
    await room.save();
    try {
      await broadcastRtcEvent({ callId, event: "cohiva.limits-persisted", data: { durationMinutes, maxParticipants } });
    } catch {}
    return Response.json({ success: true, durationMinutes, maxParticipants, participantCount });
  } catch (error) {
    console.error("Update meeting limits error:", error);
    return Response.json({ error: "Unable to update meeting limits." }, { status: 500 });
  }
}
