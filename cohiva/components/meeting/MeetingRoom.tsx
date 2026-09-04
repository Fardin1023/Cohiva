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
  type CustomVideoEvent,
  type StreamVideoEvent,
} from "@stream-io/video-react-sdk";

import {
  useUser,
} from "@clerk/nextjs";

import {
  useRouter,
} from "next/navigation";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import CohivaWhiteboard from "./CohivaWhiteboard";

import MeetingPermissionsPanel, {
  DEFAULT_COHIVA_PERMISSIONS,
  type CohivaPermissions,
} from "./MeetingPermissionsPanel";

import MeetingParticipantsPanel from "./MeetingParticipantsPanel";

import MeetingChatPanel from "./MeetingChatPanel";

import MeetingAttendancePanel from "./MeetingAttendancePanel";

import MeetingJoinRequests from "./MeetingJoinRequests";

import MeetingAccessSettings from "./MeetingAccessSettings";

import type {
  MeetingAccessMode,
} from "./MeetingAccessSettings";

import MeetingAccessibilityPanel, {
  MeetingCaptionsOverlay,
  type AccessibilitySettings,
} from "./MeetingAccessibilityPanel";

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

type FloatingReaction = {
  id: string;
  emoji: string;
  name: string;
};

type AccessStatus =
  | "idle"
  | "requesting"
  | "waiting"
  | "approved"
  | "denied";

