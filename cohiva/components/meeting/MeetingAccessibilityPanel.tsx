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

  settings: AccessibilitySettings;

  onChange: (
    settings: AccessibilitySettings
  ) => void;
};

type CaptionToast = {
  title: string;
  message: string;
  type:
    | "success"
    | "info"
    | "error";
};

/* =========================================================
   SETTING SWITCH
========================================================= */

const SettingSwitch = ({
  enabled,
  onChange,
  title,
  description,
  icon,
}: {
  enabled: boolean;

  onChange: (
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
      aria-checked={enabled}
      onClick={() =>
        onChange(
          !enabled
        )
      }
      className="flex w-full items-center gap-3 rounded-[17px] border border-[#403A35]/10 bg-white p-3.5 text-left transition hover:bg-[#F9F0E0]"
    >

      {/* ICON */}

      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] bg-[#F9F0E0] text-base font-black text-[#403A35]">
        {icon}
      </div>

      {/* TEXT */}

      <div className="min-w-0 flex-1">

        <p className="text-xs font-black text-[#3D3732]">
          {title}
        </p>

        <p className="mt-1 text-[9px] leading-4 text-[#756E64]">
          {description}
        </p>

      </div>

      {/* SWITCH */}

      <div
        className={`relative h-6 w-11 shrink-0 rounded-full transition ${
          enabled
            ? "bg-[#A2AB73]"
            : "bg-[#403A35]/15"
        }`}
      >

        <div
          className={`absolute top-1 h-4 w-4 rounded-full bg-white shadow-sm transition-all ${
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
   ACCESSIBILITY PANEL
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

  const captionsRunning =
    useIsCallCaptioningInProgress();

  /*
   * Stream checks that the current participant has
   * BOTH capabilities.
   */
  const canToggleCaptions =
    useHasPermissions(
      OwnCapability.START_CLOSED_CAPTIONS_CALL,
      OwnCapability.STOP_CLOSED_CAPTIONS_CALL
    );

  const teacher =
    Boolean(
      call?.isCreatedByMe
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

  const [
    captionToast,
    setCaptionToast,
  ] =
    useState<CaptionToast | null>(
      null
    );

  const toastTimerRef =
    useRef<
      ReturnType<
        typeof setTimeout
      > | null
    >(null);

  /* =====================================================
     UPDATE LOCAL SETTINGS
  ===================================================== */

  const update =
    <
      K extends keyof AccessibilitySettings
    >(
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
     TOAST
  ===================================================== */

  const showToast = (
    toast: CaptionToast
  ) => {
    if (
      toastTimerRef.current
    ) {
      clearTimeout(
        toastTimerRef.current
      );
    }

    setCaptionToast(
      toast
    );

    toastTimerRef.current =
      setTimeout(
        () => {
          setCaptionToast(
            null
          );

          toastTimerRef.current =
            null;
        },
        4500
      );
  };

  /* =====================================================
     START / STOP CAPTIONS

     This affects the WHOLE Stream call.

     Showing/hiding captions remains a LOCAL user choice.
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
          !canToggleCaptions
        ) {
          throw new Error(
            "Your Stream role does not have permission to control closed captions."
          );
        }

        /* STOP */

        if (
          captionsRunning
        ) {
          await call
            .stopClosedCaptions();

          showToast({
            type:
              "info",

            title:
              "Captions stopped",

            message:
              "Live captions have been stopped for this classroom.",
          });

          return;
        }

        /* START */

        await call
          .startClosedCaptions();

        /*
         * Teacher who starts captions should
         * immediately see them locally.
         */
        update(
          "captionsVisible",
          true
        );

        showToast({
          type:
            "success",

          title:
            "Captions started",

          message:
            "Live speech captions are now available to everyone in the meeting.",
        });
      } catch (
        error
      ) {
        console.error(
          "Closed caption error:",
          error
        );

        const message =
          error instanceof
            Error
            ? error.message
            : "Unable to change closed captions.";

        setCaptionError(
          message
        );

        showToast({
          type:
            "error",

          title:
            "Captions unavailable",

          message,
        });
      } finally {
        setCaptionsBusy(
          false
        );
      }
    };

  /* =====================================================
     ESC CLOSE
  ===================================================== */

  useEffect(() => {
    if (
      !open
    ) {
      return;
    }

    const handleKeyDown = (
      event: KeyboardEvent
    ) => {
      if (
        event.key ===
        "Escape"
      ) {
        onClose();
      }
    };

    window.addEventListener(
      "keydown",
      handleKeyDown
    );

    return () => {
      window.removeEventListener(
        "keydown",
        handleKeyDown
      );
    };
  }, [
    open,
    onClose,
  ]);

  /* =====================================================
     TIMER CLEANUP
  ===================================================== */

  useEffect(() => {
    return () => {
      if (
        toastTimerRef.current
      ) {
        clearTimeout(
          toastTimerRef.current
        );
      }
    };
  }, []);

  if (
    !open
  ) {
    return (
      <>
        {captionToast && (
          <CaptionNotification
            toast={
              captionToast
            }
            onClose={() =>
              setCaptionToast(
                null
              )
            }
          />
        )}
      </>
    );
  }

  /* =====================================================
     UI
  ===================================================== */

  return (
    <>
      <aside
        aria-label="Accessibility settings"
        className="fixed bottom-[76px] right-0 top-[64px] z-[300] flex w-full flex-col overflow-hidden border-l border-[#403A35]/10 bg-[#FFF7EB] text-[#3D3732] shadow-[-20px_0_60px_rgba(0,0,0,0.25)] sm:w-[430px]"
      >

        {/* =================================================
            HEADER
        ================================================= */}

        <header className="shrink-0 border-b border-[#403A35]/10 bg-white p-5">

          <div className="flex items-start justify-between gap-4">

            <div>

              <p className="text-[9px] font-black uppercase tracking-[0.18em] text-[#CC3A63]">
                Cohiva Classroom
              </p>

              <h2 className="mt-1 text-xl font-black">
                Accessibility
              </h2>

              <p className="mt-1 text-[10px] leading-4 text-[#756E64]">
                Personalize your classroom experience.
              </p>

            </div>

            <button
              type="button"
              aria-label="Close accessibility settings"
              onClick={
                onClose
              }
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#F9F0E0] text-lg font-black text-[#756E64] transition hover:bg-[#EFE4D2]"
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
              CAPTIONS
          ================================================= */}

          <section className="rounded-[22px] border border-[#403A35]/10 bg-white p-4">

            <div className="flex items-start justify-between gap-3">

              <div>

                <p className="text-[9px] font-black uppercase tracking-[0.16em] text-[#CC3A63]">
                  Live Captions
                </p>

                <h3 className="mt-1 text-sm font-black">
                  Closed captions
                </h3>

                <p className="mt-1 text-[9px] leading-4 text-[#756E64]">
                  Convert spoken audio into live text during the meeting.
                </p>

              </div>

              {/* STATUS */}

              <span
                className={`shrink-0 rounded-full px-3 py-1.5 text-[8px] font-black uppercase tracking-[0.08em] ${
                  captionsRunning
                    ? "bg-[#A2AB73]/15 text-[#737C4C]"
                    : "bg-[#403A35]/8 text-[#756E64]"
                }`}
              >
                {captionsRunning
                  ? "● Live"
                  : "Off"}
              </span>

            </div>

            {/* =============================================
                TEACHER CAPTION ENGINE CONTROL
            ============================================= */}

            {teacher && (
              <div className="mt-4">

                <button
                  type="button"
                  disabled={
                    captionsBusy ||
                    !canToggleCaptions
                  }
                  onClick={() =>
                    void toggleCaptionEngine()
                  }
                  className={`w-full rounded-[15px] px-4 py-3 text-[10px] font-black transition disabled:cursor-not-allowed disabled:opacity-50 ${
                    captionsRunning
                      ? "bg-[#CC3A63]/10 text-[#CC3A63] hover:bg-[#CC3A63]/15"
                      : "bg-[#A2AB73] text-white hover:bg-[#929C64]"
                  }`}
                >
                  {captionsBusy
                    ? "Please wait..."
                    : captionsRunning
                      ? "Stop captions for class"
                      : "Start captions for class"}
                </button>

                {!canToggleCaptions && (
                  <div className="mt-3 rounded-xl bg-[#F9F0E0] p-3">

                    <p className="text-[9px] font-bold leading-4 text-[#756E64]">
                      Closed captions are not enabled for your Stream role or call type.
                    </p>

                  </div>
                )}

              </div>
            )}

            {/* =============================================
                STUDENT STATUS
            ============================================= */}

            {!teacher && (
              <div
                className={`mt-4 rounded-[14px] p-3 ${
                  captionsRunning
                    ? "bg-[#A2AB73]/10"
                    : "bg-[#F9F0E0]"
                }`}
              >

                <p className="text-[9px] font-bold leading-4 text-[#756E64]">
                  {captionsRunning
                    ? "Live captions are available. Choose below whether you want to display them on your screen."
                    : "Captions are currently off. The teacher can start live captions for the classroom."}
                </p>

              </div>
            )}

            {/* ERROR */}

            {captionError && (
              <div
                role="alert"
                className="mt-3 flex items-start gap-2 rounded-[14px] bg-[#CC3A63]/10 p-3"
              >

                <span className="font-black text-[#CC3A63]">
                  !
                </span>

                <p className="flex-1 text-[9px] font-bold leading-4 text-[#CC3A63]">
                  {captionError}
                </p>

                <button
                  type="button"
                  onClick={() =>
                    setCaptionError("")
                  }
                  className="text-xs font-black text-[#CC3A63]"
                >
                  ×
                </button>

              </div>
            )}

          </section>

          {/* =================================================
              PERSONAL CAPTION DISPLAY
          ================================================= */}

          <section className="mt-3">

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
                captionsRunning
                  ? "Show or hide live subtitles on your own screen."
                  : "Your choice will be remembered until captions become available."
              }
              icon="CC"
            />

          </section>

          {/* =================================================
              CAPTION SIZE
          ================================================= */}

          <section className="mt-3 rounded-[17px] border border-[#403A35]/10 bg-white p-4">

            <p className="text-xs font-black">
              Caption text size
            </p>

            <p className="mt-1 text-[9px] text-[#756E64]">
              Choose a comfortable subtitle size.
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
                    className={`rounded-xl px-2 py-2.5 text-[9px] font-black capitalize transition ${
                      settings.captionSize ===
                      size
                        ? "bg-[#403A35] text-white"
                        : "bg-[#F9F0E0] text-[#756E64] hover:bg-[#EFE4D2]"
                    }`}
                  >
                    {size}
                  </button>
                )
              )}

            </div>

          </section>

          {/* =================================================
              VISUAL SETTINGS
          ================================================= */}

          <section className="mt-5">

            <div className="mb-3">

              <p className="text-[9px] font-black uppercase tracking-[0.16em] text-[#CC3A63]">
                Visual Comfort
              </p>

              <p className="mt-1 text-[9px] text-[#756E64]">
                These settings only affect your screen.
              </p>

            </div>

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
                description="Increase visual separation between interface elements."
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
                description="Minimize animations and visual movement."
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
                description="Hide floating emoji reactions from your meeting view."
                icon="😀"
              />

            </div>

          </section>

          {/* =================================================
              KEYBOARD SHORTCUTS
          ================================================= */}

          <section className="mt-5 rounded-[20px] bg-[#403A35] p-4 text-white">

            <div className="flex items-center justify-between">

              <div>

                <p className="text-[9px] font-black uppercase tracking-[0.16em] text-[#D9E2AE]">
                  Keyboard
                </p>

                <h3 className="mt-1 text-xs font-black">
                  Meeting shortcuts
                </h3>

              </div>

              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/10">
                ⌨
              </div>

            </div>

            <div className="mt-4 grid grid-cols-2 gap-x-5 gap-y-2.5">

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

      {/* TOAST */}

      {captionToast && (
        <CaptionNotification
          toast={
            captionToast
          }
          onClose={() =>
            setCaptionToast(
              null
            )
          }
        />
      )}

    </>
  );
};

export default MeetingAccessibilityPanel;

/* =========================================================
   SHORTCUT ROW
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

      <span className="text-[9px] text-white/65">
        {label}
      </span>

      <kbd className="rounded-md bg-white/10 px-2 py-1 text-[8px] font-black text-white">
        {keys}
      </kbd>

    </div>
  );
};

/* =========================================================
   CAPTION NOTIFICATION
========================================================= */

const CaptionNotification = ({
  toast,
  onClose,
}: {
  toast: CaptionToast;

  onClose: () => void;
}) => {
  return (
    <div className="fixed bottom-[96px] right-5 z-[480] w-[350px] max-w-[calc(100vw-32px)]">

      <div className="overflow-hidden rounded-[22px] border border-[#403A35]/10 bg-[#FFF7EB] text-[#3D3732] shadow-[0_24px_70px_rgba(0,0,0,0.38)]">

        <div
          className={`h-1 ${
            toast.type ===
            "error"
              ? "bg-[#CC3A63]"
              : toast.type ===
                  "success"
                ? "bg-[#A2AB73]"
                : "bg-[#403A35]"
          }`}
        />

        <div className="flex items-start gap-3 p-4">

          <div
            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl font-black ${
              toast.type ===
              "error"
                ? "bg-[#CC3A63]/10 text-[#CC3A63]"
                : "bg-[#A2AB73]/15 text-[#737C4C]"
            }`}
          >
            {toast.type ===
            "error"
              ? "!"
              : "CC"}
          </div>

          <div className="min-w-0 flex-1">

            <p className="text-[9px] font-black uppercase tracking-[0.15em] text-[#CC3A63]">
              Cohiva Accessibility
            </p>

            <h3 className="mt-1 text-sm font-black">
              {toast.title}
            </h3>

            <p className="mt-1 text-[10px] leading-4 text-[#756E64]">
              {toast.message}
            </p>

          </div>

          <button
            type="button"
            onClick={
              onClose
            }
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-sm font-black text-[#756E64] hover:bg-[#F9F0E0]"
          >
            ×
          </button>

        </div>

      </div>

    </div>
  );
};

/* =========================================================
   CAPTION OVERLAY

   Rendered inside MeetingRoom workspace.
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

  const captionsRunning =
    useIsCallCaptioningInProgress();

  if (
    !visible ||
    !captionsRunning ||
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
      className="pointer-events-none absolute inset-x-4 bottom-5 z-[120] flex flex-col items-center gap-2"
    >

      {captions.map(
        (
          caption
        ) => {
          const speaker =
            caption.user?.name ||
            "Participant";

          return (
            <div
              key={`${caption.user?.id ?? "unknown"}-${caption.start_time}`}
              className={`max-w-[850px] rounded-[14px] bg-black/85 px-4 py-2.5 text-center font-semibold leading-relaxed text-white shadow-2xl backdrop-blur ${textSize}`}
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