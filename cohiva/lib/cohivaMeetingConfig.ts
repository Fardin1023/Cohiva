export const COHIVA_DEFAULT_DURATION_MINUTES = 45;
export const COHIVA_MIN_DURATION_MINUTES = 1;
export const COHIVA_MAX_DURATION_MINUTES = 45;

export const COHIVA_DEFAULT_PARTICIPANTS = 20;
export const COHIVA_MIN_PARTICIPANTS = 2;
export const COHIVA_MAX_PARTICIPANTS = 20;

const toFiniteNumber = (value: unknown, fallback: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export const clampMeetingDurationMinutes = (value: unknown) =>
  Math.min(
    COHIVA_MAX_DURATION_MINUTES,
    Math.max(
      COHIVA_MIN_DURATION_MINUTES,
      Math.round(toFiniteNumber(value, COHIVA_DEFAULT_DURATION_MINUTES))
    )
  );

export const clampMeetingParticipants = (value: unknown) =>
  Math.min(
    COHIVA_MAX_PARTICIPANTS,
    Math.max(
      COHIVA_MIN_PARTICIPANTS,
      Math.round(toFiniteNumber(value, COHIVA_DEFAULT_PARTICIPANTS))
    )
  );

export const meetingDurationToSeconds = (minutes: unknown) =>
  clampMeetingDurationMinutes(minutes) * 60;
