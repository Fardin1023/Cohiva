"use client";

import {
  OwnCapability,
  useCall,
  useCallStateHooks,
} from "@stream-io/video-react-sdk";

import {
  useEffect,
  useRef,
  useState,
} from "react";

/* =========================================================
   TYPES
========================================================= */

type RecordingToast = {
  message: string;

  type:
    | "success"
    | "info"
    | "error";
};

/* =========================================================
   RECORDING CONTROL
========================================================= */

export const CohivaRecordingControl =
  () => {
    const call =
      useCall();

    const {
      useIsCallRecordingInProgress,
      useHasPermissions,
    } =
      useCallStateHooks();

    const recording =
      useIsCallRecordingInProgress();

    const canStartRecording =
      useHasPermissions(
        OwnCapability.START_RECORD_CALL
      );

    const canStopRecording =
      useHasPermissions(
        OwnCapability.STOP_RECORD_CALL
      );

    const teacher =
      Boolean(
        call?.isCreatedByMe
      );

    const [
      pending,
      setPending,
    ] =
      useState<
        "starting" |
        "stopping" |
        null
      >(null);

    const [
      error,
      setError,
    ] =
      useState("");

    /* =====================================================
       REACTIVE STATE IS AUTHORITATIVE

       When Stream confirms recording started/stopped,
       clear our temporary pending state.
    ===================================================== */

    useEffect(() => {
      if (
        recording &&
        pending ===
          "starting"
      ) {
        setPending(
          null
        );
      }

      if (
        !recording &&
        pending ===
          "stopping"
      ) {
        setPending(
          null
        );
      }
    }, [
      recording,
      pending,
    ]);

    /* =====================================================
       TEACHER ONLY
    ===================================================== */

    if (
      !teacher
    ) {
      return null;
    }

    /* =====================================================
       START / STOP
    ===================================================== */

    const toggleRecording =
      async () => {
        if (
          !call ||
          pending
        ) {
          return;
        }

        try {
          setError("");

          if (
            recording
          ) {
            if (
              !canStopRecording
            ) {
              throw new Error(
                "Your Stream role does not have permission to stop recordings."
              );
            }

            const confirmed =
              window.confirm(
                "Stop recording this class?"
              );

            if (
              !confirmed
            ) {
              return;
            }

            setPending(
              "stopping"
            );

            await call.stopRecording();

            return;
          }

          if (
            !canStartRecording
          ) {
            throw new Error(
              "Your Stream role does not have permission to start recordings."
            );
          }

          const confirmed =
            window.confirm(
              "Start recording this class?\n\nEveryone in the meeting will see a recording indicator."
            );

          if (
            !confirmed
          ) {
            return;
          }

          setPending(
            "starting"
          );

          await call.startRecording();
        } catch (
          recordingError
        ) {
          console.error(
            "Recording error:",
            recordingError
          );

          setPending(
            null
          );

          setError(
            recordingError instanceof
              Error
              ? recordingError.message
              : "Unable to change recording state."
          );
        }
      };

    return (
      <div className="relative">

        <button
          type="button"
          onClick={() =>
            void toggleRecording()
          }
          disabled={
            Boolean(
              pending
            )
          }
          aria-label={
            recording
              ? "Stop recording"
              : "Start recording"
          }
          className={`flex min-w-[62px] items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-[10px] font-black transition disabled:cursor-wait disabled:opacity-60 ${
            recording
              ? "bg-[#CC3A63] text-white"
              : "bg-white/10 text-white"
          }`}
        >

          {/* RECORD DOT */}

          <span
            className={`h-2.5 w-2.5 rounded-full ${
              recording
                ? "animate-pulse bg-white"
                : "border-2 border-white"
            }`}
          />

          {pending ===
          "starting"
            ? "Starting..."
            : pending ===
                "stopping"
              ? "Stopping..."
              : recording
                ? "Stop"
                : "Record"}

        </button>

        {error && (
          <div
            role="alert"
            className="absolute right-0 top-[46px] z-[320] w-[280px] rounded-xl border border-[#CC3A63]/20 bg-[#FFF7EB] p-3 text-[10px] font-bold leading-4 text-[#CC3A63] shadow-2xl"
          >
            {error}

            <button
              type="button"
              onClick={() =>
                setError("")
              }
              className="mt-2 block text-[9px] font-black underline"
            >
              Dismiss
            </button>
          </div>
        )}

      </div>
    );
  };

