import {
  auth,
} from "@clerk/nextjs/server";

import {
  StreamClient,
} from "@stream-io/node-sdk";

/* =========================================================
   CONFIG
========================================================= */

const WHITEBOARD_EVENT =
  "cohiva-whiteboard";

/*
 * One browser request can contain
 * multiple Stream events.
 *
 * This greatly reduces browser ->
 * Cohiva server requests for a
 * large whiteboard snapshot.
 */
const MAX_EVENTS_PER_REQUEST =
  256;

/*
 * Stream custom events have a
 * 5 KB limit.
 *
 * Keep a comfortable safety margin.
 */
const MAX_CUSTOM_EVENT_BYTES =
  4500;

/* =========================================================
   TYPES
========================================================= */

type WhiteboardEventPayload =
  Record<
    string,
    unknown
  >;

type WhiteboardRelayRequest = {
  callId?: string;

  events?:
    WhiteboardEventPayload[];
};

/* =========================================================
   HELPERS
========================================================= */

const validActions =
  new Set([
    "sync-request",
    "elements",
    "empty-snapshot",
    "clear",
  ]);

const getByteLength = (
  value: unknown
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
      (await request.json()) as
        WhiteboardRelayRequest;

    const callId =
      body.callId?.trim();

    const events =
      body.events;

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
      events.length === 0
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
      MAX_EVENTS_PER_REQUEST
    ) {
      return Response.json(
        {
          error:
            "Too many whiteboard events in one request.",
        },
        {
          status: 413,
        }
      );
    }

    /* =====================================================
       STREAM ENV
    ===================================================== */

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
      return Response.json(
        {
          error:
            "Stream server configuration is missing.",
        },
        {
          status: 500,
        }
      );
    }

    /* =====================================================
       VALIDATE EVENTS
    ===================================================== */

    const safeEvents:
      Record<
        string,
        unknown
      >[] =
      [];

    for (
      const event of events
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
          "string" ||
        !validActions.has(
          action
        )
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

      /*
       * Server controls:
       *
       * - event type
       * - sender identity
       *
       * The browser cannot spoof them.
       */
      const custom = {
        ...event,

        type:
          WHITEBOARD_EVENT,

        senderId:
          userId,
      };

      const eventBytes =
        getByteLength(
          custom
        );

      if (
        eventBytes >
        MAX_CUSTOM_EVENT_BYTES
      ) {
        return Response.json(
          {
            error:
              "A whiteboard event is too large.",
          },
          {
            status: 413,
          }
        );
      }

      safeEvents.push(
        custom
      );
    }

    /* =====================================================
       STREAM SERVER CLIENT
    ===================================================== */

    const streamClient =
      new StreamClient(
        apiKey,
        apiSecret
      );

    const call =
      streamClient.video.call(
        "development",
        callId
      );

    /* =====================================================
       RELAY

       Send a few events concurrently.

       Chunks carry:
       batchId
       index
       total

       so receiving order does not matter.
    ===================================================== */

    const CONCURRENCY =
      4;

    for (
      let start = 0;
      start <
      safeEvents.length;
      start +=
        CONCURRENCY
    ) {
      const group =
        safeEvents.slice(
          start,
          start +
            CONCURRENCY
        );

      await Promise.all(
        group.map(
          (
            custom
          ) =>
            call.sendCallEvent({
              custom,

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
    });
  } catch (error) {
    console.error(
      "Cohiva whiteboard relay error:",
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