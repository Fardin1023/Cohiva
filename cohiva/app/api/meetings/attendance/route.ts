import { COHIVA_CALL_TYPE } from "@/lib/cohivaMeetingConfig";

import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { getStreamServerClient } from "@/lib/streamServer";

import connectMongoDB from "@/lib/mongodb";
import MeetingAttendance from "@/models/MeetingAttendance";

/* =========================================================
   CONFIG
========================================================= */

const CALL_TYPE =
  COHIVA_CALL_TYPE;

/*
 * MeetingRoom sends a heartbeat every 20 seconds.
 *
 * If no heartbeat arrives for 55 seconds,
 * Cohiva considers the participant disconnected.
 */
const HEARTBEAT_TIMEOUT_MS =
  55_000;

/* =========================================================
   TYPES
========================================================= */

type AttendanceAction =
  | "join"
  | "leave"
  | "heartbeat";

type AttendanceBody = {
  callId?: string;

  action?: AttendanceAction;

  name?: string;

  image?: string;
};

/* =========================================================
   HELPERS
========================================================= */

const safeDateMs = (
  value: unknown
) => {
  if (!value) {
    return 0;
  }

  const date =
    new Date(
      value as string | Date
    );

  const time =
    date.getTime();

  return Number.isFinite(
    time
  )
    ? time
    : 0;
};

/* =========================================================
   DUPLICATE KEY ERROR
========================================================= */

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
    ).code === 11000
  );
};

/* =========================================================
   SORT DUPLICATE DOCUMENTS

   We keep the best/current document.

   Priority:
   1. Currently present
   2. Latest heartbeat
   3. Latest update
========================================================= */

const sortDuplicateRecords = (
  records: any[]
) => {
  return [
    ...records,
  ].sort(
    (
      a,
      b
    ) => {
      if (
        Boolean(
          a.isPresent
        ) !==
        Boolean(
          b.isPresent
        )
      ) {
        return a.isPresent
          ? -1
          : 1;
      }

      const heartbeatDifference =
        safeDateMs(
          b.lastHeartbeatAt
        ) -
        safeDateMs(
          a.lastHeartbeatAt
        );

      if (
        heartbeatDifference !==
        0
      ) {
        return heartbeatDifference;
      }

      return (
        safeDateMs(
          b.updatedAt
        ) -
        safeDateMs(
          a.updatedAt
        )
      );
    }
  );
};

/* =========================================================
   CLEAN DUPLICATES FOR SAME USER ID

   This handles OLD MongoDB duplicates where the exact same
   callId + userId accidentally produced multiple documents.
========================================================= */

