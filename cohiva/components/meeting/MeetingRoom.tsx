"use client";

import {
  CallingState,
  CallControls,
  RecordCallConfirmationButton,
  SpeakerLayout,
  StreamCall,
  StreamTheme,
  VideoPreview,
  useCall,
  useCallStateHooks,
  useStreamVideoClient,
  type Call,
} from "@stream-io/video-react-sdk";

import {
  useUser,
} from "@clerk/nextjs";

import {
  useRouter,
} from "next/navigation";

import {
  useEffect,
  useRef,
  useState,
} from "react";

import CohivaWhiteboard from "./CohivaWhiteboard";

import MeetingPermissionsPanel, {
  DEFAULT_COHIVA_PERMISSIONS,
  type CohivaPermissions,
} from "./MeetingPermissionsPanel";

/* =========================================================
   TYPES
========================================================= */

type MeetingRoomProps = {
  callId: string;
  shouldCreate: boolean;
};

type MeetingView =
  | "video"
  | "whiteboard";

/* =========================================================
   MAIN MEETING ROOM
========================================================= */

const MeetingRoom = ({
  callId,
  shouldCreate,
}: MeetingRoomProps) => {
  const client =
    useStreamVideoClient();

  const {
    user,
  } =
    useUser();

  /*
   * Primitive dependency.
   *
   * Do NOT depend on the whole
   * Clerk user object.
   */
  const userId =
    user?.id;

  const [
    call,
    setCall,
  ] =
    useState<Call>();

  const [
    error,
    setError,
  ] =
    useState("");

  /* =====================================================
     STABLE CALL REFS
  ===================================================== */

  const callRef =
    useRef<Call | null>(
      null
    );

  const callIdRef =
    useRef<string | null>(
      null
    );

  const callClientRef =
    useRef(
      client
    );

  /*
   * Used only when the entire
   * MeetingRoom genuinely disappears.
   */
  const unmountTimerRef =
    useRef<
      ReturnType<
        typeof setTimeout
      > | null
    >(null);

  const mountedRef =
    useRef(false);

  /* =====================================================
     COMPONENT LIFETIME

     This cleanup is separate from
     call initialization.

     React development can temporarily
     cleanup/remount effects.

     We therefore wait before disposing
     the call. A quick remount cancels it.
  ===================================================== */

  useEffect(() => {
    mountedRef.current =
      true;

    if (
      unmountTimerRef.current
    ) {
      clearTimeout(
        unmountTimerRef.current
      );

      unmountTimerRef.current =
        null;
    }

    return () => {
      mountedRef.current =
        false;

      unmountTimerRef.current =
        setTimeout(
          () => {
            /*
             * Only clean up if Cohiva
             * is genuinely still unmounted.
             */
            if (
              mountedRef.current
            ) {
              return;
            }

            const currentCall =
              callRef.current;

            if (
              !currentCall
            ) {
              return;
            }

            /*
             * CallControls may already
             * have left the call.
             *
             * Never call leave twice.
             */
            if (
              currentCall.state.callingState ===
              CallingState.LEFT
            ) {
              return;
            }

            void currentCall
              .leave()
              .catch(
                (
                  cleanupError
                ) => {
                  /*
                   * Don't pollute terminal
                   * with harmless
                   * already-left errors.
                   */
                  const message =
                    cleanupError instanceof
                      Error
                      ? cleanupError.message
                      : String(
                          cleanupError
                        );

                  if (
                    !message
                      .toLowerCase()
                      .includes(
                        "already been left"
                      )
                  ) {
                    console.error(
                      "Meeting final cleanup error:",
                      cleanupError
                    );
                  }
                }
              );
          },

          /*
           * Long enough to survive:
           *
           * - Strict Mode
           * - development remount
           * - fast Next.js refresh
           */
          5000
        );
    };
  }, []);

  /* =====================================================
     CREATE / LOAD A STABLE CALL
  ===================================================== */

  useEffect(() => {
    if (
      !client ||
      !userId
    ) {
      return;
    }

    let cancelled =
      false;

    /* =====================================================
       SAME CALL?

       Do NOT create another Call object.
    ===================================================== */

    if (
      callRef.current &&
      callIdRef.current ===
        callId &&
      callClientRef.current ===
        client
    ) {
      setCall(
        callRef.current
      );

      return;
    }

    /* =====================================================
       ACTUALLY MOVED TO ANOTHER CALL
    ===================================================== */

    const previousCall =
      callRef.current;

    if (
      previousCall &&
      previousCall.state.callingState !==
        CallingState.LEFT
    ) {
      void previousCall
        .leave()
        .catch(
          (
            leaveError
          ) => {
            const message =
              leaveError instanceof
                Error
                ? leaveError.message
                : String(
                    leaveError
                  );

            if (
              !message
                .toLowerCase()
                .includes(
                  "already been left"
                )
            ) {
              console.error(
                "Previous meeting leave error:",
                leaveError
              );
            }
          }
        );
    }

    /* =====================================================
       CREATE NEW STREAM CALL INSTANCE ONCE
    ===================================================== */

    const streamCall =
      client.call(
        "development",
        callId
      );

    callRef.current =
      streamCall;

    callIdRef.current =
      callId;

    callClientRef.current =
      client;

    setCall(
      streamCall
    );

    /* =====================================================
       INITIALIZE SERVER CALL
    ===================================================== */

    const initialize =
      async () => {
        try {
          setError(
            ""
          );

          if (
            shouldCreate
          ) {
            await streamCall.getOrCreate({
              data: {
                members: [
                  {
                    user_id:
                      userId,
                  },
                ],

                custom: {
                  title:
                    "Cohiva Meeting",

                  cohiva_type:
                    "instant",

                  cohiva_permissions:
                    DEFAULT_COHIVA_PERMISSIONS,
                },
              },
            });
          } else {
            await streamCall.get();
          }

          if (
            cancelled
          ) {
            return;
          }

          setCall(
            streamCall
          );
        } catch (
          initializationError
        ) {
          console.error(
            "Meeting initialization error:",
            initializationError
          );

          if (
            cancelled
          ) {
            return;
          }

          setError(
            shouldCreate
              ? "Cohiva could not create this meeting."
              : "This meeting could not be found."
          );
        }
      };

    void initialize();

    /*
     * IMPORTANT:
     *
     * We intentionally DO NOT call
     * streamCall.leave() here.
     *
     * This effect can rerun during
     * React/Next development.
     *
     * Actual cleanup is handled by
     * the component-lifetime effect
     * above.
     */
    return () => {
      cancelled =
        true;
    };
  }, [
    client,
    callId,
    shouldCreate,
    userId,
  ]);

  /* =====================================================
     LOADING
  ===================================================== */

  if (
    !client ||
    !userId
  ) {
    return (
      <MeetingLoading
        text="Connecting to Cohiva..."
      />
    );
  }

  if (
    !call &&
    !error
  ) {
    return (
      <MeetingLoading
        text={
          shouldCreate
            ? "Creating your Cohiva room..."
            : "Finding your Cohiva room..."
        }
      />
    );
  }

  if (error) {
    return (
      <MeetingError
        message={
          error
        }
      />
    );
  }

  if (!call) {
    return null;
  }

  return (
    <StreamCall
      call={
        call
      }
    >
      <StreamTheme className="cohiva-stream-theme">

        <MeetingExperience
          callId={
            callId
          }
        />

      </StreamTheme>
    </StreamCall>
  );
};

