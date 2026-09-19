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
      /*
       * A scheduled meeting remains available even when its planned start time
       * passes. It disappears only after the actual meeting session ends.
       */
      extra = {
        kind: "scheduled",
        endedAt: null,
        $or: [
          { startsAt: { $gt: now }, startedAt: null },
          {
            startedAt: { $exists: true, $ne: null },
            timerEndsAt: { $exists: true, $gt: now },
          },
        ],
      };
    } else if (scope === "previous") {
      /*
       * Product decision: ended meetings are NOT meeting-history items.
       * Previous therefore contains only missed/unstarted scheduled meetings,
       * never a meeting that the host actually ended.
       */
      extra = {
        kind: "scheduled",
        endedAt: null,
        startedAt: null,
        startsAt: { $ne: null, $lte: now },
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
      startedAt: room.startedAt,
      timerEndsAt: room.timerEndsAt,
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
        .filter(
          (item) =>
            item.kind === "scheduled" &&
            !item.endedAt &&
            ((item.startsAt &&
              !item.startedAt &&
              new Date(item.startsAt as Date).getTime() > Date.now()) ||
              (Boolean(item.startedAt) &&
                Boolean(item.timerEndsAt) &&
                new Date(item.timerEndsAt as Date).getTime() > Date.now()))
        )
        .sort((a, b) => {
          const aTime = a.startsAt ? new Date(a.startsAt as Date).getTime() : Number.MAX_SAFE_INTEGER;
          const bTime = b.startsAt ? new Date(b.startsAt as Date).getTime() : Number.MAX_SAFE_INTEGER;
          return aTime - bTime;
        })[0] || null;

      const previousCount = items.filter(
        (item) =>
          item.kind === "scheduled" &&
          !item.endedAt &&
          !item.startedAt &&
          item.startsAt &&
          new Date(item.startsAt as Date).getTime() <= Date.now()
      ).length;

      return Response.json({ success: true, upcoming, previousCount });
    }

    return Response.json({ success: true, meetings: items });
  } catch (error) {
    console.error("List Cohiva meetings error:", error);
    return Response.json({ error: "Unable to load meetings." }, { status: 500 });
  }
}
