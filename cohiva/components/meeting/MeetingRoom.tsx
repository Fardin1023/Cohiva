"use client";

import {
  CallingState,
  CallControls,
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

import { useUser } from "@clerk/nextjs";
import { useRouter } from "next/navigation";

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

import MeetingAccessibilityPanel, {
  MeetingCaptionsOverlay,
  type AccessibilitySettings,
} from "./MeetingAccessibilityPanel";

import {
  CohivaParticipantBarUI,
  CohivaParticipantSpotlightUI,
} from "./CohivaParticipantViewUI";

import {
  CohivaRecordingControl,
  CohivaRecordingEvents,
  CohivaRecordingIndicator,
} from "./CohivaRecordingControl";

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

type MeetingAccessMode =
  | "open"
  | "approval"
  | "locked";

type AccessStatus =
  | "idle"
  | "requesting"
  | "waiting"
  | "approved"
  | "denied";

type FloatingReaction = {
  id: string;
  emoji: string;
  name: string;
};

type ChatNotification = {
  senderId: string;
  senderName: string;
  senderImage: string;
  text: string;
};

type RaisedHandInfo = {
  userId: string;
  name: string;
  image: string;
  raisedAt: string;
};

type HandNotification = {
  userId: string;
  name: string;
  image: string;
};

/* =========================================================
   CONFIG
========================================================= */

const ACCESS_KEY =
  "cohiva_access_mode";

/* =========================================================
   HELPERS
========================================================= */

const normalizeAccessMode = (
  value: unknown
): MeetingAccessMode => {
  if (
    value === "open" ||
    value === "approval" ||
    value === "locked"
  ) {
    return value;
  }

  return "approval";
};

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
    >(null);

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

    /*
     * Reuse the exact same Stream call
     * on ordinary React rerenders.
     */

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

    /*
     * Clean up a previous different call.
     */

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
                "Previous meeting cleanup error:",
                leaveError
              );
            }
          }
        );
    }

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

    const initialize =
      async () => {
        try {
          setError("");

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

                  [ACCESS_KEY]:
                    "approval",

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

  if (
    error
  ) {
    return (
      <MeetingError
        message={
          error
        }
      />
    );
  }

  if (
    !call
  ) {
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

   Either lobby OR live meeting.
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
   MEETING LOBBY
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
    useCallCustomData,
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

  const custom =
    useCallCustomData();

  const accessMode =
    normalizeAccessMode(
      custom?.[
        ACCESS_KEY
      ]
    );

  const teacher =
    Boolean(
      call?.isCreatedByMe
    );

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

  const joiningRef =
    useRef(false);

  /* =====================================================
     ENSURE MEMBERSHIP
  ===================================================== */

  const ensureMembership =
    useCallback(
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

        const result =
          await response.json();

        if (
          !response.ok
        ) {
          throw new Error(
            result.error ||
              "Unable to prepare meeting membership."
          );
        }
      },
      [
        callId,
      ]
    );

  /* =====================================================
     JOIN APPROVED
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

          setError("");

          setAccessStatus(
            "approved"
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

    let stopped =
      false;

    const checkStatus =
      async () => {
        try {
          const response =
            await fetch(
              `/api/meetings/join-request?callId=${encodeURIComponent(
                callId
              )}&scope=mine`,
              {
                cache:
                  "no-store",
              }
            );

          const result =
            await response.json();

          if (
            !response.ok ||
            stopped
          ) {
            return;
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
            "denied"
          ) {
            setAccessStatus(
              "denied"
            );

            setError("");
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
      stopped =
        true;

      window.clearInterval(
        timer
      );
    };
  }, [
    teacher,
    accessStatus,
    callId,
    joinApproved,
  ]);

  /* =====================================================
     ACCESS MODE CHANGED WHILE WAITING
  ===================================================== */

  useEffect(() => {
    if (
      teacher ||
      accessStatus !==
        "waiting"
    ) {
      return;
    }

    if (
      accessMode ===
      "open"
    ) {
      const enterOpen =
        async () => {
          try {
            await ensureMembership();

            await joinApproved();
          } catch (
            openError
          ) {
            console.error(
              "Open meeting join error:",
              openError
            );

            setAccessStatus(
              "idle"
            );

            setError(
              "Unable to enter the meeting."
            );
          }
        };

      void enterOpen();

      return;
    }

    if (
      accessMode ===
      "locked"
    ) {
      setAccessStatus(
        "idle"
      );

      setError(
        "The host locked this meeting."
      );
    }
  }, [
    teacher,
    accessStatus,
    accessMode,
    ensureMembership,
    joinApproved,
  ]);

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
     JOIN / ASK TO JOIN
  ===================================================== */

  const joinMeeting =
    async () => {
      if (
        !call ||
        !user
      ) {
        return;
      }

      if (
        joiningRef.current ||
        callingState ===
          CallingState.JOINING ||
        callingState ===
          CallingState.JOINED
      ) {
        return;
      }

      if (
        teacher
      ) {
        await joinApproved();

        return;
      }

      try {
        setError("");

        /* LOCKED */

        if (
          accessMode ===
          "locked"
        ) {
          setError(
            "This meeting is currently locked by the host."
          );

          return;
        }

        /* OPEN */

        if (
          accessMode ===
          "open"
        ) {
          setAccessStatus(
            "requesting"
          );

          await ensureMembership();

          await joinApproved();

          return;
        }

        /* APPROVAL */

        setAccessStatus(
          "requesting"
        );

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
              "Unable to send join request."
          );
        }

        if (
          result.status ===
          "open"
        ) {
          await ensureMembership();

          await joinApproved();

          return;
        }

        if (
          result.status ===
          "approved"
        ) {
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
          "Ask to join error:",
          requestError
        );

        setAccessStatus(
          "idle"
        );

        setError(
          requestError instanceof
            Error
            ? requestError.message
            : "Unable to send join request."
        );
      }
    };

  /* =====================================================
     COPY INVITE
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
      } catch {
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
     LOBBY UI
  ===================================================== */

  return (
    <main className="flex h-dvh w-full items-center justify-center overflow-hidden bg-[#F9F0E0] p-4 lg:p-6">

      <div className="grid h-full max-h-[850px] w-full max-w-[1450px] overflow-hidden rounded-[30px] bg-[#FFF7EB] shadow-[0_30px_90px_rgba(61,55,50,0.16)] lg:grid-cols-[1.15fr_0.9fr]">

        {/* PREVIEW */}

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

        {/* OPTIONS */}

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

            {!teacher && (
              <div className="mt-3">

                {accessMode ===
                  "open" && (
                  <p className="text-sm leading-6 text-[#756E64]">
                    🌐 This meeting is open. You can enter immediately.
                  </p>
                )}

                {accessMode ===
                  "approval" && (
                  <p className="text-sm leading-6 text-[#756E64]">
                    🚪 The meeting opener must approve your request.
                  </p>
                )}

                {accessMode ===
                  "locked" && (
                  <p className="text-sm leading-6 text-[#CC3A63]">
                    🔒 The host is not allowing new participants.
                  </p>
                )}

              </div>
            )}

            {teacher && (
              <div className="mt-5">

                <MeetingAccessSettings
                  callId={
                    callId
                  }
                />

              </div>
            )}

            {/* CAMERA / MICROPHONE */}

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

            {/* WAITING */}

            {waiting && (
              <div className="mt-4 rounded-2xl bg-[#A2AB73]/10 p-4 text-center">

                <div className="text-2xl">
                  ⏳
                </div>

                <p className="mt-2 font-black text-[#3D3732]">
                  Waiting for the teacher
                </p>

                <p className="mt-1 text-xs text-[#756E64]">
                  You&apos;ll enter automatically once approved.
                </p>

              </div>
            )}

            {/* DENIED */}

            {accessStatus ===
              "denied" && (
              <div className="mt-4 rounded-2xl bg-[#CC3A63]/10 p-4 text-center">

                <p className="font-black text-[#CC3A63]">
                  Request denied
                </p>

              </div>
            )}

            {/* ERROR */}

            {error && (
              <div className="mt-4 rounded-xl bg-[#CC3A63]/10 p-3 text-xs font-bold text-[#CC3A63]">
                {error}
              </div>
            )}

            {/* JOIN */}

            {!waiting && (
              <button
                type="button"
                onClick={() =>
                  void joinMeeting()
                }
                disabled={
                  requesting ||
                  (
                    !teacher &&
                    accessMode ===
                      "locked"
                  ) ||
                  callingState ===
                    CallingState.JOINING
                }
                className="mt-5 w-full rounded-2xl bg-[#CC3A63] px-5 py-3.5 font-black text-white disabled:opacity-50"
              >
                {requesting
                  ? "Please wait..."
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
                          ? "Ask Again"
                          : "Ask to Join"}
              </button>
            )}

            {/* COPY */}

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

            {/* BACK */}

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

  const teacher =
    Boolean(
      call?.isCreatedByMe
    );

  /* =====================================================
     PERMISSIONS
  ===================================================== */

  const storedPermissions =
    custom?.cohiva_permissions as
      | Partial<CohivaPermissions>
      | undefined;

  const permissions:
    CohivaPermissions = {
    ...DEFAULT_COHIVA_PERMISSIONS,

    ...storedPermissions,

    studentRecording:
      false,
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

  /* =====================================================
     RAISED HAND
  ===================================================== */

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
    raisedHandDetails,
    setRaisedHandDetails,
  ] =
    useState<
      Map<
        string,
        RaisedHandInfo
      >
    >(
      new Map()
    );

  const [
    raisedHandsOpen,
    setRaisedHandsOpen,
  ] =
    useState(false);

  const [
    handNotification,
    setHandNotification,
  ] =
    useState<HandNotification | null>(
      null
    );

  const handNotificationTimerRef =
    useRef<
      ReturnType<
        typeof setTimeout
      > | null
    >(null);

  /* =====================================================
     REACTIONS
  ===================================================== */

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
     CHAT NOTIFICATIONS
  ===================================================== */

  const [
    chatUnreadCount,
    setChatUnreadCount,
  ] =
    useState(0);

  const [
    chatNotification,
    setChatNotification,
  ] =
    useState<ChatNotification | null>(
      null
    );

  const chatNotificationTimerRef =
    useRef<
      ReturnType<
        typeof setTimeout
      > | null
    >(null);

  /* =====================================================
     ATTENDANCE
  ===================================================== */

  const attendanceLeaveTimerRef =
    useRef<
      ReturnType<
        typeof setTimeout
      > | null
    >(null);

  /* =====================================================
     ACCESSIBILITY
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
     ACCESSIBILITY STORAGE
  ===================================================== */

  useEffect(() => {
    try {
      const saved =
        window.localStorage.getItem(
          "cohiva-accessibility"
        );

      if (
        saved
      ) {
        setAccessibility(
          (
            current
          ) => ({
            ...current,

            ...JSON.parse(
              saved
            ),
          })
        );
      }
    } catch (
      accessibilityError
    ) {
      console.error(
        "Accessibility load error:",
        accessibilityError
      );
    }
  }, []);

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
        "Accessibility save error:",
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
    if (
      !userId
    ) {
      return;
    }

    if (
      attendanceLeaveTimerRef.current
    ) {
      clearTimeout(
        attendanceLeaveTimerRef.current
      );

      attendanceLeaveTimerRef.current =
        null;
    }

    let pageLeaveSent =
      false;

    const payloadBase = {
      callId,

      name:
        userName,

      image:
        userImage,
    };

    const postAttendance =
      (
        action:
          | "join"
          | "leave"
          | "heartbeat",

        keepalive =
          false
      ) => {
        return fetch(
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
                ...payloadBase,

                action,
              }),

            keepalive,
          }
        );
      };

    /* JOIN */

    void postAttendance(
      "join"
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

    /* HEARTBEAT */

    const heartbeatTimer =
      window.setInterval(
        () => {
          void postAttendance(
            "heartbeat"
          ).catch(
            (
              attendanceError
            ) => {
              console.error(
                "Attendance heartbeat error:",
                attendanceError
              );
            }
          );
        },
        20_000
      );

    /* PAGE CLOSE */

    const handlePageHide =
      () => {
        if (
          pageLeaveSent
        ) {
          return;
        }

        pageLeaveSent =
          true;

        void postAttendance(
          "leave",
          true
        ).catch(
          () => {}
        );
      };

    window.addEventListener(
      "pagehide",
      handlePageHide
    );

    return () => {
      window.clearInterval(
        heartbeatTimer
      );

      window.removeEventListener(
        "pagehide",
        handlePageHide
      );

      attendanceLeaveTimerRef.current =
        setTimeout(
          () => {
            if (
              pageLeaveSent
            ) {
              return;
            }

            void postAttendance(
              "leave",
              true
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
          },
          2500
        );
    };
  }, [
    callId,
    userId,
    userName,
    userImage,
  ]);

  /* =====================================================
     SEND CLASSROOM EVENT
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
     HAND + REACTION LISTENER
  ===================================================== */

  useEffect(() => {
    if (
      !call
    ) {
      return;
    }

    const unsubscribe =
      call.on(
        "custom",
        (
          event:
            StreamVideoEvent
        ) => {
          const payload =
            (
              event as
                CustomVideoEvent
            ).custom as
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
            typeof payload.senderId ===
            "string"
              ? payload.senderId
              : "";

          if (
            !senderId
          ) {
            return;
          }

          const senderName =
            typeof payload.senderName ===
            "string"
              ? payload.senderName
              : "Participant";

          const senderImage =
            typeof payload.senderImage ===
            "string"
              ? payload.senderImage
              : "";

          /* HAND */

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

            setRaisedHandDetails(
              (
                current
              ) => {
                const next =
                  new Map(
                    current
                  );

                if (
                  raised
                ) {
                  next.set(
                    senderId,
                    {
                      userId:
                        senderId,

                      name:
                        senderName,

                      image:
                        senderImage,

                      raisedAt:
                        typeof payload.createdAt ===
                        "string"
                          ? payload.createdAt
                          : new Date()
                              .toISOString(),
                    }
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

            setAnnouncement(
              raised
                ? `${senderName} raised their hand`
                : `${senderName} lowered their hand`
            );

            if (
              teacher &&
              senderId !==
                userId &&
              raised
            ) {
              setHandNotification({
                userId:
                  senderId,

                name:
                  senderName,

                image:
                  senderImage,
              });

              if (
                handNotificationTimerRef.current
              ) {
                clearTimeout(
                  handNotificationTimerRef.current
                );
              }

              handNotificationTimerRef.current =
                setTimeout(
                  () => {
                    setHandNotification(
                      null
                    );

                    handNotificationTimerRef.current =
                      null;
                  },
                  4500
                );
            }

            return;
          }

          /* REACTION */

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
                senderName,
            };

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

            setAnnouncement(
              `${senderName} reacted ${reaction.emoji}`
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

    return () => {
      unsubscribe();
    };
  }, [
    call,
    teacher,
    userId,
  ]);

  /* =====================================================
     CHAT NOTIFICATION LISTENER
  ===================================================== */

  useEffect(() => {
    if (
      !call
    ) {
      return;
    }

    const unsubscribe =
      call.on(
        "custom",
        (
          event:
            StreamVideoEvent
        ) => {
          const payload =
            (
              event as
                CustomVideoEvent
            ).custom as
              Record<
                string,
                unknown
              >;

          if (
            payload.type !==
            "cohiva-chat"
          ) {
            return;
          }

          const senderId =
            typeof payload.senderId ===
            "string"
              ? payload.senderId
              : "";

          if (
            !senderId ||
            senderId ===
              userId ||
            chatOpen
          ) {
            return;
          }

          setChatUnreadCount(
            (
              current
            ) =>
              Math.min(
                current + 1,
                99
              )
          );

          setChatNotification({
            senderId,

            senderName:
              typeof payload.senderName ===
              "string"
                ? payload.senderName
                : "Participant",

            senderImage:
              typeof payload.senderImage ===
              "string"
                ? payload.senderImage
                : "",

            text:
              typeof payload.text ===
              "string"
                ? payload.text
                : "New message",
          });

          if (
            chatNotificationTimerRef.current
          ) {
            clearTimeout(
              chatNotificationTimerRef.current
            );
          }

          chatNotificationTimerRef.current =
            setTimeout(
              () => {
                setChatNotification(
                  null
                );

                chatNotificationTimerRef.current =
                  null;
              },
              4000
            );
        }
      );

    return () => {
      unsubscribe();
    };
  }, [
    call,
    userId,
    chatOpen,
  ]);

  /* =====================================================
     CLEAR CHAT WHEN OPEN
  ===================================================== */

  useEffect(() => {
    if (
      !chatOpen
    ) {
      return;
    }

    setChatUnreadCount(
      0
    );

    setChatNotification(
      null
    );

    if (
      chatNotificationTimerRef.current
    ) {
      clearTimeout(
        chatNotificationTimerRef.current
      );

      chatNotificationTimerRef.current =
        null;
    }
  }, [
    chatOpen,
  ]);

  /* =====================================================
     REMOVE STALE RAISED HAND WHEN PARTICIPANT LEAVES
  ===================================================== */

  useEffect(() => {
    if (
      !call
    ) {
      return;
    }

    const unsubscribe =
      call.on(
        "call.session_participant_left",
        (
          event
        ) => {
          const participant =
            event.participant as
              any;

          const leavingId =
            participant?.user?.id ??
            participant?.user_id;

          if (
            typeof leavingId !==
            "string"
          ) {
            return;
          }

          setRaisedHands(
            (
              current
            ) => {
              const next =
                new Set(
                  current
                );

              next.delete(
                leavingId
              );

              return next;
            }
          );

          setRaisedHandDetails(
            (
              current
            ) => {
              const next =
                new Map(
                  current
                );

              next.delete(
                leavingId
              );

              return next;
            }
          );
        }
      );

    return () => {
      unsubscribe();
    };
  }, [
    call,
  ]);

  /* =====================================================
     TEACHER ENDED CALL

     ONLY call.ended.
  ===================================================== */

  useEffect(() => {
    if (
      !call
    ) {
      return;
    }

    let handled =
      false;

    const handleCallEnded =
      () => {
        if (
          handled
        ) {
          return;
        }

        handled =
          true;

        setChatNotification(
          null
        );

        setHandNotification(
          null
        );

        setFloatingReactions(
          []
        );

        setChatOpen(
          false
        );

        setParticipantsOpen(
          false
        );

        setPermissionsOpen(
          false
        );

        setAttendanceOpen(
          false
        );

        setAccessibilityOpen(
          false
        );

        router.replace(
          "/"
        );
      };

    const unsubscribe =
      call.on(
        "call.ended",
        handleCallEnded
      );

    return () => {
      unsubscribe();
    };
  }, [
    call,
    router,
  ]);

  /* =====================================================
     TIMER CLEANUP
  ===================================================== */

  useEffect(() => {
    return () => {
      if (
        chatNotificationTimerRef.current
      ) {
        clearTimeout(
          chatNotificationTimerRef.current
        );

        chatNotificationTimerRef.current =
          null;
      }

      if (
        handNotificationTimerRef.current
      ) {
        clearTimeout(
          handNotificationTimerRef.current
        );

        handNotificationTimerRef.current =
          null;
      }
    };
  }, []);

  /* =====================================================
     TOGGLE HAND
  ===================================================== */

  const toggleHand =
    useCallback(
      async () => {
        const next =
          !myHandRaised;

        setMyHandRaised(
          next
        );

        if (
          userId
        ) {
          setRaisedHands(
            (
              current
            ) => {
              const updated =
                new Set(
                  current
                );

              if (
                next
              ) {
                updated.add(
                  userId
                );
              } else {
                updated.delete(
                  userId
                );
              }

              return updated;
            }
          );
        }

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

          if (
            userId
          ) {
            setRaisedHands(
              (
                current
              ) => {
                const updated =
                  new Set(
                    current
                  );

                if (
                  next
                ) {
                  updated.delete(
                    userId
                  );
                } else {
                  updated.add(
                    userId
                  );
                }

                return updated;
              }
            );
          }
        }
      },
      [
        myHandRaised,
        sendClassroomEvent,
        userId,
      ]
    );

  /* =====================================================
     SEND REACTION
  ===================================================== */

  const sendReaction =
    async (
      emoji: string
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
    if (
      !call
    ) {
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

        if (
          target?.tagName ===
            "INPUT" ||
          target?.tagName ===
            "TEXTAREA" ||
          target?.isContentEditable ||
          !event.altKey
        ) {
          return;
        }

        const key =
          event.key.toLowerCase();

        /* ALT + M */

        if (
          key ===
          "m"
        ) {
          event.preventDefault();

          void call.microphone
            .toggle()
            .catch(
              () => {}
            );
        }

        /* ALT + V */

        if (
          key ===
          "v"
        ) {
          event.preventDefault();

          void call.camera
            .toggle()
            .catch(
              () => {}
            );
        }

        /* ALT + C */

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

        /* ALT + P */

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

        /* ALT + H */

        if (
          key ===
          "h"
        ) {
          event.preventDefault();

          void toggleHand();
        }

        /* ALT + W */

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

        /* ALT + A */

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
     COPY INVITE
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
     HAND QUEUE
  ===================================================== */

  const handList =
    Array.from(
      raisedHandDetails.values()
    ).sort(
      (
        a,
        b
      ) =>
        new Date(
          a.raisedAt
        ).getTime() -
        new Date(
          b.raisedAt
        ).getTime()
    );

  /* =====================================================
     LIVE MEETING UI
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
          REDUCED MOTION
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
          RECORDING

          Indicator:
          visible to everyone.

          Events:
          teacher receives ready/error messages.
      ================================================= */}

      <CohivaRecordingIndicator />

      <CohivaRecordingEvents />

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
            <span className="hidden rounded-full bg-[#CC3A63]/20 px-2 py-1 text-[8px] font-black uppercase text-[#F58BA8] xl:inline">
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
            className="rounded-lg bg-white/10 px-3 py-2 text-xs font-black"
          >
            👥 {participantCount}
          </button>

          {/* RAISED HANDS */}

          {teacher &&
            raisedHands.size >
              0 && (
              <div className="relative">

                <button
                  type="button"
                  aria-label={`${raisedHands.size} raised hands`}
                  onClick={() =>
                    setRaisedHandsOpen(
                      (
                        current
                      ) =>
                        !current
                    )
                  }
                  className="rounded-lg bg-[#FACC15] px-3 py-2 text-xs font-black text-[#403A35]"
                >
                  ✋ {raisedHands.size}
                </button>

                {raisedHandsOpen && (
                  <div className="absolute left-0 top-[44px] z-[230] w-[280px] overflow-hidden rounded-[20px] border border-[#403A35]/10 bg-[#FFF7EB] text-[#3D3732] shadow-2xl">

                    <div className="border-b border-[#403A35]/10 px-4 py-3">

                      <p className="text-[9px] font-black uppercase tracking-[0.16em] text-[#CC3A63]">
                        Raised Hands
                      </p>

                      <p className="mt-1 text-xs font-bold text-[#756E64]">
                        {raisedHands.size} waiting
                      </p>

                    </div>

                    <div className="max-h-[270px] overflow-y-auto p-2">

                      {handList.map(
                        (
                          person,
                          index
                        ) => (
                          <div
                            key={
                              person.userId
                            }
                            className="flex items-center gap-3 rounded-xl px-2 py-2 hover:bg-[#F9F0E0]"
                          >

                            <span className="w-5 text-center text-[10px] font-black text-[#756E64]">
                              {index + 1}.
                            </span>

                            {person.image ? (
                              <img
                                src={
                                  person.image
                                }
                                alt=""
                                className="h-9 w-9 rounded-full object-cover"
                              />
                            ) : (
                              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#403A35] text-xs font-black text-white">
                                {person.name
                                  .charAt(
                                    0
                                  )
                                  .toUpperCase()}
                              </div>
                            )}

                            <div className="min-w-0 flex-1">

                              <p className="truncate text-xs font-black">
                                {person.name}
                              </p>

                              <p className="text-[9px] font-bold text-[#737C4C]">
                                ✋ Hand raised
                              </p>

                            </div>

                          </div>
                        )
                      )}

                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        setRaisedHandsOpen(
                          false
                        );

                        setParticipantsOpen(
                          true
                        );
                      }}
                      className="w-full border-t border-[#403A35]/10 bg-white px-4 py-3 text-xs font-black text-[#CC3A63]"
                    >
                      Open participants →
                    </button>

                  </div>
                )}

              </div>
            )}

          {/* VIDEO / WHITEBOARD */}

          <div className="hidden rounded-xl bg-black/20 p-1 sm:flex">

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
                  ? "bg-[#A2AB73]"
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
            aria-label={
              chatUnreadCount >
              0
                ? `${chatUnreadCount} unread chat messages`
                : "Open chat"
            }
            onClick={() =>
              setChatOpen(
                true
              )
            }
            className={`relative rounded-lg px-3 py-2 text-xs font-black ${
              chatUnreadCount >
              0
                ? "bg-[#CC3A63]/20 text-[#F8B2C4]"
                : "bg-white/10"
            }`}
          >
            💬

            {chatUnreadCount >
              0 && (
              <span className="absolute -right-2 -top-2 flex min-h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[#CC3A63] px-1 text-[8px] font-black text-white">
                {chatUnreadCount >
                9
                  ? "9+"
                  : chatUnreadCount}
              </span>
            )}

          </button>

          {/* HAND */}

          <button
            type="button"
            aria-label={
              myHandRaised
                ? "Lower hand"
                : "Raise hand"
            }
            aria-pressed={
              myHandRaised
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
            {myHandRaised
              ? "✋ ✓"
              : "✋"}
          </button>

          {/* REACTIONS */}

          <div className="relative">

            <button
              type="button"
              aria-label="Open reactions"
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
              <div className="absolute right-0 top-[44px] z-[230] flex gap-1 rounded-2xl bg-[#FFF7EB] p-2 shadow-2xl">

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
                      onClick={() =>
                        void sendReaction(
                          emoji
                        )
                      }
                      className="flex h-10 w-10 items-center justify-center rounded-xl text-xl transition hover:scale-110 hover:bg-[#F9F0E0]"
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
            aria-label="Accessibility"
            onClick={() =>
              setAccessibilityOpen(
                true
              )
            }
            className="rounded-lg bg-white/10 px-3 py-2 text-xs"
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

          {/* PERMISSIONS */}

          {teacher && (
            <button
              type="button"
              aria-label="Meeting settings"
              onClick={() =>
                setPermissionsOpen(
                  true
                )
              }
              className="rounded-lg bg-[#A2AB73]/20 px-3 py-2 text-xs text-[#DCE3B4]"
            >
              ⚙
            </button>
          )}

          {/* =================================================
              RECORDING

              Teacher only.
          ================================================= */}

          {teacher && (
            <CohivaRecordingControl />
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
          HAND NOTIFICATION
      ================================================= */}

      {teacher &&
        handNotification && (
        <button
          type="button"
          onClick={() => {
            setHandNotification(
              null
            );

            setRaisedHandsOpen(
              true
            );
          }}
          className="fixed left-4 top-[76px] z-[260] w-[310px] max-w-[calc(100vw-32px)] rounded-[20px] border border-[#FACC15]/40 bg-[#FFF7EB] p-3.5 text-left text-[#3D3732] shadow-2xl"
        >

          <div className="flex items-center gap-3">

            {handNotification.image ? (
              <img
                src={
                  handNotification.image
                }
                alt=""
                className="h-11 w-11 rounded-full object-cover"
              />
            ) : (
              <div className="flex h-11 w-11 items-center justify-center rounded-full bg-[#FACC15]/20 text-xl">
                ✋
              </div>
            )}

            <div className="min-w-0 flex-1">

              <p className="text-[9px] font-black uppercase tracking-[0.15em] text-[#CC3A63]">
                Hand Raised
              </p>

              <p className="mt-1 truncate text-sm font-black">
                {handNotification.name}
              </p>

              <p className="mt-1 text-[10px] font-bold text-[#756E64]">
                Click to view the hand queue
              </p>

            </div>

          </div>

        </button>
      )}

      {/* =================================================
          CHAT NOTIFICATION
      ================================================= */}

      {chatNotification &&
        !chatOpen && (
        <button
          type="button"
          onClick={() =>
            setChatOpen(
              true
            )
          }
          className="fixed right-4 top-[76px] z-[260] w-[330px] max-w-[calc(100vw-32px)] rounded-[20px] border border-[#403A35]/10 bg-[#FFF7EB] p-3.5 text-left text-[#3D3732] shadow-2xl"
        >

          <div className="flex items-start gap-3">

            {chatNotification.senderImage ? (
              <img
                src={
                  chatNotification.senderImage
                }
                alt=""
                className="h-11 w-11 shrink-0 rounded-full object-cover"
              />
            ) : (
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#CC3A63]/10">
                💬
              </div>
            )}

            <div className="min-w-0 flex-1">

              <p className="truncate text-xs font-black">
                {chatNotification.senderName}
              </p>

              <p className="mt-1 line-clamp-2 text-[11px] leading-4 text-[#756E64]">
                {chatNotification.text}
              </p>

              <p className="mt-2 text-[9px] font-black text-[#CC3A63]">
                Open chat →
              </p>

            </div>

          </div>

        </button>
      )}

      {/* =================================================
          MOBILE VIEW SWITCH
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

        <div className="relative h-full overflow-hidden rounded-[20px] bg-[#181614]">

          {/* VIDEO */}

          <div
            className={`absolute inset-0 ${
              activeView ===
                "video"
                ? "visible opacity-100"
                : "invisible pointer-events-none opacity-0"
            }`}
          >

            <SpeakerLayout
              participantsBarPosition="right"

              ParticipantViewUISpotlight={
                CohivaParticipantSpotlightUI
              }

              ParticipantViewUIBar={
                CohivaParticipantBarUI
              }
            />

          </div>

          {/* WHITEBOARD */}

          <div
            className={`absolute inset-0 ${
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
              active={
                activeView ===
                "whiteboard"
              }
            />

          </div>

          {/* =================================================
              CAPTIONS
          ================================================= */}

          <MeetingCaptionsOverlay
            visible={
              accessibility.captionsVisible
            }
            size={
              accessibility.captionSize
            }
          />

          {/* =================================================
              REACTIONS
          ================================================= */}

          {!accessibility.hideReactions && (
            <div className="pointer-events-none absolute inset-x-0 bottom-6 z-[80] flex flex-col items-center gap-2">

              {floatingReactions.map(
                (
                  reaction
                ) => (
                  <div
                    key={
                      reaction.id
                    }
                    className="animate-bounce rounded-full bg-[#FFF7EB] px-4 py-2 text-sm font-black text-[#403A35] shadow-xl"
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
          STREAM CALL CONTROLS
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

              router.replace(
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
          PERMISSION PANEL
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
          PARTICIPANTS PANEL
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
          CHAT PANEL
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
          ATTENDANCE PANEL
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
          ACCESSIBILITY PANEL
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
            router.replace(
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