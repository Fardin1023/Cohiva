"use client";

import {
  useCall,
  useCallStateHooks,
} from "@stream-io/video-react-sdk";

import {
  useEffect,
  useState,
} from "react";

/* =========================================================
   TYPES
========================================================= */

export type MeetingAccessMode =
  | "open"
  | "approval"
  | "locked";

type MeetingAccessSettingsProps = {
  callId: string;
};

const ACCESS_KEY =
  "cohiva_access_mode";

/* =========================================================
   NORMALIZE
========================================================= */

const normalizeMode =
  (
    value:
      unknown
  ): MeetingAccessMode => {
    if (
      value ===
        "open" ||
      value ===
        "approval" ||
      value ===
        "locked"
    ) {
      return value;
    }

    return "approval";
  };

/* =========================================================
   COMPONENT
========================================================= */

const MeetingAccessSettings = ({
  callId,
}: MeetingAccessSettingsProps) => {
  const call =
    useCall();

  const {
    useCallCustomData,
  } =
    useCallStateHooks();

  const custom =
    useCallCustomData();

  /* =====================================================
     STREAM MODE

     No API request required.
  ===================================================== */

  const streamMode =
    normalizeMode(
      custom?.[
        ACCESS_KEY
      ]
    );

  /* =====================================================
     OPTIMISTIC LOCAL MODE
  ===================================================== */

  const [
    selectedMode,
    setSelectedMode,
  ] =
    useState<MeetingAccessMode>(
      streamMode
    );

  const [
    saving,
    setSaving,
  ] =
    useState(false);

  const [
    saved,
    setSaved,
  ] =
    useState(false);

  const [
    error,
    setError,
  ] =
    useState("");

  /* =====================================================
     KEEP UI SYNCED WITH STREAM
  ===================================================== */

  useEffect(() => {
    if (
      saving
    ) {
      return;
    }

    setSelectedMode(
      streamMode
    );
  }, [
    streamMode,
    saving,
  ]);

  /* =====================================================
     CHANGE MODE
  ===================================================== */

  const changeMode =
    async (
      nextMode:
        MeetingAccessMode
    ) => {
      if (
        !call ||
        saving ||
        nextMode ===
          selectedMode
      ) {
        return;
      }

      const previousMode =
        selectedMode;

      /*
       * Change immediately so the
       * interface feels responsive.
       */
      setSelectedMode(
        nextMode
      );

      setSaving(
        true
      );

      setSaved(
        false
      );

      setError(
        ""
      );

      try {
        const response =
          await fetch(
            "/api/meetings/access",
            {
              method:
                "PUT",

              headers: {
                "Content-Type":
                  "application/json",
              },

              body:
                JSON.stringify({
                  callId,

                  mode:
                    nextMode,
                }),
            }
          );

        const result =
          await response.json();

        if (
          !response.ok
        ) {
          throw new Error(
            result.error ||
              "Unable to change meeting access."
          );
        }

        setSelectedMode(
          normalizeMode(
            result.mode
          )
        );

        setSaved(
          true
        );

        window.setTimeout(
          () => {
            setSaved(
              false
            );
          },
          1500
        );
      } catch (
        updateError
      ) {
        console.error(
          "Meeting access update error:",
          updateError
        );

        /*
         * Roll back only on actual
         * server failure.
         */
        setSelectedMode(
          previousMode
        );

        setError(
          updateError instanceof
            Error
            ? updateError.message
            : "Unable to change meeting access."
        );
      } finally {
        setSaving(
          false
        );
      }
    };

  /* =====================================================
     UI
  ===================================================== */

  return (
    <section className="rounded-[22px] border border-[#403A35]/10 bg-white p-4">

      {/* =================================================
          HEADER
      ================================================= */}

      <div className="flex items-start justify-between gap-4">

        <div>

          <p className="text-[9px] font-black uppercase tracking-[0.18em] text-[#CC3A63]">
            Meeting Access
          </p>

          <h3 className="mt-1 font-black text-[#3D3732]">
            Who can enter?
          </h3>

          <p className="mt-1 text-[11px] leading-5 text-[#756E64]">
            Choose how people with the meeting link enter your classroom.
          </p>

        </div>

        {/* STATUS */}

        <div className="shrink-0">

          {saving && (
            <span className="rounded-full bg-[#F9F0E0] px-3 py-1.5 text-[9px] font-black text-[#756E64]">
              Saving...
            </span>
          )}

          {!saving &&
            saved && (
              <span className="rounded-full bg-[#A2AB73]/15 px-3 py-1.5 text-[9px] font-black text-[#737C4C]">
                ✓ Saved
              </span>
            )}

        </div>

      </div>

      {/* =================================================
          OPTIONS
      ================================================= */}

      <div className="mt-4 grid gap-2">

        {/* =================================================
            OPEN
        ================================================= */}

        <button
          type="button"
          disabled={
            saving
          }
          onClick={() =>
            void changeMode(
              "open"
            )
          }
          aria-pressed={
            selectedMode ===
            "open"
          }
          className={`flex items-center gap-3 rounded-2xl border p-3 text-left transition ${
            selectedMode ===
            "open"
              ? "border-[#A2AB73] bg-[#A2AB73]/10 shadow-sm"
              : "border-[#403A35]/10 bg-[#FFF7EB] hover:border-[#A2AB73]/50 hover:bg-[#A2AB73]/5"
          } disabled:cursor-wait disabled:opacity-70`}
        >

          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white text-xl shadow-sm">
            🌐
          </div>

          <div className="min-w-0 flex-1">

            <p className="text-sm font-black text-[#3D3732]">
              Open
            </p>

            <p className="mt-0.5 text-[10px] leading-4 text-[#756E64]">
              Anyone signed in with the meeting link can enter immediately.
            </p>

          </div>

          {selectedMode ===
            "open" && (
            <span className="text-lg font-black text-[#737C4C]">
              ✓
            </span>
          )}

        </button>

        {/* =================================================
            ASK TO JOIN
        ================================================= */}

        <button
          type="button"
          disabled={
            saving
          }
          onClick={() =>
            void changeMode(
              "approval"
            )
          }
          aria-pressed={
            selectedMode ===
            "approval"
          }
          className={`flex items-center gap-3 rounded-2xl border p-3 text-left transition ${
            selectedMode ===
            "approval"
              ? "border-[#A2AB73] bg-[#A2AB73]/10 shadow-sm"
              : "border-[#403A35]/10 bg-[#FFF7EB] hover:border-[#A2AB73]/50 hover:bg-[#A2AB73]/5"
          } disabled:cursor-wait disabled:opacity-70`}
        >

          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white text-xl shadow-sm">
            🚪
          </div>

          <div className="min-w-0 flex-1">

            <p className="text-sm font-black text-[#3D3732]">
              Ask to join
            </p>

            <p className="mt-0.5 text-[10px] leading-4 text-[#756E64]">
              The meeting opener must approve each new participant.
            </p>

          </div>

          {selectedMode ===
            "approval" && (
            <span className="text-lg font-black text-[#737C4C]">
              ✓
            </span>
          )}

        </button>

        {/* =================================================
            LOCKED
        ================================================= */}

        <button
          type="button"
          disabled={
            saving
          }
          onClick={() =>
            void changeMode(
              "locked"
            )
          }
          aria-pressed={
            selectedMode ===
            "locked"
          }
          className={`flex items-center gap-3 rounded-2xl border p-3 text-left transition ${
            selectedMode ===
            "locked"
              ? "border-[#CC3A63] bg-[#CC3A63]/10 shadow-sm"
              : "border-[#403A35]/10 bg-[#FFF7EB] hover:border-[#CC3A63]/40 hover:bg-[#CC3A63]/5"
          } disabled:cursor-wait disabled:opacity-70`}
        >

          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white text-xl shadow-sm">
            🔒
          </div>

          <div className="min-w-0 flex-1">

            <p className="text-sm font-black text-[#3D3732]">
              Locked
            </p>

            <p className="mt-0.5 text-[10px] leading-4 text-[#756E64]">
              Nobody new can enter until you change this setting.
            </p>

          </div>

          {selectedMode ===
            "locked" && (
            <span className="text-lg font-black text-[#CC3A63]">
              ✓
            </span>
          )}

        </button>

      </div>

      {/* =================================================
          ERROR
      ================================================= */}

      {error && (
        <div className="mt-3 rounded-xl bg-[#CC3A63]/10 px-3 py-2.5">

          <p className="text-xs font-bold text-[#CC3A63]">
            {error}
          </p>

        </div>
      )}

    </section>
  );
};

export default MeetingAccessSettings;