"use client";

import {
  CallingState,
  CancelCallButton,
  ReactionsButton,
  ScreenShareButton,
  SpeakerLayout,
  SpeakingWhileMutedNotification,
  StreamCall,
  StreamTheme,
  ToggleAudioPublishingButton,
  ToggleVideoPublishingButton,
  VideoPreview,
  useCall,
  useCallStateHooks,
  useStreamVideoClient,
  type Call,
  type CustomVideoEvent,
  type StreamVideoEvent,
} from "@stream-io/video-react-sdk";

import { useUser } from "@clerk/nextjs";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

import CohivaWhiteboard from "./CohivaWhiteboard";

import MeetingPermissionsPanel, {
  DEFAULT_COHIVA_PERMISSIONS,
  type CohivaPermissions,
} from "./MeetingPermissionsPanel";


import MeetingCaptionsOverlay from "./MeetingCaptionsOverlay";

import type {
  AccessibilitySettings,
} from "./meetingAccessibilityTypes";

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
   LAZY MEETING PANELS

   These large panels are not needed for the initial video
   experience. Load them only when the user opens them.
========================================================= */

const MeetingParticipantsPanel = dynamic(
  () => import("./MeetingParticipantsPanel")
);

const MeetingChatPanel = dynamic(
  () => import("./MeetingChatPanel")
);

const MeetingAttendancePanel = dynamic(
  () => import("./MeetingAttendancePanel")
);

const MeetingAccessibilityPanel = dynamic(
  () => import("./MeetingAccessibilityPanel")
);

const MeetingJoinRequests = dynamic(
  () => import("./MeetingJoinRequests")
);

