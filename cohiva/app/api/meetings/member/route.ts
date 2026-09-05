import { auth } from "@clerk/nextjs/server";
import { getStreamServerClient } from "@/lib/streamServer";

type MemberRequestBody = {
  callId?: string;
};

export async function POST(
  request: Request
) {
  try {
    /* =====================================================
       AUTHENTICATE USER
    ===================================================== */

    const {
      userId,
    } =
      await auth();

    if (!userId) {
      return Response.json(
        {
          error:
            "Unauthorized",
        },
        {
          status: 401,
        }
      );
    }

    /* =====================================================
       READ REQUEST
    ===================================================== */

    const body =
      (await request.json()) as MemberRequestBody;

    const callId =
      body.callId?.trim();

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

    const streamClient =
      getStreamServerClient();

    /* =====================================================
       ADD USER AS CALL MEMBER
    ===================================================== */

    const call =
      streamClient.video.call(
        "development",
        callId
      );

    /*
     * This is safe to call even if
     * the user is already a member.
     *
     * Most importantly:
     * custom Cohiva events now reach
     * this participant reliably.
     */
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
      userId,
      callId,
    });
  } catch (error) {
    console.error(
      "Meeting membership error:",
      error
    );

    return Response.json(
      {
        error:
          "Unable to prepare meeting membership.",
      },
      {
        status: 500,
      }
    );
  }
}