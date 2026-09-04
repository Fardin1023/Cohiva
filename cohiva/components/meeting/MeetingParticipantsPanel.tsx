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
  useState,
} from "react";

import type {
  CohivaPermissions,
} from "./MeetingPermissionsPanel";

type MeetingParticipantsPanelProps = {
  open: boolean;
  onClose: () => void;

  raisedHands:
    ReadonlySet<string>;

  classPermissions:
    CohivaPermissions;
};

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
  } =
    useCallStateHooks();

  const participants =
    useParticipants();

  const [
    busyUserId,
    setBusyUserId,
  ] =
    useState<string | null>(
      null
    );

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

  const [
    error,
    setError,
  ] =
    useState("");

  const [
    ending,
    setEnding,
  ] =
    useState(false);

  if (
    !open ||
    !call
  ) {
    return null;
  }

  const teacherId =
    call.state.createdBy?.id;

  const isTeacher =
    call.isCreatedByMe;

  /* =====================================================
     BLOCK / ALLOW MIC
  ===================================================== */

  const toggleMicPermission =
    async (
      userId: string
    ) => {
      try {
        setBusyUserId(userId);
        setError("");

        if (
          blockedMic.has(
            userId
          )
        ) {
          await call.grantPermissions(
            userId,
            [
              OwnCapability.SEND_AUDIO,
            ]
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
        } else {
          await call.revokePermissions(
            userId,
            [
              OwnCapability.SEND_AUDIO,
            ]
          );

          setBlockedMic(
            (
              current
            ) =>
              new Set(
                current
              ).add(
                userId
              )
          );
        }
      } catch (permissionError) {
        console.error(
          "Mic permission error:",
          permissionError
        );

        setError(
          "Unable to change microphone permission."
        );
      } finally {
        setBusyUserId(null);
      }
    };

  /* =====================================================
     BLOCK / ALLOW CAMERA
  ===================================================== */

  const toggleCameraPermission =
    async (
      userId: string
    ) => {
      try {
        setBusyUserId(userId);
        setError("");

        if (
          blockedCamera.has(
            userId
          )
        ) {
          await call.grantPermissions(
            userId,
            [
              OwnCapability.SEND_VIDEO,
            ]
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
        } else {
          await call.revokePermissions(
            userId,
            [
              OwnCapability.SEND_VIDEO,
            ]
          );

          setBlockedCamera(
            (
              current
            ) =>
              new Set(
                current
              ).add(
                userId
              )
          );
        }
      } catch (permissionError) {
        console.error(
          "Camera permission error:",
          permissionError
        );

        setError(
          "Unable to change camera permission."
        );
      } finally {
        setBusyUserId(null);
      }
    };

  /* =====================================================
     BLOCK / ALLOW SCREEN SHARE
  ===================================================== */

  const toggleScreenPermission =
    async (
      userId: string
    ) => {
      try {
        setBusyUserId(userId);
        setError("");

        if (
          blockedShare.has(
            userId
          )
        ) {
          await call.grantPermissions(
            userId,
            [
              OwnCapability.SCREENSHARE,
            ]
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
        } else {
          await call.revokePermissions(
            userId,
            [
              OwnCapability.SCREENSHARE,
            ]
          );

          setBlockedShare(
            (
              current
            ) =>
              new Set(
                current
              ).add(
                userId
              )
          );
        }
      } catch (permissionError) {
        console.error(
          "Screen permission error:",
          permissionError
        );

        setError(
          "Unable to change screen sharing permission."
        );
      } finally {
        setBusyUserId(null);
      }
    };

  /* =====================================================
     REMOVE
  ===================================================== */

  const removeParticipant =
    async (
      userId: string
    ) => {
      const confirmed =
        window.confirm(
          "Remove this participant from the class?"
        );

      if (!confirmed) {
        return;
      }

      try {
        setBusyUserId(userId);
        setError("");

        await call.kickUser({
          user_id:
            userId,
        });
      } catch (removeError) {
        console.error(
          "Remove participant error:",
          removeError
        );

        setError(
          "Unable to remove this participant."
        );
      } finally {
        setBusyUserId(null);
      }
    };

  /* =====================================================
     END CLASS
  ===================================================== */

  const endClass =
    async () => {
      if (!isTeacher) {
        return;
      }

      const confirmed =
        window.confirm(
          "End this class for everyone?"
        );

      if (!confirmed) {
        return;
      }

      try {
        setEnding(true);

        await call.endCall();

        onClose();
      } catch (endError) {
        console.error(
          "End class error:",
          endError
        );

        setEnding(false);

        setError(
          "Unable to end this class."
        );
      }
    };

  return (
    <div className="fixed inset-0 z-[220] bg-black/45 backdrop-blur-sm">

      <button
        type="button"
        aria-label="Close participants"
        onClick={onClose}
        className="absolute inset-0"
      />

      <aside className="absolute bottom-3 right-3 top-3 z-10 flex w-[calc(100%-24px)] max-w-[410px] flex-col overflow-hidden rounded-[28px] bg-[#FFF7EB] shadow-2xl">

        <div className="flex shrink-0 items-center justify-between border-b border-[#403A35]/10 px-5 py-4">

          <div>

            <p className="text-[9px] font-black uppercase tracking-[0.18em] text-[#CC3A63]">
              Cohiva Classroom
            </p>

            <h2 className="mt-1 text-xl font-black text-[#3D3732]">
              Participants
            </h2>

            <p className="mt-1 text-xs text-[#756E64]">
              {participants.length} in class
            </p>

          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close participants"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-[#403A35]/10 text-xl font-black text-[#403A35]"
          >
            ×
          </button>

        </div>

        {error && (
          <div className="mx-4 mt-3 rounded-xl bg-[#CC3A63]/10 p-3 text-xs font-bold text-[#CC3A63]">
            {error}
          </div>
        )}

        {/* ONLY LIST SCROLLS */}

        <div className="min-h-0 flex-1 overflow-y-auto p-3">

          <div className="space-y-2">

            {participants.map(
              (
                participant
              ) => {
                const micOn =
                  hasAudio(
                    participant
                  );

                const cameraOn =
                  hasVideo(
                    participant
                  );

                const shareOn =
                  hasScreenShare(
                    participant
                  );

                const local =
                  participant.isLocalParticipant;

                const teacher =
                  participant.userId ===
                  teacherId;

                const hand =
                  raisedHands.has(
                    participant.userId
                  );

                const busy =
                  busyUserId ===
                  participant.userId;

                const micClassBlocked =
                  !classPermissions.studentMic;

                const cameraClassBlocked =
                  !classPermissions.studentCamera;

                const shareClassBlocked =
                  !classPermissions.studentScreenShare;

                return (
                  <article
                    key={
                      participant.sessionId
                    }
                    className={`rounded-[20px] border p-3 ${
                      participant.isSpeaking
                        ? "border-[#A2AB73] bg-[#A2AB73]/10"
                        : "border-[#403A35]/10 bg-white"
                    }`}
                  >

                    <div className="flex items-center gap-3">

                      {participant.image ? (
                        <img
                          src={
                            participant.image
                          }
                          alt={
                            participant.name ||
                            "Participant"
                          }
                          className="h-11 w-11 rounded-full object-cover"
                        />
                      ) : (
                        <div className="flex h-11 w-11 items-center justify-center rounded-full bg-[#403A35] font-black text-white">
                          {(
                            participant.name ||
                            participant.userId
                          )
                            .charAt(0)
                            .toUpperCase()}
                        </div>
                      )}

                      <div className="min-w-0 flex-1">

                        <div className="flex flex-wrap items-center gap-1.5">

                          <p className="truncate text-sm font-black text-[#3D3732]">
                            {participant.name ||
                              participant.userId}
                          </p>

                          {teacher && (
                            <span className="rounded-full bg-[#CC3A63]/10 px-2 py-0.5 text-[8px] font-black uppercase text-[#CC3A63]">
                              Teacher
                            </span>
                          )}

                          {local && (
                            <span className="rounded-full bg-[#403A35]/10 px-2 py-0.5 text-[8px] font-black uppercase text-[#756E64]">
                              You
                            </span>
                          )}

                          {hand && (
                            <span className="rounded-full bg-[#FACC15]/20 px-2 py-0.5 text-[9px] font-black text-[#806200]">
                              ✋ Hand
                            </span>
                          )}

                        </div>

                        <div className="mt-2 flex gap-2 text-xs">

                          <span>
                            {micOn
                              ? "🎙"
                              : "🔇"}
                          </span>

                          <span>
                            {cameraOn
                              ? "🎥"
                              : "📷"}
                          </span>

                          {shareOn && (
                            <span>
                              🖥
                            </span>
                          )}

                          {participant.isSpeaking && (
                            <span className="font-bold text-[#737C4C]">
                              Speaking
                            </span>
                          )}

                        </div>

                      </div>

                    </div>

                    {isTeacher &&
                      !local &&
                      !teacher && (
                        <div className="mt-3 grid grid-cols-2 gap-2">

                          <button
                            type="button"
                            disabled={
                              busy ||
                              micClassBlocked
                            }
                            onClick={() =>
                              void toggleMicPermission(
                                participant.userId
                              )
                            }
                            className={`rounded-xl px-3 py-2 text-[10px] font-black disabled:opacity-35 ${
                              blockedMic.has(
                                participant.userId
                              )
                                ? "bg-[#A2AB73]/15 text-[#737C4C]"
                                : "bg-[#CC3A63]/10 text-[#CC3A63]"
                            }`}
                          >
                            {micClassBlocked
                              ? "🔒 Class mic blocked"
                              : blockedMic.has(
                                    participant.userId
                                  )
                                ? "🎙 Allow mic"
                                : "🚫 Block mic"}
                          </button>

                          <button
                            type="button"
                            disabled={
                              busy ||
                              cameraClassBlocked
                            }
                            onClick={() =>
                              void toggleCameraPermission(
                                participant.userId
                              )
                            }
                            className={`rounded-xl px-3 py-2 text-[10px] font-black disabled:opacity-35 ${
                              blockedCamera.has(
                                participant.userId
                              )
                                ? "bg-[#A2AB73]/15 text-[#737C4C]"
                                : "bg-[#CC3A63]/10 text-[#CC3A63]"
                            }`}
                          >
                            {cameraClassBlocked
                              ? "🔒 Class camera blocked"
                              : blockedCamera.has(
                                    participant.userId
                                  )
                                ? "🎥 Allow camera"
                                : "🚫 Block camera"}
                          </button>

                          <button
                            type="button"
                            disabled={
                              busy ||
                              shareClassBlocked
                            }
                            onClick={() =>
                              void toggleScreenPermission(
                                participant.userId
                              )
                            }
                            className={`rounded-xl px-3 py-2 text-[10px] font-black disabled:opacity-35 ${
                              blockedShare.has(
                                participant.userId
                              )
                                ? "bg-[#A2AB73]/15 text-[#737C4C]"
                                : "bg-[#F9F0E0] text-[#3D3732]"
                            }`}
                          >
                            {shareClassBlocked
                              ? "🔒 Sharing blocked"
                              : blockedShare.has(
                                    participant.userId
                                  )
                                ? "🖥 Allow share"
                                : "🚫 Block share"}
                          </button>

                          <button
                            type="button"
                            disabled={busy}
                            onClick={() =>
                              void removeParticipant(
                                participant.userId
                              )
                            }
                            className="rounded-xl bg-[#CC3A63] px-3 py-2 text-[10px] font-black text-white disabled:opacity-35"
                          >
                            Remove
                          </button>

                        </div>
                      )}

                  </article>
                );
              }
            )}

          </div>

        </div>

        {isTeacher && (
          <div className="shrink-0 border-t border-[#403A35]/10 bg-[#F9F0E0] p-4">

            <button
              type="button"
              onClick={() =>
                void endClass()
              }
              disabled={ending}
              className="w-full rounded-2xl bg-[#CC3A63] px-4 py-3 text-sm font-black text-white disabled:opacity-60"
            >
              {ending
                ? "Ending class..."
                : "End class for everyone"}
            </button>

          </div>
        )}

      </aside>

    </div>
  );
};

export default MeetingParticipantsPanel;