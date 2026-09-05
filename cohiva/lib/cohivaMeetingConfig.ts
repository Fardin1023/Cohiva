export const COHIVA_CALL_TYPE = "cohiva_classroom";

export const COHIVA_MIN_DURATION_MINUTES = 1;
export const COHIVA_MAX_DURATION_MINUTES = 45;
export const COHIVA_DEFAULT_DURATION_MINUTES = 45;

export const COHIVA_MIN_PARTICIPANTS = 2;
export const COHIVA_MAX_PARTICIPANTS = 20;
export const COHIVA_DEFAULT_PARTICIPANTS = 20;

export const clampMeetingDurationMinutes = (
  value: unknown
) => {
  const parsed =
    typeof value === "number"
      ? value
      : Number(value);

  if (!Number.isFinite(parsed)) {
    return COHIVA_DEFAULT_DURATION_MINUTES;
  }

  return Math.min(
    COHIVA_MAX_DURATION_MINUTES,
    Math.max(
      COHIVA_MIN_DURATION_MINUTES,
      Math.round(parsed)
    )
  );
};

export const clampMeetingParticipants = (
  value: unknown
) => {
  const parsed =
    typeof value === "number"
      ? value
      : Number(value);

  if (!Number.isFinite(parsed)) {
    return COHIVA_DEFAULT_PARTICIPANTS;
  }

  return Math.min(
    COHIVA_MAX_PARTICIPANTS,
    Math.max(
      COHIVA_MIN_PARTICIPANTS,
      Math.round(parsed)
    )
  );
};

export const meetingDurationToSeconds = (
  minutes: number
) =>
  clampMeetingDurationMinutes(minutes) * 60;
