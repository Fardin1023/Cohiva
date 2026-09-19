import { auth } from "@/lib/auth/server";
import connectMongoDB from "@/lib/mongodb";
import { finalizeMeetingInDatabase } from "@/lib/meetings/lifecycle";
import { endRtcMeeting } from "@/lib/rtc/server";
import CohivaRtcRoom from "@/models/CohivaRtcRoom";

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
    const room = await CohivaRtcRoom.findOne({ callId })
      .select({ hostUserId: 1, endedAt: 1 })
      .lean();

    if (!room) {
      return Response.json({ error: "Meeting not found." }, { status: 404 });
    }
    if (room.hostUserId !== userId) {
      return Response.json(
        { error: "Only the host can end this meeting." },
        { status: 403 }
      );
    }

    if (room.endedAt) {
      return Response.json({
        success: true,
        endedAt: new Date(room.endedAt).toISOString(),
        alreadyEnded: true,
      });
    }

    const endedAt = new Date();
    await finalizeMeetingInDatabase(callId, endedAt);

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
