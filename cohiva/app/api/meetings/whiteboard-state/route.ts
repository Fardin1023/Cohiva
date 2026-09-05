import {
  auth,
} from "@clerk/nextjs/server";

import connectMongoDB from "@/lib/mongodb";

import WhiteboardState from "@/models/WhiteboardState";

/* =========================================================
   TYPES
========================================================= */

type SaveWhiteboardRequest = {
  callId?: string;

  elements?: unknown[];

  title?: string;
};

/* =========================================================
   GET SAVED BOARD
========================================================= */

export async function GET(
  request: Request
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
       CALL ID
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
       DATABASE
    ===================================================== */

    await connectMongoDB();

    const board =
      await WhiteboardState
        .findOne({
          callId,
        })
        .select({
          _id: 0,
          elements: 1,
          title: 1,
          elementCount: 1,
          lastSavedAt: 1,
          updatedAt: 1,
        })
        .lean();

    /* =====================================================
       NO SAVED BOARD YET
    ===================================================== */

    if (!board) {
      return Response.json({
        exists: false,

        elements: [],

        lastSavedAt: null,
      });
    }

    /* =====================================================
       RETURN BOARD
    ===================================================== */

    return Response.json({
      exists: true,

      callId,

      elements:
        Array.isArray(
          board.elements
        )
          ? board.elements
          : [],

      title:
        board.title,

      elementCount:
        board.elementCount,

      lastSavedAt:
        board.lastSavedAt,

      updatedAt:
        board.updatedAt,
    });
  } catch (error) {
    console.error(
      "Load Cohiva whiteboard error:",
      error
    );

    return Response.json(
      {
        error:
          "Unable to load saved whiteboard.",
      },
      {
        status: 500,
      }
    );
  }
}

/* =========================================================
   SAVE BOARD
========================================================= */

export async function PUT(
  request: Request
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
      (await request.json()) as
        SaveWhiteboardRequest;

    const callId =
      body.callId?.trim();

    const elements =
      body.elements;

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
      !Array.isArray(
        elements
      )
    ) {
      return Response.json(
        {
          error:
            "Invalid whiteboard elements.",
        },
        {
          status: 400,
        }
      );
    }

    /*
     * Safety limit.
     *
     * Prevent an accidentally enormous
     * browser request from being written
     * straight into MongoDB.
     *
     * This is NOT the Stream 5 KB limit.
     */
    const serialized =
      JSON.stringify(
        elements
      );

    const bytes =
      new TextEncoder()
        .encode(
          serialized
        )
        .length;

    const MAX_BOARD_BYTES =
      5 * 1024 * 1024;

    if (
      bytes >
      MAX_BOARD_BYTES
    ) {
      return Response.json(
        {
          error:
            "This whiteboard has become too large to save.",
        },
        {
          status: 413,
        }
      );
    }

    /* =====================================================
       DATABASE
    ===================================================== */

    await connectMongoDB();

    /*
     * Find existing board.
     */
    const existing =
      await WhiteboardState
        .findOne({
          callId,
        })
        .select({
          ownerId: 1,
        })
        .lean();

    /*
     * Once a board has an owner,
     * another account cannot overwrite
     * its persistent copy.
     *
     * Students still receive live
     * whiteboard updates through Stream.
     */
    if (
      existing &&
      existing.ownerId !==
        userId
    ) {
      return Response.json(
        {
          error:
            "Only the whiteboard owner can save this board.",
        },
        {
          status: 403,
        }
      );
    }

    const title =
      body.title?.trim() ||
      "Cohiva Whiteboard";

    const now =
      new Date();

    const board =
      await WhiteboardState.findOneAndUpdate(
        {
          callId,
        },

        {
          $set: {
            elements,

            title,

            elementCount:
              elements.length,

            lastSavedAt:
              now,
          },

          $setOnInsert: {
            ownerId:
              userId,
          },
        },

        {
          upsert: true,

          new: true,

          setDefaultsOnInsert:
            true,
        }
      );

    return Response.json({
      success: true,

      callId,

      elementCount:
        elements.length,

      lastSavedAt:
        board.lastSavedAt,
    });
  } catch (error) {
    console.error(
      "Save Cohiva whiteboard error:",
      error
    );

    return Response.json(
      {
        error:
          "Unable to save whiteboard.",
      },
      {
        status: 500,
      }
    );
  }
}