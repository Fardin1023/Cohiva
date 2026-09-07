/*
 * =========================================================
 * COHIVA MEETING CONFIGURATION
 * =========================================================
 *
 * TEMPORARY DIAGNOSTIC:
 *
 * We are using Stream's built-in "default" call type
 * to verify that the Stream credentials, meeting creation,
 * duration limits and participant limits all work correctly.
 *
 * Once the test succeeds, we will switch this back to:
 *
 * "cohiva_classroom"
 *
 * after the custom Stream call type is confirmed in the
 * correct Stream application.
 * =========================================================
 */

export const COHIVA_CALL_TYPE =
  "default";

/* =========================================================
   MEETING DURATION LIMITS
========================================================= */

export const COHIVA_MIN_DURATION_MINUTES =
  1;

export const COHIVA_MAX_DURATION_MINUTES =
  45;

export const COHIVA_DEFAULT_DURATION_MINUTES =
  45;

/* =========================================================
   PARTICIPANT LIMITS

   Includes the meeting host.
========================================================= */

export const COHIVA_MIN_PARTICIPANTS =
  2;

export const COHIVA_MAX_PARTICIPANTS =
  20;

export const COHIVA_DEFAULT_PARTICIPANTS =
  20;

/* =========================================================
   CLAMP MEETING DURATION

   Prevents a browser/user from sending something like:

   durationMinutes = 9999

   Server will always force the value into:

   1 → 45 minutes
========================================================= */

export const clampMeetingDurationMinutes = (
  value: unknown
) => {
  const parsed =
    typeof value === "number"
      ? value
      : Number(value);

  if (
    !Number.isFinite(parsed)
  ) {
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

/* =========================================================
   CLAMP PARTICIPANT LIMIT

   Server always forces the value into:

   2 → 20 people
========================================================= */

export const clampMeetingParticipants = (
  value: unknown
) => {
  const parsed =
    typeof value === "number"
      ? value
      : Number(value);

  if (
    !Number.isFinite(parsed)
  ) {
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

/* =========================================================
   MINUTES → SECONDS

   Stream expects max_duration_seconds.

   Example:
   3 minutes → 180 seconds
   45 minutes → 2700 seconds
========================================================= */

export const meetingDurationToSeconds = (
  minutes: number
) => {
  return (
    clampMeetingDurationMinutes(
      minutes
    ) * 60
  );
};