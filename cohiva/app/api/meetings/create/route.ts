import { randomUUID } from "node:crypto";
import { auth } from "@/lib/auth/server";
import {
  COHIVA_DEFAULT_DURATION_MINUTES,
  COHIVA_DEFAULT_PARTICIPANTS,
  clampMeetingDurationMinutes,
  clampMeetingParticipants,
} from "@/lib/cohivaMeetingConfig";
import connectMongoDB from "@/lib/mongodb";
import CohivaRtcRoom, {
  DEFAULT_COHIVA_RTC_PERMISSIONS,
} from "@/models/CohivaRtcRoom";

type MeetingKind = "instant" | "scheduled" | "personal";

const normalizeKind = (value: unknown): MeetingKind | null =>
  value === "instant" || value === "scheduled" || value === "personal"
    ? value
    : null;

export async function POST(request: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return Response.json({ error: "Unauthorized." }, { status: 401 });
    }

    const body = await request.json();
    const kind = normalizeKind(body.kind);
    if (!kind) {
      return Response.json({ error: "Invalid meeting type." }, { status: 400 });
    }

    const durationMinutes = clampMeetingDurationMinutes(
      body.durationMinutes ?? COHIVA_DEFAULT_DURATION_MINUTES
    );
    const maxParticipants = clampMeetingParticipants(
      body.maxParticipants ?? COHIVA_DEFAULT_PARTICIPANTS
    );

    const title =
      typeof body.title === "string" ? body.title.trim().slice(0, 120) : "";
    const description =
      typeof body.description === "string"
        ? body.description.trim().slice(0, 1000)
        : "";

    let callId = typeof body.callId === "string" ? body.callId.trim() : "";
    let startsAt: Date | null = null;

    if (kind === "instant") {
      callId = callId || randomUUID();
    }

    if (kind === "personal") {
      const expected = `personal-${userId}`;
      if (callId && callId !== expected) {
        return Response.json({ error: "Invalid personal room ID." }, { status: 400 });
      }
      callId = expected;
    }

    if (kind === "scheduled") {
      const raw = typeof body.startsAt === "string" ? body.startsAt : "";
      const parsed = new Date(raw);
      if (!raw || Number.isNaN(parsed.getTime()) || parsed.getTime() <= Date.now()) {
        return Response.json(
          { error: "Choose a future meeting date and time." },
          { status: 400 }
        );
      }
      startsAt = parsed;
      callId = callId || randomUUID();
    }

    if (!callId || !/^[A-Za-z0-9_-]{3,120}$/.test(callId)) {
      return Response.json({ error: "Invalid meeting ID." }, { status: 400 });
    }

    await connectMongoDB();

    const existing = await CohivaRtcRoom.findOne({ callId });
    if (existing && existing.hostUserId !== userId) {
      return Response.json({ error: "That meeting ID is already in use." }, { status: 409 });
    }

    const room = await CohivaRtcRoom.findOneAndUpdate(
      { callId },
      {
        $set: {
          hostUserId: userId,
          kind,
          title:
            title ||
            (kind === "personal" ? "Personal Cohiva Room" : "Cohiva Meeting"),
          description:
            description ||
            (kind === "personal"
              ? "Permanent Cohiva personal meeting room"
              : ""),
          startsAt,
          durationMinutes,
          maxParticipants,
          endedAt: null,
        },
        $setOnInsert: {
          accessMode: "approval",
          permissions: { ...DEFAULT_COHIVA_RTC_PERMISSIONS },
          individualPermissions: {},
          hiddenForUserIds: [],
        },
        $addToSet: { memberUserIds: userId },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    ).lean();

    return Response.json({
      success: true,
      callId: room.callId,
      durationMinutes: room.durationMinutes,
      maxParticipants: room.maxParticipants,
    });
  } catch (error) {
    console.error("Create Cohiva meeting error:", error);
    return Response.json(
      { error: "Cohiva could not create this meeting." },
      { status: 500 }
    );
  }
}
