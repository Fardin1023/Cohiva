"use client";

import {
  useCallStateHooks,
} from "@stream-io/video-react-sdk";

import type {
  AccessibilitySettings,
} from "./meetingAccessibilityTypes";

const MeetingCaptionsOverlay = ({
  visible,
  size,
}: {
  visible: boolean;

  size:
    AccessibilitySettings["captionSize"];
}) => {
  const {
    useCallClosedCaptions,
    useIsCallCaptioningInProgress,
  } =
    useCallStateHooks();

  const captions =
    useCallClosedCaptions();

  const captionsRunning =
    useIsCallCaptioningInProgress();

  if (
    !visible ||
    !captionsRunning ||
    captions.length === 0
  ) {
    return null;
  }

  const textSize =
    size === "small"
      ? "text-xs"
      : size === "large"
        ? "text-xl"
        : "text-base";

  return (
    <div
      aria-live="polite"
      aria-atomic="false"
      className="pointer-events-none absolute inset-x-2 bottom-3 z-[120] flex flex-col items-center gap-2 sm:inset-x-4 sm:bottom-5"
    >
      {captions.map(
        (caption) => {
          const speaker =
            caption.user?.name ||
            "Participant";

          return (
            <div
              key={`${caption.user?.id ?? "unknown"}-${caption.start_time}`}
              className={`max-w-[850px] rounded-[14px] bg-black/85 px-3 py-2 text-center font-semibold leading-relaxed text-white shadow-2xl backdrop-blur sm:px-4 sm:py-2.5 ${textSize}`}
            >
              <span className="mr-2 font-black text-[#D9E2AE]">
                {speaker}:
              </span>

              <span>
                {caption.text}
              </span>
            </div>
          );
        }
      )}
    </div>
  );
};

export default MeetingCaptionsOverlay;
