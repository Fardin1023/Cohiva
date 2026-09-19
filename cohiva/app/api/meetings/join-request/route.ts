import { auth } from "@/lib/auth/server";
import connectMongoDB from "@/lib/mongodb";
import { finalizeMeetingInDatabase, hasMeetingExpired } from "@/lib/meetings/lifecycle";
import { getRtcRoomStats } from "@/lib/rtc/server";
import MeetingJoinRequest from "@/models/MeetingJoinRequest";
import CohivaRtcRoom from "@/models/CohivaRtcRoom";

const PENDING_REQUEST_MAX_AGE = 15 * 60 * 1000;

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

    const url = new URL(request.url);
    const callId = url.searchParams.get("callId")?.trim() || "";
    const scope = url.searchParams.get("scope") || "mine";
    if (!callId) return Response.json({ error: "Meeting ID is required." }, { status: 400 });

    await connectMongoDB();
    const room = await CohivaRtcRoom.findOne({ callId })
      .select({
        hostUserId: 1,
        accessMode: 1,
        memberUserIds: 1,
        startedAt: 1,
        timerEndsAt: 1,
        endedAt: 1,
      })
      .lean();

    if (!room) return Response.json({ error: "Meeting not found." }, { status: 404 });
    if (await resolveEndedState(room, callId)) {
      return Response.json({ error: "This meeting has ended.", ended: true }, { status: 410 });
    }

    if (scope === "mine") {
      const item = await MeetingJoinRequest.findOne({ callId, userId })
        .select({ _id: 0, status: 1, requestedAt: 1, decidedAt: 1 })
        .lean();

      let status = item?.status ?? null;
      if (
        status === "pending" &&
        item?.requestedAt &&
        Date.now() - new Date(item.requestedAt).getTime() > PENDING_REQUEST_MAX_AGE
      ) {
        status = null;
      }

      const admitted =
        room.hostUserId === userId ||
        Boolean(room.memberUserIds?.includes(userId)) ||
        status === "approved";

      return Response.json({
        success: true,
        status,
        admitted,
        accessMode: room.accessMode || "approval",
        started: Boolean(room.startedAt),
        startedAt: room.startedAt ?? null,
        timerEndsAt: room.timerEndsAt ?? null,
      });
    }

    if (scope !== "pending") {
      return Response.json({ error: "Invalid request scope." }, { status: 400 });
    }
    if (room.hostUserId !== userId) {
      return Response.json(
        { error: "Only the meeting host can view the waiting room." },
        { status: 403 }
      );
    }

    const oldestAllowed = new Date(Date.now() - PENDING_REQUEST_MAX_AGE);
    const requests = await MeetingJoinRequest.find({
      callId,
      status: "pending",
      requestedAt: { $gte: oldestAllowed },
    })
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
    if (await resolveEndedState(room, callId)) {
      return Response.json({ error: "This meeting has ended." }, { status: 410 });
    }

    if (action === "request") {
      if (room.hostUserId === userId) {
        return Response.json({
          success: true,
          status: "approved",
          accessMode: room.accessMode,
          started: Boolean(room.startedAt),
        });
      }

      if (room.accessMode === "open") {
        if (!room.startedAt) {
          return Response.json({
            success: true,
            status: "waiting-host",
            accessMode: "open",
            started: false,
          });
        }
        await CohivaRtcRoom.updateOne(
          { callId, endedAt: null },
          { $addToSet: { memberUserIds: userId } }
        );
        return Response.json({
          success: true,
          status: "open",
          accessMode: "open",
          started: true,
        });
      }

      if (room.accessMode === "locked") {
        return Response.json(
          { error: "The host has locked this meeting.", accessMode: "locked" },
          { status: 403 }
        );
      }

      const existing = await MeetingJoinRequest.findOne({ callId, userId })
        .select({ status: 1 })
        .lean();

      if (existing?.status === "approved") {
        await CohivaRtcRoom.updateOne(
          { callId, endedAt: null },
          { $addToSet: { memberUserIds: userId } }
        );
        return Response.json({
          success: true,
          status: "approved",
          accessMode: "approval",
          started: Boolean(room.startedAt),
        });
      }

      const name =
        typeof body.name === "string"
          ? body.name.trim().slice(0, 120)
          : "Participant";
      const image =
        typeof body.image === "string" ? body.image.trim().slice(0, 1000) : "";

      await MeetingJoinRequest.findOneAndUpdate(
        { callId, userId },
        {
          $set: {
            name,
            image,
            status: "pending",
            requestedAt: new Date(),
            decidedAt: null,
          },
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );

      return Response.json({
        success: true,
        status: "pending",
        accessMode: "approval",
        started: Boolean(room.startedAt),
      });
    }

    if (action !== "approve" && action !== "deny") {
      return Response.json({ error: "Invalid waiting-room action." }, { status: 400 });
    }
    if (room.hostUserId !== userId) {
      return Response.json(
        { error: "Only the meeting host can approve participants." },
        { status: 403 }
      );
    }

    const targetUserId =
      typeof body.targetUserId === "string" ? body.targetUserId.trim() : "";
    if (!targetUserId) {
      return Response.json({ error: "Participant is required." }, { status: 400 });
    }

    const joinRequest = await MeetingJoinRequest.findOne({
      callId,
      userId: targetUserId,
    });
    if (!joinRequest) {
      return Response.json(
        { error: "This join request no longer exists." },
        { status: 404 }
      );
    }

    if (action === "approve") {
      let participantCount = 0;
      let targetAlreadyConnected = false;
      try {
        const stats = await getRtcRoomStats(callId);
        participantCount = Number(stats?.participantCount || 0);
        targetAlreadyConnected = Array.isArray(stats?.participants)
          ? stats.participants.some(
              (participant: any) =>
                String(participant?.userId || "") === targetUserId
            )
          : false;
      } catch {}

      if (!targetAlreadyConnected && participantCount >= Number(room.maxParticipants || 20)) {
        return Response.json(
          { error: `This meeting is full (${participantCount}/${room.maxParticipants}).` },
          { status: 409 }
        );
      }

      joinRequest.status = "approved";
      await CohivaRtcRoom.updateOne(
        { callId, endedAt: null },
        { $addToSet: { memberUserIds: targetUserId } }
      );
    } else {
      joinRequest.status = "denied";
      await CohivaRtcRoom.updateOne(
        { callId, endedAt: null },
        { $pull: { memberUserIds: targetUserId } }
      );
    }

    joinRequest.decidedAt = new Date();
    await joinRequest.save();

    return Response.json({ success: true, status: joinRequest.status });
  } catch (error) {
    console.error("Cohiva waiting room POST error:", error);
    return Response.json({ error: "Unable to update the waiting room." }, { status: 500 });
  }
}
