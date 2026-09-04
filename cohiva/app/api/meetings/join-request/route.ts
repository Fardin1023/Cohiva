import {
  auth,
} from "@clerk/nextjs/server";

import {
  StreamClient,
} from "@stream-io/node-sdk";

import connectMongoDB from "@/lib/mongodb";

import MeetingJoinRequest from "@/models/MeetingJoinRequest";

/* =========================================================
   TYPES
========================================================= */

type MeetingAccessMode =
  | "open"
  | "approval"
  | "locked";

const ACCESS_KEY =
  "cohiva_access_mode";

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
   GET CALL INFORMATION
========================================================= */

const getCallInformation =
  async (
    callId:
      string
  ) => {
    const streamClient =
      getStreamClient();

    const call =
      streamClient.video.call(
        "development",
        callId
      );

    const response =
      await call.get();

    const custom =
      (
        response.call
          .custom ??
        {}
      ) as Record<
        string,
        unknown
      >;

    const accessMode =
      normalizeMode(
        custom[
          ACCESS_KEY
        ]
      );

    return {
      streamClient,
      call,
      response,
      accessMode,
    };
  };

/* =========================================================
   GET

   Teacher:
   pending requests

   Student:
   own status
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

    const {
      response,
      accessMode,
    } =
      await getCallInformation(
        callId
      );

    const isTeacher =
      response.call
        .created_by?.id ===
      userId;

    await connectMongoDB();

    /* =====================================================
       TEACHER
    ===================================================== */

    if (
      isTeacher
    ) {
      const requests =
        await MeetingJoinRequest
          .find({
            callId,

            status:
              "pending",
          })
          .sort({
            requestedAt:
              1,
          })
          .lean();

      return Response.json({
        teacher: true,

        accessMode,

        requests:
          requests.map(
            (
              request
            ) => ({
              userId:
                request.userId,

              name:
                request.name,

              image:
                request.image,

              status:
                request.status,

              requestedAt:
                request.requestedAt,
            })
          ),
      });
    }

    /* =====================================================
       STUDENT
    ===================================================== */

    const studentRequest =
      await MeetingJoinRequest
        .findOne({
          callId,

          userId,
        })
        .lean();

    return Response.json({
      teacher: false,

      accessMode,

      status:
        studentRequest?.status ??
        null,
    });
  } catch (error) {
    console.error(
      "Cohiva waiting room GET error:",
      error
    );

    return Response.json(
      {
        error:
          "Unable to read waiting room status.",
      },
      {
        status: 500,
      }
    );
  }
}

/* =========================================================
   POST
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

    const {
      call,
      response,
      accessMode,
    } =
      await getCallInformation(
        callId
      );

    const isTeacher =
      response.call
        .created_by?.id ===
      userId;

    /* =====================================================
       STUDENT REQUEST
    ===================================================== */

    if (
      action ===
      "request"
    ) {
      /*
       * Creator never waits.
       */
      if (
        isTeacher
      ) {
        return Response.json({
          success: true,

          status:
            "approved",

          accessMode,
        });
      }

      /* ===============================================
         OPEN
      =============================================== */

      if (
        accessMode ===
        "open"
      ) {
        return Response.json({
          success: true,

          status:
            "open",

          accessMode,
        });
      }

      /* ===============================================
         LOCKED
      =============================================== */

      if (
        accessMode ===
        "locked"
      ) {
        return Response.json(
          {
            error:
              "This meeting is currently locked.",

            accessMode,
          },
          {
            status: 403,
          }
        );
      }

      /* ===============================================
         APPROVAL MODE
      =============================================== */

      await connectMongoDB();

      const existing =
        await MeetingJoinRequest.findOne({
          callId,

          userId,
        });

      if (
        existing?.status ===
        "approved"
      ) {
        return Response.json({
          success: true,

          status:
            "approved",

          accessMode,
        });
      }

      const name =
        typeof body.name ===
        "string"
          ? body.name
              .trim()
              .slice(
                0,
                120
              )
          : "Participant";

      const image =
        typeof body.image ===
        "string"
          ? body.image
              .trim()
              .slice(
                0,
                1000
              )
          : "";

      await MeetingJoinRequest.findOneAndUpdate(
        {
          callId,

          userId,
        },

        {
          $set: {
            name,

            image,

            status:
              "pending",

            requestedAt:
              new Date(),

            decidedAt:
              null,
          },
        },

        {
          upsert: true,

          returnDocument:
            "after",

          setDefaultsOnInsert:
            true,
        }
      );

      return Response.json({
        success: true,

        status:
          "pending",

        accessMode,
      });
    }

    /* =====================================================
       APPROVE / DENY
    ===================================================== */

    if (
      action !==
        "approve" &&
      action !==
        "deny"
    ) {
      return Response.json(
        {
          error:
            "Invalid waiting room action.",
        },
        {
          status: 400,
        }
      );
    }

    if (
      !isTeacher
    ) {
      return Response.json(
        {
          error:
            "Only the meeting opener can approve participants.",
        },
        {
          status: 403,
        }
      );
    }

    const targetUserId =
      typeof body.targetUserId ===
      "string"
        ? body.targetUserId.trim()
        : "";

    if (
      !targetUserId
    ) {
      return Response.json(
        {
          error:
            "Participant is required.",
        },
        {
          status: 400,
        }
      );
    }

    await connectMongoDB();

    const joinRequest =
      await MeetingJoinRequest.findOne({
        callId,

        userId:
          targetUserId,
      });

    if (
      !joinRequest
    ) {
      return Response.json(
        {
          error:
            "Join request was not found.",
        },
        {
          status: 404,
        }
      );
    }

    /* =====================================================
       APPROVE
    ===================================================== */

    if (
      action ===
      "approve"
    ) {
      await call.updateCallMembers({
        update_members: [
          {
            user_id:
              targetUserId,
          },
        ],
      });

      joinRequest.status =
        "approved";
    } else {
      joinRequest.status =
        "denied";
    }

    joinRequest.decidedAt =
      new Date();

    await joinRequest.save();

    return Response.json({
      success: true,

      status:
        joinRequest.status,

      accessMode,
    });
  } catch (error) {
    console.error(
      "Cohiva waiting room POST error:",
      error
    );

    return Response.json(
      {
        error:
          "Unable to process join request.",
      },
      {
        status: 500,
      }
    );
  }
}