const MeetingAccessSettings = dynamic(
  () => import("./MeetingAccessSettings")
);

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

  const toggleCamera =
    async () => {
      try {
        setError("");

        await camera.toggle();
      } catch (
        cameraError
      ) {
        console.error(
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
        setError("");

        await microphone.toggle();
      } catch (
        microphoneError
      ) {
        console.error(
          microphoneError
        );

        setError(
          "Cohiva could not access your microphone."
        );
      }
    };

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

        if (
          accessMode ===
          "locked"
        ) {
          setError(
            "This meeting is currently locked by the host."
          );

          return;
        }

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
          () =>
            setCopied(
              false
            ),
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

  return (
    <main className="flex min-h-dvh w-full items-start justify-center overflow-y-auto bg-[#F9F0E0] p-2 sm:p-4 lg:h-dvh lg:items-center lg:overflow-hidden lg:p-6">

      <div className="grid w-full max-w-[1450px] overflow-hidden rounded-[24px] bg-[#FFF7EB] shadow-[0_30px_90px_rgba(61,55,50,0.16)] sm:rounded-[30px] lg:h-full lg:max-h-[850px] lg:grid-cols-[1.15fr_0.9fr]">

        <section className="relative h-[190px] min-h-[190px] overflow-hidden bg-[#302B27] sm:h-[260px] sm:min-h-[260px] lg:h-auto lg:min-h-0">

          <div className="absolute left-3 top-3 z-30 rounded-full bg-[#CC3A63] px-3 py-2 text-[9px] font-black uppercase tracking-[0.18em] text-white sm:left-5 sm:top-5 sm:px-4 sm:text-[10px]">
            Cohiva Preview
          </div>

          <div className="cohiva-preview-video absolute inset-0">
            <VideoPreview />
          </div>

          {cameraOff && (
            <div className="absolute inset-0 z-20 flex items-center justify-center bg-[#302B27]">

              <div className="text-center">

                <div className="text-4xl sm:text-5xl">
                  📷
                </div>

                <p className="mt-2 text-base font-black text-white sm:mt-4 sm:text-xl">
                  Camera is off
                </p>

              </div>

            </div>
          )}

        </section>

        <section className="flex min-h-0 flex-col p-4 sm:p-6 lg:overflow-y-auto lg:p-8">

          <div className="my-0 lg:my-auto">

            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#A2AB73]">
              Ready to meet?
            </p>

            <h1 className="mt-1.5 text-2xl font-black leading-tight text-[#3D3732] sm:mt-2 sm:text-3xl">
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
              <div className="mt-3 sm:mt-5">

                <MeetingAccessSettings
                  callId={
                    callId
                  }
                />

              </div>
            )}

            <div className="mt-3 grid grid-cols-2 gap-2 sm:mt-5 sm:gap-3">

              <button
                type="button"
                onClick={() =>
                  void toggleCamera()
                }
                className="rounded-2xl bg-[#F9F0E0] p-3 text-xs font-bold text-[#3D3732] sm:p-4 sm:text-sm"
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
                className="rounded-2xl bg-[#F9F0E0] p-3 text-xs font-bold text-[#3D3732] sm:p-4 sm:text-sm"
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

            {accessStatus ===
              "denied" && (
              <div className="mt-4 rounded-2xl bg-[#CC3A63]/10 p-4 text-center">
                <p className="font-black text-[#CC3A63]">
                  Request denied
                </p>
              </div>
            )}

            {error && (
              <div className="mt-4 rounded-xl bg-[#CC3A63]/10 p-3 text-xs font-bold text-[#CC3A63]">
                {error}
              </div>
            )}

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
                className="mt-3 w-full rounded-2xl bg-[#CC3A63] px-5 py-3 font-black text-white disabled:opacity-50 sm:mt-5 sm:py-3.5"
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

            <button
              type="button"
              onClick={() =>
                void copyInvite()
              }
              className="mt-2 w-full rounded-2xl bg-[#F9F0E0] px-5 py-2.5 text-sm font-bold text-[#3D3732] sm:py-3"
            >
              {copied
                ? "✓ Link copied"
                : "Copy invite link"}
            </button>

            <button
              type="button"
              onClick={() =>
                router.push(
                  "/"
                )
              }
              className="mt-3 w-full pb-1 text-xs font-bold text-[#756E64] sm:mt-4 sm:pb-0"
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

  const [
    activeView,
    setActiveView,
  ] =
    useState<MeetingView>(
      "video"
    );

  /*
   * Do not load Excalidraw on initial meeting entry. Once the
   * whiteboard is opened for the first time, keep it mounted
   * so switching back to video does not lose board state.
   */
  const [
    whiteboardMounted,
    setWhiteboardMounted,
  ] =
    useState(false);

  useLayoutEffect(() => {
    if (
      activeView ===
      "whiteboard"
    ) {
      setWhiteboardMounted(
        true
      );
    }
  }, [activeView]);

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

  const attendanceLeaveTimerRef =
    useRef<
      ReturnType<
        typeof setTimeout
      > | null
    >(null);

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
      ) =>
        fetch(
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

    void postAttendance(
      "join"
    ).catch(
      console.error
    );

    const heartbeatTimer =
      window.setInterval(
        () => {
          void postAttendance(
            "heartbeat"
          ).catch(
            console.error
          );
        },
        20_000
      );

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
              console.error
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
     CLASSROOM EVENTS
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
     HAND + REACTION
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
                  },
                  4500
                );
            }

            return;
          }

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
     CHAT
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
  }, [
    chatOpen,
  ]);

  /* =====================================================
     PARTICIPANT LEFT
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
     ★ END CALL FOR EVERYONE

     Teacher executes:
       call.endCall()

     Stream then emits:
       call.ended

     to every connected client.

     EVERYONE redirects home.

     DO NOT use call.session_ended here.
  ===================================================== */

  useEffect(() => {
    if (
      !call
    ) {
      return;
    }

    let alreadyHandled =
      false;

    const handleCallEnded =
      () => {
        if (
          alreadyHandled
        ) {
          return;
        }

        alreadyHandled =
          true;

        /*
         * Clear temporary meeting state before routing.
         */

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

        setReactionMenuOpen(
          false
        );

        setRaisedHandsOpen(
          false
        );

        /*
         * Teacher + every participant go home.
         */

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

        try {
          await sendClassroomEvent({
            action:
              "hand",
            raised:
              next,
          });
        } catch (
          error
        ) {
          console.error(
            error
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
        error
      ) {
        console.error(
          error
        );
      }
    };

  /* =====================================================
     SHORTCUTS
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

        if (
          key ===
          "m"
        ) {
          event.preventDefault();

          void call.microphone.toggle();
        }

        if (
          key ===
          "v"
        ) {
          event.preventDefault();

          void call.camera.toggle();
        }

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

        if (
          key ===
          "h"
        ) {
          event.preventDefault();

          void toggleHand();
        }

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
          () =>
            setCopied(
              false
            ),
          1800
        );
      } catch (
        error
      ) {
        console.error(
          error
        );
      }
    };

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

  return (
    <main
      className={`cohiva-meeting-root flex h-dvh w-full flex-col overflow-hidden bg-[#24211F] text-white ${
        accessibility.highContrast
          ? "contrast-125"
          : ""
      }`}
    >

      {accessibility.reduceMotion && (
        <style>
          {`
            .cohiva-meeting-root *,
            .cohiva-meeting-root *::before,
            .cohiva-meeting-root *::after {
              animation-duration: 0.001ms !important;
              animation-iteration-count: 1 !important;
              transition-duration: 0.001ms !important;
            }
          `}
        </style>
      )}

      <div
        className="sr-only"
        aria-live="polite"
      >
        {announcement}
      </div>

      <CohivaRecordingIndicator />

      <CohivaRecordingEvents />

      {/* =================================================
          HEADER
      ================================================= */}

      <header className="cohiva-hide-scrollbar flex h-[64px] shrink-0 items-center justify-between gap-2 overflow-x-auto border-b border-white/10 bg-[#302B27] px-2 sm:px-3 lg:px-5">

        <div className="flex min-w-0 items-center gap-2">

          <p className="hidden truncate text-base font-black md:block">
            Cohiva Meeting
          </p>

          {teacher && (
            <span className="hidden rounded-full bg-[#CC3A63]/20 px-2 py-1 text-[8px] font-black uppercase text-[#F58BA8] xl:inline">
              Teacher
            </span>
          )}

          <button
            type="button"
            onClick={() =>
              setParticipantsOpen(
                true
              )
            }
            className="rounded-lg bg-white/10 px-3 py-2 text-xs font-black"
          >
            👥 {participantCount}
          </button>

          {teacher &&
            raisedHands.size >
              0 && (
              <button
                type="button"
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
            )}

          <div className="flex rounded-xl bg-black/20 p-1">

            <button
              type="button"
              onClick={() =>
                setActiveView(
                  "video"
                )
              }
              className={`rounded-lg px-2 py-1.5 text-xs font-black sm:px-3 ${
                activeView ===
                "video"
                  ? "bg-[#FFF7EB] text-[#403A35]"
                  : "text-white/60"
              }`}
            >
              🎥 <span className="hidden sm:inline">Video</span>
            </button>

            <button
              type="button"
              onClick={() =>
                setActiveView(
                  "whiteboard"
                )
              }
              className={`rounded-lg px-2 py-1.5 text-xs font-black sm:px-3 ${
                activeView ===
                "whiteboard"
                  ? "bg-[#A2AB73]"
                  : "text-white/60"
              }`}
            >
              ✏ <span className="hidden sm:inline">Board</span>
            </button>

          </div>

        </div>

        <div className="flex shrink-0 items-center gap-1.5">

          <button
            type="button"
            onClick={() =>
              setChatOpen(
                true
              )
            }
            className="relative rounded-lg bg-white/10 px-3 py-2 text-xs"
          >
            💬

            {chatUnreadCount >
              0 && (
              <span className="absolute -right-2 -top-2 rounded-full bg-[#CC3A63] px-1.5 text-[8px] font-black">
                {chatUnreadCount}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() =>
              void toggleHand()
            }
            className={`rounded-lg px-3 py-2 text-xs ${
              myHandRaised
                ? "bg-[#FACC15] text-[#403A35]"
                : "bg-white/10"
            }`}
          >
            ✋
          </button>

          <div className="relative">

            <button
              type="button"
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
                      className="h-10 w-10 rounded-xl text-xl"
                    >
                      {emoji}
                    </button>
                  )
                )}

              </div>
            )}

          </div>

          <button
            type="button"
            onClick={() =>
              setAccessibilityOpen(
                true
              )
            }
            className="rounded-lg bg-white/10 px-3 py-2 text-xs"
          >
            ♿
          </button>

          {teacher && (
            <button
              type="button"
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

          {teacher && (
            <button
              type="button"
              onClick={() =>
                setPermissionsOpen(
                  true
                )
              }
              className="rounded-lg bg-[#A2AB73]/20 px-3 py-2 text-xs"
            >
              ⚙
            </button>
          )}

          {teacher && (
            <CohivaRecordingControl />
          )}

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

      {/* WORKSPACE */}

      <section className="min-h-0 flex-1 overflow-hidden p-2 sm:p-3">

        <div className="relative h-full overflow-hidden rounded-[20px] bg-[#181614]">

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

          {whiteboardMounted && (
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
          )}

          <MeetingCaptionsOverlay
            visible={
              accessibility.captionsVisible
            }
            size={
              accessibility.captionSize
            }
          />

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
                    className="rounded-full bg-[#FFF7EB] px-4 py-2 text-sm font-black text-[#403A35]"
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
          BOTTOM CALL CONTROLS

          Bottom red button = LEAVE ONLY.
          It does NOT end class.
      ================================================= */}

      <footer className="flex h-[76px] shrink-0 items-center justify-center border-t border-white/10 bg-[#302B27] px-3">

        <div className="str-video__call-controls">

          <SpeakingWhileMutedNotification>
            <ToggleAudioPublishingButton />
          </SpeakingWhileMutedNotification>

          <ToggleVideoPublishingButton />

          <ReactionsButton />

          <ScreenShareButton />

          <CancelCallButton
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

      {teacher && (
        <MeetingJoinRequests
          callId={
            callId
          }
        />
      )}

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

      {participantsOpen && (
        <MeetingParticipantsPanel
          open
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
      )}

      {chatOpen && (
        <MeetingChatPanel
          open
          onClose={() =>
            setChatOpen(
              false
            )
          }
          callId={
            callId
          }
        />
      )}

      {teacher &&
        attendanceOpen && (
        <MeetingAttendancePanel
          open
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

      {accessibilityOpen && (
        <MeetingAccessibilityPanel
          open
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
      )}

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
}) => (
  <main className="flex h-dvh items-center justify-center bg-[#F9F0E0]">

    <div className="text-center">

      <div className="mx-auto h-11 w-11 animate-spin rounded-full border-4 border-[#CC3A63]/20 border-t-[#CC3A63]" />

      <p className="mt-5 font-bold text-[#756E64]">
        {text}
      </p>

    </div>

  </main>
);

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
    <main className="flex h-dvh items-center justify-center bg-[#F9F0E0] p-5">

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