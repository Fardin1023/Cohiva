"use client";

import {
  OwnCapability,
  hasAudio,
  hasScreenShare,
  hasVideo,
  useCall,
  useCallStateHooks,
} from "@stream-io/video-react-sdk";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import type {
  CohivaPermissions,
} from "./MeetingPermissionsPanel";

import {
  getIndividualPermissionMap,
  saveIndividualPermission,
} from "./cohivaParticipantPermissions";

/* =========================================================
   TYPES
========================================================= */

type MeetingParticipantsPanelProps = {
  open: boolean;

  onClose: () => void;

  raisedHands: ReadonlySet<string>;

  classPermissions: CohivaPermissions;
};

type ActionType =
  | "mic"
  | "camera"
  | "share"
  | "remove";

type ModerationNotice = {
  id: string;

  name: string;

  control:
    | "Microphone"
    | "Camera"
    | "Screen sharing";

  blocked: boolean;
};

/* =========================================================
   COMPONENT
========================================================= */

const MeetingParticipantsPanel = ({
  open,
  onClose,
  raisedHands,
  classPermissions,
}: MeetingParticipantsPanelProps) => {
  const call =
    useCall();

  const {
    useParticipants,
    useCallCustomData,
  } =
    useCallStateHooks();

  const participants =
    useParticipants();

  const custom =
    useCallCustomData();

  const teacher =
    Boolean(
      call?.isCreatedByMe
    );

  /* =====================================================
     SEARCH
  ===================================================== */

  const [
    search,
    setSearch,
  ] =
    useState("");

  /* =====================================================
     INDIVIDUAL PERMISSION STATE

     These are synchronized with:
     custom.cohiva_individual_permissions
  ===================================================== */

  const [
    blockedMic,
    setBlockedMic,
  ] =
    useState<
      Set<string>
    >(
      new Set()
    );

  const [
    blockedCamera,
    setBlockedCamera,
  ] =
    useState<
      Set<string>
    >(
      new Set()
    );

  const [
    blockedShare,
    setBlockedShare,
  ] =
    useState<
      Set<string>
    >(
      new Set()
    );

  /* =====================================================
     BUSY / ERROR STATE
  ===================================================== */

  const [
    busyAction,
    setBusyAction,
  ] =
    useState<
      string | null
    >(
      null
    );

  const [
    error,
    setError,
  ] =
    useState("");

  const [
    endingCall,
    setEndingCall,
  ] =
    useState(false);

  /* =====================================================
     INDIVIDUAL MODERATION NOTICE

     Example:

       Kamran
       Camera blocked
  ===================================================== */

  const [
    moderationNotice,
    setModerationNotice,
  ] =
    useState<
      ModerationNotice | null
    >(
      null
    );

  const noticeTimerRef =
    useRef<
      ReturnType<
        typeof setTimeout
      > | null
    >(
      null
    );

  /* =====================================================
     READ INDIVIDUAL PERMISSION STATE FROM STREAM

     This is important because the same permission can
     also be changed from the Stream participant menu.

     So both menus stay synchronized.
  ===================================================== */

  useEffect(() => {
    const permissionMap =
      getIndividualPermissionMap(
        custom
      );

    const mic =
      new Set<string>();

    const camera =
      new Set<string>();

    const share =
      new Set<string>();

    Object.entries(
      permissionMap
    ).forEach(
      ([
        userId,
        permissions,
      ]) => {
        if (
          permissions.audio ===
          false
        ) {
          mic.add(
            userId
          );
        }

        if (
          permissions.video ===
          false
        ) {
          camera.add(
            userId
          );
        }

        if (
          permissions.screenShare ===
          false
        ) {
          share.add(
            userId
          );
        }
      }
    );

    setBlockedMic(
      mic
    );

    setBlockedCamera(
      camera
    );

    setBlockedShare(
      share
    );
  }, [
    custom,
  ]);

  /* =====================================================
     REMOVE STALE LOCAL STATES WHEN USER LEAVES
  ===================================================== */

  useEffect(() => {
    const activeIds =
      new Set(
        participants.map(
          (
            participant
          ) =>
            participant.userId
        )
      );

    setBlockedMic(
      (
        current
      ) =>
        new Set(
          Array.from(
            current
          ).filter(
            (
              id
            ) =>
              activeIds.has(
                id
              )
          )
        )
    );

    setBlockedCamera(
      (
        current
      ) =>
        new Set(
          Array.from(
            current
          ).filter(
            (
              id
            ) =>
              activeIds.has(
                id
              )
          )
        )
    );

    setBlockedShare(
      (
        current
      ) =>
        new Set(
          Array.from(
            current
          ).filter(
            (
              id
            ) =>
              activeIds.has(
                id
              )
          )
        )
    );
  }, [
    participants,
  ]);

  /* =====================================================
     MODERATION POPUP
  ===================================================== */

  const showModerationNotice =
    (
      name: string,

      control:
        ModerationNotice["control"],

      blocked: boolean
    ) => {
      if (
        noticeTimerRef.current
      ) {
        clearTimeout(
          noticeTimerRef.current
        );
      }

      setModerationNotice({
        id:
          crypto.randomUUID(),

        name,

        control,

        blocked,
      });

      noticeTimerRef.current =
        setTimeout(
          () => {
            setModerationNotice(
              null
            );

            noticeTimerRef.current =
              null;
          },
          3500
        );
    };

  /* =====================================================
     TIMER CLEANUP
  ===================================================== */

  useEffect(() => {
    return () => {
      if (
        noticeTimerRef.current
      ) {
        clearTimeout(
          noticeTimerRef.current
        );
      }
    };
  }, []);

  /* =====================================================
     FILTER PARTICIPANTS
  ===================================================== */

  const filteredParticipants =
    useMemo(
      () => {
        const query =
          search
            .trim()
            .toLowerCase();

        if (
          !query
        ) {
          return participants;
        }

        return participants.filter(
          (
            participant
          ) => {
            const name =
              participant.name ||
              "";

            return (
              name
                .toLowerCase()
                .includes(
                  query
                ) ||
              participant.userId
                .toLowerCase()
                .includes(
                  query
                )
            );
          }
        );
      },
      [
        participants,
        search,
      ]
    );

  /* =====================================================
     ACTION KEY
  ===================================================== */

  const actionKey =
    (
      userId: string,
      action: ActionType
    ) =>
      `${userId}:${action}`;

  /* =====================================================
     MICROPHONE

     IMPORTANT:

     Disable:
       revoke SEND_AUDIO
       save audio:false

     Allow:
       grant SEND_AUDIO
       save audio:true
  ===================================================== */

  const toggleMicrophonePermission =
    async (
      userId: string,
      name: string
    ) => {
      if (
        !call ||
        !teacher
      ) {
        return;
      }

      /*
       * If the entire class microphone
       * permission is disabled, we don't
       * allow an individual override.
       */
      if (
        !classPermissions.studentMic
      ) {
        setError(
          "Microphones are currently blocked for the whole class. Enable class microphone permission first."
        );

        return;
      }

      const currentlyBlocked =
        blockedMic.has(
          userId
        );

      const key =
        actionKey(
          userId,
          "mic"
        );

      try {
        setBusyAction(
          key
        );

        setError("");

        /* =========================================
           ALLOW MICROPHONE
        ========================================= */

        if (
          currentlyBlocked
        ) {
          await call.grantPermissions(
            userId,
            [
              OwnCapability.SEND_AUDIO,
            ]
          );

          await saveIndividualPermission(
            call,
            custom,
            userId,
            "audio",
            true
          );

          setBlockedMic(
            (
              current
            ) => {
              const next =
                new Set(
                  current
                );

              next.delete(
                userId
              );

              return next;
            }
          );

          showModerationNotice(
            name,
            "Microphone",
            false
          );

          return;
        }

        /* =========================================
           DISABLE MICROPHONE
        ========================================= */

        await call.revokePermissions(
          userId,
          [
            OwnCapability.SEND_AUDIO,
          ]
        );

        await saveIndividualPermission(
          call,
          custom,
          userId,
          "audio",
          false
        );

        setBlockedMic(
          (
            current
          ) => {
            const next =
              new Set(
                current
              );

            next.add(
              userId
            );

            return next;
          }
        );

        showModerationNotice(
          name,
          "Microphone",
          true
        );
      } catch (
        moderationError
      ) {
        console.error(
          "Microphone moderation error:",
          moderationError
        );

        setError(
          moderationError instanceof
            Error
            ? moderationError.message
            : "Unable to change microphone permission."
        );
      } finally {
        setBusyAction(
          null
        );
      }
    };

  /* =====================================================
     CAMERA
  ===================================================== */

  const toggleCameraPermission =
    async (
      userId: string,
      name: string
    ) => {
      if (
        !call ||
        !teacher
      ) {
        return;
      }

      if (
        !classPermissions.studentCamera
      ) {
        setError(
          "Cameras are currently blocked for the whole class. Enable class camera permission first."
        );

        return;
      }

      const currentlyBlocked =
        blockedCamera.has(
          userId
        );

      const key =
        actionKey(
          userId,
          "camera"
        );

      try {
        setBusyAction(
          key
        );

        setError("");

        /* =========================================
           ALLOW CAMERA
        ========================================= */

        if (
          currentlyBlocked
        ) {
          await call.grantPermissions(
            userId,
            [
              OwnCapability.SEND_VIDEO,
            ]
          );

          await saveIndividualPermission(
            call,
            custom,
            userId,
            "video",
            true
          );

          setBlockedCamera(
            (
              current
            ) => {
              const next =
                new Set(
                  current
                );

              next.delete(
                userId
              );

              return next;
            }
          );

          showModerationNotice(
            name,
            "Camera",
            false
          );

          return;
        }

        /* =========================================
           DISABLE CAMERA
        ========================================= */

        await call.revokePermissions(
          userId,
          [
            OwnCapability.SEND_VIDEO,
          ]
        );

        await saveIndividualPermission(
          call,
          custom,
          userId,
          "video",
          false
        );

        setBlockedCamera(
          (
            current
          ) => {
            const next =
              new Set(
                current
              );

            next.add(
              userId
            );

            return next;
          }
        );

        showModerationNotice(
          name,
          "Camera",
          true
        );
      } catch (
        moderationError
      ) {
        console.error(
          "Camera moderation error:",
          moderationError
        );

        setError(
          moderationError instanceof
            Error
            ? moderationError.message
            : "Unable to change camera permission."
        );
      } finally {
        setBusyAction(
          null
        );
      }
    };

  /* =====================================================
     SCREEN SHARING
  ===================================================== */

  const toggleScreenSharePermission =
    async (
      userId: string,
      name: string
    ) => {
      if (
        !call ||
        !teacher
      ) {
        return;
      }

      if (
        !classPermissions.studentScreenShare
      ) {
        setError(
          "Screen sharing is currently blocked for the whole class. Enable class screen sharing first."
        );

        return;
      }

      const currentlyBlocked =
        blockedShare.has(
          userId
        );

      const key =
        actionKey(
          userId,
          "share"
        );

      try {
        setBusyAction(
          key
        );

        setError("");

        /* =========================================
           ALLOW SCREEN SHARE
        ========================================= */

        if (
          currentlyBlocked
        ) {
          await call.grantPermissions(
            userId,
            [
              OwnCapability.SCREENSHARE,
            ]
          );

          await saveIndividualPermission(
            call,
            custom,
            userId,
            "screenShare",
            true
          );

          setBlockedShare(
            (
              current
            ) => {
              const next =
                new Set(
                  current
                );

              next.delete(
                userId
              );

              return next;
            }
          );

          showModerationNotice(
            name,
            "Screen sharing",
            false
          );

          return;
        }

        /* =========================================
           DISABLE SCREEN SHARE
        ========================================= */

        await call.revokePermissions(
          userId,
          [
            OwnCapability.SCREENSHARE,
          ]
        );

        await saveIndividualPermission(
          call,
          custom,
          userId,
          "screenShare",
          false
        );

        setBlockedShare(
          (
            current
          ) => {
            const next =
              new Set(
                current
              );

            next.add(
              userId
            );

            return next;
          }
        );

        showModerationNotice(
          name,
          "Screen sharing",
          true
        );
      } catch (
        moderationError
      ) {
        console.error(
          "Screen-share moderation error:",
          moderationError
        );

        setError(
          moderationError instanceof
            Error
            ? moderationError.message
            : "Unable to change screen-share permission."
        );
      } finally {
        setBusyAction(
          null
        );
      }
    };

  /* =====================================================
     REMOVE PARTICIPANT

     IMPORTANT:

     kickUser() WITHOUT block:true.

     This removes them from the active call
     but does not ban them from rejoining.
  ===================================================== */

  const removeParticipant =
    async (
      userId: string,
      name: string
    ) => {
      if (
        !call ||
        !teacher
      ) {
        return;
      }

      const confirmed =
        window.confirm(
          `Remove ${name} from this meeting?`
        );

      if (
        !confirmed
      ) {
        return;
      }

      const key =
        actionKey(
          userId,
          "remove"
        );

      try {
        setBusyAction(
          key
        );

        setError("");

        await call.kickUser({
          user_id:
            userId,
        });
      } catch (
        moderationError
      ) {
        console.error(
          "Remove participant error:",
          moderationError
        );

        setError(
          moderationError instanceof
            Error
            ? moderationError.message
            : "Unable to remove participant."
        );
      } finally {
        setBusyAction(
          null
        );
      }
    };

  /* =====================================================
     END CLASS

     MeetingRoom.tsx handles call.ended
     and redirects everyone.

     No manual redirect here.
  ===================================================== */

  const endClass =
    async () => {
      if (
        !call ||
        !teacher ||
        endingCall
      ) {
        return;
      }

      const confirmed =
        window.confirm(
          "End this class for everyone?\n\nEveryone will be disconnected from the meeting."
        );

      if (
        !confirmed
      ) {
        return;
      }

      try {
        setEndingCall(
          true
        );

        setError("");

        await call.endCall();
      } catch (
        endError
      ) {
        console.error(
          "End class error:",
          endError
        );

        setError(
          endError instanceof
            Error
            ? endError.message
            : "Unable to end the class."
        );

        setEndingCall(
          false
        );
      }
    };

  /* =====================================================
     HIDDEN
  ===================================================== */

  if (
    !open
  ) {
    return null;
  }

  /* =====================================================
     UI
  ===================================================== */

  return (
    <>

      {/* =================================================
          INDIVIDUAL MODERATION POPUP
      ================================================= */}

      {moderationNotice && (
        <div
          key={
            moderationNotice.id
          }
          role="status"
          aria-live="polite"
          className="fixed left-1/2 top-[78px] z-[400] w-[330px] max-w-[calc(100vw-32px)] -translate-x-1/2 rounded-[20px] border border-[#403A35]/10 bg-[#FFF7EB] p-4 text-[#3D3732] shadow-[0_20px_70px_rgba(0,0,0,0.3)]"
        >

          <div className="flex items-center gap-3">

            {/* ICON */}

            <div
              className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-xl ${
                moderationNotice.blocked
                  ? "bg-[#CC3A63]/10"
                  : "bg-[#A2AB73]/15"
              }`}
            >
              {moderationNotice.control ===
              "Microphone"
                ? moderationNotice.blocked
                  ? "🔇"
                  : "🎙"
                : moderationNotice.control ===
                    "Camera"
                  ? moderationNotice.blocked
                    ? "📷"
                    : "🎥"
                  : moderationNotice.blocked
                    ? "🚫"
                    : "🖥"}
            </div>

            {/* DETAILS */}

            <div className="min-w-0 flex-1">

              <p className="truncate text-sm font-black text-[#3D3732]">
                {moderationNotice.name}
              </p>

              <p
                className={`mt-1 text-xs font-bold ${
                  moderationNotice.blocked
                    ? "text-[#CC3A63]"
                    : "text-[#737C4C]"
                }`}
              >
                {moderationNotice.control}{" "}
                {moderationNotice.blocked
                  ? "blocked"
                  : "allowed"}
              </p>

            </div>

            {/* STATE */}

            <span
              className={`rounded-full px-2 py-1 text-[8px] font-black uppercase ${
                moderationNotice.blocked
                  ? "bg-[#CC3A63]/10 text-[#CC3A63]"
                  : "bg-[#A2AB73]/15 text-[#737C4C]"
              }`}
            >
              {moderationNotice.blocked
                ? "Blocked"
                : "Allowed"}
            </span>

          </div>

        </div>
      )}

      {/* =================================================
          PARTICIPANTS PANEL
      ================================================= */}

      <aside
        aria-label="Meeting participants"
        className="fixed bottom-[76px] right-0 top-[64px] z-[245] flex w-full flex-col overflow-hidden border-l border-[#403A35]/10 bg-[#FFF7EB] text-[#3D3732] shadow-[-18px_0_55px_rgba(0,0,0,0.2)] sm:w-[430px]"
      >

        {/* =================================================
            HEADER
        ================================================= */}

        <header className="shrink-0 border-b border-[#403A35]/10 bg-white px-4 py-4">

          <div className="flex items-start justify-between gap-3">

            <div>

              <p className="text-[9px] font-black uppercase tracking-[0.18em] text-[#CC3A63]">
                Cohiva Classroom
              </p>

              <div className="mt-1 flex items-center gap-2">

                <h2 className="text-lg font-black text-[#3D3732]">
                  Participants
                </h2>

                <span className="rounded-full bg-[#A2AB73]/15 px-2.5 py-1 text-[9px] font-black text-[#737C4C]">
                  {participants.length}
                </span>

              </div>

            </div>

            <button
              type="button"
              aria-label="Close participants panel"
              onClick={
                onClose
              }
              className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#F9F0E0] text-lg font-black text-[#3D3732] transition hover:bg-[#CC3A63]/10 hover:text-[#CC3A63]"
            >
              ×
            </button>

          </div>

          {/* SEARCH */}

          <div className="relative mt-4">

            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm">
              🔎
            </span>

            <input
              type="text"
              value={
                search
              }
              onChange={(
                event
              ) =>
                setSearch(
                  event.target.value
                )
              }
              placeholder="Search participants..."
              className="h-11 w-full rounded-2xl border border-[#403A35]/10 bg-[#FFF7EB] pl-10 pr-3 text-sm font-semibold text-[#3D3732] outline-none transition placeholder:text-[#756E64]/55 focus:border-[#A2AB73]"
            />

          </div>

        </header>

        {/* =================================================
            ERROR
        ================================================= */}

        {error && (
          <div
            role="alert"
            className="shrink-0 border-b border-[#CC3A63]/15 bg-[#CC3A63]/10 px-4 py-2.5 text-xs font-bold text-[#CC3A63]"
          >
            {error}
          </div>
        )}

        {/* =================================================
            CLASS-WIDE RESTRICTIONS
        ================================================= */}

        {teacher &&
          (
            !classPermissions.studentMic ||
            !classPermissions.studentCamera ||
            !classPermissions.studentScreenShare
          ) && (
          <div className="shrink-0 border-b border-[#403A35]/10 bg-[#F9F0E0] px-4 py-3">

            <p className="text-[9px] font-black uppercase tracking-[0.13em] text-[#756E64]">
              Class-wide blocks
            </p>

            <div className="mt-2 flex flex-wrap gap-1.5">

              {!classPermissions.studentMic && (
                <span className="rounded-full bg-white px-2 py-1 text-[9px] font-black text-[#CC3A63]">
                  🔇 All microphones
                </span>
              )}

              {!classPermissions.studentCamera && (
                <span className="rounded-full bg-white px-2 py-1 text-[9px] font-black text-[#CC3A63]">
                  📷 All cameras
                </span>
              )}

              {!classPermissions.studentScreenShare && (
                <span className="rounded-full bg-white px-2 py-1 text-[9px] font-black text-[#CC3A63]">
                  🚫 All screen sharing
                </span>
              )}

            </div>

            <p className="mt-2 text-[9px] leading-4 text-[#756E64]">
              Change class-wide permissions from Meeting Settings.
            </p>

          </div>
        )}

        {/* =================================================
            PARTICIPANT LIST
        ================================================= */}

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3">

          {filteredParticipants.length ===
            0 && (
            <div className="flex h-full items-center justify-center">

              <div className="text-center">

                <div className="text-3xl">
                  👥
                </div>

                <p className="mt-3 text-sm font-black text-[#3D3732]">
                  No participants found
                </p>

              </div>

            </div>
          )}

          <div className="space-y-3">

            {filteredParticipants.map(
              (
                participant
              ) => {
                const participantId =
                  participant.userId;

                const name =
                  participant.name ||
                  "Participant";

                const local =
                  participant.isLocalParticipant;

                const raised =
                  raisedHands.has(
                    participantId
                  );

                /* =====================================
                   CURRENT MEDIA TRACKS
                ===================================== */

                const micPublishing =
                  hasAudio(
                    participant
                  );

                const cameraPublishing =
                  hasVideo(
                    participant
                  );

                const sharing =
                  hasScreenShare(
                    participant
                  );

                /* =====================================
                   INDIVIDUAL PERMISSION STATE
                ===================================== */

                const individualMicBlocked =
                  blockedMic.has(
                    participantId
                  );

                const individualCameraBlocked =
                  blockedCamera.has(
                    participantId
                  );

                const individualShareBlocked =
                  blockedShare.has(
                    participantId
                  );

                /* =====================================
                   EFFECTIVE STATE
                ===================================== */

                const effectiveMicBlocked =
                  !classPermissions.studentMic ||
                  individualMicBlocked;

                const effectiveCameraBlocked =
                  !classPermissions.studentCamera ||
                  individualCameraBlocked;

                const effectiveShareBlocked =
                  !classPermissions.studentScreenShare ||
                  individualShareBlocked;

                /* =====================================
                   BUSY
                ===================================== */

                const micBusy =
                  busyAction ===
                  actionKey(
                    participantId,
                    "mic"
                  );

                const cameraBusy =
                  busyAction ===
                  actionKey(
                    participantId,
                    "camera"
                  );

                const shareBusy =
                  busyAction ===
                  actionKey(
                    participantId,
                    "share"
                  );

                const removeBusy =
                  busyAction ===
                  actionKey(
                    participantId,
                    "remove"
                  );

                return (
                  <article
                    key={
                      participant.sessionId
                    }
                    className={`rounded-[20px] border p-3 transition ${
                      raised
                        ? "border-[#FACC15]/60 bg-[#FFF7C8]/30"
                        : "border-[#403A35]/10 bg-white"
                    }`}
                  >

                    {/* =====================================
                        USER INFO
                    ===================================== */}

                    <div className="flex items-center gap-3">

                      {/* AVATAR */}

                      <div className="relative shrink-0">

                        {participant.image ? (
                          <img
                            src={
                              participant.image
                            }
                            alt=""
                            className="h-11 w-11 rounded-full object-cover"
                          />
                        ) : (
                          <div className="flex h-11 w-11 items-center justify-center rounded-full bg-[#403A35] text-sm font-black text-white">
                            {name
                              .charAt(
                                0
                              )
                              .toUpperCase()}
                          </div>
                        )}

                        {participant.isSpeaking && (
                          <span
                            title="Speaking"
                            className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full border-2 border-white bg-[#A2AB73] text-[8px]"
                          >
                            🔊
                          </span>
                        )}

                      </div>

                      {/* NAME */}

                      <div className="min-w-0 flex-1">

                        <div className="flex items-center gap-2">

                          <p className="truncate text-sm font-black text-[#3D3732]">
                            {name}
                          </p>

                          {local && (
                            <span className="rounded-full bg-[#403A35]/10 px-2 py-0.5 text-[8px] font-black text-[#756E64]">
                              You
                            </span>
                          )}

                        </div>

                        {/* =================================
                            MEDIA STATUS
                        ================================= */}

                        <div className="mt-1.5 flex flex-wrap gap-1.5">

                          {/* MIC */}

                          <span
                            className={`rounded-full px-2 py-1 text-[8px] font-black ${
                              effectiveMicBlocked
                                ? "bg-[#CC3A63]/10 text-[#CC3A63]"
                                : micPublishing
                                  ? "bg-[#A2AB73]/15 text-[#737C4C]"
                                  : "bg-[#403A35]/10 text-[#756E64]"
                            }`}
                          >
                            {effectiveMicBlocked
                              ? "🔒 Mic blocked"
                              : micPublishing
                                ? "🎙 Mic on"
                                : "🔇 Mic off"}
                          </span>

                          {/* CAMERA */}

                          <span
                            className={`rounded-full px-2 py-1 text-[8px] font-black ${
                              effectiveCameraBlocked
                                ? "bg-[#CC3A63]/10 text-[#CC3A63]"
                                : cameraPublishing
                                  ? "bg-[#A2AB73]/15 text-[#737C4C]"
                                  : "bg-[#403A35]/10 text-[#756E64]"
                            }`}
                          >
                            {effectiveCameraBlocked
                              ? "🔒 Camera blocked"
                              : cameraPublishing
                                ? "🎥 Camera on"
                                : "📷 Camera off"}
                          </span>

                          {/* SHARE BLOCK */}

                          {effectiveShareBlocked && (
                            <span className="rounded-full bg-[#CC3A63]/10 px-2 py-1 text-[8px] font-black text-[#CC3A63]">
                              🔒 Share blocked
                            </span>
                          )}

                          {/* ACTIVE SHARE */}

                          {sharing &&
                            !effectiveShareBlocked && (
                            <span className="rounded-full bg-[#A2AB73]/15 px-2 py-1 text-[8px] font-black text-[#737C4C]">
                              🖥 Sharing
                            </span>
                          )}

                          {/* HAND */}

                          {raised && (
                            <span className="rounded-full bg-[#FACC15]/30 px-2 py-1 text-[8px] font-black text-[#75620A]">
                              ✋ Raised
                            </span>
                          )}

                        </div>

                      </div>

                    </div>

                    {/* =====================================
                        INDIVIDUAL TEACHER CONTROLS
                    ===================================== */}

                    {teacher &&
                      !local && (
                      <div className="mt-3 border-t border-[#403A35]/10 pt-3">

                        <p className="mb-2 text-[8px] font-black uppercase tracking-[0.15em] text-[#756E64]/70">
                          Individual Controls
                        </p>

                        <div className="grid grid-cols-3 gap-2">

                          {/* =============================
                              AUDIO

                              ALLOW only appears if this
                              participant was individually
                              disabled.
                          ============================= */}

                          <button
                            type="button"
                            disabled={
                              micBusy ||
                              !classPermissions.studentMic
                            }
                            onClick={() =>
                              void toggleMicrophonePermission(
                                participantId,
                                name
                              )
                            }
                            className={`rounded-xl px-2 py-2.5 text-[9px] font-black transition disabled:cursor-not-allowed disabled:opacity-40 ${
                              individualMicBlocked
                                ? "bg-[#A2AB73]/15 text-[#737C4C] hover:bg-[#A2AB73] hover:text-white"
                                : "bg-[#CC3A63]/10 text-[#CC3A63] hover:bg-[#CC3A63] hover:text-white"
                            }`}
                          >
                            {micBusy
                              ? "..."
                              : !classPermissions.studentMic
                                ? "🔒 All mic"
                                : individualMicBlocked
                                  ? "🎙 Allow audio"
                                  : "🔇 Disable audio"}
                          </button>

                          {/* =============================
                              VIDEO
                          ============================= */}

                          <button
                            type="button"
                            disabled={
                              cameraBusy ||
                              !classPermissions.studentCamera
                            }
                            onClick={() =>
                              void toggleCameraPermission(
                                participantId,
                                name
                              )
                            }
                            className={`rounded-xl px-2 py-2.5 text-[9px] font-black transition disabled:cursor-not-allowed disabled:opacity-40 ${
                              individualCameraBlocked
                                ? "bg-[#A2AB73]/15 text-[#737C4C] hover:bg-[#A2AB73] hover:text-white"
                                : "bg-[#CC3A63]/10 text-[#CC3A63] hover:bg-[#CC3A63] hover:text-white"
                            }`}
                          >
                            {cameraBusy
                              ? "..."
                              : !classPermissions.studentCamera
                                ? "🔒 All video"
                                : individualCameraBlocked
                                  ? "🎥 Allow video"
                                  : "📷 Disable video"}
                          </button>

                          {/* =============================
                              SCREEN SHARE
                          ============================= */}

                          <button
                            type="button"
                            disabled={
                              shareBusy ||
                              !classPermissions.studentScreenShare
                            }
                            onClick={() =>
                              void toggleScreenSharePermission(
                                participantId,
                                name
                              )
                            }
                            className={`rounded-xl px-2 py-2.5 text-[9px] font-black transition disabled:cursor-not-allowed disabled:opacity-40 ${
                              individualShareBlocked
                                ? "bg-[#A2AB73]/15 text-[#737C4C] hover:bg-[#A2AB73] hover:text-white"
                                : "bg-[#CC3A63]/10 text-[#CC3A63] hover:bg-[#CC3A63] hover:text-white"
                            }`}
                          >
                            {shareBusy
                              ? "..."
                              : !classPermissions.studentScreenShare
                                ? "🔒 All share"
                                : individualShareBlocked
                                  ? "🖥 Allow sharing"
                                  : "🚫 Disable share"}
                          </button>

                        </div>

                        {/* REMOVE */}

                        <button
                          type="button"
                          disabled={
                            removeBusy
                          }
                          onClick={() =>
                            void removeParticipant(
                              participantId,
                              name
                            )
                          }
                          className="mt-2 w-full rounded-xl border border-[#CC3A63]/20 bg-[#CC3A63]/5 px-3 py-2.5 text-[10px] font-black text-[#CC3A63] transition hover:bg-[#CC3A63] hover:text-white disabled:cursor-wait disabled:opacity-50"
                        >
                          {removeBusy
                            ? "Removing..."
                            : "🚪 Remove from meeting"}
                        </button>

                      </div>
                    )}

                  </article>
                );
              }
            )}

          </div>

        </div>

        {/* =================================================
            FOOTER
        ================================================= */}

        <footer className="shrink-0 border-t border-[#403A35]/10 bg-white p-3">

          {teacher ? (
            <>

              <div className="mb-2 rounded-xl bg-[#F9F0E0] px-3 py-2">

                <p className="text-[9px] leading-4 text-[#756E64]">
                  Disable audio, video, or screen sharing to prevent that participant from using the feature. The Allow option appears only after you disable that permission.
                </p>

              </div>

              <button
                type="button"
                disabled={
                  endingCall
                }
                onClick={() =>
                  void endClass()
                }
                className="w-full rounded-[14px] bg-[#CC3A63] px-4 py-3 text-xs font-black text-white transition hover:bg-[#B83259] disabled:cursor-wait disabled:opacity-60"
              >
                {endingCall
                  ? "Ending class for everyone..."
                  : "⏹ End Class for Everyone"}
              </button>

            </>
          ) : (
            <p className="px-2 py-1 text-center text-[10px] font-semibold text-[#756E64]">
              Only the meeting teacher can moderate participants.
            </p>
          )}

        </footer>

      </aside>

    </>
  );
};

export default MeetingParticipantsPanel;