import { randomUUID } from "node:crypto";

import { auth } from "@clerk/nextjs/server";

import {
  COHIVA_CALL_TYPE,
  clampMeetingDurationMinutes,
  clampMeetingParticipants,
  meetingDurationToSeconds,
} from "@/lib/cohivaMeetingConfig";
import { getStreamServerClient } from "@/lib/streamServer";

type MeetingKind =
  | "instant"
  | "scheduled"
  | "personal";

const DEFAULT_PERMISSIONS = {
  studentMic: true,
  studentCamera: true,
  studentScreenShare: true,
  studentRecording: false,
  studentWhiteboard: false,
};

const normalizeKind = (
  value: unknown
): MeetingKind | null => {
  if (
    value === "instant" ||
    value === "scheduled" ||
    value === "personal"
  ) {
    return value;
  }

  return null;
};

export async function POST(
  request: Request
) {
  try {
    const { userId } = await auth();

    if (!userId) {
      return Response.json(
        { error: "Unauthorized." },
        { status: 401 }
      );
    }

    const body = await request.json();

    const kind = normalizeKind(
      body.kind
    );

    if (!kind) {
      return Response.json(
        { error: "Invalid meeting type." },
        { status: 400 }
      );
    }

    const durationMinutes =
      clampMeetingDurationMinutes(
        body.durationMinutes
      );

    const maxParticipants =
      clampMeetingParticipants(
        body.maxParticipants
      );

    const title =
      typeof body.title === "string"
        ? body.title.trim().slice(0, 120)
        : "";

    const description =
      typeof body.description === "string"
        ? body.description.trim().slice(0, 1000)
        : "";

    let callId =
      typeof body.callId === "string"
        ? body.callId.trim()
        : "";

    let startsAt:
      | Date
      | undefined;

    if (kind === "instant") {
      callId = callId || randomUUID();
    }

    if (kind === "personal") {
      const expectedId =
        `personal-${userId}`;

      if (
        callId &&
        callId !== expectedId
      ) {
        return Response.json(
          {
            error:
              "Invalid personal room ID.",
          },
          { status: 400 }
        );
      }

      callId = expectedId;
    }

    if (kind === "scheduled") {
      const rawStartsAt =
        typeof body.startsAt === "string"
          ? body.startsAt
          : "";

      const parsed = new Date(
        rawStartsAt
      );

      if (
        !rawStartsAt ||
        Number.isNaN(
          parsed.getTime()
        ) ||
        parsed.getTime() <= Date.now()
      ) {
        return Response.json(
          {
            error:
              "Choose a future meeting date and time.",
          },
          { status: 400 }
        );
      }

      startsAt =
        parsed;

      callId = callId || randomUUID();
    }

    if (!callId) {
      return Response.json(
        {
          error:
            "Unable to create meeting ID.",
        },
        { status: 400 }
      );
    }

    const client =
      getStreamServerClient();

    const call =
      client.video.call(
        COHIVA_CALL_TYPE,
        callId
      );

    await call.getOrCreate({
      data: {
        created_by_id: userId,

        ...(startsAt
          ? {
              starts_at:
                startsAt,
            }
          : {}),

        members: [
          {
            user_id: userId,
            role: "host",
          },
        ],

        settings_override: {
          limits: {
            max_duration_seconds:
              meetingDurationToSeconds(
                durationMinutes
              ),

            max_participants:
              maxParticipants,

            max_participants_exclude_owner:
              false,
          },
        },

        custom: {
          title:
            title ||
            (kind === "personal"
              ? "Personal Cohiva Room"
              : "Cohiva Meeting"),

          description:
            description ||
            (kind === "personal"
              ? "Permanent Cohiva personal meeting room"
              : ""),

          cohiva_type: kind,

          owner_id: userId,

          cohiva_access_mode:
            "approval",

          cohiva_permissions:
            DEFAULT_PERMISSIONS,

          cohiva_duration_minutes:
            durationMinutes,

          cohiva_max_participants:
            maxParticipants,
        },
      },
    });

    return Response.json({
      success: true,
      callId,
      durationMinutes,
      maxParticipants,
    });
  } catch (error) {
    console.error(
      "Create Cohiva meeting error:",
      error
    );

    return Response.json(
      {
        error:
          "Cohiva could not create this meeting.",
      },
      { status: 500 }
    );
  }
}
