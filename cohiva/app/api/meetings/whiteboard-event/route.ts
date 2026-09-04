import {
  auth,
} from "@clerk/nextjs/server";

import {
  StreamClient,
} from "@stream-io/node-sdk";

/* =========================================================
   CONFIG
========================================================= */

const CALL_TYPE =
  "development";

const WHITEBOARD_EVENT =
  "cohiva-whiteboard";

const MAX_EVENTS =
  256;

const MAX_EVENT_BYTES =
  4500;

/* =========================================================
   TYPES
========================================================= */

type WhiteboardEvent =
  Record<
    string,
    unknown
  >;

type WhiteboardPermissions = {
  studentWhiteboard?: boolean;
};

/* =========================================================
   STREAM
========================================================= */

const getStreamClient =
  () => {
    const apiKey =
      process.env
        .NEXT_PUBLIC_STREAM_API_KEY;

    const apiSecret =
      process.env
        .STREAM_API_SECRET;

    if (
      !apiKey ||
      !apiSecret
    ) {
      throw new Error(
        "Stream configuration is missing."
      );
    }

    return new StreamClient(
      apiKey,
      apiSecret
    );
  };

/* =========================================================
   BYTE SIZE
========================================================= */

const getBytes =
  (
    value:
      unknown
  ) => {
    return new TextEncoder()
      .encode(
        JSON.stringify(
          value
        )
      )
      .length;
  };

/* =========================================================
   POST
========================================================= */

export async function POST(
  request:
    Request
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
      typeof body.callId ===
      "string"
        ? body.callId.trim()
        : "";

    const events =
      body.events as
        WhiteboardEvent[];

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
      !Array.isArray(
        events
      ) ||
      events.length ===
        0
    ) {
      return Response.json(
        {
          error:
            "Whiteboard events are required.",
        },
        {
          status: 400,
        }
      );
    }

    if (
      events.length >
      MAX_EVENTS
    ) {
      return Response.json(
        {
          error:
            "Too many whiteboard events.",
        },
        {
          status: 413,
        }
      );
    }

    /* =====================================================
       LOAD CALL
    ===================================================== */

    const streamClient =
      getStreamClient();

    const call =
      streamClient.video.call(
        CALL_TYPE,
        callId
      );

    const callResponse =
      await call.get();

    const creatorId =
      callResponse.call
        .created_by?.id;

    const isTeacher =
      creatorId ===
      userId;

    const custom =
      (
        callResponse.call
          .custom ??
        {}
      ) as Record<
        string,
        unknown
      >;

    const permissions =
      custom
        .cohiva_permissions as
        | WhiteboardPermissions
        | undefined;

    const studentCanDraw =
      permissions
        ?.studentWhiteboard ===
      true;

    /* =====================================================
       VALIDATE EACH EVENT
    ===================================================== */

    const safeEvents:
      Record<
        string,
        unknown
      >[] =
      [];

    for (
      const event of
        events
    ) {
      if (
        !event ||
        typeof event !==
          "object" ||
        Array.isArray(
          event
        )
      ) {
        return Response.json(
          {
            error:
              "Invalid whiteboard event.",
          },
          {
            status: 400,
          }
        );
      }

      const action =
        event.action;

      if (
        typeof action !==
        "string"
      ) {
        return Response.json(
          {
            error:
              "Invalid whiteboard action.",
          },
          {
            status: 400,
          }
        );
      }

      /* ===============================================
         SYNC REQUEST

         Everyone may request the current
         teacher board.
      =============================================== */

      if (
        action ===
        "sync-request"
      ) {
        // Allowed.
      }

      /* ===============================================
         ELEMENT CHANGES

         Teacher = always allowed.

         Student = only when teacher has
         enabled Whiteboard permission.
      =============================================== */

      else if (
        action ===
        "elements"
      ) {
        if (
          !isTeacher &&
          !studentCanDraw
        ) {
          return Response.json(
            {
              error:
                "The teacher has disabled student whiteboard editing.",
            },
            {
              status: 403,
            }
          );
        }
      }

      /* ===============================================
         CLEAR BOARD

         Teacher only.
      =============================================== */

      else if (
        action ===
        "clear"
      ) {
        if (
          !isTeacher
        ) {
          return Response.json(
            {
              error:
                "Only the teacher can clear the whiteboard.",
            },
            {
              status: 403,
            }
          );
        }
      }

      /* ===============================================
         EMPTY SNAPSHOT

         Teacher only.
      =============================================== */

      else if (
        action ===
        "empty-snapshot"
      ) {
        if (
          !isTeacher
        ) {
          return Response.json(
            {
              error:
                "Only the teacher can publish the board snapshot.",
            },
            {
              status: 403,
            }
          );
        }
      }

      /* ===============================================
         EVERYTHING ELSE
      =============================================== */

      else {
        return Response.json(
          {
            error:
              "Unsupported whiteboard action.",
          },
          {
            status: 400,
          }
        );
      }

      /* ===============================================
         SERVER EVENT
      =============================================== */

      const customEvent = {
        ...event,

        type:
          WHITEBOARD_EVENT,

        senderId:
          userId,
      };

      if (
        getBytes(
          customEvent
        ) >
        MAX_EVENT_BYTES
      ) {
        return Response.json(
          {
            error:
              "Whiteboard event is too large.",
          },
          {
            status: 413,
          }
        );
      }

      safeEvents.push(
        customEvent
      );
    }

    /* =====================================================
       RELAY

       Small groups avoid firing hundreds
       of calls simultaneously.
    ===================================================== */

    const CONCURRENCY =
      4;

    for (
      let index = 0;
      index <
      safeEvents.length;
      index +=
        CONCURRENCY
    ) {
      const group =
        safeEvents.slice(
          index,
          index +
            CONCURRENCY
        );

      await Promise.all(
        group.map(
          (
            customEvent
          ) =>
            call.sendCallEvent({
              custom:
                customEvent,

              user_id:
                userId,
            })
        )
      );
    }

    return Response.json({
      success: true,

      relayed:
        safeEvents.length,

      studentWhiteboard:
        studentCanDraw,
    });
  } catch (error) {
    console.error(
      "Cohiva whiteboard event error:",
      error
    );

    return Response.json(
      {
        error:
          "Unable to relay whiteboard update.",
      },
      {
        status: 500,
      }
    );
  }
}