export default MeetingRoom;

/* =========================================================
   MEETING EXPERIENCE
========================================================= */

const MeetingExperience = ({
  callId,
}: {
  callId: string;
}) => {
  const {
    useCallCallingState,
  } =
    useCallStateHooks();

  const callingState =
    useCallCallingState();

  if (
    callingState ===
    CallingState.JOINED
  ) {
    return (
      <LiveMeeting
        callId={
          callId
        }
      />
    );
  }

  return (
    <MeetingLobby
      callId={
        callId
      }
    />
  );
};

/* =========================================================
   LOBBY
========================================================= */

const MeetingLobby = ({
  callId,
}: {
  callId: string;
}) => {
  const router =
    useRouter();

  const call =
    useCall();

  const {
    useCameraState,
    useMicrophoneState,
    useCallCallingState,
  } =
    useCallStateHooks();

  const {
    camera,
    isMute:
      cameraOff,
  } =
    useCameraState();

  const {
    microphone,
    isMute:
      microphoneOff,
  } =
    useMicrophoneState();

  const callingState =
    useCallCallingState();

  const [
    error,
    setError,
  ] =
    useState("");

  const [
    copied,
    setCopied,
  ] =
    useState(false);

  const joining =
    callingState ===
    CallingState.JOINING;

  /* =====================================================
     CAMERA
  ===================================================== */

  const toggleCamera =
    async () => {
      try {
        setError("");

        await camera.toggle();
      } catch (
        cameraError
      ) {
        console.error(
          "Camera error:",
          cameraError
        );

        setError(
          "Cohiva could not access your camera."
        );
      }
    };

  /* =====================================================
     MICROPHONE
  ===================================================== */

  const toggleMicrophone =
    async () => {
      try {
        setError("");

        await microphone.toggle();
      } catch (
        microphoneError
      ) {
        console.error(
          "Microphone error:",
          microphoneError
        );

        setError(
          "Cohiva could not access your microphone."
        );
      }
    };

  /* =====================================================
     ENSURE MEMBERSHIP
  ===================================================== */

  const ensureMembership =
    async () => {
      const response =
        await fetch(
          "/api/meetings/member",
          {
            method:
              "POST",

            headers: {
              "Content-Type":
                "application/json",
            },

            body:
              JSON.stringify({
                callId,
              }),
          }
        );

      const data =
        await response.json();

      if (
        !response.ok
      ) {
        throw new Error(
          data.error ||
            "Unable to prepare classroom membership."
        );
      }
    };

  /* =====================================================
     JOIN
  ===================================================== */

  const joinMeeting =
    async () => {
      if (!call) {
        return;
      }

      /*
       * Prevent duplicate join attempts.
       */
      if (
        callingState ===
          CallingState.JOINED ||
        joining
      ) {
        return;
      }

      try {
        setError("");

        await ensureMembership();

        await call.join();
      } catch (
        joinError
      ) {
        console.error(
          "Join meeting error:",
          joinError
        );

        setError(
          joinError instanceof
            Error
            ? joinError.message
            : "Unable to join this meeting."
        );
      }
    };

  /* =====================================================
     COPY
  ===================================================== */

  const copyInvite =
    async () => {
      try {
        await navigator.clipboard.writeText(
          `${window.location.origin}/meeting/${callId}`
        );

        setCopied(
          true
        );

        window.setTimeout(
          () => {
            setCopied(
              false
            );
          },
          1800
        );
      } catch (
        copyError
      ) {
        console.error(
          "Copy invite error:",
          copyError
        );

        setError(
          "Unable to copy meeting link."
        );
      }
    };

  /* =====================================================
     LOBBY UI
  ===================================================== */

  return (
    <main className="flex h-dvh w-full items-center justify-center overflow-hidden bg-[#F9F0E0] p-4 lg:p-6">

      <div className="grid h-full max-h-[820px] w-full max-w-[1400px] overflow-hidden rounded-[30px] bg-[#FFF7EB] shadow-[0_30px_90px_rgba(61,55,50,0.16)] lg:grid-cols-[1.35fr_0.9fr]">

        {/* CAMERA */}

        <section className="relative min-h-0 overflow-hidden bg-[#302B27]">

          <div className="absolute left-5 top-5 z-30 rounded-full bg-[#CC3A63] px-4 py-2 text-[10px] font-black uppercase tracking-[0.18em] text-white">
            Cohiva Preview
          </div>

          <div className="cohiva-preview-video absolute inset-0">

            <VideoPreview />

          </div>

          {cameraOff && (
            <div className="absolute inset-0 z-20 flex items-center justify-center bg-[#302B27]">

              <div className="text-center">

                <div className="text-5xl">
                  📷
                </div>

                <p className="mt-4 text-xl font-black text-white">
                  Camera is off
                </p>

              </div>

            </div>
          )}

        </section>

        {/* SETTINGS */}

        <section className="flex min-h-0 flex-col justify-center overflow-hidden p-7 lg:p-10">

          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#A2AB73]">
            Ready to meet?
          </p>

          <h1 className="mt-2 text-3xl font-black text-[#3D3732]">
            Check yourself first ✨
          </h1>

          <p className="mt-3 text-sm leading-6 text-[#756E64]">
            Check your camera and microphone before entering.
          </p>

          <div className="mt-6 grid grid-cols-2 gap-3">

            <button
              type="button"
              onClick={
                toggleCamera
              }
              className="rounded-2xl bg-[#F9F0E0] p-4 text-sm font-bold text-[#3D3732]"
            >
              <span className="mb-1 block text-xl">
                {cameraOff
                  ? "📷"
                  : "🎥"}
              </span>

              {cameraOff
                ? "Camera off"
                : "Camera on"}
            </button>

            <button
              type="button"
              onClick={
                toggleMicrophone
              }
              className="rounded-2xl bg-[#F9F0E0] p-4 text-sm font-bold text-[#3D3732]"
            >
              <span className="mb-1 block text-xl">
                {microphoneOff
                  ? "🔇"
                  : "🎙"}
              </span>

              {microphoneOff
                ? "Mic off"
                : "Mic on"}
            </button>

          </div>

          {error && (
            <div className="mt-4 rounded-xl bg-[#CC3A63]/10 p-3 text-xs font-bold text-[#CC3A63]">
              {error}
            </div>
          )}

          <button
            type="button"
            onClick={
              joinMeeting
            }
            disabled={
              joining
            }
            className="mt-5 rounded-2xl bg-[#CC3A63] px-5 py-3.5 font-black text-white disabled:opacity-60"
          >
            {joining
              ? "Joining..."
              : "Join Meeting"}
          </button>

          <button
            type="button"
            onClick={
              copyInvite
            }
            className="mt-2 rounded-2xl bg-[#F9F0E0] px-5 py-3 text-sm font-bold text-[#3D3732]"
          >
            {copied
              ? "✓ Link copied"
              : "Copy invite link"}
          </button>

          <button
            type="button"
            onClick={() =>
              router.push("/")
            }
            className="mt-4 text-xs font-bold text-[#756E64]"
          >
            ← Back to dashboard
          </button>

        </section>

      </div>
    </main>
  );
};

