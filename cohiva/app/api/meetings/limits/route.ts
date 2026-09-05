import { auth } from "@clerk/nextjs/server";

import {
  COHIVA_CALL_TYPE,
  clampMeetingDurationMinutes,
  clampMeetingParticipants,
  meetingDurationToSeconds,
} from "@/lib/cohivaMeetingConfig";
import { getStreamServerClient } from "@/lib/streamServer";

const getCall = async (
  callId: string
) => {
  const client =
    getStreamServerClient();

  const call =
    client.video.call(
      COHIVA_CALL_TYPE,
      callId
    );

  const response =
    await call.get();

  return {
    call,
    response,
  };
};

export async function GET(
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

    const { searchParams } =
      new URL(request.url);

    const callId =
      searchParams
        .get("callId")
        ?.trim();

    if (!callId) {
      return Response.json(
        {
          error:
            "Meeting ID is required.",
        },
        { status: 400 }
      );
    }

    const { response } =
      await getCall(callId);

    const teacher =
      response.call.created_by?.id ===
      userId;

    const limits =
      response.call.settings
        ?.limits;

    const durationMinutes =
      clampMeetingDurationMinutes(
        Math.round(
          Number(
            limits?.max_duration_seconds ??
              2700
          ) / 60
        )
      );

    const maxParticipants =
      clampMeetingParticipants(
        limits?.max_participants ??
          20
      );

    const currentParticipants =
      response.call.session
        ?.participants?.length ??
      0;

    return Response.json({
      success: true,
      teacher,
      durationMinutes,
      maxParticipants,
      currentParticipants,
      timerEndsAt:
        response.call.session
          ?.timer_ends_at ??
        null,
    });
  } catch (error) {
    console.error(
      "Read meeting limits error:",
      error
    );

    return Response.json(
      {
        error:
          "Unable to read meeting limits.",
      },
      { status: 500 }
    );
  }
}

export async function PUT(
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

    const body =
      await request.json();

    const callId =
      typeof body.callId === "string"
        ? body.callId.trim()
        : "";

    if (!callId) {
      return Response.json(
        {
          error:
            "Meeting ID is required.",
        },
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

    const {
      call,
      response,
    } = await getCall(
      callId
    );

    if (
      response.call.created_by?.id !==
      userId
    ) {
      return Response.json(
        {
          error:
            "Only the meeting host can change these limits.",
        },
        { status: 403 }
      );
    }

    const currentParticipants =
      response.call.session
        ?.participants?.length ??
      0;

    if (
      currentParticipants > 0 &&
      maxParticipants <
        currentParticipants
    ) {
      return Response.json(
        {
          error:
            `There are currently ${currentParticipants} people in the meeting. The participant limit cannot be set below that number.`,
        },
        { status: 400 }
      );
    }

    const currentCustom =
      (response.call.custom ?? {}) as
        Record<string, unknown>;

    await call.update({
      settings_override: {
        limits: {
          max_duration_seconds:
            meetingDurationToSeconds(
              durationMinutes
            ),

          max_participants:
            maxParticipants,
        },
      },

      custom: {
        ...currentCustom,

        cohiva_duration_minutes:
          durationMinutes,

        cohiva_max_participants:
          maxParticipants,
      },
    });

    return Response.json({
      success: true,
      durationMinutes,
      maxParticipants,
      currentParticipants,
    });
  } catch (error) {
    console.error(
      "Update meeting limits error:",
      error
    );

    return Response.json(
      {
        error:
          "Unable to update meeting limits.",
      },
      { status: 500 }
    );
  }
}
