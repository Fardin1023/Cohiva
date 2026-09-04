"use client";

import {
  OwnCapability,
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

export type AccessibilitySettings = {
  captionsVisible: boolean;

  captionSize:
    | "small"
    | "medium"
    | "large";

  highContrast: boolean;

  reduceMotion: boolean;

  hideReactions: boolean;
};

type MeetingAccessibilityPanelProps = {
  open: boolean;

  onClose: () => void;

  settings:
    AccessibilitySettings;

  onChange:
    (
      settings:
        AccessibilitySettings
    ) => void;
};

/* =========================================================
   UPDATE HELPER
========================================================= */

const SettingSwitch = ({
  enabled,
  onChange,
  title,
  description,
  icon,
}: {
  enabled: boolean;

  onChange:
    (
      enabled: boolean
    ) => void;

  title: string;

  description: string;

  icon: string;
}) => {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={
        enabled
      }
      onClick={() =>
        onChange(
          !enabled
        )
      }
      className="flex w-full items-center gap-3 rounded-[16px] border border-[#403A35]/8 bg-white p-3 text-left transition hover:bg-[#F9F0E0]"
    >

      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#F9F0E0] text-lg">
        {icon}
      </div>

      <div className="min-w-0 flex-1">

        <p className="text-xs font-black text-[#3D3732]">
          {title}
        </p>

        <p className="mt-1 text-[9px] leading-4 text-[#756E64]">
          {description}
        </p>

      </div>

      <div
        className={`relative h-6 w-11 shrink-0 rounded-full transition ${
          enabled
            ? "bg-[#A2AB73]"
            : "bg-[#403A35]/15"
        }`}
      >
        <div
          className={`absolute top-1 h-4 w-4 rounded-full bg-white shadow transition ${
            enabled
              ? "left-6"
              : "left-1"
          }`}
        />
      </div>

    </button>
  );
};

/* =========================================================
   PANEL
========================================================= */

