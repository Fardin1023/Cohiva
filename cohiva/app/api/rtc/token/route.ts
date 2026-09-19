import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth/server";
import {
  clampMeetingDurationMinutes,
  clampMeetingParticipants,
} from "@/lib/cohivaMeetingConfig";
import connectMongoDB from "@/lib/mongodb";
import { finalizeMeetingInDatabase, hasMeetingExpired } from "@/lib/meetings/lifecycle";
import { getRtcRoomStats } from "@/lib/rtc/server";
import { createRtcToken } from "@/lib/rtc/token";
import MeetingJoinRequest from "@/models/MeetingJoinRequest";
import CohivaRtcRoom, {
  DEFAULT_COHIVA_RTC_PERMISSIONS,
} from "@/models/CohivaRtcRoom";

const normalizeWsUrl = (raw: string) => {
  const value = raw.trim() || "ws://127.0.0.1:4100/rtc";
  try {
    const url = new URL(value);
    if (!url.pathname || url.pathname === "/") url.pathname = "/rtc";
    return url.toString();
  } catch {
    return "ws://127.0.0.1:4100/rtc";
  }
};

export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const secret = process.env.COHIVA_RTC_SECRET?.trim();
  if (!secret) return NextResponse.json({ error: "Cohiva RTC is not configured." }, { status: 500 });

  let body: { callId?: string } = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const callId = body.callId?.trim();
  if (!callId || !/^[A-Za-z0-9_-]{3,120}$/.test(callId)) {
    return NextResponse.json({ error: "Invalid room id." }, { status: 400 });
  }

  await connectMongoDB();
  const room = await CohivaRtcRoom.findOne({ callId });
  if (!room) return NextResponse.json({ error: "Meeting not found." }, { status: 404 });

  if (room.endedAt) {
    return NextResponse.json({ error: "This meeting has already ended." }, { status: 410 });
  }

  if (hasMeetingExpired(room)) {
    const endedAt = room.timerEndsAt ? new Date(room.timerEndsAt) : new Date();
    await finalizeMeetingInDatabase(callId, endedAt);
    return NextResponse.json({ error: "This meeting has already ended." }, { status: 410 });
  }

  const role = room.hostUserId === user.id ? "host" : "participant";
  const durationMinutes = clampMeetingDurationMinutes(room.durationMinutes ?? 45);
  const maxParticipants = clampMeetingParticipants(room.maxParticipants ?? 20);

  /*
   * The host's first RTC token starts the actual meeting session. Keeping
   * this timestamp in MongoDB means refreshes, host leave/rejoin and RTC
   * process room cleanup do not restart the meeting clock.
   */
  if (role === "host" && !room.startedAt) {
    const startedAt = new Date();
    room.startedAt = startedAt;
    room.timerEndsAt = new Date(startedAt.getTime() + durationMinutes * 60_000);
    await room.save();
  }

  if (role !== "host") {
    if (!room.startedAt) {
      return NextResponse.json(
        { error: "The host has not started this meeting yet.", waitingForHost: true },
        { status: 409 }
      );
    }

    let allowed = room.memberUserIds?.includes(user.id) || room.accessMode === "open";
    if (!allowed && room.accessMode === "approval") {
      allowed = Boolean(
        await MeetingJoinRequest.exists({ callId, userId: user.id, status: "approved" })
      );
    }

    if (!allowed) {
      return NextResponse.json(
        {
          error:
            room.accessMode === "locked"
              ? "This meeting is locked."
              : "Host approval is required.",
        },
        { status: 403 }
      );
    }

    /*
     * RTC is the final race-safe capacity gate, but reject obvious over-limit
     * API attempts here as well. A reconnect by a user already in the room is
     * not counted as a new seat.
     */
    try {
      const stats = await getRtcRoomStats(callId);
      const participants = Array.isArray(stats?.participants) ? stats.participants : [];
      const alreadyConnected = participants.some(
        (participant: any) => String(participant?.userId || "") === user.id
      );
      const participantCount = Number(stats?.participantCount || 0);
      if (!alreadyConnected && participantCount >= maxParticipants) {
        return NextResponse.json(
          { error: `This meeting is full (${participantCount}/${maxParticipants}).` },
          { status: 409 }
        );
      }
    } catch {
      // The mediasoup join action performs the final capacity check.
    }

    await CohivaRtcRoom.updateOne(
      { callId, endedAt: null },
      { $addToSet: { memberUserIds: user.id } }
    );
  }

  const permissions = {
    ...DEFAULT_COHIVA_RTC_PERMISSIONS,
    ...(room.permissions && typeof room.permissions === "object" ? room.permissions : {}),
    studentRecording: false,
  };
  const individualPermissions =
    room.individualPermissions && typeof room.individualPermissions === "object"
      ? room.individualPermissions
      : {};

  const custom = {
    title: room.title || (room.kind === "personal" ? "Personal Cohiva Room" : "Cohiva Meeting"),
    description: room.description || "",
    cohiva_type: room.kind || "instant",
    owner_id: room.hostUserId,
    cohiva_access_mode: room.accessMode || "approval",
    cohiva_permissions: permissions,
    cohiva_individual_permissions: individualPermissions,
    cohiva_duration_minutes: durationMinutes,
    cohiva_max_participants: maxParticipants,
  };

  const name =
    user.fullName?.trim() ||
    user.username?.trim() ||
    user.email.split("@")[0] ||
    "Cohiva user";
  const image = user.imageUrl ? `/api/auth/avatar/${encodeURIComponent(user.id)}` : "";
  const startedAt = room.startedAt ? new Date(room.startedAt).toISOString() : null;
  const timerEndsAt = room.timerEndsAt ? new Date(room.timerEndsAt).toISOString() : null;

  const token = createRtcToken(
    {
      callId,
      userId: user.id,
      name,
      image,
      avatarIcon: user.avatarIcon || "",
      role,
      exp: Date.now() + 10 * 60_000,
      maxParticipants,
      durationMinutes,
      startedAt,
      timerEndsAt,
      custom,
    },
    secret
  );

  return NextResponse.json({
    token,
    wsUrl: normalizeWsUrl(
      process.env.NEXT_PUBLIC_COHIVA_RTC_URL || "ws://127.0.0.1:4100/rtc"
    ),
    callId,
    userId: user.id,
    name,
    role,
    hostUserId: room.hostUserId,
    durationMinutes,
    maxParticipants,
    startedAt,
    timerEndsAt,
  });
}
