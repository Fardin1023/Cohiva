import connectMongoDB from "../mongodb";
import CohivaRtcRoom from "../../models/CohivaRtcRoom";
import { finalizeMeetingInDatabase, hasMeetingExpired } from "./lifecycle";

export type ActiveMeetingAuthorization = {
  room: any;
  isHost: boolean;
};

export class MeetingAuthorizationError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "MeetingAuthorizationError";
    this.status = status;
  }
}

/**
 * Authorizes APIs that are only meaningful once a user has actually been
 * admitted to an active Cohiva meeting. This prevents an authenticated user
 * from calling chat/whiteboard/classroom APIs with somebody else's callId.
 */
export const requireActiveMeetingParticipant = async (
  callId: string,
  userId: string
): Promise<ActiveMeetingAuthorization> => {
  await connectMongoDB();

  const room = await CohivaRtcRoom.findOne({ callId });
  if (!room) {
    throw new MeetingAuthorizationError("Meeting not found.", 404);
  }

  if (room.endedAt || hasMeetingExpired(room)) {
    if (!room.endedAt && hasMeetingExpired(room)) {
      await finalizeMeetingInDatabase(
        callId,
        room.timerEndsAt ? new Date(room.timerEndsAt) : new Date()
      );
    }
    throw new MeetingAuthorizationError("This meeting has ended.", 410);
  }

  if (!room.startedAt) {
    throw new MeetingAuthorizationError("The host has not started this meeting yet.", 409);
  }

  const isHost = room.hostUserId === userId;
  const admitted = isHost || Boolean(room.memberUserIds?.includes(userId));

  if (!admitted) {
    throw new MeetingAuthorizationError("You are not admitted to this meeting.", 403);
  }

  return { room, isHost };
};

export const meetingAuthorizationResponse = (error: unknown) => {
  if (error instanceof MeetingAuthorizationError) {
    return Response.json({ error: error.message }, { status: error.status });
  }
  return null;
};
