"use client";

import {
  useCall,
  useCallStateHooks,
} from "@stream-io/video-react-sdk";

import {
  useEffect,
  useState,
} from "react";

import {
  COHIVA_DEFAULT_DURATION_MINUTES,
  COHIVA_DEFAULT_PARTICIPANTS,
  clampMeetingDurationMinutes,
  clampMeetingParticipants,
} from "@/lib/cohivaMeetingConfig";

import MeetingLimitFields from "./MeetingLimitFields";

type MeetingLimitsSettingsProps = {
  callId: string;
  compact?: boolean;
};

const MeetingLimitsSettings = ({
  callId,
  compact = false,
}: MeetingLimitsSettingsProps) => {
  const call = useCall();

  const {
    useCallSettings,
    useParticipantCount,
  } = useCallStateHooks();

  const settings =
    useCallSettings();

  const participantCount =
    useParticipantCount();

  const teacher =
    Boolean(
      call?.isCreatedByMe
    );

  const savedDuration =
    clampMeetingDurationMinutes(
      Math.round(
        Number(
          settings?.limits
            ?.max_duration_seconds ??
            COHIVA_DEFAULT_DURATION_MINUTES *
              60
        ) / 60
      )
    );

  const savedParticipants =
    clampMeetingParticipants(
      settings?.limits
        ?.max_participants ??
        COHIVA_DEFAULT_PARTICIPANTS
    );

  const [
    durationMinutes,
    setDurationMinutes,
  ] = useState(
    savedDuration
  );

  const [
    maxParticipants,
    setMaxParticipants,
  ] = useState(
    savedParticipants
  );

  const [saving, setSaving] =
    useState(false);

  const [saved, setSaved] =
    useState(false);

  const [error, setError] =
    useState("");

  useEffect(() => {
    if (saving) {
      return;
    }

    setDurationMinutes(
      savedDuration
    );

    setMaxParticipants(
      savedParticipants
    );
  }, [
    savedDuration,
    savedParticipants,
    saving,
  ]);

  if (!teacher) {
    return null;
  }

  const changed =
    durationMinutes !==
      savedDuration ||
    maxParticipants !==
      savedParticipants;

  const saveLimits = async () => {
    if (
      !call ||
      saving ||
      !changed
    ) {
      return;
    }

    try {
      setSaving(true);
      setSaved(false);
      setError("");

      const response =
        await fetch(
          "/api/meetings/limits",
          {
            method: "PUT",
            headers: {
              "Content-Type":
                "application/json",
            },
            body: JSON.stringify({
              callId,
              durationMinutes,
              maxParticipants,
            }),
          }
        );

      const result =
        await response.json();

      if (!response.ok) {
        throw new Error(
          result.error ||
            "Unable to update meeting limits."
        );
      }

      /*
       * Stream also emits call.updated, but loading the call
       * once here makes the settings card update immediately
       * even on a slow websocket connection.
       */
      await call.get();

      setSaved(true);

      window.setTimeout(
        () => setSaved(false),
        1800
      );
    } catch (limitError) {
      console.error(
        "Meeting limit update error:",
        limitError
      );

      setError(
        limitError instanceof Error
          ? limitError.message
          : "Unable to update meeting limits."
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className={`rounded-[24px] border border-[#403A35]/10 bg-[#F9F0E0] ${
        compact
          ? "p-3"
          : "p-4"
      }`}
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-[9px] font-black uppercase tracking-[0.18em] text-[#B9687C]">
            Meeting Limits
          </p>

          <h3 className="mt-1 font-black text-[#3D3732]">
            Time & room capacity
          </h3>

          <p className="mt-1 text-[10px] leading-4 text-[#756E64]">
            Stream enforces these limits on the server. The timer starts when the first participant joins.
          </p>
        </div>

        <div className="rounded-full bg-white px-3 py-1.5 text-[9px] font-black text-[#756E64]">
          👥 {participantCount}/{savedParticipants}
        </div>
      </div>

      <div className="mt-3">
        <MeetingLimitFields
          durationMinutes={durationMinutes}
          maxParticipants={maxParticipants}
          onDurationChange={setDurationMinutes}
          onParticipantsChange={setMaxParticipants}
          disabled={saving}
          compact
        />
      </div>

      {error && (
        <div className="mt-3 rounded-xl bg-[#CC3A63]/10 p-3 text-[10px] font-bold leading-4 text-[#CC3A63]">
          {error}
        </div>
      )}

      <div className="mt-3 flex items-center justify-between gap-3">
        <p className="text-[9px] font-semibold text-[#756E64]">
          {saved
            ? "✓ Limits saved"
            : changed
              ? "Unsaved changes"
              : "Current meeting limits"}
        </p>

        <button
          type="button"
          disabled={
            saving ||
            !changed
          }
          onClick={() =>
            void saveLimits()
          }
          className="rounded-xl bg-[#403A35] px-4 py-2 text-[10px] font-black text-white transition hover:bg-[#CC3A63] disabled:cursor-not-allowed disabled:opacity-35"
        >
          {saving
            ? "Saving..."
            : "Save limits"}
        </button>
      </div>
    </div>
  );
};

export default MeetingLimitsSettings;
