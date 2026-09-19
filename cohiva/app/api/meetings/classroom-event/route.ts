import {
  auth,
} from "@/lib/auth/server";

import {
  randomUUID,
} from "node:crypto";

import { broadcastRtcEvent } from "@/lib/rtc/server";
import { meetingAuthorizationResponse, requireActiveMeetingParticipant } from "@/lib/meetings/authorization";

/* =========================================================
   CONFIG
========================================================= */

const CLASSROOM_EVENT =
  "cohiva-classroom";

const ALLOWED_REACTIONS =
  new Set([
    "👍",
    "👏",
    "❤️",
    "😂",
    "🎉",
  ]);

/* =========================================================
   CLEAN STRING
========================================================= */

const cleanString = (
  value: unknown,
  maxLength: number
) => {
  if (
    typeof value !==
    "string"
  ) {
    return "";
  }

  return value
    .trim()
    .slice(
      0,
      maxLength
    );
};

/* =========================================================
   POST
========================================================= */

export async function POST(
  request: Request
) {
  try {
    /* =====================================================
       AUTH
    ===================================================== */

    const {
      userId,
    } =
      await auth();

    if (!userId) {
      return Response.json(
        {
          error:
            "Unauthorized.",
        },
        {
          status: 401,
        }
      );
    }

    /* =====================================================
       BODY
    ===================================================== */

    const body =
      await request.json();

    const callId =
      cleanString(
        body.callId,
        200
      );

    const senderName =
      cleanString(
        body.senderName,
        120
      ) ||
      "Participant";

    const senderImage =
      cleanString(
        body.senderImage,
        1000
      );

    const action =
      body.action;

    if (!callId) {
      return Response.json(
        {
          error:
            "Meeting ID is required.",
        },
        {
          status: 400,
        }
      );
    }

    if (
      action !==
        "hand" &&
      action !==
        "reaction"
    ) {
      return Response.json(
        {
          error:
            "Invalid classroom action.",
        },
        {
          status: 400,
        }
      );
    }

    await requireActiveMeetingParticipant(callId, userId);

    /* =====================================================
       BUILD EVENT
    ===================================================== */

    const custom:
      Record<
        string,
        unknown
      > = {
      type:
        CLASSROOM_EVENT,

      action,

      senderId:
        userId,

      senderName,

      senderImage,

      eventId:
        randomUUID(),

      createdAt:
        new Date()
          .toISOString(),
    };

    /* =====================================================
       HAND
    ===================================================== */

    if (
      action ===
      "hand"
    ) {
      if (
        typeof body.raised !==
        "boolean"
      ) {
        return Response.json(
          {
            error:
              "Raised-hand status is required.",
          },
          {
            status: 400,
          }
        );
      }

      custom.raised =
        body.raised;
    }

    /* =====================================================
       REACTION
    ===================================================== */

    if (
      action ===
      "reaction"
    ) {
      const emoji =
        cleanString(
          body.emoji,
          10
        );

      if (
        !ALLOWED_REACTIONS.has(
          emoji
        )
      ) {
        return Response.json(
          {
            error:
              "Unsupported reaction.",
          },
          {
            status: 400,
          }
        );
      }

      custom.emoji =
        emoji;
    }

    /* =====================================================
       RELAY THROUGH COHIVA RTC
    ===================================================== */

    await broadcastRtcEvent({
      callId,
      event: "custom",
      data: {
        custom,
        user_id:
          userId,
      },
    });

    return Response.json({
      success: true,

      event:
        custom,
    });
  } catch (error) {
    const authorizationResponse = meetingAuthorizationResponse(error);
    if (authorizationResponse) return authorizationResponse;

    console.error(
      "Cohiva classroom event error:",
      error
    );

    return Response.json(
      {
        error:
          "Unable to send classroom event.",
      },
      {
        status: 500,
      }
    );
  }
}