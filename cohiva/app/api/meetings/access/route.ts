import {
  auth,
} from "@clerk/nextjs/server";

import { getStreamServerClient } from "@/lib/streamServer";

/* =========================================================
   TYPES
========================================================= */

type MeetingAccessMode =
  | "open"
  | "approval"
  | "locked";

const VALID_MODES =
  new Set<MeetingAccessMode>([
    "open",
    "approval",
    "locked",
  ]);

const ACCESS_KEY =
  "cohiva_access_mode";

/* =========================================================
   NORMALIZE MODE
========================================================= */

const normalizeMode =
  (
    value:
      unknown
  ): MeetingAccessMode => {
    if (
      value ===
        "open" ||
      value ===
        "approval" ||
      value ===
        "locked"
    ) {
      return value;
    }

    return "approval";
  };

/* =========================================================
   GET CALL
========================================================= */

const getCall =
  async (
    callId:
      string
  ) => {
    const client =
      getStreamServerClient();

    const call =
      client.video.call(
        "development",
        callId
      );

    const response =
      await call.get();

    return {
      client,
      call,
      response,
    };
  };

/* =========================================================
   GET
   READ ACCESS MODE
========================================================= */

export async function GET(
  request:
    Request
) {
  try {
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

    const {
      searchParams,
    } =
      new URL(
        request.url
      );

    const callId =
      searchParams
        .get(
          "callId"
        )
        ?.trim();

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

    /* =====================================================
       LOAD DIRECTLY FROM STREAM
    ===================================================== */

    const {
      response,
    } =
      await getCall(
        callId
      );

    const custom =
      (
        response.call
          .custom ??
        {}
      ) as Record<
        string,
        unknown
      >;

    const mode =
      normalizeMode(
        custom[
          ACCESS_KEY
        ]
      );

    return Response.json({
      success: true,

      mode,

      teacher:
        response.call
          .created_by?.id ===
        userId,
    });
  } catch (error) {
    console.error(
      "Read Cohiva access error:",
      error
    );

    return Response.json(
      {
        error:
          "Unable to read meeting access settings.",
      },
      {
        status: 500,
      }
    );
  }
}

/* =========================================================
   PUT
   TEACHER CHANGES ACCESS MODE
========================================================= */

export async function PUT(
  request:
    Request
) {
  try {
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

    const body =
      await request.json();

    const callId =
      typeof body.callId ===
      "string"
        ? body.callId.trim()
        : "";

    const mode =
      body.mode as
        MeetingAccessMode;

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
      !VALID_MODES.has(
        mode
      )
    ) {
      return Response.json(
        {
          error:
            "Invalid access mode.",
        },
        {
          status: 400,
        }
      );
    }

    /* =====================================================
       GET CURRENT CALL
    ===================================================== */

    const {
      call,
      response,
    } =
      await getCall(
        callId
      );

    /* =====================================================
       TEACHER CHECK
    ===================================================== */

    const creatorId =
      response.call
        .created_by?.id;

    if (
      creatorId !==
      userId
    ) {
      return Response.json(
        {
          error:
            "Only the meeting opener can change access settings.",
        },
        {
          status: 403,
        }
      );
    }

    /* =====================================================
       PRESERVE ALL EXISTING CUSTOM DATA
    ===================================================== */

    const existingCustom =
      (
        response.call
          .custom ??
        {}
      ) as Record<
        string,
        unknown
      >;

    const nextCustom = {
      ...existingCustom,

      [ACCESS_KEY]:
        mode,
    };

    /* =====================================================
       UPDATE STREAM

       This also broadcasts call.updated,
       so connected clients receive the
       new custom data reactively.
    ===================================================== */

    await call.update({
      custom:
        nextCustom,
    });

    return Response.json({
      success: true,

      mode,
    });
  } catch (error) {
    console.error(
      "Update Cohiva access error:",
      error
    );

    return Response.json(
      {
        error:
          "Unable to update meeting access settings.",
      },
      {
        status: 500,
      }
    );
  }
}

/* =========================================================
   POST
   PREPARE OPEN-MEETING PARTICIPANT
========================================================= */

export async function POST(
  request:
    Request
) {
  try {
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

    const body =
      await request.json();

    const callId =
      typeof body.callId ===
      "string"
        ? body.callId.trim()
        : "";

    const action =
      body.action;

    if (
      !callId ||
      action !==
        "prepare-open-join"
    ) {
      return Response.json(
        {
          error:
            "Invalid meeting access request.",
        },
        {
          status: 400,
        }
      );
    }

    const {
      call,
      response,
    } =
      await getCall(
        callId
      );

    const custom =
      (
        response.call
          .custom ??
        {}
      ) as Record<
        string,
        unknown
      >;

    const mode =
      normalizeMode(
        custom[
          ACCESS_KEY
        ]
      );

    /* =====================================================
       SERVER-SIDE MODE CHECK
    ===================================================== */

    if (
      mode ===
      "locked"
    ) {
      return Response.json(
        {
          error:
            "This meeting is currently locked.",

          mode,
        },
        {
          status: 403,
        }
      );
    }

    if (
      mode ===
      "approval"
    ) {
      return Response.json(
        {
          error:
            "This meeting requires host approval.",

          mode,
        },
        {
          status: 403,
        }
      );
    }

    /* =====================================================
       OPEN — ADD USER AS MEMBER
    ===================================================== */

    await call.updateCallMembers({
      update_members: [
        {
          user_id:
            userId,
        },
      ],
    });

    return Response.json({
      success: true,

      mode:
        "open",
    });
  } catch (error) {
    console.error(
      "Prepare open meeting join error:",
      error
    );

    return Response.json(
      {
        error:
          "Unable to prepare meeting access.",
      },
      {
        status: 500,
      }
    );
  }
}