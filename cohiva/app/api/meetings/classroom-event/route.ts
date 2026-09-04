import {
  auth,
} from "@clerk/nextjs/server";

import {
  StreamClient,
} from "@stream-io/node-sdk";

const CLASSROOM_EVENT =
  "cohiva-classroom";

const allowedReactions =
  new Set([
    "👍",
    "👏",
    "❤️",
    "😂",
    "🎉",
  ]);

export async function POST(
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

    const body =
      await request.json();

    const callId =
      typeof body.callId ===
      "string"
        ? body.callId.trim()
        : "";

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
            "Invalid classroom event.",
        },
        {
          status: 400,
        }
      );
    }

    const senderName =
      typeof body.senderName ===
      "string"
        ? body.senderName
            .trim()
            .slice(
              0,
              120
            )
        : "Participant";

    const senderImage =
      typeof body.senderImage ===
      "string"
        ? body.senderImage
            .trim()
            .slice(
              0,
              1000
            )
        : "";

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
        crypto.randomUUID(),

      createdAt:
        new Date()
          .toISOString(),
    };

    if (
      action ===
      "hand"
    ) {
      custom.raised =
        body.raised ===
        true;
    }

    if (
      action ===
      "reaction"
    ) {
      if (
        typeof body.emoji !==
          "string" ||
        !allowedReactions.has(
          body.emoji
        )
      ) {
        return Response.json(
          {
            error:
              "Invalid reaction.",
          },
          {
            status: 400,
          }
        );
      }

      custom.emoji =
        body.emoji;
    }

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
            "Stream configuration is missing.",
        },
        {
          status: 500,
        }
      );
    }

    const client =
      new StreamClient(
        apiKey,
        apiSecret
      );

    const call =
      client.video.call(
        "development",
        callId
      );

    await call.sendCallEvent({
      custom,

      user_id:
        userId,
    });

    return Response.json({
      success: true,
      event:
        custom,
    });
  } catch (error) {
    console.error(
      "Classroom event error:",
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