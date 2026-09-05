"use client";

import {
  useEffect,
  useRef,
} from "react";

type SmartPollingOptions = {
  enabled?: boolean;
  intervalMs: number;
  immediate?: boolean;
  refreshOnFocus?: boolean;
  pauseWhenHidden?: boolean;
};

/* =========================================================
   VISIBILITY-AWARE POLLING

   - prevents overlapping requests
   - pauses background-tab traffic
   - refreshes immediately when the user returns
========================================================= */

export const useSmartPolling = (
  task: () => void | Promise<void>,
  {
    enabled = true,
    intervalMs,
    immediate = true,
    refreshOnFocus = true,
    pauseWhenHidden = true,
  }: SmartPollingOptions
) => {
  const taskRef =
    useRef(task);

  const runningRef =
    useRef(false);

  useEffect(() => {
    taskRef.current =
      task;
  }, [task]);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    let cancelled =
      false;

    let lastRunAt =
      0;

    const run =
      async () => {
        if (
          cancelled ||
          runningRef.current ||
          (
            pauseWhenHidden &&
            document.visibilityState ===
              "hidden"
          )
        ) {
          return;
        }

        runningRef.current =
          true;

        lastRunAt =
          Date.now();

        try {
          await taskRef.current();
        } finally {
          runningRef.current =
            false;
        }
      };

    if (immediate) {
      void run();
    }

    const timer =
      window.setInterval(
        () => {
          void run();
        },
        intervalMs
      );

    const refreshIfNeeded =
      () => {
        if (
          Date.now() -
            lastRunAt <
          Math.min(
            intervalMs / 2,
            5_000
          )
        ) {
          return;
        }

        void run();
      };

    const handleVisibility =
      () => {
        if (
          document.visibilityState ===
          "visible"
        ) {
          refreshIfNeeded();
        }
      };

    if (pauseWhenHidden) {
      document.addEventListener(
        "visibilitychange",
        handleVisibility
      );
    }

    if (refreshOnFocus) {
      window.addEventListener(
        "focus",
        refreshIfNeeded
      );
    }

    return () => {
      cancelled = true;

      window.clearInterval(
        timer
      );

      if (pauseWhenHidden) {
        document.removeEventListener(
          "visibilitychange",
          handleVisibility
        );
      }

      if (refreshOnFocus) {
        window.removeEventListener(
          "focus",
          refreshIfNeeded
        );
      }
    };
  }, [
    enabled,
    immediate,
    intervalMs,
    pauseWhenHidden,
    refreshOnFocus,
  ]);
};
