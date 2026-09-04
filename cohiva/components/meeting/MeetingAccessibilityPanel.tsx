"use client";

import {
  OwnCapability,
  useCall,
  useCallStateHooks,
} from "@stream-io/video-react-sdk";

export type CaptionSize =
  | "small"
  | "medium"
  | "large";

export type AccessibilitySettings = {
  captionsVisible: boolean;
  captionSize: CaptionSize;
  highContrast: boolean;
  reduceMotion: boolean;
  hideReactions: boolean;
};

type Props = {
  open: boolean;
  onClose: () => void;

  settings:
    AccessibilitySettings;

  onChange: (
    settings:
      AccessibilitySettings
  ) => void;
};

/* =========================================================
   PANEL
========================================================= */

const MeetingAccessibilityPanel = ({
  open,
  onClose,
  settings,
  onChange,
}: Props) => {
  const call =
    useCall();

  const {
    useIsCallCaptioningInProgress,
    useHasPermissions,
  } =
    useCallStateHooks();

  const captionsRunning =
    useIsCallCaptioningInProgress();

  const canStartCaptions =
    useHasPermissions(
      OwnCapability.START_CLOSED_CAPTIONS_CALL
    );

  const canStopCaptions =
    useHasPermissions(
      OwnCapability.STOP_CLOSED_CAPTIONS_CALL
    );

  if (!open) {
    return null;
  }

  const update =
    <K extends keyof AccessibilitySettings>(
      key: K,
      value:
        AccessibilitySettings[K]
    ) => {
      onChange({
        ...settings,
        [key]:
          value,
      });
    };

  const toggleGlobalCaptions =
    async () => {
      if (!call) {
        return;
      }

      try {
        if (
          captionsRunning &&
          canStopCaptions
        ) {
          await call.stopClosedCaptions();
        } else if (
          !captionsRunning &&
          canStartCaptions
        ) {
          await call.startClosedCaptions();
        }
      } catch (error) {
        console.error(
          "Closed caption error:",
          error
        );
      }
    };

  return (
    <div className="fixed inset-0 z-[240] flex items-center justify-center bg-black/55 p-3 backdrop-blur-sm">

      <button
        type="button"
        onClick={onClose}
        aria-label="Close accessibility settings"
        className="absolute inset-0"
      />

      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="cohiva-accessibility-title"
        className="relative z-10 w-full max-w-[650px] overflow-hidden rounded-[28px] bg-[#FFF7EB] text-[#3D3732] shadow-2xl"
      >

        <div className="flex items-center justify-between border-b border-[#403A35]/10 p-5">

          <div>

            <p className="text-[9px] font-black uppercase tracking-[0.18em] text-[#CC3A63]">
              Accessibility
            </p>

            <h2
              id="cohiva-accessibility-title"
              className="mt-1 text-xl font-black"
            >
              Make Cohiva easier to use
            </h2>

          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close accessibility settings"
            className="flex h-10 w-10 items-center justify-center rounded-full bg-[#403A35]/10 text-xl font-black"
          >
            ×
          </button>

        </div>

        <div className="grid gap-3 p-4 sm:grid-cols-2">

          <AccessibilityToggle
            title="Show captions"
            description="Display live speech captions locally."
            enabled={
              settings.captionsVisible
            }
            onClick={() =>
              update(
                "captionsVisible",
                !settings.captionsVisible
              )
            }
          />

          <AccessibilityToggle
            title="High contrast"
            description="Increase contrast throughout the meeting."
            enabled={
              settings.highContrast
            }
            onClick={() =>
              update(
                "highContrast",
                !settings.highContrast
              )
            }
          />

          <AccessibilityToggle
            title="Reduce motion"
            description="Disable most animations and transitions."
            enabled={
              settings.reduceMotion
            }
            onClick={() =>
              update(
                "reduceMotion",
                !settings.reduceMotion
              )
            }
          />

          <AccessibilityToggle
            title="Hide visual reactions"
            description="Stop reaction bubbles from appearing over content."
            enabled={
              settings.hideReactions
            }
            onClick={() =>
              update(
                "hideReactions",
                !settings.hideReactions
              )
            }
          />

          {/* CAPTION SIZE */}

          <div className="rounded-[20px] border border-[#403A35]/10 bg-white p-4 sm:col-span-2">

            <p className="font-black">
              Caption text size
            </p>

            <div className="mt-3 grid grid-cols-3 gap-2">

              {(
                [
                  "small",
                  "medium",
                  "large",
                ] as CaptionSize[]
              ).map(
                (
                  size
                ) => (
                  <button
                    key={size}
                    type="button"
                    onClick={() =>
                      update(
                        "captionSize",
                        size
                      )
                    }
                    className={`rounded-xl py-2 text-xs font-black capitalize ${
                      settings.captionSize ===
                      size
                        ? "bg-[#A2AB73] text-white"
                        : "bg-[#F9F0E0]"
                    }`}
                  >
                    {size}
                  </button>
                )
              )}

            </div>

          </div>

          {/* GLOBAL CAPTION ENGINE */}

          <div className="rounded-[20px] bg-[#403A35] p-4 text-[#FFF7EB] sm:col-span-2">

            <div className="flex items-center justify-between gap-4">

              <div>

                <p className="font-black">
                  Live caption engine
                </p>

                <p className="mt-1 text-xs text-white/60">
                  {captionsRunning
                    ? "Live captions are currently running for this call."
                    : "Captions are not currently running."}
                </p>

              </div>

              {(canStartCaptions ||
                canStopCaptions) && (
                <button
                  type="button"
                  onClick={() =>
                    void toggleGlobalCaptions()
                  }
                  className="shrink-0 rounded-xl bg-[#CC3A63] px-4 py-2 text-xs font-black text-white"
                >
                  {captionsRunning
                    ? "Stop captions"
                    : "Start captions"}
                </button>
              )}

            </div>

          </div>

          {/* KEYBOARD */}

          <div className="rounded-[20px] bg-[#F9F0E0] p-4 sm:col-span-2">

            <p className="font-black">
              Keyboard shortcuts
            </p>

            <div className="mt-3 grid grid-cols-2 gap-x-5 gap-y-2 text-xs sm:grid-cols-3">

              <Shortcut
                keys="Alt + M"
                label="Microphone"
              />

              <Shortcut
                keys="Alt + V"
                label="Camera"
              />

              <Shortcut
                keys="Alt + C"
                label="Chat"
              />

              <Shortcut
                keys="Alt + P"
                label="Participants"
              />

              <Shortcut
                keys="Alt + H"
                label="Raise hand"
              />

              <Shortcut
                keys="Alt + W"
                label="Video / board"
              />

            </div>

          </div>

        </div>

      </section>

    </div>
  );
};