/* =========================================================
   GLOBAL RECORDING INDICATOR

   Shown to EVERYONE while recording.
========================================================= */

export const CohivaRecordingIndicator =
  () => {
    const {
      useIsCallRecordingInProgress,
    } =
      useCallStateHooks();

    const recording =
      useIsCallRecordingInProgress();

    if (
      !recording
    ) {
      return null;
    }

    return (
      <div
        role="status"
        aria-live="polite"
        className="pointer-events-none fixed left-1/2 top-[74px] z-[270] -translate-x-1/2"
      >

        <div className="flex items-center gap-2 rounded-full bg-[#CC3A63] px-4 py-2 text-[10px] font-black uppercase tracking-[0.12em] text-white shadow-[0_12px_35px_rgba(0,0,0,0.3)]">

          <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-white" />

          Recording

        </div>

      </div>
    );
  };

/* =========================================================
   RECORDING READY NOTIFICATION

   Stream may need some processing time after stop.
========================================================= */

export const CohivaRecordingEvents =
  () => {
    const call =
      useCall();

    const teacher =
      Boolean(
        call?.isCreatedByMe
      );

    const [
      toast,
      setToast,
    ] =
      useState<
        RecordingToast | null
      >(null);

    const timerRef =
      useRef<
        ReturnType<
          typeof setTimeout
        > | null
      >(null);

    const showToast =
      (
        next:
          RecordingToast
      ) => {
        if (
          timerRef.current
        ) {
          clearTimeout(
            timerRef.current
          );
        }

        setToast(
          next
        );

        timerRef.current =
          setTimeout(
            () => {
              setToast(
                null
              );

              timerRef.current =
                null;
            },
            5000
          );
      };

    useEffect(() => {
      if (
        !call
      ) {
        return;
      }

      const unsubscribeReady =
        call.on(
          "call.recording_ready",
          () => {
            if (
              !teacher
            ) {
              return;
            }

            showToast({
              type:
                "success",

              message:
                "Recording is ready and will appear on the Recordings page.",
            });
          }
        );

      const unsubscribeFailed =
        call.on(
          "call.recording_failed",
          () => {
            if (
              !teacher
            ) {
              return;
            }

            showToast({
              type:
                "error",

              message:
                "Stream could not complete this recording.",
            });
          }
        );

      return () => {
        unsubscribeReady();
        unsubscribeFailed();
      };
    }, [
      call,
      teacher,
    ]);

    useEffect(() => {
      return () => {
        if (
          timerRef.current
        ) {
          clearTimeout(
            timerRef.current
          );
        }
      };
    }, []);

    if (
      !toast
    ) {
      return null;
    }

    return (
      <div className="fixed bottom-[92px] right-4 z-[330] w-[330px] max-w-[calc(100vw-32px)] rounded-[18px] border border-[#403A35]/10 bg-[#FFF7EB] p-4 text-[#3D3732] shadow-2xl">

        <div className="flex gap-3">

          <div
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
              toast.type ===
              "error"
                ? "bg-[#CC3A63]/10"
                : "bg-[#A2AB73]/15"
            }`}
          >
            {toast.type ===
            "error"
              ? "!"
              : "✓"}
          </div>

          <div>

            <p className="text-xs font-black">
              {toast.type ===
              "error"
                ? "Recording problem"
                : "Recording ready"}
            </p>

            <p className="mt-1 text-[10px] leading-4 text-[#756E64]">
              {toast.message}
            </p>

          </div>

        </div>

      </div>
    );
  };