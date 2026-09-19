import connectMongoDB from "../mongodb";
import CohivaRtcRoom from "../../models/CohivaRtcRoom";
import MeetingAttendance from "../../models/MeetingAttendance";

const HEARTBEAT_TIMEOUT_MS = 55_000;

type RoomTiming = {
  endedAt?: Date | string | null;
  timerEndsAt?: Date | string | null;
};

export const hasMeetingExpired = (room: RoomTiming, now = new Date()) => {
  if (room.endedAt) return true;
  if (!room.timerEndsAt) return false;
  const end = new Date(room.timerEndsAt);
  return !Number.isNaN(end.getTime()) && end.getTime() <= now.getTime();
};

const finalizeAttendance = async (callId: string, endedAt: Date) => {
  const records = await MeetingAttendance.find({ callId, isPresent: true });

  for (const record of records) {
    let leftAt = endedAt;

    if (record.lastHeartbeatAt) {
      const heartbeatAt = new Date(record.lastHeartbeatAt);
      if (endedAt.getTime() - heartbeatAt.getTime() > HEARTBEAT_TIMEOUT_MS) {
        leftAt = heartbeatAt;
      }
    }

    const startedAt = record.activeSessionStartedAt
      ? new Date(record.activeSessionStartedAt)
      : null;
    const durationSeconds = startedAt
      ? Math.max(0, Math.floor((leftAt.getTime() - startedAt.getTime()) / 1000))
      : 0;

    record.totalSeconds = Number(record.totalSeconds || 0) + durationSeconds;
    record.lastLeftAt = leftAt;
    record.lastHeartbeatAt = leftAt;
    record.activeSessionStartedAt = null;
    record.isPresent = false;

    if (Array.isArray(record.sessions)) {
      for (let index = record.sessions.length - 1; index >= 0; index -= 1) {
        const session = record.sessions[index];
        if (!session.leftAt) {
          session.leftAt = leftAt;
          session.durationSeconds = durationSeconds;
          break;
        }
      }
    }

    await record.save();
  }
};

/**
 * Permanently closes one meeting session in MongoDB. It is intentionally
 * idempotent so the Next.js API and the RTC duration timer can both call it.
 */
export const finalizeMeetingInDatabase = async (
  callId: string,
  requestedEndedAt = new Date()
) => {
  await connectMongoDB();

  /*
   * Only one caller wins the transition from active -> ended. The RTC timer,
   * the host's End button and a stale-link check may all notice the same end
   * at nearly the same moment; this atomic filter prevents attendance time
   * from being added twice.
   */
  const transitioned = await CohivaRtcRoom.findOneAndUpdate(
    { callId, endedAt: null },
    { $set: { endedAt: requestedEndedAt } },
    { new: true }
  )
    .select({ endedAt: 1 })
    .lean();

  if (!transitioned) {
    const existing = await CohivaRtcRoom.findOne({ callId })
      .select({ endedAt: 1 })
      .lean();
    return existing?.endedAt ? new Date(existing.endedAt) : null;
  }

  try {
    await finalizeAttendance(callId, requestedEndedAt);
  } catch (error) {
    console.error("Attendance finalization error:", error);
  }

  return requestedEndedAt;
};
