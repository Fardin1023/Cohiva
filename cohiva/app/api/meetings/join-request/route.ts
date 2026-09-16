import { auth } from "@/lib/auth/server";
import connectMongoDB from "@/lib/mongodb";
import { getRtcRoomStats } from "@/lib/rtc/server";
import MeetingJoinRequest from "@/models/MeetingJoinRequest";
import CohivaRtcRoom from "@/models/CohivaRtcRoom";

const PENDING_REQUEST_MAX_AGE = 15 * 60 * 1000;

export async function GET(request: Request) {
  try {
    const { userId } = await auth();
    if (!userId) return Response.json({ error: "Unauthorized." }, { status: 401 });
    const url = new URL(request.url);
    const callId = url.searchParams.get("callId")?.trim() || "";
    const scope = url.searchParams.get("scope") || "mine";
    if (!callId) return Response.json({ error: "Meeting ID is required." }, { status: 400 });
    await connectMongoDB();
    if (scope === "mine") {
      const item = await MeetingJoinRequest.findOne({ callId, userId }).select({ _id: 0, status: 1 }).lean();
      return Response.json({ success: true, status: item?.status ?? null });
    }
    if (scope !== "pending") return Response.json({ error: "Invalid request scope." }, { status: 400 });
    const room = await CohivaRtcRoom.findOne({ callId }).select({ hostUserId: 1 }).lean();
    if (!room) return Response.json({ error: "Meeting not found." }, { status: 404 });
    if (room.hostUserId !== userId) return Response.json({ error: "Only the meeting host can view the waiting room." }, { status: 403 });
    const oldestAllowed = new Date(Date.now() - PENDING_REQUEST_MAX_AGE);
    const requests = await MeetingJoinRequest.find({ callId, status: "pending", requestedAt: { $gte: oldestAllowed } })
      .sort({ requestedAt: 1 })
      .select({ _id: 0, userId: 1, name: 1, image: 1, requestedAt: 1, status: 1 })
      .lean();
    return Response.json({ success: true, requests });
  } catch (error) {
    console.error("Cohiva waiting room GET error:", error);
    return Response.json({ error: "Unable to load the waiting room." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { userId } = await auth();
    if (!userId) return Response.json({ error: "Unauthorized." }, { status: 401 });
    const body = await request.json();
    const callId = typeof body.callId === "string" ? body.callId.trim() : "";
    const action = body.action;
    if (!callId) return Response.json({ error: "Meeting ID is required." }, { status: 400 });
    await connectMongoDB();
    const room = await CohivaRtcRoom.findOne({ callId });
    if (!room) return Response.json({ error: "Meeting not found." }, { status: 404 });
    if (room.endedAt) return Response.json({ error: "This meeting has ended." }, { status: 410 });

    if (action === "request") {
      if (room.hostUserId === userId) return Response.json({ success: true, status: "approved", accessMode: room.accessMode });
      if (room.accessMode === "open") {
        await CohivaRtcRoom.updateOne({ callId }, { $addToSet: { memberUserIds: userId } });
        return Response.json({ success: true, status: "open", accessMode: "open" });
      }
      if (room.accessMode === "locked") return Response.json({ error: "The host has locked this meeting.", accessMode: "locked" }, { status: 403 });
      const existing = await MeetingJoinRequest.findOne({ callId, userId }).select({ status: 1 }).lean();
      if (existing?.status === "approved") {
        await CohivaRtcRoom.updateOne({ callId }, { $addToSet: { memberUserIds: userId } });
        return Response.json({ success: true, status: "approved", accessMode: "approval" });
      }
      const name = typeof body.name === "string" ? body.name.trim().slice(0, 120) : "Participant";
      const image = typeof body.image === "string" ? body.image.trim().slice(0, 1000) : "";
      await MeetingJoinRequest.findOneAndUpdate(
        { callId, userId },
        { $set: { name, image, status: "pending", requestedAt: new Date(), decidedAt: null } },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
      return Response.json({ success: true, status: "pending", accessMode: "approval" });
    }

    if (action !== "approve" && action !== "deny") return Response.json({ error: "Invalid waiting-room action." }, { status: 400 });
    if (room.hostUserId !== userId) return Response.json({ error: "Only the meeting host can approve participants." }, { status: 403 });
    const targetUserId = typeof body.targetUserId === "string" ? body.targetUserId.trim() : "";
    if (!targetUserId) return Response.json({ error: "Participant is required." }, { status: 400 });
    const joinRequest = await MeetingJoinRequest.findOne({ callId, userId: targetUserId });
    if (!joinRequest) return Response.json({ error: "This join request no longer exists." }, { status: 404 });

    if (action === "approve") {
      let participantCount = 0;
      try {
        const stats = await getRtcRoomStats(callId);
        participantCount = Number(stats?.participantCount || 0);
      } catch {}
      if (participantCount >= room.maxParticipants) {
        return Response.json({ error: `This meeting is full (${participantCount}/${room.maxParticipants}).` }, { status: 409 });
      }
      joinRequest.status = "approved";
      await CohivaRtcRoom.updateOne({ callId }, { $addToSet: { memberUserIds: targetUserId } });
    } else {
      joinRequest.status = "denied";
    }
    joinRequest.decidedAt = new Date();
    await joinRequest.save();
    return Response.json({ success: true, status: joinRequest.status });
  } catch (error) {
    console.error("Cohiva waiting room POST error:", error);
    return Response.json({ error: "Unable to update the waiting room." }, { status: 500 });
  }
}