const deduplicateUserAttendance =
  async (
    callId: string,
    userId: string
  ) => {
    const records =
      await MeetingAttendance.find({
        callId,
        userId,
      });

    if (
      records.length ===
      0
    ) {
      return null;
    }

    if (
      records.length ===
      1
    ) {
      return records[0];
    }

    const sorted =
      sortDuplicateRecords(
        records
      );

    const keeper =
      sorted[0];

    const duplicates =
      sorted.slice(
        1
      );

    /* =====================================================
       EARLIEST FIRST JOIN
    ===================================================== */

    const firstJoinedTimes =
      records
        .map(
          (
            record
          ) =>
            safeDateMs(
              record.firstJoinedAt
            )
        )
        .filter(
          (
            value
          ) =>
            value >
            0
        );

    if (
      firstJoinedTimes.length >
      0
    ) {
      keeper.firstJoinedAt =
        new Date(
          Math.min(
            ...firstJoinedTimes
          )
        );
    }

    /* =====================================================
       LATEST JOIN
    ===================================================== */

    const lastJoinedTimes =
      records
        .map(
          (
            record
          ) =>
            safeDateMs(
              record.lastJoinedAt
            )
        )
        .filter(
          (
            value
          ) =>
            value >
            0
        );

    if (
      lastJoinedTimes.length >
      0
    ) {
      keeper.lastJoinedAt =
        new Date(
          Math.max(
            ...lastJoinedTimes
          )
        );
    }

    /* =====================================================
       LATEST LEAVE
    ===================================================== */

    const lastLeftTimes =
      records
        .map(
          (
            record
          ) =>
            safeDateMs(
              record.lastLeftAt
            )
        )
        .filter(
          (
            value
          ) =>
            value >
            0
        );

    if (
      lastLeftTimes.length >
      0
    ) {
      keeper.lastLeftAt =
        new Date(
          Math.max(
            ...lastLeftTimes
          )
        );
    }

    /* =====================================================
       LATEST HEARTBEAT
    ===================================================== */

    const heartbeatTimes =
      records
        .map(
          (
            record
          ) =>
            safeDateMs(
              record.lastHeartbeatAt
            )
        )
        .filter(
          (
            value
          ) =>
            value >
            0
        );

    if (
      heartbeatTimes.length >
      0
    ) {
      keeper.lastHeartbeatAt =
        new Date(
          Math.max(
            ...heartbeatTimes
          )
        );
    }

    /*
     * IMPORTANT:
     *
     * Do NOT SUM duplicate duration/join counts.
     *
     * The duplicate documents normally represent the
     * same physical attendance session.
     */

    keeper.totalSeconds =
      Math.max(
        ...records.map(
          (
            record
          ) =>
            Number(
              record.totalSeconds ||
                0
            )
        ),
        0
      );

    keeper.joinCount =
      Math.max(
        ...records.map(
          (
            record
          ) =>
            Number(
              record.joinCount ||
                0
            )
        ),
        1
      );

    /* =====================================================
       KEEP USEFUL NAME
    ===================================================== */

    if (
      !keeper.name ||
      keeper.name ===
        "Participant"
    ) {
      const usefulName =
        records.find(
          (
            record
          ) =>
            record.name &&
            record.name !==
              "Participant"
        )?.name;

      if (
        usefulName
      ) {
        keeper.name =
          usefulName;
      }
    }

    /* =====================================================
       KEEP USEFUL PROFILE IMAGE
    ===================================================== */

    if (
      !keeper.image
    ) {
      const usefulImage =
        records.find(
          (
            record
          ) =>
            Boolean(
              record.image
            )
        )?.image;

      if (
        usefulImage
      ) {
        keeper.image =
          usefulImage;
      }
    }

    await keeper.save();

    /* =====================================================
       DELETE OLD DUPLICATE DOCUMENTS
    ===================================================== */

    const duplicateIds =
      duplicates.map(
        (
          record
        ) =>
          record._id
      );

    if (
      duplicateIds.length >
      0
    ) {
      await MeetingAttendance.deleteMany({
        _id: {
          $in:
            duplicateIds,
        },
      });
    }

    return keeper;
  };

/* =========================================================
   CLEAN ALL SAME-USER DUPLICATES IN MEETING
========================================================= */

const deduplicateCallAttendance =
  async (
    callId: string
  ) => {
    const records =
      await MeetingAttendance.find({
        callId,
      });

    const userIds =
      Array.from(
        new Set(
          records
            .map(
              (
                record
              ) =>
                String(
                  record.userId ||
                    ""
                )
            )
            .filter(
              Boolean
            )
        )
      );

    const cleanRecords:
      any[] = [];

    for (
      const userId of userIds
    ) {
      const record =
        await deduplicateUserAttendance(
          callId,
          userId
        );

      if (
        record
      ) {
        cleanRecords.push(
          record
        );
      }
    }

    return cleanRecords;
  };

/* =========================================================
   CLOSE ACTIVE SESSION
========================================================= */

const closeActiveSession = (
  record: any,
  leftAt: Date
) => {
  const startedAt =
    record.activeSessionStartedAt
      ? new Date(
          record.activeSessionStartedAt
        )
      : null;

  let durationSeconds =
    0;

  if (
    startedAt
  ) {
    durationSeconds =
      Math.max(
        0,

        Math.floor(
          (
            leftAt.getTime() -
            startedAt.getTime()
          ) /
            1000
        )
      );
  }

  record.totalSeconds =
    Number(
      record.totalSeconds ||
        0
    ) +
    durationSeconds;

  record.lastLeftAt =
    leftAt;

  record.activeSessionStartedAt =
    null;

  record.isPresent =
    false;

  /* =====================================================
     CLOSE LAST OPEN SESSION HISTORY ITEM
  ===================================================== */

  if (
    Array.isArray(
      record.sessions
    )
  ) {
    for (
      let index =
        record.sessions.length -
        1;
      index >= 0;
      index -= 1
    ) {
      const session =
        record.sessions[
          index
        ];

      if (
        !session.leftAt
      ) {
        session.leftAt =
          leftAt;

        session.durationSeconds =
          durationSeconds;

        break;
      }
    }
  }

  return durationSeconds;
};

