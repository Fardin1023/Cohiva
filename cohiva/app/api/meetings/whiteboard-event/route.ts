import { auth } from "@/lib/auth/server";
import connectMongoDB from "@/lib/mongodb";
import { broadcastRtcEvent } from "@/lib/rtc/server";
import CohivaRtcRoom, {
  DEFAULT_COHIVA_RTC_PERMISSIONS,
} from "@/models/CohivaRtcRoom";

const WHITEBOARD_EVENT = "cohiva-whiteboard";
const MAX_EVENTS = 256;
const MAX_EVENT_BYTES = 4500;

type WhiteboardEvent = Record<string, unknown>;

const getBytes = (value: unknown) =>
  new TextEncoder().encode(JSON.stringify(value)).length;

export async function POST(request: Request) {
  try {
    const { userId } = await auth();

    if (!userId) {
      return Response.json(
        { error: "Unauthorized." },
        { status: 401 }
      );
    }

    const body = await request.json();
    const callId =
      typeof body.callId === "string"
        ? body.callId.trim().slice(0, 120)
        : "";
    const events = body.events as WhiteboardEvent[];

    if (!callId) {
      return Response.json(
        { error: "Meeting ID is required." },
        { status: 400 }
      );
    }

    if (!Array.isArray(events) || events.length === 0) {
      return Response.json(
        { error: "Whiteboard events are required." },
        { status: 400 }
      );
    }

    if (events.length > MAX_EVENTS) {
      return Response.json(
        { error: "Too many whiteboard events." },
        { status: 413 }
      );
    }

    await connectMongoDB();

    const room = await CohivaRtcRoom.findOne({ callId })
      .select({
        hostUserId: 1,
        permissions: 1,
      })
      .lean();

    if (!room) {
      return Response.json(
        { error: "Meeting not found." },
        { status: 404 }
      );
    }

    const isTeacher = room.hostUserId === userId;
    const storedPermissions =
      room.permissions && typeof room.permissions === "object"
        ? (room.permissions as Record<string, unknown>)
        : {};
    const studentCanDraw =
      typeof storedPermissions.studentWhiteboard === "boolean"
        ? storedPermissions.studentWhiteboard
        : DEFAULT_COHIVA_RTC_PERMISSIONS.studentWhiteboard;

    const safeEvents: Record<string, unknown>[] = [];

    for (const event of events) {
      if (!event || typeof event !== "object" || Array.isArray(event)) {
        return Response.json(
          { error: "Invalid whiteboard event." },
          { status: 400 }
        );
      }

      const action = event.action;

      if (typeof action !== "string") {
        return Response.json(
          { error: "Invalid whiteboard action." },
          { status: 400 }
        );
      }

      if (action === "sync-request") {
        // Everyone may ask the teacher for the latest board.
      } else if (action === "elements") {
        if (!isTeacher && !studentCanDraw) {
          return Response.json(
            {
              error:
                "The teacher has disabled student whiteboard editing.",
            },
            { status: 403 }
          );
        }
      } else if (action === "clear" || action === "empty-snapshot") {
        if (!isTeacher) {
          return Response.json(
            {
              error:
                action === "clear"
                  ? "Only the teacher can clear the whiteboard."
                  : "Only the teacher can publish the board snapshot.",
            },
            { status: 403 }
          );
        }
      } else {
        return Response.json(
          { error: "Unsupported whiteboard action." },
          { status: 400 }
        );
      }

      const customEvent = {
        ...event,
        type: WHITEBOARD_EVENT,
        senderId: userId,
      };

      if (getBytes(customEvent) > MAX_EVENT_BYTES) {
        return Response.json(
          { error: "Whiteboard event is too large." },
          { status: 413 }
        );
      }

      safeEvents.push(customEvent);
    }

    const CONCURRENCY = 4;

    for (let index = 0; index < safeEvents.length; index += CONCURRENCY) {
      const group = safeEvents.slice(index, index + CONCURRENCY);

      await Promise.all(
        group.map((customEvent) =>
          broadcastRtcEvent({
            callId,
            event: "custom",
            data: {
              custom: customEvent,
              user_id: userId,
            },
          })
        )
      );
    }

    return Response.json({
      success: true,
      relayed: safeEvents.length,
      studentWhiteboard: studentCanDraw,
    });
  } catch (error) {
    console.error("Cohiva whiteboard event error:", error);

    return Response.json(
      { error: "Unable to relay whiteboard update." },
      { status: 500 }
    );
  }
}
