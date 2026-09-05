"use client";

import {
  useCallStateHooks,
} from "@stream-io/video-react-sdk";

import {
  useEffect,
  useRef,
  useState,
} from "react";

const formatRemaining = (
  totalSeconds: number
) => {
  const safe = Math.max(
    0,
    totalSeconds
  );

  const minutes =
    Math.floor(
      safe / 60
    );

  const seconds =
    safe % 60;

  return `${minutes}:${seconds
    .toString()
    .padStart(2, "0")}`;
};

const MeetingSessionTimer = () => {
  const {
    useCallSession,
  } = useCallStateHooks();

  const session =
    useCallSession();

  const timerEndsAt =
    session?.timer_ends_at;

  const [
    remainingSeconds,
    setRemainingSeconds,
  ] = useState<number | null>(
    null
  );

  const [notice, setNotice] =
    useState("");

  const previousRef =
    useRef<number | null>(
      null
    );

  const firedRef =
    useRef<Set<number>>(
      new Set()
    );

  useEffect(() => {
    if (!timerEndsAt) {
      setRemainingSeconds(
        null
      );

      previousRef.current =
        null;

      firedRef.current.clear();

      return;
    }

    const endTime =
      new Date(
        timerEndsAt
      ).getTime();

    const update = () => {
      const next =
        Math.max(
          0,
          Math.ceil(
            (endTime -
              Date.now()) /
              1000
          )
        );

      const previous =
        previousRef.current;

      setRemainingSeconds(
        next
      );

      const thresholds = [
        600,
        300,
        60,
      ];

      for (
        const threshold of
        thresholds
      ) {
        if (
          previous !== null &&
          previous > threshold &&
          next <= threshold &&
          !firedRef.current.has(
            threshold
          )
        ) {
          firedRef.current.add(
            threshold
          );

          setNotice(
            threshold === 60
              ? "Class ends in 1 minute"
              : `Class ends in ${Math.round(
                  threshold / 60
                )} minutes`
          );

          window.setTimeout(
            () =>
              setNotice(""),
            5000
          );
        }
      }

      previousRef.current =
        next;
    };

    update();

    const timer =
      window.setInterval(
        update,
        1000
      );

    return () =>
      window.clearInterval(
        timer
      );
  }, [
    timerEndsAt,
  ]);

  if (
    remainingSeconds === null
  ) {
    return null;
  }

  const urgent =
    remainingSeconds <= 60;

  const warning =
    remainingSeconds <= 300;

  return (
    <>
      <div
        className={`rounded-lg px-3 py-2 text-xs font-black tabular-nums ${
          urgent
            ? "bg-[#CC3A63] text-white"
            : warning
              ? "bg-[#FACC15] text-[#403A35]"
              : "bg-white/10 text-white"
        }`}
        title="Meeting time remaining"
        aria-label={`${formatRemaining(
          remainingSeconds
        )} remaining in this meeting`}
      >
        ⏱ {formatRemaining(
          remainingSeconds
        )}
      </div>

      {notice && (
        <div
          role="status"
          aria-live="polite"
          className="fixed left-1/2 top-[78px] z-[420] w-[330px] max-w-[calc(100vw-28px)] -translate-x-1/2 rounded-[20px] border border-[#403A35]/10 bg-[#FFF7EB] p-4 text-center text-sm font-black text-[#3D3732] shadow-[0_20px_70px_rgba(0,0,0,0.32)]"
        >
          ⏱ {notice}
        </div>
      )}
    </>
  );
};

export default MeetingSessionTimer;