/* =========================================================
   IS PARTICIPANT REALLY PRESENT?
========================================================= */

const isRecordFresh = (
  record: any,
  now = new Date()
) => {
  if (
    !record.isPresent ||
    !record.lastHeartbeatAt
  ) {
    return false;
  }

  const heartbeat =
    new Date(
      record.lastHeartbeatAt
    ).getTime();

  return (
    now.getTime() -
      heartbeat <=
    HEARTBEAT_TIMEOUT_MS
  );
};

/* =========================================================
   START ATTENDANCE SESSION
========================================================= */

const startSession =
  async ({
    record,
    callId,
    userId,
    name,
    image,
    now,
  }: {
    record: any | null;

    callId: string;

    userId: string;

    name: string;

    image: string;

    now: Date;
  }) => {
    /* =====================================================
       EXISTING ATTENDANCE DOCUMENT
    ===================================================== */

    if (
      record
    ) {
      /*
       * Duplicate JOIN from React/Fast Refresh.
       *
       * If they're already present and heartbeat is fresh,
       * this is NOT a real new join.
       */

      if (
        isRecordFresh(
          record,
          now
        )
      ) {
        record.name =
          name;

        record.image =
          image;

        record.lastHeartbeatAt =
          now;

        record.isPresent =
          true;

        await record.save();

        return record;
      }

      /*
       * Old session became stale.
       */

      if (
        record.activeSessionStartedAt
      ) {
        const staleEnd =
          record.lastHeartbeatAt
            ? new Date(
                record.lastHeartbeatAt
              )
            : now;

        closeActiveSession(
          record,
          staleEnd
        );
      }

      record.name =
        name;

      record.image =
        image;

      if (
        !record.firstJoinedAt
      ) {
        record.firstJoinedAt =
          now;
      }

      record.lastJoinedAt =
        now;

      record.activeSessionStartedAt =
        now;

      record.lastHeartbeatAt =
        now;

      record.isPresent =
        true;

      record.joinCount =
        Number(
          record.joinCount ||
            0
        ) + 1;

      if (
        !Array.isArray(
          record.sessions
        )
      ) {
        record.sessions =
          [];
      }

      record.sessions.push({
        joinedAt:
          now,

        leftAt:
          null,

        durationSeconds:
          0,
      });

      await record.save();

      return record;
    }

    /* =====================================================
       FIRST JOIN
    ===================================================== */

    try {
      const created =
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

      return created;
    } catch (
      error
    ) {
      /*
       * Two JOIN requests reached MongoDB at the exact same
       * time. The unique index rejects one.
       */

      if (
        isDuplicateKeyError(
          error
        )
      ) {
        const existing =
          await deduplicateUserAttendance(
            callId,
            userId
          );

        if (
          existing
        ) {
          existing.name =
            name;

          existing.image =
            image;

          existing.lastHeartbeatAt =
            now;

          existing.isPresent =
            true;

          await existing.save();

          return existing;
        }
      }

      throw error;
    }
  };

/* =========================================================
   POST
   JOIN / HEARTBEAT / LEAVE
========================================================= */