/* =========================================================
   MAIN ROOM
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

  const mountedRef =
    useRef(false);

  const cleanupTimerRef =
    useRef<
      ReturnType<
        typeof setTimeout
      > | null
    >(
      null
    );

  /* =====================================================
     COMPONENT LIFETIME
  ===================================================== */

  useEffect(() => {
    mountedRef.current =
      true;

    if (
      cleanupTimerRef.current
    ) {
      clearTimeout(
        cleanupTimerRef.current
      );

      cleanupTimerRef.current =
        null;
    }

    return () => {
      mountedRef.current =
        false;

      cleanupTimerRef.current =
        setTimeout(
          () => {
            if (
              mountedRef.current
            ) {
              return;
            }

            const currentCall =
              callRef.current;

            if (
              !currentCall ||
              currentCall.state
                .callingState ===
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
                      "Meeting cleanup error:",
                      cleanupError
                    );
                  }
                }
              );
          },
          5000
        );
    };
  }, []);

  /* =====================================================
     INITIALIZE CALL
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

    /* ===============================================
       REUSE EXISTING CALL
    =============================================== */

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

    /* ===============================================
       CLEAN PREVIOUS CALL
    =============================================== */

    const previousCall =
      callRef.current;

    if (
      previousCall &&
      previousCall.state
        .callingState !==
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
                "Previous call cleanup error:",
                leaveError
              );
            }
          }
        );
    }

    /* ===============================================
       CREATE CALL INSTANCE
    =============================================== */

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

    /* ===============================================
       INITIALIZE SERVER CALL
    =============================================== */

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
            !cancelled
          ) {
            setCall(
              streamCall
            );
          }
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
     RENDER STATES
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
   EXPERIENCE
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
   LOBBY + WAITING ROOM
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
    user,
  } =
    useUser();

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

  const teacher =
    Boolean(
      call?.isCreatedByMe
    );

  /* =====================================================
     UI STATE
  ===================================================== */

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

  const [
    accessStatus,
    setAccessStatus,
  ] =
    useState<AccessStatus>(
      "idle"
    );

  const [
    accessMode,
    setAccessMode,
  ] =
    useState<MeetingAccessMode>(
      "approval"
    );

  const [
    accessLoading,
    setAccessLoading,
  ] =
    useState(true);

  const joiningRef =
    useRef(false);

  /* =====================================================
     LOAD CURRENT ACCESS MODE
  ===================================================== */

  useEffect(() => {
    const loadAccess =
      async () => {
        try {
          const response =
            await fetch(
              `/api/meetings/access?callId=${encodeURIComponent(
                callId
              )}`,
              {
                method:
                  "GET",

                cache:
                  "no-store",
              }
            );

          const result =
            await response.json();

          if (
            !response.ok
          ) {
            throw new Error(
              result.error ||
                "Unable to load meeting access."
            );
          }

          setAccessMode(
            result.mode ??
            "approval"
          );
        } catch (
          loadError
        ) {
          console.error(
            "Load meeting access error:",
            loadError
          );

          /*
           * Safer default.
           */
          setAccessMode(
            "approval"
          );
        } finally {
          setAccessLoading(
            false
          );
        }
      };

    void loadAccess();
  }, [
    callId,
  ]);

  /* =====================================================
     APPROVED / DIRECT JOIN
  ===================================================== */

  const joinApproved =
    useCallback(
      async () => {
        if (
          !call ||
          joiningRef.current ||
          callingState ===
            CallingState.JOINED
        ) {
          return;
        }

        try {
          joiningRef.current =
            true;

          setAccessStatus(
            "approved"
          );

          setError(
            ""
          );

          await call.join();
        } catch (
          joinError
        ) {
          console.error(
            "Join meeting error:",
            joinError
          );

          joiningRef.current =
            false;

          setAccessStatus(
            "idle"
          );

          setError(
            joinError instanceof
              Error
              ? joinError.message
              : "Cohiva could not join this meeting."
          );
        }
      },
      [
        call,
        callingState,
      ]
    );

  /* =====================================================
     PREPARE OPEN MEETING USER

     Server checks access mode again
     and adds user as a Stream member.
  ===================================================== */

  const prepareOpenJoin =
    useCallback(
      async () => {
        const response =
          await fetch(
            "/api/meetings/access",
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

                  action:
                    "prepare-open-join",
                }),
            }
          );

        const result =
          await response.json();

        if (
          !response.ok
        ) {
          throw new Error(
            result.error ||
              "Unable to enter this meeting."
          );
        }
      },
      [
        callId,
      ]
    );

  /* =====================================================
     WAITING ROOM POLLING
  ===================================================== */

  useEffect(() => {
    if (
      teacher ||
      accessStatus !==
        "waiting"
    ) {
      return;
    }

    const checkStatus =
      async () => {
        try {
          const response =
            await fetch(
              `/api/meetings/join-request?callId=${encodeURIComponent(
                callId
              )}`,
              {
                cache:
                  "no-store",
              }
            );

          const result =
            await response.json();

          if (
            !response.ok
          ) {
            return;
          }

          /* ===========================================
             HOST CHANGED MEETING TO OPEN
          =========================================== */

          if (
            result.accessMode ===
            "open"
          ) {
            setAccessMode(
              "open"
            );

            await prepareOpenJoin();

            await joinApproved();

            return;
          }

          /* ===========================================
             HOST LOCKED MEETING
          =========================================== */

          if (
            result.accessMode ===
            "locked"
          ) {
            setAccessMode(
              "locked"
            );

            setAccessStatus(
              "idle"
            );

            setError(
              "The host locked this meeting."
            );

            return;
          }

          /* ===========================================
             APPROVED
          =========================================== */

          if (
            result.status ===
            "approved"
          ) {
            await joinApproved();

            return;
          }

          /* ===========================================
             DENIED
          =========================================== */

          if (
            result.status ===
            "denied"
          ) {
            setAccessStatus(
              "denied"
            );

            setError(
              ""
            );
          }
        } catch (
          pollError
        ) {
          console.error(
            "Waiting room status error:",
            pollError
          );
        }
      };

    void checkStatus();

    const timer =
      window.setInterval(
        () => {
          void checkStatus();
        },
        1200
      );

    return () => {
      window.clearInterval(
        timer
      );
    };
  }, [
    accessStatus,
    callId,
    teacher,
    joinApproved,
    prepareOpenJoin,
  ]);

  /* =====================================================
     DEVICE CONTROLS
  ===================================================== */

  const toggleCamera =
    async () => {
      try {
        setError(
          ""
        );

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

  const toggleMicrophone =
    async () => {
      try {
        setError(
          ""
        );

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
     JOIN / REQUEST ACCESS
  ===================================================== */

  const joinMeeting =
    async () => {
      if (
        !call ||
        !user
      ) {
        return;
      }

      /* ===============================================
         TEACHER ENTERS DIRECTLY
      =============================================== */

      if (teacher) {
        await joinApproved();

        return;
      }

      try {
        setError(
          ""
        );

        setAccessStatus(
          "requesting"
        );

        /* =============================================
           REFRESH ACCESS MODE BEFORE ENTERING
        ============================================= */

        const accessResponse =
          await fetch(
            `/api/meetings/access?callId=${encodeURIComponent(
              callId
            )}`,
            {
              cache:
                "no-store",
            }
          );

        const accessResult =
          await accessResponse.json();

        if (
          !accessResponse.ok
        ) {
          throw new Error(
            accessResult.error ||
              "Unable to check meeting access."
          );
        }

        const latestMode:
          MeetingAccessMode =
          accessResult.mode ??
          "approval";

        setAccessMode(
          latestMode
        );

        /* =============================================
           OPEN
        ============================================= */

        if (
          latestMode ===
          "open"
        ) {
          await prepareOpenJoin();

          await joinApproved();

          return;
        }

        /* =============================================
           LOCKED
        ============================================= */

        if (
          latestMode ===
          "locked"
        ) {
          setAccessStatus(
            "idle"
          );

          setError(
            "This meeting is currently locked by the host."
          );

          return;
        }

        /* =============================================
           APPROVAL REQUIRED
        ============================================= */

        const response =
          await fetch(
            "/api/meetings/join-request",
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

                  action:
                    "request",

                  name:
                    user.fullName ||
                    user.username ||
                    user.firstName ||
                    "Participant",

                  image:
                    user.imageUrl ||
                    "",
                }),
            }
          );

        const result =
          await response.json();

        if (
          !response.ok
        ) {
          throw new Error(
            result.error ||
              "Unable to process join request."
          );
        }

        if (
          result.status ===
          "approved"
        ) {
          await joinApproved();

          return;
        }

        if (
          result.status ===
          "open"
        ) {
          await prepareOpenJoin();

          await joinApproved();

          return;
        }

        setAccessStatus(
          "waiting"
        );
      } catch (
        requestError
      ) {
        console.error(
          "Meeting access request error:",
          requestError
        );

        setAccessStatus(
          "idle"
        );

        setError(
          requestError instanceof
            Error
            ? requestError.message
            : "Unable to request access."
        );
      }
    };

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
          "Copy invite error:",
          copyError
        );

        setError(
          "Unable to copy meeting link."
        );
      }
    };

  const waiting =
    accessStatus ===
    "waiting";

  const requesting =
    accessStatus ===
    "requesting";

  /* =====================================================
     UI
  ===================================================== */

  return (
    <main className="flex h-dvh w-full items-center justify-center overflow-hidden bg-[#F9F0E0] p-4 lg:p-6">

      <div className="grid h-full max-h-[850px] w-full max-w-[1450px] overflow-hidden rounded-[30px] bg-[#FFF7EB] shadow-[0_30px_90px_rgba(61,55,50,0.16)] lg:grid-cols-[1.15fr_0.9fr]">

        {/* =================================================
            CAMERA PREVIEW
        ================================================= */}

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

        {/* =================================================
            LOBBY OPTIONS
        ================================================= */}

        <section className="flex min-h-0 flex-col overflow-y-auto p-6 lg:p-8">

          <div className="my-auto">

            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#A2AB73]">
              Ready to meet?
            </p>

            <h1 className="mt-2 text-3xl font-black text-[#3D3732]">
              {teacher
                ? "Start your classroom ✨"
                : "Join the classroom ✨"}
            </h1>

            {/* =============================================
                STUDENT ACCESS MESSAGE
            ============================================= */}

            {!teacher && (
              <p className="mt-3 text-sm leading-6 text-[#756E64]">
                {accessLoading
                  ? "Checking meeting access..."
                  : accessMode ===
                      "open"
                    ? "This meeting is open. You can join immediately."
                    : accessMode ===
                        "locked"
                      ? "The host is not allowing new participants right now."
                      : "The teacher will be notified and must approve your request."}
              </p>
            )}

            {/* =============================================
                TEACHER ACCESS SETTINGS
            ============================================= */}

            {teacher && (
              <div className="mt-5">

                <MeetingAccessSettings
                  callId={
                    callId
                  }
                />

              </div>
            )}

            {/* =============================================
                CAMERA + MICROPHONE
            ============================================= */}

            <div className="mt-5 grid grid-cols-2 gap-3">

              <button
                type="button"
                onClick={() =>
                  void toggleCamera()
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
                onClick={() =>
                  void toggleMicrophone()
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

            {/* =============================================
                WAITING
            ============================================= */}

            {waiting && (
              <div
                role="status"
                aria-live="polite"
                className="mt-4 rounded-2xl bg-[#A2AB73]/15 p-4 text-center"
              >

                <div className="text-2xl">
                  ⏳
                </div>

                <p className="mt-2 font-black text-[#3D3732]">
                  Waiting for the teacher
                </p>

                <p className="mt-1 text-xs leading-5 text-[#756E64]">
                  Your request has been sent. Cohiva will automatically enter the meeting after approval.
                </p>

              </div>
            )}

            {/* =============================================
                DENIED
            ============================================= */}

            {accessStatus ===
              "denied" && (
              <div className="mt-4 rounded-2xl bg-[#CC3A63]/10 p-4 text-center">

                <p className="font-black text-[#CC3A63]">
                  Access was not approved
                </p>

                <p className="mt-1 text-xs text-[#756E64]">
                  You may send another request if needed.
                </p>

              </div>
            )}

            {/* =============================================
                ERROR
            ============================================= */}

            {error && (
              <div className="mt-4 rounded-xl bg-[#CC3A63]/10 p-3 text-xs font-bold text-[#CC3A63]">
                {error}
              </div>
            )}

            {/* =============================================
                JOIN BUTTON
            ============================================= */}

            {!waiting && (
              <button
                type="button"
                onClick={() =>
                  void joinMeeting()
                }
                disabled={
                  accessLoading ||
                  requesting ||
                  (!teacher &&
                    accessMode ===
                      "locked") ||
                  callingState ===
                    CallingState.JOINING
                }
                className="mt-5 w-full rounded-2xl bg-[#CC3A63] px-5 py-3.5 font-black text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                {requesting
                  ? "Sending request..."
                  : teacher
                    ? "Join Meeting"
                    : accessMode ===
                        "open"
                      ? "Join Meeting"
                      : accessMode ===
                          "locked"
                        ? "Meeting Locked"
                        : accessStatus ===
                            "denied"
                          ? "Request Again"
                          : "Ask to Join"}
              </button>
            )}

            {/* =============================================
                COPY LINK
            ============================================= */}

            <button
              type="button"
              onClick={() =>
                void copyInvite()
              }
              className="mt-2 w-full rounded-2xl bg-[#F9F0E0] px-5 py-3 text-sm font-bold text-[#3D3732]"
            >
              {copied
                ? "✓ Link copied"
                : "Copy invite link"}
            </button>

            {/* =============================================
                BACK
            ============================================= */}

            <button
              type="button"
              onClick={() =>
                router.push(
                  "/"
                )
              }
              className="mt-4 w-full text-xs font-bold text-[#756E64]"
            >
              ← Back to dashboard
            </button>

          </div>

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
    user,
  } =
    useUser();

  const userId =
    user?.id;

  const userName =
    user?.fullName ||
    user?.username ||
    user?.firstName ||
    "Participant";

  const userImage =
    user?.imageUrl ||
    "";

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
     CLASS PERMISSIONS
  ===================================================== */

  const storedPermissions =
    custom?.cohiva_permissions as
      | Partial<CohivaPermissions>
      | undefined;

  const permissions:
    CohivaPermissions = {
    ...DEFAULT_COHIVA_PERMISSIONS,

    ...storedPermissions,

    /*
     * Always teacher-only.
     */
    studentRecording:
      false,
  };

  const teacher =
    Boolean(
      call?.isCreatedByMe
    );

  /* =====================================================
     VIEW STATE
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

  const [
    participantsOpen,
    setParticipantsOpen,
  ] =
    useState(false);

  const [
    chatOpen,
    setChatOpen,
  ] =
    useState(false);

  const [
    attendanceOpen,
    setAttendanceOpen,
  ] =
    useState(false);

  const [
    accessibilityOpen,
    setAccessibilityOpen,
  ] =
    useState(false);

  const [
    reactionMenuOpen,
    setReactionMenuOpen,
  ] =
    useState(false);

  const [
    myHandRaised,
    setMyHandRaised,
  ] =
    useState(false);

  const [
    raisedHands,
    setRaisedHands,
  ] =
    useState<
      Set<string>
    >(
      new Set()
    );

  const [
    floatingReactions,
    setFloatingReactions,
  ] =
    useState<
      FloatingReaction[]
    >(
      []
    );

  const [
    announcement,
    setAnnouncement,
  ] =
    useState("");

  /* =====================================================
     ACCESSIBILITY STATE
  ===================================================== */

  const [
    accessibility,
    setAccessibility,
  ] =
    useState<AccessibilitySettings>({
      captionsVisible:
        false,

      captionSize:
        "medium",

      highContrast:
        false,

      reduceMotion:
        false,

      hideReactions:
        false,
    });

  /* =====================================================
     LOAD ACCESSIBILITY SETTINGS
  ===================================================== */

  useEffect(() => {
    try {
      const saved =
        window.localStorage.getItem(
          "cohiva-accessibility"
        );

      if (!saved) {
        return;
      }

      const parsed =
        JSON.parse(
          saved
        );

      setAccessibility(
        (
          current
        ) => ({
          ...current,

          ...parsed,
        })
      );
    } catch (
      accessibilityError
    ) {
      console.error(
        "Accessibility settings load error:",
        accessibilityError
      );
    }
  }, []);

  /* =====================================================
     SAVE ACCESSIBILITY SETTINGS
  ===================================================== */

  useEffect(() => {
    try {
      window.localStorage.setItem(
        "cohiva-accessibility",

        JSON.stringify(
          accessibility
        )
      );
    } catch (
      accessibilityError
    ) {
      console.error(
        "Accessibility settings save error:",
        accessibilityError
      );
    }
  }, [
    accessibility,
  ]);

  /* =====================================================
     ATTENDANCE
  ===================================================== */

  useEffect(() => {
    if (!userId) {
      return;
    }

    let leaveSent =
      false;

    const attendanceBody = {
      callId,

      name:
        userName,

      image:
        userImage,
    };

    /* JOIN */

    void fetch(
      "/api/meetings/attendance",
      {
        method:
          "POST",

        headers: {
          "Content-Type":
            "application/json",
        },

        body:
          JSON.stringify({
            ...attendanceBody,

            action:
              "join",
          }),
      }
    ).catch(
      (
        attendanceError
      ) => {
        console.error(
          "Attendance join error:",
          attendanceError
        );
      }
    );

    /* LEAVE */

    const sendLeave =
      () => {
        if (
          leaveSent
        ) {
          return;
        }

        leaveSent =
          true;

        void fetch(
          "/api/meetings/attendance",
          {
            method:
              "POST",

            headers: {
              "Content-Type":
                "application/json",
            },

            body:
              JSON.stringify({
                ...attendanceBody,

                action:
                  "leave",
              }),

            keepalive:
              true,
          }
        ).catch(
          (
            attendanceError
          ) => {
            console.error(
              "Attendance leave error:",
              attendanceError
            );
          }
        );
      };

    return () => {
      sendLeave();
    };
  }, [
    callId,
    userId,
    userName,
    userImage,
  ]);

  /* =====================================================
     CLASSROOM EVENT SENDER
  ===================================================== */

  const sendClassroomEvent =
    useCallback(
      async (
        body:
          Record<
            string,
            unknown
          >
      ) => {
        const response =
          await fetch(
            "/api/meetings/classroom-event",
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

                  senderName:
                    userName,

                  senderImage:
                    userImage,

                  ...body,
                }),
            }
          );

        const result =
          await response
            .json()
            .catch(
              () =>
                null
            );

        if (
          !response.ok
        ) {
          throw new Error(
            result?.error ||
              "Unable to send classroom event."
          );
        }
      },
      [
        callId,
        userName,
        userImage,
      ]
    );

  /* =====================================================
     RECEIVE HAND + REACTION EVENTS
  ===================================================== */

  useEffect(() => {
    if (!call) {
      return;
    }

    const unsubscribe =
      call.on(
        "custom",
        (
          event:
            StreamVideoEvent
        ) => {
          const customEvent =
            event as
              CustomVideoEvent;

          const payload =
            customEvent.custom as
              Record<
                string,
                unknown
              >;

          if (
            payload.type !==
            "cohiva-classroom"
          ) {
            return;
          }

          const senderId =
            payload.senderId;

          if (
            typeof senderId !==
            "string"
          ) {
            return;
          }

          /* ===========================================
             HAND
          =========================================== */

          if (
            payload.action ===
            "hand"
          ) {
            const raised =
              payload.raised ===
              true;

            setRaisedHands(
              (
                current
              ) => {
                const next =
                  new Set(
                    current
                  );

                if (
                  raised
                ) {
                  next.add(
                    senderId
                  );
                } else {
                  next.delete(
                    senderId
                  );
                }

                return next;
              }
            );

            if (
              senderId ===
              userId
            ) {
              setMyHandRaised(
                raised
              );
            }

            const name =
              typeof payload.senderName ===
              "string"
                ? payload.senderName
                : "Participant";

            setAnnouncement(
              raised
                ? `${name} raised their hand`
                : `${name} lowered their hand`
            );

            return;
          }

          /* ===========================================
             REACTION
          =========================================== */

          if (
            payload.action ===
              "reaction" &&
            typeof payload.emoji ===
              "string"
          ) {
            const reaction:
              FloatingReaction = {
              id:
                typeof payload.eventId ===
                "string"
                  ? payload.eventId
                  : crypto.randomUUID(),

              emoji:
                payload.emoji,

              name:
                typeof payload.senderName ===
                "string"
                  ? payload.senderName
                  : "Participant",
            };

            setAnnouncement(
              `${reaction.name} reacted ${reaction.emoji}`
            );

            setFloatingReactions(
              (
                current
              ) => [
                ...current.slice(
                  -5
                ),

                reaction,
              ]
            );

            window.setTimeout(
              () => {
                setFloatingReactions(
                  (
                    current
                  ) =>
                    current.filter(
                      (
                        item
                      ) =>
                        item.id !==
                        reaction.id
                    )
                );
              },
              3000
            );
          }
        }
      );

    /* =================================================
       REMOVE HAND WHEN PARTICIPANT LEAVES
    ================================================= */

    const unsubscribeParticipantLeft =
      call.on(
        "call.session_participant_left",
        (
          event
        ) => {
          const leavingUserId =
            event.participant
              .user.id;

          setRaisedHands(
            (
              current
            ) => {
              const next =
                new Set(
                  current
                );

              next.delete(
                leavingUserId
              );

              return next;
            }
          );
        }
      );

    return () => {
      unsubscribe();

      unsubscribeParticipantLeft();
    };
  }, [
    call,
    userId,
  ]);

  /* =====================================================
     CALL ENDED
  ===================================================== */

  useEffect(() => {
    if (!call) {
      return;
    }

    const unsubscribe =
      call.on(
        "call.ended",
        () => {
          router.push(
            "/"
          );
        }
      );

    return () => {
      unsubscribe();
    };
  }, [
    call,
    router,
  ]);

  /* =====================================================
     RAISE / LOWER HAND
  ===================================================== */

  const toggleHand =
    useCallback(
      async () => {
        const next =
          !myHandRaised;

        setMyHandRaised(
          next
        );

        try {
          await sendClassroomEvent({
            action:
              "hand",

            raised:
              next,
          });
        } catch (
          handError
        ) {
          console.error(
            "Raise hand error:",
            handError
          );

          setMyHandRaised(
            !next
          );
        }
      },
      [
        myHandRaised,
        sendClassroomEvent,
      ]
    );

  /* =====================================================
     REACTION
  ===================================================== */

  const sendReaction =
    async (
      emoji:
        string
    ) => {
      setReactionMenuOpen(
        false
      );

      try {
        await sendClassroomEvent({
          action:
            "reaction",

          emoji,
        });
      } catch (
        reactionError
      ) {
        console.error(
          "Reaction error:",
          reactionError
        );
      }
    };

  /* =====================================================
     KEYBOARD SHORTCUTS
  ===================================================== */

  useEffect(() => {
    if (!call) {
      return;
    }

    const onKeyDown =
      (
        event:
          KeyboardEvent
      ) => {
        const target =
          event.target as
            HTMLElement | null;

        /*
         * Never trigger shortcuts while
         * typing in chat/forms.
         */
        if (
          target?.tagName ===
            "INPUT" ||
          target?.tagName ===
            "TEXTAREA" ||
          target?.isContentEditable
        ) {
          return;
        }

        if (
          !event.altKey
        ) {
          return;
        }

        const key =
          event.key.toLowerCase();

        /* MIC */

        if (
          key ===
          "m"
        ) {
          event.preventDefault();

          void call.microphone
            .toggle()
            .catch(
              (
                shortcutError
              ) => {
                console.error(
                  "Mic shortcut error:",
                  shortcutError
                );
              }
            );
        }

        /* CAMERA */

        if (
          key ===
          "v"
        ) {
          event.preventDefault();

          void call.camera
            .toggle()
            .catch(
              (
                shortcutError
              ) => {
                console.error(
                  "Camera shortcut error:",
                  shortcutError
                );
              }
            );
        }

        /* CHAT */

        if (
          key ===
          "c"
        ) {
          event.preventDefault();

          setChatOpen(
            (
              current
            ) =>
              !current
          );
        }

        /* PARTICIPANTS */

        if (
          key ===
          "p"
        ) {
          event.preventDefault();

          setParticipantsOpen(
            (
              current
            ) =>
              !current
          );
        }

        /* HAND */

        if (
          key ===
          "h"
        ) {
          event.preventDefault();

          void toggleHand();
        }

        /* VIDEO / WHITEBOARD */

        if (
          key ===
          "w"
        ) {
          event.preventDefault();

          setActiveView(
            (
              current
            ) =>
              current ===
              "video"
                ? "whiteboard"
                : "video"
          );
        }

        /* ACCESSIBILITY */

        if (
          key ===
          "a"
        ) {
          event.preventDefault();

          setAccessibilityOpen(
            (
              current
            ) =>
              !current
          );
        }
      };

    window.addEventListener(
      "keydown",
      onKeyDown
    );

    return () => {
      window.removeEventListener(
        "keydown",
        onKeyDown
      );
    };
  }, [
    call,
    toggleHand,
  ]);

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

  /* =====================================================
     UI
  ===================================================== */

  return (
    <main
      className={`cohiva-meeting-root flex h-dvh w-full flex-col overflow-hidden bg-[#24211F] text-white ${
        accessibility.highContrast
          ? "contrast-125"
          : ""
      }`}
    >

      {/* =================================================
          REDUCE MOTION
      ================================================= */}

      {accessibility.reduceMotion && (
        <style>
          {`
            .cohiva-meeting-root *,
            .cohiva-meeting-root *::before,
            .cohiva-meeting-root *::after {
              animation-duration: 0.001ms !important;
              animation-iteration-count: 1 !important;
              transition-duration: 0.001ms !important;
              scroll-behavior: auto !important;
            }
          `}
        </style>
      )}

      {/* =================================================
          SCREEN READER ANNOUNCEMENTS
      ================================================= */}

      <div
        className="sr-only"
        aria-live="polite"
        aria-atomic="true"
      >
        {announcement}
      </div>

      {/* =================================================
          HEADER
      ================================================= */}

      <header className="flex h-[64px] shrink-0 items-center justify-between gap-2 border-b border-white/10 bg-[#302B27] px-3 lg:px-5">

        {/* LEFT */}

        <div className="flex min-w-0 items-center gap-2">

          <p className="hidden truncate text-base font-black md:block">
            Cohiva Meeting
          </p>

          {teacher && (
            <span className="hidden rounded-full bg-[#CC3A63]/20 px-2 py-1 text-[8px] font-black uppercase tracking-wide text-[#F58BA8] xl:inline">
              Teacher
            </span>
          )}

          {/* PARTICIPANTS */}

          <button
            type="button"
            aria-label={`${participantCount} participants`}
            onClick={() =>
              setParticipantsOpen(
                true
              )
            }
            className="relative flex shrink-0 items-center gap-1.5 rounded-lg bg-white/10 px-3 py-2 text-xs font-black hover:bg-[#A2AB73]/20"
          >
            👥

            <span>
              {participantCount}
            </span>

            {raisedHands.size >
              0 && (
              <span className="absolute -right-2 -top-2 rounded-full bg-[#FACC15] px-1.5 py-0.5 text-[8px] text-[#403A35]">
                ✋ {raisedHands.size}
              </span>
            )}
          </button>

          {/* VIEW SWITCH */}

          <div className="hidden shrink-0 rounded-xl bg-black/20 p-1 sm:flex">

            <button
              type="button"
              onClick={() =>
                setActiveView(
                  "video"
                )
              }
              className={`rounded-lg px-3 py-1.5 text-xs font-black ${
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
              className={`rounded-lg px-3 py-1.5 text-xs font-black ${
                activeView ===
                "whiteboard"
                  ? "bg-[#A2AB73] text-white"
                  : "text-white/60"
              }`}
            >
              ✏ Board
            </button>

          </div>

        </div>

        {/* RIGHT */}

        <div className="flex shrink-0 items-center gap-1.5">

          {/* CHAT */}

          <button
            type="button"
            aria-label="Open class chat"
            onClick={() =>
              setChatOpen(
                true
              )
            }
            className="rounded-lg bg-white/10 px-3 py-2 text-xs font-black hover:bg-[#A2AB73]/20"
          >
            💬
          </button>

          {/* HAND */}

          <button
            type="button"
            aria-pressed={
              myHandRaised
            }
            aria-label={
              myHandRaised
                ? "Lower hand"
                : "Raise hand"
            }
            onClick={() =>
              void toggleHand()
            }
            className={`rounded-lg px-3 py-2 text-xs font-black ${
              myHandRaised
                ? "bg-[#FACC15] text-[#403A35]"
                : "bg-white/10"
            }`}
          >
            ✋
          </button>

          {/* REACTIONS */}

          <div className="relative">

            <button
              type="button"
              aria-label="Reactions"
              aria-expanded={
                reactionMenuOpen
              }
              onClick={() =>
                setReactionMenuOpen(
                  (
                    current
                  ) =>
                    !current
                )
              }
              className="rounded-lg bg-white/10 px-3 py-2 text-xs"
            >
              😀
            </button>

            {reactionMenuOpen && (
              <div className="absolute right-0 top-[44px] z-[100] flex gap-1 rounded-2xl bg-[#FFF7EB] p-2 shadow-xl">

                {[
                  "👍",
                  "👏",
                  "❤️",
                  "😂",
                  "🎉",
                ].map(
                  (
                    emoji
                  ) => (
                    <button
                      key={
                        emoji
                      }
                      type="button"
                      aria-label={`React ${emoji}`}
                      onClick={() =>
                        void sendReaction(
                          emoji
                        )
                      }
                      className="flex h-10 w-10 items-center justify-center rounded-xl text-xl hover:bg-[#F9F0E0]"
                    >
                      {emoji}
                    </button>
                  )
                )}

              </div>
            )}

          </div>

          {/* ACCESSIBILITY */}

          <button
            type="button"
            aria-label="Accessibility settings"
            onClick={() =>
              setAccessibilityOpen(
                true
              )
            }
            className="rounded-lg bg-white/10 px-3 py-2 text-xs font-black"
          >
            ♿
          </button>

          {/* ATTENDANCE */}

          {teacher && (
            <button
              type="button"
              aria-label="Attendance"
              onClick={() =>
                setAttendanceOpen(
                  true
                )
              }
              className="rounded-lg bg-white/10 px-3 py-2 text-xs"
            >
              📋
            </button>
          )}

          {/* SETTINGS */}

          {teacher && (
            <button
              type="button"
              aria-label="Meeting settings"
              onClick={() =>
                setPermissionsOpen(
                  true
                )
              }
              className="rounded-lg bg-[#A2AB73]/20 px-3 py-2 text-xs font-black text-[#DCE3B4]"
            >
              ⚙
            </button>
          )}

          {/* RECORDING — TEACHER ONLY */}

          {teacher && (
            <div className="cohiva-record-button">

              <RecordCallConfirmationButton
                caption="Record"
              />

            </div>
          )}

          {/* INVITE */}

          <button
            type="button"
            onClick={() =>
              void copyInvite()
            }
            className="rounded-lg bg-white/10 px-3 py-2 text-xs font-black"
          >
            {copied
              ? "✓"
              : "Invite"}
          </button>

        </div>

      </header>

      {/* =================================================
          MOBILE VIDEO/BOARD SWITCH
      ================================================= */}

      <div className="flex h-[44px] shrink-0 bg-[#302B27] px-3 sm:hidden">

        <div className="flex w-full rounded-xl bg-black/20 p-1">

          <button
            type="button"
            onClick={() =>
              setActiveView(
                "video"
              )
            }
            className={`flex-1 rounded-lg text-xs font-black ${
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
            className={`flex-1 rounded-lg text-xs font-black ${
              activeView ===
                "whiteboard"
                ? "bg-[#A2AB73]"
                : "text-white/60"
            }`}
          >
            ✏ Board
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
            className={`absolute inset-0 min-h-0 overflow-hidden transition-opacity ${
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
            className={`absolute inset-0 min-h-0 overflow-hidden transition-opacity ${
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

          {/* CAPTIONS */}

          <MeetingCaptionsOverlay
            visible={
              accessibility.captionsVisible
            }
            size={
              accessibility.captionSize
            }
          />

          {/* REACTIONS */}

          {!accessibility.hideReactions && (
            <div className="pointer-events-none absolute inset-x-0 bottom-6 z-50 flex flex-col items-center gap-2">

              {floatingReactions.map(
                (
                  reaction
                ) => (
                  <div
                    key={
                      reaction.id
                    }
                    className="rounded-full bg-[#FFF7EB] px-4 py-2 text-sm font-black text-[#403A35] shadow-xl"
                  >

                    <span className="mr-2 text-xl">
                      {reaction.emoji}
                    </span>

                    {reaction.name}

                  </div>
                )
              )}

            </div>
          )}

        </div>

      </section>

      {/* =================================================
          CALL CONTROLS
      ================================================= */}

      <footer className="flex h-[76px] shrink-0 items-center justify-center overflow-hidden border-t border-white/10 bg-[#302B27] px-3">

        <div className="max-w-full scale-[0.92] sm:scale-100">

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
          WAITING ROOM REQUESTS
      ================================================= */}

      {teacher && (
        <MeetingJoinRequests
          callId={
            callId
          }
        />
      )}

      {/* =================================================
          MEETING SETTINGS
      ================================================= */}

      <MeetingPermissionsPanel
        callId={
          callId
        }
        open={
          permissionsOpen
        }
        onClose={() =>
          setPermissionsOpen(
            false
          )
        }
      />

      {/* =================================================
          PARTICIPANTS
      ================================================= */}

      <MeetingParticipantsPanel
        open={
          participantsOpen
        }
        onClose={() =>
          setParticipantsOpen(
            false
          )
        }
        raisedHands={
          raisedHands
        }
        classPermissions={
          permissions
        }
      />

      {/* =================================================
          CHAT
      ================================================= */}

      <MeetingChatPanel
        open={
          chatOpen
        }
        onClose={() =>
          setChatOpen(
            false
          )
        }
        callId={
          callId
        }
      />

      {/* =================================================
          ATTENDANCE
      ================================================= */}

      {teacher && (
        <MeetingAttendancePanel
          open={
            attendanceOpen
          }
          onClose={() =>
            setAttendanceOpen(
              false
            )
          }
          callId={
            callId
          }
        />
      )}

      {/* =================================================
          ACCESSIBILITY
      ================================================= */}

      <MeetingAccessibilityPanel
        open={
          accessibilityOpen
        }
        onClose={() =>
          setAccessibilityOpen(
            false
          )
        }
        settings={
          accessibility
        }
        onChange={
          setAccessibility
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
            router.push(
              "/"
            )
          }
          className="mt-6 rounded-2xl bg-[#CC3A63] px-6 py-3 font-bold text-white"
        >
          Return Home
        </button>

      </div>

    </main>
  );
};