export default MeetingAccessibilityPanel;

/* =========================================================
   CAPTION OVERLAY
========================================================= */

export const MeetingCaptionsOverlay = ({
  visible,
  size,
}: {
  visible: boolean;
  size: CaptionSize;
}) => {
  const {
    useCallClosedCaptions,
  } =
    useCallStateHooks();

  const captions =
    useCallClosedCaptions();

  if (
    !visible ||
    captions.length ===
      0
  ) {
    return null;
  }

  const sizeClass =
    size ===
    "large"
      ? "text-lg"
      : size ===
          "small"
        ? "text-xs"
        : "text-sm";

  return (
    <div
      aria-live="polite"
      aria-label="Live captions"
      className="pointer-events-none absolute inset-x-4 bottom-5 z-[70] flex justify-center"
    >

      <div className="max-w-[850px] rounded-2xl bg-black/80 px-5 py-3 text-center text-white shadow-2xl backdrop-blur-sm">

        {captions.map(
          (
            caption
          ) => (
            <p
              key={`${caption.user.id}-${caption.start_time}`}
              className={`${sizeClass} leading-6`}
            >
              <strong>
                {caption.user.name ||
                  "Speaker"}:
              </strong>
              {" "}
              {caption.text}
            </p>
          )
        )}

      </div>

    </div>
  );
};

/* =========================================================
   HELPERS
========================================================= */

const AccessibilityToggle = ({
  title,
  description,
  enabled,
  onClick,
}: {
  title: string;
  description: string;
  enabled: boolean;
  onClick: () => void;
}) => (
  <button
    type="button"
    aria-pressed={enabled}
    onClick={onClick}
    className={`rounded-[20px] border p-4 text-left ${
      enabled
        ? "border-[#A2AB73]/40 bg-[#A2AB73]/10"
        : "border-[#403A35]/10 bg-white"
    }`}
  >

    <div className="flex items-center justify-between gap-4">

      <div>

        <p className="font-black">
          {title}
        </p>

        <p className="mt-1 text-xs leading-5 text-[#756E64]">
          {description}
        </p>

      </div>

      <div
        className={`relative h-6 w-11 shrink-0 rounded-full ${
          enabled
            ? "bg-[#A2AB73]"
            : "bg-[#403A35]/15"
        }`}
      >

        <div
          className={`absolute top-1 h-4 w-4 rounded-full bg-white ${
            enabled
              ? "left-6"
              : "left-1"
          }`}
        />

      </div>

    </div>

  </button>
);

const Shortcut = ({
  keys,
  label,
}: {
  keys: string;
  label: string;
}) => (
  <div className="flex items-center justify-between gap-2">
    <span>
      {label}
    </span>

    <kbd className="rounded-md bg-white px-2 py-1 font-mono text-[10px] font-black">
      {keys}
    </kbd>
  </div>
);