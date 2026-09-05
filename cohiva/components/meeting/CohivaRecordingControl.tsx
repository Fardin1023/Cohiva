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

type ConfirmAction =
  | "start"
  | "stop"
  | null;

type RecordingToast = {
  title: string;
  message: string;
  type:
    | "success"
    | "error"
    | "info";
};

/* =========================================================
   RECORDING CONTROL
   TEACHER ONLY
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
      confirmAction,
      setConfirmAction,
    ] =
      useState<ConfirmAction>(
        null
      );

    const [
      error,
      setError,
    ] =
      useState("");

    /* =====================================================
       STREAM STATE IS AUTHORITATIVE
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
       ONLY TEACHER GETS RECORD BUTTON
    ===================================================== */

    if (
      !teacher
    ) {
      return null;
    }

    /* =====================================================
       OPEN CONFIRMATION
    ===================================================== */

    const requestRecordingChange =
      () => {
        setError("");

        if (
          recording
        ) {
          setConfirmAction(
            "stop"
          );

          return;
        }

        setConfirmAction(
          "start"
        );
      };

    /* =====================================================
       CONFIRM START / STOP
    ===================================================== */

    const confirmRecordingChange =
      async () => {
        if (
          !call ||
          !confirmAction ||
          pending
        ) {
          return;
        }

        const action =
          confirmAction;

        setConfirmAction(
          null
        );

        try {
          setError("");

          /* =============================================
             STOP RECORDING
          ============================================= */

          if (
            action ===
            "stop"
          ) {
            if (
              !canStopRecording
            ) {
              throw new Error(
                "You do not have permission to stop this recording."
              );
            }

            setPending(
              "stopping"
            );

            await call.stopRecording();

            return;
          }

          /* =============================================
             START RECORDING
          ============================================= */

          if (
            !canStartRecording
          ) {
            throw new Error(
              "You do not have permission to start recording."
            );
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
      <>
        {/* =================================================
            RECORD BUTTON
        ================================================= */}

        <div className="relative">

          <button
            type="button"
            onClick={
              requestRecordingChange
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
            className={`flex min-w-[72px] items-center justify-center gap-2 rounded-xl px-3 py-2 text-[10px] font-black transition-all duration-200 disabled:cursor-wait disabled:opacity-60 ${
              recording
                ? "bg-[#CC3A63] text-white shadow-[0_5px_18px_rgba(204,58,99,0.28)]"
                : "bg-white/10 text-white hover:bg-white/15"
            }`}
          >

            <span
              className={`h-2.5 w-2.5 rounded-full ${
                recording
                  ? "animate-pulse bg-white"
                  : "border-2 border-white"
              }`}
            />

            {pending ===
            "starting"
              ? "Starting"
              : pending ===
                  "stopping"
                ? "Stopping"
                : recording
                  ? "Stop"
                  : "Record"}

          </button>

          {/* ERROR */}

          {error && (
            <div className="absolute right-0 top-[48px] z-[350] w-[300px] overflow-hidden rounded-[20px] border border-[#CC3A63]/15 bg-[#FFF7EB] text-[#3D3732] shadow-[0_20px_60px_rgba(0,0,0,0.32)]">

              <div className="flex gap-3 p-4">

                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#CC3A63]/10 text-lg">
                  !
                </div>

                <div className="min-w-0 flex-1">

                  <p className="text-xs font-black text-[#CC3A63]">
                    Recording problem
                  </p>

                  <p className="mt-1 text-[10px] leading-4 text-[#756E64]">
                    {error}
                  </p>

                </div>

                <button
                  type="button"
                  onClick={() =>
                    setError("")
                  }
                  className="h-7 w-7 shrink-0 rounded-lg text-sm font-black text-[#756E64] hover:bg-[#F9F0E0]"
                >
                  ×
                </button>

              </div>

            </div>
          )}

        </div>

        {/* =================================================
            CUSTOM CONFIRMATION MODAL
        ================================================= */}

        {confirmAction && (
          <div className="fixed inset-0 z-[500] flex items-center justify-center bg-black/55 p-4 backdrop-blur-[3px]">

            <div className="w-full max-w-[420px] overflow-hidden rounded-[28px] border border-white/10 bg-[#FFF7EB] text-[#3D3732] shadow-[0_35px_100px_rgba(0,0,0,0.45)]">

              {/* TOP */}

              <div className="relative p-6 pb-4">

                <button
                  type="button"
                  onClick={() =>
                    setConfirmAction(
                      null
                    )
                  }
                  className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-xl bg-[#F9F0E0] text-lg font-black text-[#756E64] transition hover:bg-[#EFE4D2]"
                >
                  ×
                </button>

                <div
                  className={`flex h-14 w-14 items-center justify-center rounded-2xl text-2xl ${
                    confirmAction ===
                    "start"
                      ? "bg-[#CC3A63]/10"
                      : "bg-[#403A35]/10"
                  }`}
                >
                  {confirmAction ===
                  "start"
                    ? "●"
                    : "■"}
                </div>

                <p className="mt-5 text-[9px] font-black uppercase tracking-[0.18em] text-[#CC3A63]">
                  Cohiva Recording
                </p>

                <h2 className="mt-2 text-[22px] font-black">
                  {confirmAction ===
                  "start"
                    ? "Start recording?"
                    : "Stop recording?"}
                </h2>

                <p className="mt-2 text-sm leading-6 text-[#756E64]">
                  {confirmAction ===
                  "start"
                    ? "Everyone in the classroom will be notified that this meeting is being recorded."
                    : "The recording will stop and Stream will begin processing the recorded video."}
                </p>

              </div>

              {/* INFO */}

              {confirmAction ===
                "start" && (
                <div className="mx-6 rounded-[16px] bg-[#CC3A63]/8 p-4">

                  <div className="flex gap-3">

                    <span className="mt-0.5 text-base">
                      🔴
                    </span>

                    <div>

                      <p className="text-xs font-black">
                        Recording notification
                      </p>

                      <p className="mt-1 text-[10px] leading-4 text-[#756E64]">
                        Participants will see:
                        <span className="font-black text-[#3D3732]">
                          {" "}
                          “The meeting is being recorded.”
                        </span>
                      </p>

                    </div>

                  </div>

                </div>
              )}

              {/* BUTTONS */}

              <div className="mt-5 flex gap-3 border-t border-[#403A35]/10 bg-white p-5">

                <button
                  type="button"
                  onClick={() =>
                    setConfirmAction(
                      null
                    )
                  }
                  className="flex-1 rounded-2xl bg-[#F9F0E0] px-4 py-3 text-sm font-black text-[#756E64] transition hover:bg-[#EFE4D2]"
                >
                  Cancel
                </button>

                <button
                  type="button"
                  onClick={() =>
                    void confirmRecordingChange()
                  }
                  className={`flex-1 rounded-2xl px-4 py-3 text-sm font-black text-white transition ${
                    confirmAction ===
                    "start"
                      ? "bg-[#CC3A63] hover:bg-[#B93459]"
                      : "bg-[#403A35] hover:bg-[#302B27]"
                  }`}
                >
                  {confirmAction ===
                  "start"
                    ? "Start Recording"
                    : "Stop Recording"}
                </button>

              </div>

            </div>

          </div>
        )}

      </>
    );
  };

/* =========================================================
   RECORDING INDICATOR + START NOTIFICATION

   SHOWN TO EVERYONE
========================================================= */

export const CohivaRecordingIndicator =
  () => {
    const {
      useIsCallRecordingInProgress,
    } =
      useCallStateHooks();

    const recording =
      useIsCallRecordingInProgress();

    const [
      notificationVisible,
      setNotificationVisible,
    ] =
      useState(false);

    const previousRecordingRef =
      useRef(false);

    const notificationTimerRef =
      useRef<
        ReturnType<
          typeof setTimeout
        > | null
      >(null);

    /* =====================================================
       SHOW POPUP WHEN RECORDING STARTS
    ===================================================== */

    useEffect(() => {
      const wasRecording =
        previousRecordingRef.current;

      /*
       * This covers:
       *
       * 1. recording changes false -> true
       * 2. participant joins while recording is already on
       */

      if (
        recording &&
        !wasRecording
      ) {
        setNotificationVisible(
          true
        );

        if (
          notificationTimerRef.current
        ) {
          clearTimeout(
            notificationTimerRef.current
          );
        }

        notificationTimerRef.current =
          setTimeout(
            () => {
              setNotificationVisible(
                false
              );

              notificationTimerRef.current =
                null;
            },
            6000
          );
      }

      previousRecordingRef.current =
        recording;
    }, [
      recording,
    ]);

    useEffect(() => {
      return () => {
        if (
          notificationTimerRef.current
        ) {
          clearTimeout(
            notificationTimerRef.current
          );
        }
      };
    }, []);

    return (
      <>
        {/* =================================================
            START RECORDING POPUP

            Everyone sees this for 6 seconds.
        ================================================= */}

        {notificationVisible &&
          recording && (
            <div
              role="alert"
              aria-live="assertive"
              className="fixed left-1/2 top-[82px] z-[450] w-[420px] max-w-[calc(100vw-32px)] -translate-x-1/2"
            >

              <div className="overflow-hidden rounded-[22px] border border-[#CC3A63]/20 bg-[#FFF7EB] text-[#3D3732] shadow-[0_24px_70px_rgba(0,0,0,0.38)]">

                {/* ACCENT */}

                <div className="h-1 w-full bg-[#CC3A63]" />

                <div className="flex items-start gap-4 p-4">

                  {/* ICON */}

                  <div className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#CC3A63]/10">

                    <span className="h-4 w-4 animate-pulse rounded-full bg-[#CC3A63]" />

                    <span className="absolute h-7 w-7 animate-ping rounded-full border border-[#CC3A63]/30" />

                  </div>

                  {/* TEXT */}

                  <div className="min-w-0 flex-1">

                    <p className="text-[9px] font-black uppercase tracking-[0.16em] text-[#CC3A63]">
                      Recording Started
                    </p>

                    <h3 className="mt-1 text-base font-black">
                      The meeting is being recorded
                    </h3>

                    <p className="mt-1 text-[10px] leading-4 text-[#756E64]">
                      Audio, video, and shared meeting content may be included in the recording.
                    </p>

                  </div>

                  {/* CLOSE */}

                  <button
                    type="button"
                    onClick={() =>
                      setNotificationVisible(
                        false
                      )
                    }
                    aria-label="Dismiss recording notification"
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-sm font-black text-[#756E64] transition hover:bg-[#F9F0E0]"
                  >
                    ×
                  </button>

                </div>

              </div>

            </div>
          )}

        {/* =================================================
            PERMANENT RECORDING BADGE

            Remains visible as long as recording continues.
        ================================================= */}

        {recording && (
          <div
            role="status"
            aria-live="polite"
            className="pointer-events-none fixed left-1/2 top-[72px] z-[270] -translate-x-1/2"
          >

            <div className="flex items-center gap-2 rounded-full border border-white/10 bg-[#CC3A63] px-4 py-2 text-[9px] font-black uppercase tracking-[0.14em] text-white shadow-[0_12px_35px_rgba(0,0,0,0.3)]">

              <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-white" />

              Recording

            </div>

          </div>
        )}

      </>
    );
  };

/* =========================================================
   RECORDING PROCESSING EVENTS

   TEACHER ONLY
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

    /* =====================================================
       SHOW TOAST
    ===================================================== */

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
            6000
          );
      };

    /* =====================================================
       STREAM RECORDING EVENTS
    ===================================================== */

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

              title:
                "Recording ready",

              message:
                "Your classroom recording has finished processing and is ready in Recordings.",
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

              title:
                "Recording failed",

              message:
                "Cohiva could not finish processing this recording.",
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

    /* =====================================================
       CLEANUP
    ===================================================== */

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

    /* =====================================================
       TOAST DESIGN
    ===================================================== */

    return (
      <div className="fixed bottom-[96px] right-5 z-[480] w-[360px] max-w-[calc(100vw-32px)]">

        <div className="overflow-hidden rounded-[22px] border border-[#403A35]/10 bg-[#FFF7EB] text-[#3D3732] shadow-[0_24px_70px_rgba(0,0,0,0.38)]">

          <div
            className={`h-1 w-full ${
              toast.type ===
              "error"
                ? "bg-[#CC3A63]"
                : "bg-[#A2AB73]"
            }`}
          />

          <div className="flex items-start gap-3 p-4">

            {/* ICON */}

            <div
              className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-lg font-black ${
                toast.type ===
                "error"
                  ? "bg-[#CC3A63]/10 text-[#CC3A63]"
                  : "bg-[#A2AB73]/15 text-[#737C4C]"
              }`}
            >
              {toast.type ===
              "error"
                ? "!"
                : "✓"}
            </div>

            {/* TEXT */}

            <div className="min-w-0 flex-1">

              <p
                className={`text-[9px] font-black uppercase tracking-[0.16em] ${
                  toast.type ===
                  "error"
                    ? "text-[#CC3A63]"
                    : "text-[#737C4C]"
                }`}
              >
                Cohiva Recording
              </p>

              <h3 className="mt-1 text-sm font-black">
                {toast.title}
              </h3>

              <p className="mt-1 text-[10px] leading-4 text-[#756E64]">
                {toast.message}
              </p>

            </div>

            {/* CLOSE */}

            <button
              type="button"
              onClick={() =>
                setToast(
                  null
                )
              }
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-sm font-black text-[#756E64] transition hover:bg-[#F9F0E0]"
            >
              ×
            </button>

          </div>

        </div>

      </div>
    );
  };