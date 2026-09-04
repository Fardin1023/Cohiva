import {
  auth,
} from "@clerk/nextjs/server";

import {
  StreamClient,
} from "@stream-io/node-sdk";

import connectMongoDB from "@/lib/mongodb";

import MeetingAttendance from "@/models/MeetingAttendance";

const CALL_TYPE =
  "development";

/*
 * Client sends heartbeat every 20 seconds.
 *
 * If we haven't heard from the participant
 * for 55 seconds, consider the session stale.
 */
const HEARTBEAT_TIMEOUT_MS =
  55_000;

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

const secondsBetween = (
  start: Date,
  end: Date
) => {
  return Math.max(
    0,
    Math.floor(
      (
        end.getTime() -
        start.getTime()
      ) /
        1000
    )
  );
};

/* =========================================================
   FINALIZE CURRENT SESSION
========================================================= */

const finalizeCurrentSession = (
  document: any,
  endTime: Date
) => {
  const startedAt =
    document.activeSessionStartedAt
      ? new Date(
          document.activeSessionStartedAt
        )
      : null;

  if (
    !startedAt
  ) {
    document.isPresent =
      false;

    document.lastLeftAt =
      endTime;

    document.activeSessionStartedAt =
      null;

    return;
  }

  const duration =
    secondsBetween(
      startedAt,
      endTime
    );

  document.totalSeconds =
    Math.max(
      0,
      Number(
        document.totalSeconds ||
          0
      )
    ) +
    duration;

  const sessions =
    document.sessions ||
    [];

  const lastSession =
    sessions[
      sessions.length - 1
    ];

  if (
    lastSession &&
    !lastSession.leftAt
  ) {
    lastSession.leftAt =
      endTime;

    lastSession.durationSeconds =
      duration;
  }

  document.isPresent =
    false;

  document.lastLeftAt =
    endTime;

  document.activeSessionStartedAt =
    null;
};

/* =========================================================
   VERIFY TEACHER
========================================================= */

const verifyTeacher =
  async (
    callId: string,
    userId: string
  ) => {
    const apiKey =
      process.env
        .NEXT_PUBLIC_STREAM_API_KEY;

    const secret =
      process.env
        .STREAM_API_SECRET;

    if (
      !apiKey ||
      !secret
    ) {
      throw new Error(
        "Stream configuration missing."
      );
    }

    const client =
      new StreamClient(
        apiKey,
        secret,
        {
          timeout: 10000,
        }
      );

    const call =
      client.video.call(
        CALL_TYPE,
        callId
      );

    const response =
      await call.get();

    return (
      response.call
        .created_by?.id ===
      userId
    );
  };

/* =========================================================
   POST
========================================================= */

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
      cleanString(
        body.callId,
        200
      );

    const action =
      cleanString(
        body.action,
        30
      );

    const name =
      cleanString(
        body.name,
        120
      ) ||
      "Participant";

    const image =
      cleanString(
        body.image,
        1000
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

    if (
      action !== "join" &&
      action !== "leave" &&
      action !== "heartbeat"
    ) {
      return Response.json(
        {
          error:
            "Invalid attendance action.",
        },
        {
          status: 400,
        }
      );
    }

    await connectMongoDB();

    const now =
      new Date();

    let attendance =
      await MeetingAttendance.findOne({
        callId,
        userId,
      });

    /* =====================================================
       FIRST JOIN
    ===================================================== */

    if (
      action === "join" &&
      !attendance
    ) {
      attendance =
        await MeetingAttendance.create({
          callId,

          userId,

          name,

          image,

          firstJoinedAt:
            now,

          lastJoinedAt:
            now,

          lastLeftAt:
            null,

          activeSessionStartedAt:
            now,

          lastHeartbeatAt:
            now,

          totalSeconds:
            0,

          joinCount:
            1,

          isPresent:
            true,

          sessions: [
            {
              joinedAt:
                now,

              leftAt:
                null,

              durationSeconds:
                0,
            },
          ],
        });

      return Response.json({
        success: true,

        status:
          "joined",
      });
    }

    /* =====================================================
       HEARTBEAT WITHOUT EXISTING RECORD

       Treat as join recovery.
    ===================================================== */

    if (
      action ===
        "heartbeat" &&
      !attendance
    ) {
      attendance =
        await MeetingAttendance.create({
          callId,

          userId,

          name,

          image,

          firstJoinedAt:
            now,

          lastJoinedAt:
            now,

          activeSessionStartedAt:
            now,

          lastHeartbeatAt:
            now,

          totalSeconds:
            0,

          joinCount:
            1,

          isPresent:
            true,

          sessions: [
            {
              joinedAt:
                now,

              leftAt:
                null,

              durationSeconds:
                0,
            },
          ],
        });

      return Response.json({
        success: true,
      });
    }

    if (
      !attendance
    ) {
      return Response.json({
        success: true,
      });
    }

    /* =====================================================
       UPDATE PROFILE DATA
    ===================================================== */

    attendance.name =
      name ||
      attendance.name;

    if (image) {
      attendance.image =
        image;
    }

    /* =====================================================
       JOIN / REJOIN
    ===================================================== */

    if (
      action ===
      "join"
    ) {
      /*
       * If we still think the participant
       * is present, check whether that old
       * session actually went stale.
       */
      if (
        attendance.isPresent
      ) {
        const heartbeat =
          attendance.lastHeartbeatAt
            ? new Date(
                attendance.lastHeartbeatAt
              )
            : null;

        const stale =
          !heartbeat ||
          now.getTime() -
            heartbeat.getTime() >
            HEARTBEAT_TIMEOUT_MS;

        /*
         * Normal duplicate join from React
         * or refresh initialization.
         */
        if (
          !stale
        ) {
          attendance.lastHeartbeatAt =
            now;

          await attendance.save();

          return Response.json({
            success: true,

            status:
              "already-present",
          });
        }

        /*
         * Previous browser vanished without
         * sending leave. Close that session
         * at its last heartbeat.
         */
        finalizeCurrentSession(
          attendance,

          heartbeat ||
            now
        );
      }

      attendance.lastJoinedAt =
        now;

      attendance.lastLeftAt =
        null;

      attendance.activeSessionStartedAt =
        now;

      attendance.lastHeartbeatAt =
        now;

      attendance.isPresent =
        true;

      attendance.joinCount =
        Number(
          attendance.joinCount ||
            0
        ) + 1;

      attendance.sessions.push({
        joinedAt:
          now,

        leftAt:
          null,

        durationSeconds:
          0,
      });

      await attendance.save();

      return Response.json({
        success: true,

        status:
          "rejoined",
      });
    }

    /* =====================================================
       HEARTBEAT
    ===================================================== */

    if (
      action ===
      "heartbeat"
    ) {
      if (
        attendance.isPresent
      ) {
        attendance.lastHeartbeatAt =
          now;

        await attendance.save();
      }

      return Response.json({
        success: true,
      });
    }

    /* =====================================================
       LEAVE
    ===================================================== */

    if (
      action ===
      "leave"
    ) {
      /*
       * Duplicate leave is harmless.
       */
      if (
        !attendance.isPresent
      ) {
        return Response.json({
          success: true,

          status:
            "already-left",
        });
      }

      finalizeCurrentSession(
        attendance,
        now
      );

      attendance.lastHeartbeatAt =
        now;

      await attendance.save();

      return Response.json({
        success: true,

        status:
          "left",
      });
    }

    return Response.json({
      success: true,
    });
  } catch (error) {
    console.error(
      "Attendance POST error:",
      error
    );

    return Response.json(
      {
        error:
          "Unable to update attendance.",
      },
      {
        status: 500,
      }
    );
  }
}