/* =========================================================
   LIVE MEETING
========================================================= */

const LiveMeeting = ({
  callId,
}: {
  callId: string;
}) => {
  const router =
    useRouter();

  const call =
    useCall();

  const {
    useParticipantCount,
    useCallCustomData,
  } =
    useCallStateHooks();

  const participantCount =
    useParticipantCount();

  const custom =
    useCallCustomData();

  /* =====================================================
     COHIVA PERMISSIONS
  ===================================================== */

  const savedPermissions =
    custom?.cohiva_permissions as
      | Partial<CohivaPermissions>
      | undefined;

  const permissions:
    CohivaPermissions = {
    ...DEFAULT_COHIVA_PERMISSIONS,
    ...savedPermissions,
  };

  /* =====================================================
     UI STATE
  ===================================================== */

  const [
    activeView,
    setActiveView,
  ] =
    useState<MeetingView>(
      "video"
    );

  const [
    copied,
    setCopied,
  ] =
    useState(false);

  const [
    permissionsOpen,
    setPermissionsOpen,
  ] =
    useState(false);

  const isTeacher =
    Boolean(
      call?.isCreatedByMe
    );

  /*
   * Teacher always sees recording.
   *
   * Student only sees it if teacher
   * enabled the Cohiva recording option.
   */
  const showRecording =
    isTeacher ||
    permissions.studentRecording;

  /* =====================================================
     INVITE
  ===================================================== */

  const copyInvite =
    async () => {
      try {
        await navigator.clipboard.writeText(
          `${window.location.origin}/meeting/${callId}`
        );

        setCopied(
          true
        );

        window.setTimeout(
          () => {
            setCopied(
              false
            );
          },
          1800
        );
      } catch (
        copyError
      ) {
        console.error(
          "Invite copy error:",
          copyError
        );
      }
    };

  return (
    <main className="flex h-dvh w-full flex-col overflow-hidden bg-[#24211F] text-white">

      {/* =================================================
          HEADER
      ================================================= */}

      <header className="flex h-[64px] shrink-0 items-center justify-between gap-3 border-b border-white/10 bg-[#302B27] px-4 lg:px-6">

        {/* LEFT */}

        <div className="flex min-w-0 items-center gap-3">

          {/* TITLE */}

          <div className="min-w-0">

            <div className="flex items-center gap-2">

              <p className="truncate text-base font-black text-[#FFF7EB]">
                Cohiva Meeting
              </p>

              {isTeacher && (
                <span className="hidden rounded-full bg-[#CC3A63]/20 px-2 py-1 text-[8px] font-black uppercase tracking-wider text-[#F58BA8] md:inline">
                  Teacher
                </span>
              )}

            </div>

          </div>

          {/* PARTICIPANTS */}

          <div className="flex shrink-0 items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5">

            <span className="text-xs">
              👥
            </span>

            <span className="text-xs font-black">
              {participantCount}
            </span>

            <span className="hidden text-[10px] text-white/50 xl:inline">
              {participantCount ===
              1
                ? "participant"
                : "participants"}
            </span>

          </div>

          {/* VIEW SWITCH */}

          <div className="hidden shrink-0 rounded-xl bg-black/20 p-1 sm:flex">

            <button
              type="button"
              onClick={() =>
                setActiveView(
                  "video"
                )
              }
              className={`rounded-lg px-3 py-1.5 text-xs font-black transition ${
                activeView ===
                "video"
                  ? "bg-[#FFF7EB] text-[#403A35]"
                  : "text-white/60 hover:text-white"
              }`}
            >
              🎥 Video
            </button>

            <button
              type="button"
              onClick={() =>
                setActiveView(
                  "whiteboard"
                )
              }
              className={`rounded-lg px-3 py-1.5 text-xs font-black transition ${
                activeView ===
                "whiteboard"
                  ? "bg-[#A2AB73] text-white"
                  : "text-white/60 hover:text-white"
              }`}
            >
              ✏ Whiteboard
            </button>

          </div>

        </div>

        {/* =================================================
            RIGHT ACTIONS
        ================================================= */}

        <div className="flex shrink-0 items-center gap-2">

          {/* PERMISSIONS */}

          {isTeacher && (
            <button
              type="button"
              onClick={() =>
                setPermissionsOpen(
                  true
                )
              }
              className="rounded-lg bg-[#A2AB73]/20 px-3 py-2 text-xs font-black text-[#DCE3B4] transition hover:bg-[#A2AB73] hover:text-white"
            >
              ⚙
              <span className="ml-1 hidden lg:inline">
                Permissions
              </span>
            </button>
          )}

          {/* RECORD */}

          {showRecording && (
            <div className="cohiva-record-button">

              <RecordCallConfirmationButton
                caption="Record"
              />

            </div>
          )}

          {/* INVITE */}

          <button
            type="button"
            onClick={
              copyInvite
            }
            className="rounded-lg bg-white/10 px-3 py-2 text-xs font-black transition hover:bg-[#CC3A63]"
          >
            {copied
              ? "Copied ✓"
              : "Invite"}
          </button>

        </div>

      </header>

      {/* =================================================
          MOBILE VIEW SWITCH
      ================================================= */}

      <div className="flex h-[44px] shrink-0 items-center bg-[#302B27] px-3 sm:hidden">

        <div className="flex w-full rounded-xl bg-black/20 p-1">

          <button
            type="button"
            onClick={() =>
              setActiveView(
                "video"
              )
            }
            className={`flex-1 rounded-lg py-1.5 text-xs font-black ${
              activeView ===
              "video"
                ? "bg-[#FFF7EB] text-[#403A35]"
                : "text-white/60"
            }`}
          >
            🎥 Video
          </button>

          <button
            type="button"
            onClick={() =>
              setActiveView(
                "whiteboard"
              )
            }
            className={`flex-1 rounded-lg py-1.5 text-xs font-black ${
              activeView ===
              "whiteboard"
                ? "bg-[#A2AB73] text-white"
                : "text-white/60"
            }`}
          >
            ✏ Whiteboard
          </button>

        </div>

      </div>

      {/* =================================================
          WORKSPACE
      ================================================= */}

      <section className="min-h-0 flex-1 overflow-hidden p-2 sm:p-3">

        <div className="relative h-full w-full overflow-hidden rounded-[20px] bg-[#181614]">

          {/* VIDEO */}

          <div
            className={`absolute inset-0 min-h-0 overflow-hidden ${
              activeView ===
              "video"
                ? "visible opacity-100"
                : "invisible pointer-events-none opacity-0"
            }`}
          >
            <SpeakerLayout
              participantsBarPosition="right"
            />
          </div>

          {/* WHITEBOARD */}

          <div
            className={`absolute inset-0 min-h-0 overflow-hidden ${
              activeView ===
              "whiteboard"
                ? "visible opacity-100"
                : "invisible pointer-events-none opacity-0"
            }`}
          >
            <CohivaWhiteboard
              callId={
                callId
              }
            />
          </div>

        </div>

      </section>

      {/* =================================================
          CONTROLS
      ================================================= */}

      <footer className="flex h-[76px] shrink-0 items-center justify-center overflow-hidden border-t border-white/10 bg-[#302B27] px-3">

        <div className="max-w-full scale-[0.92] sm:scale-100">

          {/*
           * IMPORTANT:
           *
           * CallControls handles call.leave().
           *
           * onLeave only navigates afterwards.
           *
           * We do NOT call leave() again.
           */}

          <CallControls
            onLeave={(
              leaveError
            ) => {
              if (
                leaveError
              ) {
                console.error(
                  "Leave call error:",
                  leaveError
                );

                return;
              }

              router.push(
                "/"
              );
            }}
          />

        </div>

      </footer>

      {/* =================================================
          PERMISSIONS
      ================================================= */}

      <MeetingPermissionsPanel
        open={
          permissionsOpen
        }
        onClose={() =>
          setPermissionsOpen(
            false
          )
        }
      />

    </main>
  );
};

