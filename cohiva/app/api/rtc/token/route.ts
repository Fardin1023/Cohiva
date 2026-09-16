import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth/server";
import {
  clampMeetingDurationMinutes,
  clampMeetingParticipants,
} from "@/lib/cohivaMeetingConfig";
import connectMongoDB from "@/lib/mongodb";
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
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid request." }, { status: 400 }); }
  const callId = body.callId?.trim();
  if (!callId || !/^[A-Za-z0-9_-]{3,120}$/.test(callId)) {
    return NextResponse.json({ error: "Invalid room id." }, { status: 400 });
  }

  await connectMongoDB();
  const room = await CohivaRtcRoom.findOne({ callId });
  if (!room) return NextResponse.json({ error: "Meeting not found." }, { status: 404 });
  if (room.endedAt) return NextResponse.json({ error: "This meeting has already ended." }, { status: 410 });

  const role = room.hostUserId === user.id ? "host" : "participant";
  if (role !== "host") {
    let allowed = room.memberUserIds?.includes(user.id) || room.accessMode === "open";
    if (!allowed && room.accessMode === "approval") {
      allowed = Boolean(await MeetingJoinRequest.exists({ callId, userId: user.id, status: "approved" }));
    }
    if (!allowed) {
      return NextResponse.json(
        { error: room.accessMode === "locked" ? "This meeting is locked." : "Host approval is required." },
        { status: 403 }
      );
    }
    await CohivaRtcRoom.updateOne({ callId }, { $addToSet: { memberUserIds: user.id } });
  }

  const durationMinutes = clampMeetingDurationMinutes(room.durationMinutes ?? 45);
  const maxParticipants = clampMeetingParticipants(room.maxParticipants ?? 20);
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

  const name = user.fullName?.trim() || user.username?.trim() || user.email.split("@")[0] || "Cohiva user";
  const image = user.imageUrl ? `/api/auth/avatar/${encodeURIComponent(user.id)}` : "";
  const token = createRtcToken({
    callId,
    userId: user.id,
    name,
    image,
    avatarIcon: user.avatarIcon || "",
    role,
    exp: Date.now() + 10 * 60_000,
    maxParticipants,
    durationMinutes,
    custom,
  }, secret);

  return NextResponse.json({
    token,
    wsUrl: normalizeWsUrl(process.env.NEXT_PUBLIC_COHIVA_RTC_URL || "ws://127.0.0.1:4100/rtc"),
    callId,
    userId: user.id,
    name,
    role,
    hostUserId: room.hostUserId,
    durationMinutes,
    maxParticipants,
  });
}