/* =========================================================
   GET - TEACHER ONLY
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

    const teacher =
      await verifyTeacher(
        callId,
        userId
      );

    if (!teacher) {
      return Response.json(
        {
          error:
            "Only the teacher can view attendance.",
        },
        {
          status: 403,
        }
      );
    }

    await connectMongoDB();

    const records =
      await MeetingAttendance
        .find({
          callId,
        })
        .sort({
          firstJoinedAt:
            1,
        })
        .lean();

    const now =
      new Date();

    const attendance =
      records
        .map(
          (
            record: any
          ) => {
            const heartbeat =
              record.lastHeartbeatAt
                ? new Date(
                    record.lastHeartbeatAt
                  )
                : null;

            const heartbeatFresh =
              Boolean(
                heartbeat &&
                now.getTime() -
                  heartbeat.getTime() <=
                  HEARTBEAT_TIMEOUT_MS
              );

            const present =
              Boolean(
                record.isPresent &&
                heartbeatFresh
              );

            let totalSeconds =
              Number(
                record.totalSeconds ||
                  0
              );

            if (
              record.isPresent &&
              record.activeSessionStartedAt
            ) {
              const start =
                new Date(
                  record.activeSessionStartedAt
                );

              /*
               * If stale, only count until
               * last known heartbeat.
               */
              const effectiveEnd =
                present
                  ? now
                  : heartbeat ||
                    now;

              totalSeconds +=
                secondsBetween(
                  start,
                  effectiveEnd
                );
            }

            return {
              userId:
                record.userId,

              name:
                record.name,

              image:
                record.image ||
                "",

              firstJoinedAt:
                record.firstJoinedAt,

              lastJoinedAt:
                record.lastJoinedAt,

              lastLeftAt:
                record.lastLeftAt,

              totalSeconds,

              joinCount:
                record.joinCount ||
                1,

              isPresent:
                present,

              sessions:
                record.sessions ||
                [],
            };
          }
        )
        .sort(
          (
            a,
            b
          ) => {
            if (
              a.isPresent !==
              b.isPresent
            ) {
              return a.isPresent
                ? -1
                : 1;
            }

            return (
              new Date(
                a.firstJoinedAt
              ).getTime() -
              new Date(
                b.firstJoinedAt
              ).getTime()
            );
          }
        );

    return Response.json({
      success: true,

      attendance,

      count:
        attendance.length,

      presentCount:
        attendance.filter(
          (
            item
          ) =>
            item.isPresent
        ).length,
    });
  } catch (error) {
    console.error(
      "Attendance GET error:",
      error
    );

    return Response.json(
      {
        error:
          "Unable to load attendance.",
      },
      {
        status: 500,
      }
    );
  }
}