/* =========================================================
   LOADING
========================================================= */

const MeetingLoading = ({
  text,
}: {
  text: string;
}) => {
  return (
    <main className="flex h-dvh items-center justify-center overflow-hidden bg-[#F9F0E0]">

      <div className="text-center">

        <div className="mx-auto h-11 w-11 animate-spin rounded-full border-4 border-[#CC3A63]/20 border-t-[#CC3A63]" />

        <p className="mt-5 font-bold text-[#756E64]">
          {text}
        </p>

      </div>

    </main>
  );
};

/* =========================================================
   ERROR
========================================================= */

const MeetingError = ({
  message,
}: {
  message: string;
}) => {
  const router =
    useRouter();

  return (
    <main className="flex h-dvh items-center justify-center overflow-hidden bg-[#F9F0E0] p-5">

      <div className="max-w-md rounded-[28px] bg-[#FFF7EB] p-8 text-center shadow-lg">

        <div className="text-3xl">
          ⚠
        </div>

        <h1 className="mt-4 text-2xl font-black text-[#3D3732]">
          Meeting unavailable
        </h1>

        <p className="mt-3 text-[#756E64]">
          {message}
        </p>

        <button
          type="button"
          onClick={() =>
            router.push("/")
          }
          className="mt-6 rounded-2xl bg-[#CC3A63] px-6 py-3 font-bold text-white"
        >
          Return Home
        </button>

      </div>

    </main>
  );
};