import {
  randomUUID,
} from "node:crypto";

import {
  auth,
} from "@clerk/nextjs/server";

import {
  COHIVA_CALL_TYPE,
  clampMeetingDurationMinutes,
  clampMeetingParticipants,
  meetingDurationToSeconds,
} from "@/lib/cohivaMeetingConfig";

import {
  getStreamServerClient,
} from "@/lib/streamServer";

/* =========================================================
   TYPES
========================================================= */

type MeetingKind =
  | "instant"
  | "scheduled"
  | "personal";

/* =========================================================
   DEFAULT COHIVA CLASS PERMISSIONS
========================================================= */

const DEFAULT_PERMISSIONS = {
  studentMic: true,
  studentCamera: true,
  studentScreenShare: true,
  studentRecording: false,
  studentWhiteboard: false,
};

/* =========================================================
   NORMALIZE MEETING TYPE
========================================================= */

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

/* =========================================================
   CREATE MEETING
========================================================= */

export async function POST(
  request: Request
) {
  try {
    /* =====================================================
       AUTHENTICATION
    ===================================================== */

    const {
      userId,
    } =
      await auth();

    if (
      !userId
    ) {
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
       REQUEST BODY
    ===================================================== */

    const body =
      await request.json();

    const kind =
      normalizeKind(
        body.kind
      );

    if (
      !kind
    ) {
      return Response.json(
        {
          error:
            "Invalid meeting type.",
        },
        {
          status: 400,
        }
      );
    }

    /* =====================================================
       SERVER-VALIDATED LIMITS
    ===================================================== */

    const durationMinutes =
      clampMeetingDurationMinutes(
        body.durationMinutes
      );

    const maxParticipants =
      clampMeetingParticipants(
        body.maxParticipants
      );

    /* =====================================================
       OPTIONAL METADATA
    ===================================================== */

    const title =
      typeof body.title ===
      "string"
        ? body.title
            .trim()
            .slice(
              0,
              120
            )
        : "";

    const description =
      typeof body.description ===
      "string"
        ? body.description
            .trim()
            .slice(
              0,
              1000
            )
        : "";

    /* =====================================================
       CALL ID
    ===================================================== */

    let callId =
      typeof body.callId ===
      "string"
        ? body.callId.trim()
        : "";

    /* =====================================================
       SCHEDULED START DATE

       Stream Node SDK requires Date,
       not an ISO string.
    ===================================================== */

    let startsAt:
      | Date
      | undefined;

    /* =====================================================
       INSTANT MEETING
    ===================================================== */

    if (
      kind ===
      "instant"
    ) {
      callId =
        callId ||
        randomUUID();
    }

    /* =====================================================
       PERSONAL ROOM
    ===================================================== */

    if (
      kind ===
      "personal"
    ) {
      const expectedId =
        `personal-${userId}`;

      if (
        callId &&
        callId !==
          expectedId
      ) {
        return Response.json(
          {
            error:
              "Invalid personal room ID.",
          },
          {
            status: 400,
          }
        );
      }

      callId =
        expectedId;
    }

    /* =====================================================
       SCHEDULED MEETING
    ===================================================== */

    if (
      kind ===
      "scheduled"
    ) {
      const rawStartsAt =
        typeof body.startsAt ===
        "string"
          ? body.startsAt
          : "";

      const parsed =
        new Date(
          rawStartsAt
        );

      if (
        !rawStartsAt ||
        Number.isNaN(
          parsed.getTime()
        ) ||
        parsed.getTime() <=
          Date.now()
      ) {
        return Response.json(
          {
            error:
              "Choose a future meeting date and time.",
          },
          {
            status: 400,
          }
        );
      }

      startsAt =
        parsed;

      callId =
        callId ||
        randomUUID();
    }

    /* =====================================================
       FINAL CALL ID CHECK
    ===================================================== */

    if (
      !callId
    ) {
      return Response.json(
        {
          error:
            "Unable to create meeting ID.",
        },
        {
          status: 400,
        }
      );
    }

    /* =====================================================
       STREAM SERVER CLIENT
    ===================================================== */

    const client =
      getStreamServerClient();

    /*
     * During this diagnostic:
     *
     * COHIVA_CALL_TYPE = "default"
     *
     * Later:
     *
     * COHIVA_CALL_TYPE = "cohiva_classroom"
     */

    const call =
      client.video.call(
        COHIVA_CALL_TYPE,
        callId
      );

    /* =====================================================
       CREATE STREAM CALL
    ===================================================== */

    await call.getOrCreate({
      data: {
        /*
         * Meeting creator / owner.
         */

        created_by_id:
          userId,

        /*
         * Scheduled meetings only.
         */

        ...(startsAt
          ? {
              starts_at:
                startsAt,
            }
          : {}),

        /*
         * Host is explicitly added
         * as a call member.
         */

        members: [
          {
            user_id:
              userId,

            role:
              "host",
          },
        ],

        /*
         * SERVER-ENFORCED LIMITS
         *
         * Duration:
         * 1 → 45 minutes
         *
         * Participants:
         * 2 → 20
         */

        settings_override: {
          limits: {
            max_duration_seconds:
              meetingDurationToSeconds(
                durationMinutes
              ),

            max_participants:
              maxParticipants,

            /*
             * Host counts toward
             * participant capacity.
             */

            max_participants_exclude_owner:
              false,
          },
        },

        /* =================================================
           COHIVA CUSTOM DATA
        ================================================= */

        custom: {
          title:
            title ||
            (
              kind ===
              "personal"
                ? "Personal Cohiva Room"
                : "Cohiva Meeting"
            ),

          description:
            description ||
            (
              kind ===
              "personal"
                ? "Permanent Cohiva personal meeting room"
                : ""
            ),

          cohiva_type:
            kind,

          owner_id:
            userId,

          /*
           * Default waiting-room behavior.
           */

          cohiva_access_mode:
            "approval",

          /*
           * Existing class permissions.
           */

          cohiva_permissions:
            DEFAULT_PERMISSIONS,

          /*
           * UI-friendly copies of
           * the enforced meeting limits.
           */

          cohiva_duration_minutes:
            durationMinutes,

          cohiva_max_participants:
            maxParticipants,
        },
      },
    });

    /* =====================================================
       SUCCESS
    ===================================================== */

    return Response.json({
      success: true,

      callId,

      durationMinutes,

      maxParticipants,
    });

  } catch (
    error
  ) {
    console.error(
      "Create Cohiva meeting error:",
      error
    );

    return Response.json(
      {
        error:
          "Cohiva could not create this meeting.",
      },
      {
        status: 500,
      }
    );
  }
}