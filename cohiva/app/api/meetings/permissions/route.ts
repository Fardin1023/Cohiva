import { auth } from "@/lib/auth/server";
import connectMongoDB from "@/lib/mongodb";
import { broadcastRtcEvent } from "@/lib/rtc/server";
import { meetingAuthorizationResponse, requireActiveMeetingParticipant } from "@/lib/meetings/authorization";
import CohivaRtcRoom, {
  DEFAULT_COHIVA_RTC_PERMISSIONS,
} from "@/models/CohivaRtcRoom";

const cleanCallId = (value: unknown) =>
  typeof value === "string"
    ? value.trim().slice(0, 120)
    : "";

const normalizePermissions = (value: unknown) => {
  const raw =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};

  return {
    studentMic:
      typeof raw.studentMic === "boolean"
        ? raw.studentMic
        : DEFAULT_COHIVA_RTC_PERMISSIONS.studentMic,
    studentCamera:
      typeof raw.studentCamera === "boolean"
        ? raw.studentCamera
        : DEFAULT_COHIVA_RTC_PERMISSIONS.studentCamera,
    studentScreenShare:
      typeof raw.studentScreenShare === "boolean"
        ? raw.studentScreenShare
        : DEFAULT_COHIVA_RTC_PERMISSIONS.studentScreenShare,
    studentRecording: false,
    studentWhiteboard:
      typeof raw.studentWhiteboard === "boolean"
        ? raw.studentWhiteboard
        : DEFAULT_COHIVA_RTC_PERMISSIONS.studentWhiteboard,
  };
};

export async function GET(request: Request) {
  try {
    const { userId } = await auth();

    if (!userId) {
      return Response.json(
        { error: "Unauthorized." },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const callId = cleanCallId(searchParams.get("callId"));

    if (!callId) {
      return Response.json(
        { error: "Meeting ID is required." },
        { status: 400 }
      );
    }

    await connectMongoDB();

    await requireActiveMeetingParticipant(callId, userId);

    const room = await CohivaRtcRoom.findOne({ callId })
      .select({
        hostUserId: 1,
        permissions: 1,
        individualPermissions: 1,
      })
      .lean();

    if (!room) {
      return Response.json(
        { error: "Meeting not found." },
        { status: 404 }
      );
    }

    return Response.json({
      success: true,
      teacher: room.hostUserId === userId,
      permissions: normalizePermissions(room.permissions),
      individualPermissions:
        room.individualPermissions &&
        typeof room.individualPermissions === "object"
          ? room.individualPermissions
          : {},
    });
  } catch (error) {
    const authorizationResponse = meetingAuthorizationResponse(error);
    if (authorizationResponse) return authorizationResponse;

    console.error("Read Cohiva permissions error:", error);

    return Response.json(
      { error: "Unable to read meeting permissions." },
      { status: 500 }
    );
  }
}

export async function PUT(request: Request) {
  try {
    const { userId } = await auth();

    if (!userId) {
      return Response.json(
        { error: "Unauthorized." },
        { status: 401 }
      );
    }

    const body = await request.json();
    const callId = cleanCallId(body.callId);

    if (!callId) {
      return Response.json(
        { error: "Meeting ID is required." },
        { status: 400 }
      );
    }

    await connectMongoDB();

    await requireActiveMeetingParticipant(callId, userId);

    const room = await CohivaRtcRoom.findOne({ callId });

    if (!room) {
      return Response.json(
        { error: "Meeting not found." },
        { status: 404 }
      );
    }

    if (room.hostUserId !== userId) {
      return Response.json(
        { error: "Only the meeting host can change permissions." },
        { status: 403 }
      );
    }

    const current = normalizePermissions(room.permissions);
    const next = normalizePermissions({
      ...current,
      ...(body.permissions && typeof body.permissions === "object"
        ? body.permissions
        : {}),
    });

    room.permissions = next;
    await room.save();

    try {
      await broadcastRtcEvent({
        callId,
        event: "call.updated",
        data: {
          call: {
            custom: {
              cohiva_permissions: next,
            },
          },
        },
      });
    } catch (realtimeError) {
      console.error(
        "Cohiva permissions RTC broadcast error:",
        realtimeError
      );
    }

    return Response.json({
      success: true,
      permissions: next,
    });
  } catch (error) {
    const authorizationResponse = meetingAuthorizationResponse(error);
    if (authorizationResponse) return authorizationResponse;

    console.error("Update Cohiva permissions error:", error);

    return Response.json(
      { error: "Unable to update meeting permissions." },
      { status: 500 }
    );
  }
}
