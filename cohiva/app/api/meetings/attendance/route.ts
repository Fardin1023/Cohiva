import {
  auth,
} from "@clerk/nextjs/server";

import {
  StreamClient,
} from "@stream-io/node-sdk";

import connectMongoDB from "@/lib/mongodb";
import MeetingAttendance from "@/models/MeetingAttendance";

/* =========================================================
   POST JOIN / LEAVE
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
      typeof body.callId ===
      "string"
        ? body.callId.trim()
        : "";

    const action =
      body.action;

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
        "join" &&
      action !==
        "leave"
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
       JOIN
    ===================================================== */

    if (
      action ===
      "join"
    ) {
      if (!attendance) {
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

            totalSeconds:
              0,

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
      } else {
        attendance.name =
          name;

        attendance.image =
          image;

        const lastSession =
          attendance.sessions[
            attendance.sessions.length -
              1
          ];

        /*
         * React development can mount twice.
         * Don't create duplicate active sessions.
         */
        if (
          !lastSession ||
          lastSession.leftAt
        ) {
          attendance.sessions.push({
            joinedAt:
              now,

            leftAt:
              null,

            durationSeconds:
              0,
          });

          attendance.lastJoinedAt =
            now;

          attendance.lastLeftAt =
            null;

          await attendance.save();
        }
      }

      return Response.json({
        success: true,
        action:
          "join",
      });
    }

    /* =====================================================
       LEAVE
    ===================================================== */

    if (!attendance) {
      return Response.json({
        success: true,
        action:
          "leave",
      });
    }

    const lastSession =
      attendance.sessions[
        attendance.sessions.length -
          1
      ];

    if (
      lastSession &&
      !lastSession.leftAt
    ) {
      const durationSeconds =
        Math.max(
          0,
          Math.round(
            (
              now.getTime() -
              new Date(
                lastSession.joinedAt
              ).getTime()
            ) /
              1000
          )
        );

      lastSession.leftAt =
        now;

      lastSession.durationSeconds =
        durationSeconds;

      attendance.totalSeconds =
        (
          attendance.totalSeconds ||
          0
        ) +
        durationSeconds;

      attendance.lastLeftAt =
        now;

      await attendance.save();
    }

    return Response.json({
      success: true,
      action:
        "leave",
    });
  } catch (error) {
    console.error(
      "Attendance update error:",
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
   GET ATTENDANCE — TEACHER ONLY
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

    /*
     * Verify the requesting user
     * created this meeting.
     */
    const query =
      await streamClient.video.queryCalls({
        filter_conditions: {
          id: {
            $eq:
              callId,
          },

          type: {
            $eq:
              "development",
          },

          created_by_user_id: {
            $eq:
              userId,
          },
        },
      });

    if (
      !query.calls ||
      query.calls.length ===
        0
    ) {
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

    return Response.json({
      records:
        records.map(
          (
            record
          ) => {
            const sessions =
              Array.isArray(
                record.sessions
              )
                ? record.sessions
                : [];

            const active =
              sessions.some(
                (
                  session:
                    {
                      leftAt?: Date | null;
                    }
                ) =>
                  !session.leftAt
              );

            return {
              userId:
                record.userId,

              name:
                record.name,

              image:
                record.image,

              firstJoinedAt:
                record.firstJoinedAt,

              lastJoinedAt:
                record.lastJoinedAt,

              lastLeftAt:
                record.lastLeftAt,

              totalSeconds:
                record.totalSeconds ||
                0,

              sessionCount:
                sessions.length,

              active,
            };
          }
        ),
    });
  } catch (error) {
    console.error(
      "Attendance read error:",
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