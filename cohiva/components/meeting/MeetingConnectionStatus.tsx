"use client";

import {
  CallingState,
  useCall,
  useCallStateHooks,
} from "@stream-io/video-react-sdk";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

/* =========================================================
   CONNECTION STATUS

   Stream owns the actual WebRTC reconnect loop. Cohiva only
   reflects that lifecycle in the UI and offers a manual
   rejoin after Stream reports RECONNECTING_FAILED.
========================================================= */

const MeetingConnectionStatus = () => {
  const call =
    useCall();

  const {
    useCallCallingState,
  } =
    useCallStateHooks();

  const callingState =
    useCallCallingState();

  const [
    browserOnline,
    setBrowserOnline,
  ] =
    useState(true);

  const [
    retrying,
    setRetrying,
  ] =
    useState(false);

  const [
    retryError,
    setRetryError,
  ] =
    useState("");

  const [
    showRestored,
    setShowRestored,
  ] =
    useState(false);

  const hadConnectionProblemRef =
    useRef(false);

  useEffect(() => {
    const syncOnlineState =
      () => {
        setBrowserOnline(
          navigator.onLine
        );
      };

    syncOnlineState();

    window.addEventListener(
      "online",
      syncOnlineState
    );

    window.addEventListener(
      "offline",
      syncOnlineState
    );

    return () => {
      window.removeEventListener(
        "online",
        syncOnlineState
      );

      window.removeEventListener(
        "offline",
        syncOnlineState
      );
    };
  }, []);

  const connectionUnstable =
    !browserOnline ||
    callingState ===
      CallingState.OFFLINE ||
    callingState ===
      CallingState.RECONNECTING ||
    callingState ===
      CallingState.RECONNECTING_FAILED ||
    callingState ===
      CallingState.MIGRATING;

  useEffect(() => {
    if (
      connectionUnstable
    ) {
      hadConnectionProblemRef.current =
        true;

      setShowRestored(
        false
      );

      return;
    }

    if (
      callingState !==
        CallingState.JOINED ||
      !hadConnectionProblemRef.current
    ) {
      return;
    }

    hadConnectionProblemRef.current =
      false;

    setRetrying(
      false
    );

    setRetryError(
      ""
    );

    setShowRestored(
      true
    );

    const timer =
      window.setTimeout(
        () => {
          setShowRestored(
            false
          );
        },
        2500
      );

    return () => {
      window.clearTimeout(
        timer
      );
    };
  }, [
    callingState,
    connectionUnstable,
  ]);

  const retryConnection =
    useCallback(
      async () => {
        if (
          !call ||
          retrying ||
          !browserOnline
        ) {
          return;
        }

        try {
          setRetrying(
            true
          );

          setRetryError(
            ""
          );

          await call.join();
        } catch (
          error
        ) {
          console.error(
            "Cohiva reconnect error:",
            error
          );

          setRetrying(
            false
          );

          setRetryError(
            error instanceof Error
              ? error.message
              : "Cohiva could not reconnect to this meeting."
          );
        }
      },
      [
        browserOnline,
        call,
        retrying,
      ]
    );

  const offline =
    !browserOnline ||
    callingState ===
      CallingState.OFFLINE;

  const reconnectFailed =
    callingState ===
      CallingState.RECONNECTING_FAILED;

  const reconnecting =
    callingState ===
      CallingState.RECONNECTING ||
    callingState ===
      CallingState.MIGRATING ||
    retrying ||
    (
      hadConnectionProblemRef.current &&
      callingState ===
        CallingState.JOINING
    );

  if (
    !offline &&
    !reconnectFailed &&
    !reconnecting &&
    !showRestored
  ) {
    return null;
  }

  const tone =
    showRestored
      ? "border-emerald-300/40 bg-emerald-950/95 text-emerald-50"
      : reconnectFailed
        ? "border-rose-300/40 bg-rose-950/95 text-rose-50"
        : "border-amber-300/40 bg-[#3A3024]/95 text-amber-50";

  return (
    <div
      className="pointer-events-none fixed inset-x-0 top-3 z-[500] flex justify-center px-3"
      role="status"
      aria-live="polite"
    >
      <div
        className={`pointer-events-auto flex max-w-[min(92vw,720px)] items-center gap-3 rounded-2xl border px-4 py-3 shadow-2xl backdrop-blur ${tone}`}
      >
        <span
          aria-hidden="true"
          className={
            showRestored
              ? "text-lg"
              : "text-lg animate-pulse"
          }
        >
          {showRestored
            ? "✓"
            : offline
              ? "○"
              : reconnectFailed
                ? "!"
                : "↻"}
        </span>

        <div className="min-w-0 flex-1">
          <p className="text-sm font-black">
            {showRestored
              ? "Connection restored"
              : offline
                ? "You are offline"
                : reconnectFailed
                  ? "Connection could not be restored"
                  : callingState ===
                      CallingState.MIGRATING
                    ? "Optimizing your connection"
                    : "Reconnecting to the meeting"}
          </p>

          <p className="mt-0.5 text-xs leading-5 opacity-80">
            {showRestored
              ? "Your Cohiva meeting is live again."
              : offline
                ? "Cohiva will reconnect automatically when your internet connection returns."
                : reconnectFailed
                  ? retryError ||
                    "Check your connection, then try joining the meeting again."
                  : "Keep this tab open. Your audio and video session will resume automatically."}
          </p>
        </div>

        {reconnectFailed && (
          <button
            type="button"
            onClick={() =>
              void retryConnection()
            }
            disabled={
              retrying ||
              !browserOnline
            }
            className="shrink-0 rounded-xl bg-white px-3 py-2 text-xs font-black text-[#403A35] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {retrying
              ? "Retrying…"
              : "Try again"}
          </button>
        )}
      </div>
    </div>
  );
};

export default MeetingConnectionStatus;
