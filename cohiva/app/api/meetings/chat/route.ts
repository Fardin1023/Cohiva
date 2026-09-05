import {
  auth,
} from "@clerk/nextjs/server";

import { getStreamServerClient } from "@/lib/streamServer";

import {
  randomUUID,
} from "node:crypto";

import connectMongoDB from "@/lib/mongodb";

import MeetingChatMessage from "@/models/MeetingChatMessage";

/* =========================================================
   CONFIG
========================================================= */

const CALL_TYPE =
  "development";

const CHAT_EVENT =
  "cohiva-chat";

const MAX_MESSAGE_LENGTH =
  1000;

const MAX_HISTORY =
  100;

/* =========================================================
   HELPERS
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

const isDuplicateKeyError = (
  error: unknown
) => {
  if (
    !error ||
    typeof error !==
      "object"
  ) {
    return false;
  }

  return (
    "code" in error &&
    (
      error as {
        code?: number;
      }
    ).code ===
      11000
  );
};

const serializeMessage = (
  message: any
) => {
  return {
    messageId:
      message.messageId ||
      message._id?.toString(),

    senderId:
      message.senderId,

    senderName:
      message.senderName ||
      "Participant",

    senderImage:
      message.senderImage ||
      "",

    text:
      message.text,

    createdAt:
      new Date(
        message.createdAt
      ).toISOString(),
  };
};

/* =========================================================
   GET CHAT HISTORY
========================================================= */

export async function GET(
  request: Request
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
      cleanString(
        searchParams.get(
          "callId"
        ),
        200
      );

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

    await connectMongoDB();

    /*
     * Read newest 100 for efficiency,
     * then reverse so UI receives
     * oldest -> newest.
     */
    const storedMessages =
      await MeetingChatMessage
        .find({
          callId,
        })
        .select({
          _id: 1,
          messageId: 1,
          senderId: 1,
          senderName: 1,
          senderImage: 1,
          text: 1,
          createdAt: 1,
        })
        .sort({
          createdAt: -1,
        })
        .limit(
          MAX_HISTORY
        )
        .lean();

    const messages =
      storedMessages
        .reverse()
        .map(
          serializeMessage
        );

    return Response.json({
      success: true,

      messages,
    });
  } catch (error) {
    console.error(
      "Cohiva chat GET error:",
      error
    );

    return Response.json(
      {
        error:
          "Unable to load class chat.",
      },
      {
        status: 500,
      }
    );
  }
}

/* =========================================================
   POST MESSAGE
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

    const text =
      cleanString(
        body.text,
        MAX_MESSAGE_LENGTH
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

    const messageId =
      cleanString(
        body.messageId,
        150
      ) ||
      randomUUID();

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

    if (!text) {
      return Response.json(
        {
          error:
            "Message cannot be empty.",
        },
        {
          status: 400,
        }
      );
    }

    await connectMongoDB();

    /* =====================================================
       SAVE MESSAGE
    ===================================================== */

    let storedMessage:
      any;

    let newlyCreated =
      false;

    try {
      storedMessage =
        await MeetingChatMessage.create({
          callId,

          messageId,

          /*
           * IMPORTANT:
           *
           * senderId comes from Clerk,
           * never from the browser.
           */
          senderId:
            userId,

          senderName,

          senderImage,

          text,

          createdAt:
            new Date(),
        });

      newlyCreated =
        true;
    } catch (
      databaseError
    ) {
      /*
       * A retry with the same messageId
       * should not create a duplicate.
       */
      if (
        !isDuplicateKeyError(
          databaseError
        )
      ) {
        throw databaseError;
      }

      storedMessage =
        await MeetingChatMessage
          .findOne({
            callId,

            messageId,
          })
          .select({
            _id: 1,
            messageId: 1,
            senderId: 1,
            senderName: 1,
            senderImage: 1,
            text: 1,
            createdAt: 1,
          })
          .lean();

      if (
        !storedMessage
      ) {
        throw databaseError;
      }
    }

    const message =
      serializeMessage(
        storedMessage
      );

    /* =====================================================
       REALTIME BROADCAST

       Only broadcast a newly-created message.

       If Stream has a temporary realtime failure,
       the message stays safely stored in MongoDB.
       The client also has lightweight history sync.
    ===================================================== */

    let realtime =
      true;

    if (
      newlyCreated
    ) {
      try {
        const streamClient =
          getStreamServerClient();

        const call =
          streamClient.video.call(
            CALL_TYPE,
            callId
          );

        await call.sendCallEvent({
          custom: {
            type:
              CHAT_EVENT,

            ...message,
          },

          user_id:
            userId,
        });
      } catch (
        realtimeError
      ) {
        realtime =
          false;

        console.error(
          "Cohiva chat realtime broadcast error:",
          realtimeError
        );
      }
    }

    return Response.json({
      success: true,

      realtime,

      message,
    });
  } catch (error) {
    console.error(
      "Cohiva chat POST error:",
      error
    );

    return Response.json(
      {
        error:
          "Unable to send message.",
      },
      {
        status: 500,
      }
    );
  }
}