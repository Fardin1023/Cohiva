import { auth } from "@/lib/auth/server";
import connectMongoDB from "@/lib/mongodb";
import CohivaRtcRoom from "@/models/CohivaRtcRoom";

export async function GET(request: Request) {
  try {
    const { userId } = await auth();
    if (!userId) return Response.json({ error: "Unauthorized." }, { status: 401 });

    const scope = new URL(request.url).searchParams.get("scope") || "all";
    await connectMongoDB();

    const membership = {
      $and: [
        { $or: [{ hostUserId: userId }, { memberUserIds: userId }] },
        { hiddenForUserIds: { $ne: userId } },
      ],
    };

    const now = new Date();
    let extra: Record<string, unknown> = {};

    if (scope === "upcoming") {
      extra = { kind: "scheduled", startsAt: { $gt: now }, endedAt: null };
    } else if (scope === "previous") {
      extra = {
        kind: { $ne: "personal" },
        $or: [{ endedAt: { $ne: null } }, { startsAt: { $ne: null, $lte: now } }],
      };
    }

    const rooms = await CohivaRtcRoom.find({ ...membership, ...extra })
      .sort(scope === "upcoming" ? { startsAt: 1 } : { updatedAt: -1 })
      .limit(100)
      .lean();

    const items = rooms.map((room) => ({
      id: room.callId,
      callId: room.callId,
      title: room.title || "Cohiva Meeting",
      description: room.description || "",
      kind: room.kind,
      startsAt: room.startsAt,
      endedAt: room.endedAt,
      updatedAt: room.updatedAt,
      createdAt: room.createdAt,
      hostUserId: room.hostUserId,
      teacher: room.hostUserId === userId,
      accessMode: room.accessMode,
      durationMinutes: room.durationMinutes,
      maxParticipants: room.maxParticipants,
    }));

    if (scope === "dashboard") {
      const upcoming = items
        .filter((item) => item.kind === "scheduled" && item.startsAt && new Date(item.startsAt).getTime() > Date.now() && !item.endedAt)
        .sort((a, b) => new Date(a.startsAt as Date).getTime() - new Date(b.startsAt as Date).getTime())[0] || null;
      const previousCount = items.filter((item) =>
        item.kind !== "personal" &&
        (item.endedAt || (item.startsAt && new Date(item.startsAt).getTime() < Date.now()))
      ).length;
      return Response.json({ success: true, upcoming, previousCount });
    }

    return Response.json({ success: true, meetings: items });
  } catch (error) {
    console.error("List Cohiva meetings error:", error);
    return Response.json({ error: "Unable to load meetings." }, { status: 500 });
  }
}
