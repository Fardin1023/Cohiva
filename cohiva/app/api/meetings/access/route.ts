import { auth } from "@/lib/auth/server";
import connectMongoDB from "@/lib/mongodb";
import { broadcastRtcEvent } from "@/lib/rtc/server";
import CohivaRtcRoom from "@/models/CohivaRtcRoom";

type MeetingAccessMode = "open" | "approval" | "locked";
const VALID_MODES = new Set<MeetingAccessMode>(["open", "approval", "locked"]);

export async function GET(request: Request) {
  try {
    const { userId } = await auth();
    if (!userId) return Response.json({ error: "Unauthorized." }, { status: 401 });
    const callId = new URL(request.url).searchParams.get("callId")?.trim() || "";
    if (!callId) return Response.json({ error: "Meeting ID is required." }, { status: 400 });
    await connectMongoDB();
    const room = await CohivaRtcRoom.findOne({ callId }).select({ hostUserId: 1, accessMode: 1, endedAt: 1 }).lean();
    if (!room) return Response.json({ error: "Meeting not found." }, { status: 404 });
    return Response.json({ success: true, mode: room.accessMode || "approval", teacher: room.hostUserId === userId, ended: Boolean(room.endedAt) });
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
    if (!callId || !VALID_MODES.has(mode)) return Response.json({ error: "Invalid access settings." }, { status: 400 });
    await connectMongoDB();
    const room = await CohivaRtcRoom.findOne({ callId });
    if (!room) return Response.json({ error: "Meeting not found." }, { status: 404 });
    if (room.hostUserId !== userId) return Response.json({ error: "Only the meeting host can change access settings." }, { status: 403 });
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
    if (!callId || body.action !== "prepare-open-join") return Response.json({ error: "Invalid meeting access request." }, { status: 400 });
    await connectMongoDB();
    const room = await CohivaRtcRoom.findOne({ callId });
    if (!room) return Response.json({ error: "Meeting not found." }, { status: 404 });
    if (room.endedAt) return Response.json({ error: "This meeting has ended." }, { status: 410 });
    if (room.hostUserId === userId) return Response.json({ success: true, mode: room.accessMode });
    if (room.accessMode !== "open") {
      return Response.json(
        { error: room.accessMode === "locked" ? "This meeting is currently locked." : "This meeting requires host approval.", mode: room.accessMode },
        { status: 403 }
      );
    }
    await CohivaRtcRoom.updateOne({ callId }, { $addToSet: { memberUserIds: userId } });
    return Response.json({ success: true, mode: "open" });
  } catch (error) {
    console.error("Prepare open meeting join error:", error);
    return Response.json({ error: "Unable to prepare meeting access." }, { status: 500 });
  }
}