const MeetingAccessibilityPanel = ({
  open,
  onClose,
  settings,
  onChange,
}: MeetingAccessibilityPanelProps) => {
  const call =
    useCall();

  const {
    useIsCallCaptioningInProgress,
    useHasPermissions,
  } =
    useCallStateHooks();

  const captionEngineRunning =
    useIsCallCaptioningInProgress();

  const canStartCaptions =
    useHasPermissions(
      OwnCapability.START_CLOSED_CAPTIONS_CALL
    );

  const canStopCaptions =
    useHasPermissions(
      OwnCapability.STOP_CLOSED_CAPTIONS_CALL
    );

  const [
    captionsBusy,
    setCaptionsBusy,
  ] =
    useState(false);

  const [
    captionError,
    setCaptionError,
  ] =
    useState("");

  const teacher =
    Boolean(
      call?.isCreatedByMe
    );

  /* =====================================================
     UPDATE LOCAL ACCESSIBILITY PREFERENCE
  ===================================================== */

  const update =
    <K extends
      keyof AccessibilitySettings>(
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

  /* =====================================================
     CAPTION ENGINE

     Teacher controls whether Stream generates captions
     for the entire meeting.

     Each participant separately chooses whether they
     personally display them.
  ===================================================== */

  const toggleCaptionEngine =
    async () => {
      if (
        !call ||
        captionsBusy
      ) {
        return;
      }

      try {
        setCaptionsBusy(
          true
        );

        setCaptionError("");

        if (
          captionEngineRunning
        ) {
          if (
            !canStopCaptions
          ) {
            throw new Error(
              "Your Stream role cannot stop closed captions."
            );
          }

          await call.stopClosedCaptions();

          return;
        }

        if (
          !canStartCaptions
        ) {
          throw new Error(
            "Your Stream role cannot start closed captions."
          );
        }

        await call.startClosedCaptions();
      } catch (
        error
      ) {
        console.error(
          "Closed caption error:",
          error
        );

        setCaptionError(
          error instanceof
            Error
            ? error.message
            : "Unable to change closed captioning."
        );
      } finally {
        setCaptionsBusy(
          false
        );
      }
    };

  if (
    !open
  ) {
    return null;
  }

  return (
    <aside
      aria-label="Accessibility settings"
      className="fixed bottom-[76px] right-0 top-[64px] z-[250] flex w-full flex-col overflow-hidden border-l border-[#403A35]/10 bg-[#FFF7EB] text-[#3D3732] shadow-[-18px_0_55px_rgba(0,0,0,0.2)] sm:w-[430px]"
    >

      {/* =================================================
          HEADER
      ================================================= */}

      <header className="shrink-0 border-b border-[#403A35]/10 bg-white p-4">

        <div className="flex items-start justify-between">

          <div>

            <p className="text-[9px] font-black uppercase tracking-[0.18em] text-[#CC3A63]">
              Cohiva
            </p>

            <h2 className="mt-1 text-lg font-black">
              Accessibility
            </h2>

            <p className="mt-1 text-[10px] text-[#756E64]">
              Personalize the meeting for comfort and clarity.
            </p>

          </div>

          <button
            type="button"
            aria-label="Close accessibility panel"
            onClick={
              onClose
            }
            className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#F9F0E0] text-lg font-black"
          >
            ×
          </button>

        </div>

      </header>

      {/* =================================================
          CONTENT
      ================================================= */}

      <div className="min-h-0 flex-1 overflow-y-auto p-4">

        {/* =================================================
            CLOSED CAPTIONS
        ================================================= */}

        <section>

          <div className="flex items-center justify-between gap-3">

            <div>

              <p className="text-[9px] font-black uppercase tracking-[0.16em] text-[#CC3A63]">
                Closed Captions
              </p>

              <p className="mt-1 text-xs font-bold text-[#756E64]">
                Live spoken subtitles
              </p>

            </div>

            <span
              className={`rounded-full px-2.5 py-1 text-[8px] font-black uppercase ${
                captionEngineRunning
                  ? "bg-[#A2AB73]/15 text-[#737C4C]"
                  : "bg-[#403A35]/8 text-[#756E64]"
              }`}
            >
              {captionEngineRunning
                ? "Running"
                : "Off"}
            </span>

          </div>

          {/* TEACHER ENGINE CONTROL */}

          {teacher && (
            <button
              type="button"
              disabled={
                captionsBusy
              }
              onClick={() =>
                void toggleCaptionEngine()
              }
              className={`mt-3 w-full rounded-[14px] px-4 py-3 text-[10px] font-black transition disabled:opacity-50 ${
                captionEngineRunning
                  ? "bg-[#CC3A63]/10 text-[#CC3A63]"
                  : "bg-[#A2AB73] text-white"
              }`}
            >
              {captionsBusy
                ? "Please wait..."
                : captionEngineRunning
                  ? "Stop captions for class"
                  : "Start captions for class"}
            </button>
          )}

          {/* STUDENT INFO */}

          {!teacher &&
            !captionEngineRunning && (
            <div className="mt-3 rounded-xl bg-[#F9F0E0] p-3 text-[9px] leading-4 text-[#756E64]">
              Closed captions are not currently running for this meeting. The teacher can start them.
            </div>
          )}

          {/* LOCAL DISPLAY */}

          <div className="mt-3">

            <SettingSwitch
              enabled={
                settings.captionsVisible
              }
              onChange={(
                enabled
              ) =>
                update(
                  "captionsVisible",
                  enabled
                )
              }
              title="Show captions for me"
              description={
                captionEngineRunning
                  ? "Show or hide live captions on your screen."
                  : "Your preference is saved. Captions will appear when the meeting caption engine is running."
              }
              icon="CC"
            />

          </div>

          {captionError && (
            <div
              role="alert"
              className="mt-3 rounded-xl bg-[#CC3A63]/10 p-3 text-[9px] font-bold leading-4 text-[#CC3A63]"
            >
              {captionError}
            </div>
          )}

          {/* CAPTION SIZE */}

          <div className="mt-3 rounded-[16px] border border-[#403A35]/8 bg-white p-3">

            <p className="text-xs font-black">
              Caption size
            </p>

            <div className="mt-3 grid grid-cols-3 gap-2">

              {(
                [
                  "small",
                  "medium",
                  "large",
                ] as const
              ).map(
                (
                  size
                ) => (
                  <button
                    key={
                      size
                    }
                    type="button"
                    onClick={() =>
                      update(
                        "captionSize",
                        size
                      )
                    }
                    className={`rounded-xl px-2 py-2 text-[9px] font-black capitalize transition ${
                      settings.captionSize ===
                      size
                        ? "bg-[#A2AB73] text-white"
                        : "bg-[#F9F0E0] text-[#756E64]"
                    }`}
                  >
                    {size}
                  </button>
                )
              )}

            </div>

          </div>

        </section>

        {/* DIVIDER */}

        <div className="my-5 h-px bg-[#403A35]/10" />

        {/* =================================================
            VISUAL ACCESSIBILITY
        ================================================= */}

        <section>

          <p className="mb-3 text-[9px] font-black uppercase tracking-[0.16em] text-[#CC3A63]">
            Visual Preferences
          </p>

          <div className="space-y-2.5">

            <SettingSwitch
              enabled={
                settings.highContrast
              }
              onChange={(
                enabled
              ) =>
                update(
                  "highContrast",
                  enabled
                )
              }
              title="High contrast"
              description="Increase visual separation and interface contrast."
              icon="◐"
            />

            <SettingSwitch
              enabled={
                settings.reduceMotion
              }
              onChange={(
                enabled
              ) =>
                update(
                  "reduceMotion",
                  enabled
                )
              }
              title="Reduce motion"
              description="Minimize animations and interface movement."
              icon="◌"
            />

            <SettingSwitch
              enabled={
                settings.hideReactions
              }
              onChange={(
                enabled
              ) =>
                update(
                  "hideReactions",
                  enabled
                )
              }
              title="Hide reactions"
              description="Hide floating emoji reactions from your screen."
              icon="😀"
            />

          </div>

        </section>

        {/* =================================================
            KEYBOARD SHORTCUTS
        ================================================= */}

        <section className="mt-5 rounded-[18px] bg-[#403A35] p-4 text-white">

          <p className="text-[9px] font-black uppercase tracking-[0.16em] text-[#D9E2AE]">
            Keyboard Shortcuts
          </p>

          <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-[9px]">

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
              label="Whiteboard"
            />

            <Shortcut
              keys="Alt + A"
              label="Accessibility"
            />

          </div>

        </section>

      </div>

    </aside>
  );
};

export default MeetingAccessibilityPanel;

/* =========================================================
   SHORTCUT
========================================================= */

const Shortcut = ({
  keys,
  label,
}: {
  keys: string;
  label: string;
}) => {
  return (
    <div className="flex items-center justify-between gap-2">

      <span className="text-white/65">
        {label}
      </span>

      <kbd className="rounded-md bg-white/10 px-2 py-1 font-black text-white">
        {keys}
      </kbd>

    </div>
  );
};

/* =========================================================
   CLOSED CAPTION OVERLAY
========================================================= */

export const MeetingCaptionsOverlay = ({
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

  const running =
    useIsCallCaptioningInProgress();

  if (
    !visible ||
    !running ||
    captions.length ===
      0
  ) {
    return null;
  }

  const textSize =
    size ===
    "small"
      ? "text-xs"
      : size ===
          "large"
        ? "text-xl"
        : "text-base";

  return (
    <div
      aria-live="polite"
      aria-atomic="false"
      className="pointer-events-none absolute inset-x-4 bottom-5 z-[100] flex flex-col items-center gap-2"
    >

      {captions.map(
        (
          caption
        ) => {
          const speaker =
            caption.user
              ?.name ||
            "Participant";

          return (
            <div
              key={`${caption.user?.id ?? "unknown"}-${caption.start_time}`}
              className={`max-w-[900px] rounded-[14px] bg-black/80 px-4 py-2.5 text-center font-semibold leading-relaxed text-white shadow-xl backdrop-blur ${textSize}`}
            >
              <span className="mr-2 font-black text-[#D9E2AE]">
                {speaker}:
              </span>

              {caption.text}
            </div>
          );
        }
      )}

    </div>
  );
};