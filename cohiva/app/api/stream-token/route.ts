import {
  auth,
} from "@clerk/nextjs/server";

import { getStreamServerClient } from "@/lib/streamServer";

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

    const streamClient =
      getStreamServerClient();

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