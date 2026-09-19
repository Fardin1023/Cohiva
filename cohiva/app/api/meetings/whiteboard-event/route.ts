import { auth } from "@/lib/auth/server";
import connectMongoDB from "@/lib/mongodb";
import { meetingAuthorizationResponse, requireActiveMeetingParticipant } from "@/lib/meetings/authorization";
import { broadcastRtcEvent } from "@/lib/rtc/server";
import CohivaRtcRoom, {
  DEFAULT_COHIVA_RTC_PERMISSIONS,
} from "@/models/CohivaRtcRoom";
import WhiteboardState from "@/models/WhiteboardState";

const WHITEBOARD_EVENT = "cohiva-whiteboard";
const MAX_EVENTS = 2048;
const MAX_EVENT_BYTES = 4500;
const MAX_BOARD_BYTES = 5 * 1024 * 1024;

type WhiteboardEvent = Record<string, unknown>;
type WhiteboardElement = Record<string, unknown> & {
  id?: unknown;
  version?: unknown;
};

type ElementBatch = {
  total: number;
  snapshot: boolean;
  chunks: string[];
};

const getBytes = (value: unknown) =>
  new TextEncoder().encode(JSON.stringify(value)).length;

const mergeElements = (
  existing: WhiteboardElement[],
  incoming: WhiteboardElement[]
) => {
  const byId = new Map<string, WhiteboardElement>();
  const withoutId: WhiteboardElement[] = [];

  for (const element of existing) {
    const id = typeof element?.id === "string" ? element.id : "";
    if (id) {
      byId.set(id, element);
    } else {
      withoutId.push(element);
    }
  }

  for (const element of incoming) {
    const id = typeof element?.id === "string" ? element.id : "";

    if (!id) {
      withoutId.push(element);
      continue;
    }

    const current = byId.get(id);
    const currentVersion = Number(current?.version ?? -1);
    const incomingVersion = Number(element.version ?? 0);

    if (!current || incomingVersion >= currentVersion) {
      byId.set(id, element);
    }
  }

  return [...byId.values(), ...withoutId];
};

const parseElementBatches = (events: WhiteboardEvent[]) => {
  const batches = new Map<string, ElementBatch>();

  for (const event of events) {
    if (event.action !== "elements") continue;

    const batchId = event.batchId;
    const index = event.index;
    const total = event.total;
    const data = event.data;

    if (
      typeof batchId !== "string" ||
      typeof index !== "number" ||
      typeof total !== "number" ||
      typeof data !== "string" ||
      !Number.isInteger(index) ||
      !Number.isInteger(total) ||
      total < 1 ||
      total > MAX_EVENTS ||
      index < 0 ||
      index >= total
    ) {
      throw new Error("INVALID_BATCH");
    }

    let batch = batches.get(batchId);

    if (!batch) {
      batch = {
        total,
        snapshot: event.snapshot === true,
        chunks: new Array(total),
      };
      batches.set(batchId, batch);
    }

    if (batch.total !== total || batch.snapshot !== (event.snapshot === true)) {
      throw new Error("INVALID_BATCH");
    }

    batch.chunks[index] = data;
  }

  const parsed: Array<{
    snapshot: boolean;
    elements: WhiteboardElement[];
  }> = [];

  for (const batch of batches.values()) {
    if (batch.chunks.some((chunk) => typeof chunk !== "string")) {
      throw new Error("INCOMPLETE_BATCH");
    }

    let elements: unknown;

    try {
      elements = JSON.parse(batch.chunks.join(""));
    } catch {
      throw new Error("INVALID_ELEMENTS");
    }

    if (!Array.isArray(elements)) {
      throw new Error("INVALID_ELEMENTS");
    }

    parsed.push({
      snapshot: batch.snapshot,
      elements: elements as WhiteboardElement[],
    });
  }

  return parsed;
};

export async function POST(request: Request) {
  try {
    const { userId } = await auth();

    if (!userId) {
      return Response.json({ error: "Unauthorized." }, { status: 401 });
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

    const { room, isHost } = await requireActiveMeetingParticipant(callId, userId);
    const hostUserId = String(room.hostUserId ?? "");
    const isTeacher = isHost;
    const storedPermissions =
      room.permissions && typeof room.permissions === "object"
        ? (room.permissions as Record<string, unknown>)
        : {};
    const studentCanDraw =
      typeof storedPermissions.studentWhiteboard === "boolean"
        ? storedPermissions.studentWhiteboard
        : DEFAULT_COHIVA_RTC_PERMISSIONS.studentWhiteboard;

    const safeEvents: Record<string, unknown>[] = [];
    let shouldClearPersistedBoard = false;

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
        // Any authenticated meeting participant may request the latest board.
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

        if (event.snapshot === true && !isTeacher) {
          return Response.json(
            { error: "Only the teacher can publish a board snapshot." },
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

        shouldClearPersistedBoard = true;
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

    let elementBatches: Array<{
      snapshot: boolean;
      elements: WhiteboardElement[];
    }> = [];

    try {
      elementBatches = parseElementBatches(events);
    } catch (error) {
      const reason = error instanceof Error ? error.message : "";
      return Response.json(
        {
          error:
            reason === "INCOMPLETE_BATCH"
              ? "Incomplete whiteboard update."
              : "Invalid whiteboard element update.",
        },
        { status: 400 }
      );
    }

    /*
     * Keep MongoDB as the authoritative late-join state.
     *
     * This is intentionally updated BEFORE broadcasting the realtime event.
     * A participant opening the board after these changes can therefore load
     * the complete scene even if the original realtime events happened before
     * their WhiteboardCanvas was mounted.
     */
    if (shouldClearPersistedBoard || elementBatches.length > 0) {
      const existing = await WhiteboardState.findOne({ callId })
        .select({ elements: 1 })
        .lean();

      let nextElements: WhiteboardElement[] = Array.isArray(existing?.elements)
        ? (existing.elements as WhiteboardElement[])
        : [];

      if (shouldClearPersistedBoard) {
        nextElements = [];
      }

      for (const batch of elementBatches) {
        if (batch.snapshot) {
          nextElements = batch.elements;
        } else {
          nextElements = mergeElements(nextElements, batch.elements);
        }
      }

      if (getBytes(nextElements) > MAX_BOARD_BYTES) {
        return Response.json(
          { error: "This whiteboard has become too large to save." },
          { status: 413 }
        );
      }

      const now = new Date();

      await WhiteboardState.findOneAndUpdate(
        { callId },
        {
          $set: {
            ownerId: hostUserId,
            elements: nextElements,
            title: "Cohiva Whiteboard",
            elementCount: nextElements.length,
            lastSavedAt: now,
          },
        },
        {
          upsert: true,
          new: true,
          setDefaultsOnInsert: true,
        }
      );
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
    const authorizationResponse = meetingAuthorizationResponse(error);
    if (authorizationResponse) return authorizationResponse;

    console.error("Cohiva whiteboard event error:", error);

    return Response.json(
      { error: "Unable to relay whiteboard update." },
      { status: 500 }
    );
  }
}
