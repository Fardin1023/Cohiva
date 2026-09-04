import {
  auth,
} from "@clerk/nextjs/server";

import {
  StreamClient,
} from "@stream-io/node-sdk";

import connectMongoDB from "@/lib/mongodb";
import MeetingChatMessage from "@/models/MeetingChatMessage";

const CHAT_EVENT =
  "cohiva-chat";

/* =========================================================
   GET CHAT HISTORY
========================================================= */

export async function GET(
  request: Request
) {
  try {
    const {
      userId,
    } = await auth();

    if (!userId) {
      return Response.json(
        {
          error: "Unauthorized.",
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

    await connectMongoDB();

    const messages =
      await MeetingChatMessage
        .find({
          callId,
        })
        .sort({
          createdAt: -1,
        })
        .limit(100)
        .lean();

    return Response.json({
      messages:
        messages
          .reverse()
          .map(
            (
              message
            ) => ({
              id:
                String(
                  message._id
                ),

              senderId:
                message.senderId,

              senderName:
                message.senderName,

              senderImage:
                message.senderImage,

              text:
                message.text,

              sentAt:
                message.createdAt,
            })
          ),
    });
  } catch (error) {
    console.error(
      "Load meeting chat error:",
      error
    );

    return Response.json(
      {
        error:
          "Unable to load meeting chat.",
      },
      {
        status: 500,
      }
    );
  }
}

/* =========================================================
   SEND MESSAGE
========================================================= */

export async function POST(
  request: Request
) {
  try {
    const {
      userId,
    } = await auth();

    if (!userId) {
      return Response.json(
        {
          error: "Unauthorized.",
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

    const text =
      typeof body.text ===
      "string"
        ? body.text.trim()
        : "";

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

    if (
      text.length >
      1500
    ) {
      return Response.json(
        {
          error:
            "Message is too long.",
        },
        {
          status: 413,
        }
      );
    }

    await connectMongoDB();

    const savedMessage =
      await MeetingChatMessage.create({
        callId,
        senderId:
          userId,
        senderName,
        senderImage,
        text,
      });

    const message = {
      id:
        String(
          savedMessage._id
        ),

      senderId:
        userId,

      senderName,

      senderImage,

      text,

      sentAt:
        savedMessage.createdAt.toISOString(),
    };

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

    await call.sendCallEvent({
      custom: {
        type:
          CHAT_EVENT,

        ...message,
      },

      user_id:
        userId,
    });

    return Response.json({
      success: true,
      message,
    });
  } catch (error) {
    console.error(
      "Send meeting chat error:",
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