export async function POST(
  request: NextRequest
) {
  try {
    /* =====================================================
       AUTH
    ===================================================== */

    const {
      userId,
    } =
      await auth();

    if (
      !userId
    ) {
      return NextResponse.json(
        {
          error:
            "Unauthorized.",
        },
        {
          status:
            401,
        }
      );
    }

    /* =====================================================
       BODY
    ===================================================== */

    const body =
      (
        await request.json()
      ) as AttendanceBody;

    const callId =
      body.callId?.trim();

    const action =
      body.action;

    const name =
      body.name?.trim() ||
      "Participant";

    const image =
      body.image?.trim() ||
      "";

    if (
      !callId
    ) {
      return NextResponse.json(
        {
          error:
            "callId is required.",
        },
        {
          status:
            400,
        }
      );
    }

    if (
      action !==
        "join" &&
      action !==
        "leave" &&
      action !==
        "heartbeat"
    ) {
      return NextResponse.json(
        {
          error:
            "Invalid attendance action.",
        },
        {
          status:
            400,
        }
      );
    }

    /* =====================================================
       DATABASE
    ===================================================== */

    await connectMongoDB();

    const now =
      new Date();

    /*
     * Clean old duplicate documents first.
     */

    let record =
      await deduplicateUserAttendance(
        callId,
        userId
      );

    /* =====================================================
       JOIN
    ===================================================== */

    if (
      action ===
      "join"
    ) {
      record =
        await startSession({
          record,

          callId,

          userId,

          name,

          image,

          now,
        });

      return NextResponse.json({
        ok:
          true,

        action:
          "join",

        attendance: {
          userId:
            record.userId,

          name:
            record.name,

          joinCount:
            record.joinCount,

          isPresent:
            record.isPresent,
        },
      });
    }

    /* =====================================================
       HEARTBEAT
    ===================================================== */

    if (
      action ===
      "heartbeat"
    ) {
      /*
       * Recover if JOIN somehow failed.
       */

      if (
        !record
      ) {
        record =
          await startSession({
            record:
              null,

            callId,

            userId,

            name,

            image,

            now,
          });

        return NextResponse.json({
          ok:
            true,

          action:
            "heartbeat",

          recoveredJoin:
            true,
        });
      }

      /*
       * If React cleanup accidentally marked them absent but
       * heartbeat proves they're still here, recover.
       */

      if (
        !record.isPresent ||
        !record.activeSessionStartedAt
      ) {
        record =
          await startSession({
            record,

            callId,

            userId,

            name,

            image,

            now,
          });

        return NextResponse.json({
          ok:
            true,

          action:
            "heartbeat",

          recoveredJoin:
            true,
        });
      }

      /*
       * Heartbeat is extremely old.
       */

      if (
        record.lastHeartbeatAt
      ) {
        const heartbeatAge =
          now.getTime() -
          new Date(
            record.lastHeartbeatAt
          ).getTime();

        if (
          heartbeatAge >
          HEARTBEAT_TIMEOUT_MS
        ) {
          const staleEnd =
            new Date(
              record.lastHeartbeatAt
            );

          closeActiveSession(
            record,
            staleEnd
          );

          await record.save();

          record =
            await startSession({
              record,

              callId,

              userId,

              name,

              image,

              now,
            });

          return NextResponse.json({
            ok:
              true,

            action:
              "heartbeat",

            recoveredJoin:
              true,
          });
        }
      }

      record.name =
        name;

      record.image =
        image;

      record.lastHeartbeatAt =
        now;

      record.isPresent =
        true;

      await record.save();

      return NextResponse.json({
        ok:
          true,

        action:
          "heartbeat",
      });
    }

    /* =====================================================
       LEAVE
    ===================================================== */

    if (
      action ===
      "leave"
    ) {
      if (
        !record
      ) {
        return NextResponse.json({
          ok:
            true,

          action:
            "leave",

          alreadyLeft:
            true,
        });
      }

      record.name =
        name;

      record.image =
        image;

      /*
       * Duplicate leave request.
       */

      if (
        !record.isPresent ||
        !record.activeSessionStartedAt
      ) {
        record.isPresent =
          false;

        await record.save();

        return NextResponse.json({
          ok:
            true,

          action:
            "leave",

          alreadyLeft:
            true,
        });
      }

      const durationAdded =
        closeActiveSession(
          record,
          now
        );

      record.lastHeartbeatAt =
        now;

      await record.save();

      return NextResponse.json({
        ok:
          true,

        action:
          "leave",

        durationAdded,
      });
    }

    return NextResponse.json(
      {
        error:
          "Invalid attendance action.",
      },
      {
        status:
          400,
      }
    );
  } catch (
    error
  ) {
    console.error(
      "Cohiva attendance POST error:",
      error
    );

    return NextResponse.json(
      {
        error:
          "Unable to update attendance.",
      },
      {
        status:
          500,
      }
    );
  }
}

/* =========================================================
   GET
   TEACHER ATTENDANCE SHEET
========================================================= */

