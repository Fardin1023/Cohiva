import {
  auth,
} from "@clerk/nextjs/server";

import {
  StreamClient,
} from "@stream-io/node-sdk";

import {
  NextResponse,
} from "next/server";

/* =========================================================
   GET STREAM TOKEN
========================================================= */

export async function GET() {
  try {
    /* =====================================================
       CLERK AUTH
    ===================================================== */

    const {
      userId,
    } =
      await auth();

    if (!userId) {
      return NextResponse.json(
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
       ENVIRONMENT
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
      console.error(
        "Missing Stream API configuration."
      );

      return NextResponse.json(
        {
          error:
            "Stream configuration is missing.",
        },
        {
          status: 500,
        }
      );
    }

    /* =====================================================
       STREAM SERVER CLIENT

       Increased timeout for any future
       server operations.

       Token generation itself is local
       and does not require a Stream API
       request.
    ===================================================== */

    const streamClient =
      new StreamClient(
        apiKey,
        apiSecret,
        {
          timeout: 10000,
        }
      );

    /* =====================================================
       GENERATE TOKEN

       IMPORTANT:
       Do NOT call upsertUsers() here.

       The token endpoint must stay fast and
       reliable because the entire video client
       depends on it.
    ===================================================== */

    const token =
      streamClient.generateUserToken({
        user_id:
          userId,

        validity_in_seconds:
          60 * 60,
      });

    return NextResponse.json({
      token,
    });
  } catch (error) {
    console.error(
      "Stream token error:",
      error
    );

    return NextResponse.json(
      {
        error:
          "Unable to get Stream token.",
      },
      {
        status: 500,
      }
    );
  }
}