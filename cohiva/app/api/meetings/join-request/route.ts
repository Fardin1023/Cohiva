import {
  auth,
} from "@clerk/nextjs/server";

import {
  StreamClient,
} from "@stream-io/node-sdk";

import connectMongoDB from "@/lib/mongodb";

import MeetingJoinRequest from "@/models/MeetingJoinRequest";

/* =========================================================
   CONFIG
========================================================= */

const CALL_TYPE =
  "development";

const ACCESS_KEY =
  "cohiva_access_mode";

const PENDING_REQUEST_MAX_AGE =
  15 * 60 * 1000;

/* =========================================================
   TYPES
========================================================= */

type MeetingAccessMode =
  | "open"
  | "approval"
  | "locked";

type TeacherCacheEntry = {
  teacher: boolean;
  expiresAt: number;
};

/* =========================================================
   SMALL SERVER CACHE

   Avoids repeatedly asking Stream whether
   the same user is the teacher every 1-2s.
========================================================= */

const teacherCache =
  new Map<
    string,
    TeacherCacheEntry
  >();

const TEACHER_CACHE_MS =
  60_000;

/* =========================================================
   STREAM CLIENT
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
        "Stream server configuration is missing."
      );
    }

    return new StreamClient(
      apiKey,
      apiSecret
    );
  };

/* =========================================================
   NORMALIZE ACCESS MODE
========================================================= */

const normalizeAccessMode =
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

    /*
     * Safe default.
     */
    return "approval";
  };

/* =========================================================
   LOAD STREAM CALL
========================================================= */

const getStreamCall =
  async (
    callId:
      string
  ) => {
    const client =
      getStreamClient();

    const call =
      client.video.call(
        CALL_TYPE,
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
      normalizeAccessMode(
        custom[
          ACCESS_KEY
        ]
      );

    const creatorId =
      response.call
        .created_by?.id ??
      null;

    return {
      call,
      accessMode,
      creatorId,
    };
  };

/* =========================================================
   VERIFY TEACHER

   Cached briefly to make waiting-room
   polling cheaper.
========================================================= */

const verifyTeacher =
  async (
    callId:
      string,

    userId:
      string
  ) => {
    const cacheKey =
      `${callId}:${userId}`;

    const cached =
      teacherCache.get(
        cacheKey
      );

    if (
      cached &&
      cached.expiresAt >
        Date.now()
    ) {
      return cached.teacher;
    }

    const {
      creatorId,
    } =
      await getStreamCall(
        callId
      );

    const teacher =
      creatorId ===
      userId;

    teacherCache.set(
      cacheKey,
      {
        teacher,

        expiresAt:
          Date.now() +
          TEACHER_CACHE_MS,
      }
    );

    return teacher;
  };

/* =========================================================
   GET

   scope=mine
   Student checks ONLY their own status.

   scope=pending
   Teacher checks waiting room.
========================================================= */

export async function GET(
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
       QUERY
    ===================================================== */

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

    const scope =
      searchParams.get(
        "scope"
      ) ??
      "mine";

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

    /* =====================================================
       STUDENT STATUS

       Fast path:
       no Stream network request required.
    ===================================================== */

    if (
      scope ===
      "mine"
    ) {
      const joinRequest =
        await MeetingJoinRequest
          .findOne({
            callId,

            userId,
          })
          .lean();

      return Response.json({
        success: true,

        status:
          joinRequest?.status ??
          null,
      });
    }

    /* =====================================================
       TEACHER WAITING ROOM
    ===================================================== */

    if (
      scope !==
      "pending"
    ) {
      return Response.json(
        {
          error:
            "Invalid request scope.",
        },
        {
          status: 400,
        }
      );
    }

    const teacher =
      await verifyTeacher(
        callId,
        userId
      );

    if (!teacher) {
      return Response.json(
        {
          error:
            "Only the meeting opener can view the waiting room.",
        },
        {
          status: 403,
        }
      );
    }

    /*
     * Don't revive extremely old
     * pending requests.
     */
    const oldestAllowed =
      new Date(
        Date.now() -
          PENDING_REQUEST_MAX_AGE
      );

    const requests =
      await MeetingJoinRequest
        .find({
          callId,

          status:
            "pending",

          requestedAt: {
            $gte:
              oldestAllowed,
          },
        })
        .sort({
          requestedAt:
            1,
        })
        .lean();

    return Response.json({
      success: true,

      requests:
        requests.map(
          (
            item
          ) => ({
            userId:
              item.userId,

            name:
              item.name,

            image:
              item.image,

            requestedAt:
              item.requestedAt,

            status:
              item.status,
          })
        ),
    });
  } catch (error) {
    console.error(
      "Cohiva waiting room GET error:",
      error
    );

    return Response.json(
      {
        error:
          "Unable to load the waiting room.",
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

    /* =====================================================
       STUDENT REQUEST
    ===================================================== */

    if (
      action ===
      "request"
    ) {
      /*
       * Only one Stream request happens
       * here when Ask to Join is clicked.
       *
       * It confirms:
       * - meeting exists
       * - current access mode
       * - whether requester is creator
       */

      const {
        accessMode,
        creatorId,
      } =
        await getStreamCall(
          callId
        );

      /* ===============================================
         CREATOR
      =============================================== */

      if (
        creatorId ===
        userId
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
              "The host has locked this meeting.",

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

      /*
       * Already approved users don't
       * need to ask every time they
       * temporarily reconnect.
       */
      if (
        existing?.status ===
        "approved"
      ) {
        return Response.json({
          success: true,

          status:
            "approved",

          accessMode:
            "approval",
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

      /*
       * Request itself is only MongoDB.
       *
       * No custom Stream event.
       * No need to already be inside
       * the meeting.
       */
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
          upsert:
            true,

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

        accessMode:
          "approval",
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
            "Invalid waiting-room action.",
        },
        {
          status: 400,
        }
      );
    }

    /* =====================================================
       VERIFY HOST + LOAD CALL
    ===================================================== */

    const {
      call,
      creatorId,
    } =
      await getStreamCall(
        callId
      );

    if (
      creatorId !==
      userId
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

    /* =====================================================
       TARGET USER
    ===================================================== */

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
            "This join request no longer exists.",
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
      /*
       * Make the user an actual member
       * BEFORE marking them approved.
       */
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
    }

    /* =====================================================
       DENY
    ===================================================== */

    if (
      action ===
      "deny"
    ) {
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