export async function GET(
  request: NextRequest
) {
  try {
    /* =====================================================
       AUTH
    ===================================================== */

    const {
      userId,
    } =
      await auth();

    if (
      !userId
    ) {
      return NextResponse.json(
        {
          error:
            "Unauthorized.",
        },
        {
          status:
            401,
        }
      );
    }

    /* =====================================================
       CALL ID
    ===================================================== */

    const callId =
      request.nextUrl.searchParams
        .get(
          "callId"
        )
        ?.trim();

    if (
      !callId
    ) {
      return NextResponse.json(
        {
          error:
            "callId is required.",
        },
        {
          status:
            400,
        }
      );
    }

    /* =====================================================
       TEACHER VERIFICATION
    ===================================================== */

    const streamClient =
      getStreamServerClient();

    const queryResult =
      await streamClient.video.queryCalls({
        filter_conditions: {
          id: {
            $eq:
              callId,
          },

          type: {
            $eq:
              CALL_TYPE,
          },

          created_by_user_id: {
            $eq:
              userId,
          },
        },
      });

    const teacherCalls =
      (
        queryResult as {
          calls?: unknown[];
        }
      ).calls;

    if (
      !Array.isArray(
        teacherCalls
      ) ||
      teacherCalls.length ===
        0
    ) {
      return NextResponse.json(
        {
          error:
            "Only the meeting creator can view attendance.",
        },
        {
          status:
            403,
        }
      );
    }

    /* =====================================================
       DATABASE
    ===================================================== */

    await connectMongoDB();

    /*
     * Delete old duplicate documents where the same
     * callId + userId exists more than once.
     */

    const attendance =
      await deduplicateCallAttendance(
        callId
      );

    const now =
      new Date();

    const rows:
      {
        id: string;

        userId: string;

        name: string;

        image: string;

        firstJoinedAt:
          Date | null;

        lastJoinedAt:
          Date | null;

        lastLeftAt:
          Date | null;

        joinCount: number;

        totalSeconds: number;

        durationSeconds: number;

        isPresent: boolean;
      }[] = [];

    /* =====================================================
       BUILD RAW ROWS
    ===================================================== */

    for (
      const record of attendance
    ) {
      let present =
        isRecordFresh(
          record,
          now
        );

      /*
       * Participant is still marked present in DB,
       * but heartbeat has expired.
       */

      if (
        record.isPresent &&
        !present
      ) {
        const staleLeftAt =
          record.lastHeartbeatAt
            ? new Date(
                record.lastHeartbeatAt
              )
            : now;

        closeActiveSession(
          record,
          staleLeftAt
        );

        await record.save();

        present =
          false;
      }

      let liveSessionSeconds =
        0;

      if (
        present &&
        record.activeSessionStartedAt
      ) {
        liveSessionSeconds =
          Math.max(
            0,

            Math.floor(
              (
                now.getTime() -
                new Date(
                  record.activeSessionStartedAt
                ).getTime()
              ) /
                1000
            )
          );
      }

      const calculatedTotal =
        Number(
          record.totalSeconds ||
            0
        ) +
        liveSessionSeconds;

      rows.push({
        id:
          String(
            record._id
          ),

        userId:
          String(
            record.userId ||
              ""
          ),

        name:
          record.name ||
          "Participant",

        image:
          record.image ||
          "",

        firstJoinedAt:
          record.firstJoinedAt ||
          null,

        lastJoinedAt:
          record.lastJoinedAt ||
          null,

        lastLeftAt:
          record.lastLeftAt ||
          null,

        joinCount:
          Number(
            record.joinCount ||
              0
          ),

        totalSeconds:
          calculatedTotal,

        durationSeconds:
          calculatedTotal,

        isPresent:
          present,
      });
    }

    /* =====================================================
       FINAL DISPLAY DEDUPLICATION

       Main key:
       userId

       Legacy fallback:
       same normalized name + SAME non-empty profile image.

       This is what fixes cases such as:

       Kamran
       Kamran
       Fardin

       becoming:

       Kamran
       Fardin
    ===================================================== */

    const finalMap =
      new Map<
        string,
        (typeof rows)[number]
      >();

    for (
      const row of rows
    ) {
      const normalizedName =
        row.name
          .trim()
          .toLowerCase();

      const normalizedImage =
        row.image
          .trim();

      const userKey =
        row.userId
          ? `user:${row.userId}`
          : "";

      let existingKey:
        string | undefined;

      /* =============================================
         SAME USER ID
      ============================================= */

      if (
        userKey &&
        finalMap.has(
          userKey
        )
      ) {
        existingKey =
          userKey;
      }

      /* =============================================
         LEGACY FALLBACK

         Same name + exact same NON-EMPTY image.
      ============================================= */

      if (
        !existingKey &&
        normalizedImage
      ) {
        for (
          const [
            key,
            existing,
          ] of finalMap
        ) {
          const existingName =
            existing.name
              .trim()
              .toLowerCase();

          const existingImage =
            existing.image
              .trim();

          if (
            existingName ===
              normalizedName &&
            existingImage &&
            existingImage ===
              normalizedImage
          ) {
            existingKey =
              key;

            break;
          }
        }
      }

      /* =============================================
         FIRST ROW
      ============================================= */

      if (
        !existingKey
      ) {
        const fallbackKey =
          normalizedImage
            ? `identity:${normalizedName}|${normalizedImage}`
            : `row:${row.id}`;

        finalMap.set(
          userKey ||
            fallbackKey,
          {
            ...row,
          }
        );

        continue;
      }

      /* =============================================
         MERGE DUPLICATE DISPLAY ROW
      ============================================= */

      const existing =
        finalMap.get(
          existingKey
        );

      if (
        !existing
      ) {
        continue;
      }

      /* PRESENT IF EITHER ONE IS PRESENT */

      existing.isPresent =
        existing.isPresent ||
        row.isPresent;

      /* EARLIEST FIRST JOIN */

      const existingFirst =
        safeDateMs(
          existing.firstJoinedAt
        );

      const currentFirst =
        safeDateMs(
          row.firstJoinedAt
        );

      if (
        currentFirst >
          0 &&
        (
          existingFirst ===
            0 ||
          currentFirst <
            existingFirst
        )
      ) {
        existing.firstJoinedAt =
          row.firstJoinedAt;
      }

      /* LATEST LAST JOIN */

      if (
        safeDateMs(
          row.lastJoinedAt
        ) >
        safeDateMs(
          existing.lastJoinedAt
        )
      ) {
        existing.lastJoinedAt =
          row.lastJoinedAt;
      }

      /* LATEST LEAVE */

      if (
        safeDateMs(
          row.lastLeftAt
        ) >
        safeDateMs(
          existing.lastLeftAt
        )
      ) {
        existing.lastLeftAt =
          row.lastLeftAt;
      }

      /*
       * Do NOT sum duplicates because they may represent
       * the same session.
       */

      existing.totalSeconds =
        Math.max(
          existing.totalSeconds,
          row.totalSeconds
        );

      existing.durationSeconds =
        Math.max(
          existing.durationSeconds,
          row.durationSeconds
        );

      existing.joinCount =
        Math.max(
          existing.joinCount,
          row.joinCount
        );

      if (
        !existing.image &&
        row.image
      ) {
        existing.image =
          row.image;
      }

      if (
        existing.name ===
          "Participant" &&
        row.name !==
          "Participant"
      ) {
        existing.name =
          row.name;
      }
    }

    /* =====================================================
       FINAL UNIQUE ROWS
    ===================================================== */

    const finalRows =
      Array.from(
        finalMap.values()
      );

    /* =====================================================
       SORT

       Present participants first.
       Then earliest first join.
    ===================================================== */

    finalRows.sort(
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
          safeDateMs(
            a.firstJoinedAt
          ) -
          safeDateMs(
            b.firstJoinedAt
          )
        );
      }
    );

    /* =====================================================
       COUNTS FROM UNIQUE ROWS ONLY
    ===================================================== */

    const presentCount =
      finalRows.filter(
        (
          row
        ) =>
          row.isPresent
      ).length;

    /* =====================================================
       RESPONSE
    ===================================================== */

    return NextResponse.json({
      attendance:
        finalRows,

      records:
        finalRows,

      presentCount,

      totalCount:
        finalRows.length,
    });
  } catch (
    error
  ) {
    console.error(
      "Cohiva attendance GET error:",
      error
    );

    return NextResponse.json(
      {
        error:
          "Unable to load attendance.",
      },
      {
        status:
          500,
      }
    );
  }
}