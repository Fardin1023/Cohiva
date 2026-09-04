"use client";

import {
  DefaultParticipantViewUI,
  GenericMenu,
  GenericMenuButtonItem,
  Icon,
  OwnCapability,
  Restricted,
  hasAudio,
  hasScreenShare,
  hasVideo,
  useCall,
  useCallStateHooks,
  useMenuContext,
  useParticipantViewContext,
} from "@stream-io/video-react-sdk";

import {
  useEffect,
  useState,
} from "react";

import {
  isIndividualPermissionAllowed,
  saveIndividualPermission,
} from "./cohivaParticipantPermissions";

/* =========================================================
   TYPES
========================================================= */

type GlobalPermissions = {
  studentMic?: boolean;
  studentCamera?: boolean;
  studentScreenShare?: boolean;
};

/* =========================================================
   CUSTOM PARTICIPANT ACTION MENU
========================================================= */

export const CohivaParticipantActionsMenu =
  () => {
    const call =
      useCall();

    const {
      participant,
      participantViewElement,
    } =
      useParticipantViewContext();

    const {
      useCallCustomData,
    } =
      useCallStateHooks();

    const custom =
      useCallCustomData();

    const menuContext =
      useMenuContext();

    const close =
      menuContext?.close;

    const {
      userId,
      sessionId,
      pin,
      isLocalParticipant,
    } =
      participant;

    /* =====================================================
       FULLSCREEN STATE
    ===================================================== */

    const [
      fullscreen,
      setFullscreen,
    ] =
      useState(
        Boolean(
          document.fullscreenElement
        )
      );

    /* =====================================================
       GLOBAL CLASS PERMISSIONS
    ===================================================== */

    const globalPermissions =
      custom
        ?.cohiva_permissions as
        | GlobalPermissions
        | undefined;

    const classAudioAllowed =
      globalPermissions
        ?.studentMic !==
      false;

    const classVideoAllowed =
      globalPermissions
        ?.studentCamera !==
      false;

    const classShareAllowed =
      globalPermissions
        ?.studentScreenShare !==
      false;

    /* =====================================================
       INDIVIDUAL PERMISSION STATE
    ===================================================== */

    const audioAllowed =
      isIndividualPermissionAllowed(
        custom,
        userId,
        "audio"
      );

    const videoAllowed =
      isIndividualPermissionAllowed(
        custom,
        userId,
        "video"
      );

    const screenShareAllowed =
      isIndividualPermissionAllowed(
        custom,
        userId,
        "screenShare"
      );

    /* =====================================================
       CURRENT MEDIA TRACKS

       These determine whether temporary
       mute/turn-off actions are relevant.

       They DO NOT determine permission state.
    ===================================================== */

    const participantHasAudio =
      hasAudio(
        participant
      );

    const participantHasVideo =
      hasVideo(
        participant
      );

    const participantSharing =
      hasScreenShare(
        participant
      );

    /* =====================================================
       PIN STATE

       pin === undefined
         → no pin

       pin.isLocalPin === true
         → pinned only for this user

       pin.isLocalPin === false
         → pinned for everyone
    ===================================================== */

    const isLocallyPinned =
      Boolean(
        pin?.isLocalPin
      );

    const isPinnedForEveryone =
      Boolean(
        pin &&
        !pin.isLocalPin
      );

    /* =====================================================
       FULLSCREEN LISTENER
    ===================================================== */

    useEffect(() => {
      const handleFullscreenChange =
        () => {
          setFullscreen(
            Boolean(
              document.fullscreenElement
            )
          );
        };

      document.addEventListener(
        "fullscreenchange",
        handleFullscreenChange
      );

      return () => {
        document.removeEventListener(
          "fullscreenchange",
          handleFullscreenChange
        );
      };
    }, []);

    /* =====================================================
       LOCAL PIN / UNPIN
    ===================================================== */

    const togglePin =
      () => {
        if (!call) {
          return;
        }

        /*
         * Locally pinned
         * → show Unpin
         * → unpin when clicked.
         */

        if (
          isLocallyPinned
        ) {
          call.unpin(
            sessionId
          );

          return;
        }

        /*
         * Not locally pinned
         * → Pin
         */

        call.pin(
          sessionId
        );
      };

    /* =====================================================
       PIN FOR EVERYONE
    ===================================================== */

    const pinForEveryone =
      async () => {
        if (!call) {
          return;
        }

        try {
          await call.pinForEveryone({
            user_id:
              userId,

            session_id:
              sessionId,
          });
        } catch (
          error
        ) {
          console.error(
            "Pin for everyone error:",
            error
          );
        }
      };

    /* =====================================================
       UNPIN FOR EVERYONE
    ===================================================== */

    const unpinForEveryone =
      async () => {
        if (!call) {
          return;
        }

        try {
          await call.unpinForEveryone({
            user_id:
              userId,

            session_id:
              sessionId,
          });
        } catch (
          error
        ) {
          console.error(
            "Unpin for everyone error:",
            error
          );
        }
      };

    /* =====================================================
       BLOCK USER

       IMPORTANT:
       This is a full meeting block.

       It is deliberately separate from:
         Disable audio
         Disable video
         Disable screen sharing
    ===================================================== */

    const blockUser =
      async () => {
        if (
          !call ||
          isLocalParticipant
        ) {
          return;
        }

        const confirmed =
          window.confirm(
            `Block ${
              participant.name ||
              "this participant"
            } from this meeting?\n\nThey will not be able to rejoin until they are unblocked.`
          );

        if (
          !confirmed
        ) {
          return;
        }

        try {
          await call.blockUser(
            userId
          );
        } catch (
          error
        ) {
          console.error(
            "Block participant error:",
            error
          );
        }
      };

    /* =====================================================
       KICK USER

       Removes them from current meeting,
       but does NOT permanently block them.
    ===================================================== */

    const kickUser =
      async () => {
        if (
          !call ||
          isLocalParticipant
        ) {
          return;
        }

        const confirmed =
          window.confirm(
            `Remove ${
              participant.name ||
              "this participant"
            } from the meeting?`
          );

        if (
          !confirmed
        ) {
          return;
        }

        try {
          await call.kickUser({
            user_id:
              userId,
          });
        } catch (
          error
        ) {
          console.error(
            "Kick participant error:",
            error
          );
        }
      };

    /* =====================================================
       TEMPORARY AUDIO MUTE

       Does NOT revoke permission.
    ===================================================== */

    const muteAudio =
      async () => {
        if (!call) {
          return;
        }

        try {
          await call.muteUser(
            userId,
            "audio"
          );
        } catch (
          error
        ) {
          console.error(
            "Mute participant audio error:",
            error
          );
        }
      };

    /* =====================================================
       TEMPORARY VIDEO OFF
    ===================================================== */

    const muteVideo =
      async () => {
        if (!call) {
          return;
        }

        try {
          await call.muteUser(
            userId,
            "video"
          );
        } catch (
          error
        ) {
          console.error(
            "Turn participant video off error:",
            error
          );
        }
      };

    /* =====================================================
       TEMPORARY SCREEN SHARE STOP
    ===================================================== */

    const muteScreenShare =
      async () => {
        if (!call) {
          return;
        }

        try {
          await call.muteUser(
            userId,
            "screenshare"
          );
        } catch (
          error
        ) {
          console.error(
            "Stop screen sharing error:",
            error
          );
        }
      };

    /* =====================================================
       DISABLE AUDIO

       Revokes permission so the participant
       cannot turn audio back on.
    ===================================================== */

    const disableAudio =
      async () => {
        if (!call) {
          return;
        }

        try {
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
        } catch (
          error
        ) {
          console.error(
            "Disable audio error:",
            error
          );
        }
      };

    /* =====================================================
       ALLOW AUDIO
    ===================================================== */

    const allowAudio =
      async () => {
        if (
          !call ||
          !classAudioAllowed
        ) {
          return;
        }

        try {
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
        } catch (
          error
        ) {
          console.error(
            "Allow audio error:",
            error
          );
        }
      };

    /* =====================================================
       DISABLE VIDEO
    ===================================================== */

    const disableVideo =
      async () => {
        if (!call) {
          return;
        }

        try {
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
        } catch (
          error
        ) {
          console.error(
            "Disable video error:",
            error
          );
        }
      };

    /* =====================================================
       ALLOW VIDEO
    ===================================================== */

    const allowVideo =
      async () => {
        if (
          !call ||
          !classVideoAllowed
        ) {
          return;
        }

        try {
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
        } catch (
          error
        ) {
          console.error(
            "Allow video error:",
            error
          );
        }
      };

    /* =====================================================
       DISABLE SCREEN SHARING
    ===================================================== */

    const disableScreenShare =
      async () => {
        if (!call) {
          return;
        }

        try {
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
        } catch (
          error
        ) {
          console.error(
            "Disable screen sharing error:",
            error
          );
        }
      };

    /* =====================================================
       ALLOW SCREEN SHARING
    ===================================================== */

    const allowScreenShare =
      async () => {
        if (
          !call ||
          !classShareAllowed
        ) {
          return;
        }

        try {
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
        } catch (
          error
        ) {
          console.error(
            "Allow screen sharing error:",
            error
          );
        }
      };

    /* =====================================================
       FULLSCREEN
    ===================================================== */

    const toggleFullscreen =
      async () => {
        try {
          if (
            !fullscreen
          ) {
            await participantViewElement
              ?.requestFullscreen();

            return;
          }

          await document
            .exitFullscreen();
        } catch (
          error
        ) {
          console.error(
            "Fullscreen error:",
            error
          );
        }
      };

    /* =====================================================
       REMOTE PARTICIPANT
    ===================================================== */

    const remote =
      !isLocalParticipant;

    /* =====================================================
       MENU
    ===================================================== */

    return (
      <GenericMenu
        onItemClick={
          close
        }
      >

        {/* =================================================
            LOCAL PIN / UNPIN

            NO PIN:
              Pin

            LOCAL PIN:
              Unpin

            GLOBAL PIN:
              Local Pin/Unpin hidden
        ================================================= */}

        {!isPinnedForEveryone && (
          <GenericMenuButtonItem
            onClick={
              togglePin
            }
          >
            <Icon icon="pin" />

            {isLocallyPinned
              ? "Unpin"
              : "Pin"}
          </GenericMenuButtonItem>
        )}

        {/* =================================================
            PIN FOR EVERYONE / UNPIN FOR EVERYONE

            NORMAL:
              Pin for everyone

            AFTER GLOBAL PIN:
              Unpin for everyone
        ================================================= */}

        <Restricted
          requiredGrants={[
            OwnCapability.PIN_FOR_EVERYONE,
          ]}
        >

          {isPinnedForEveryone ? (
            <GenericMenuButtonItem
              onClick={() =>
                void unpinForEveryone()
              }
            >
              <Icon icon="pin" />

              Unpin for everyone
            </GenericMenuButtonItem>
          ) : (
            <GenericMenuButtonItem
              onClick={() =>
                void pinForEveryone()
              }
            >
              <Icon icon="pin" />

              Pin for everyone
            </GenericMenuButtonItem>
          )}

        </Restricted>

        {/* =================================================
            BLOCK
        ================================================= */}

        {remote && (
          <Restricted
            requiredGrants={[
              OwnCapability.BLOCK_USERS,
            ]}
          >

            <GenericMenuButtonItem
              onClick={() =>
                void blockUser()
              }
            >
              <Icon icon="not-allowed" />

              Block
            </GenericMenuButtonItem>

          </Restricted>
        )}

        {/* =================================================
            KICK
        ================================================= */}

        {remote && (
          <Restricted
            requiredGrants={[
              OwnCapability.KICK_USER,
            ]}
          >

            <GenericMenuButtonItem
              onClick={() =>
                void kickUser()
              }
            >
              <Icon icon="kick-user" />

              Kick
            </GenericMenuButtonItem>

          </Restricted>
        )}

        {/* =================================================
            FULLSCREEN
        ================================================= */}

        {participantViewElement &&
          typeof participantViewElement
            .requestFullscreen !==
            "undefined" && (
          <GenericMenuButtonItem
            onClick={() =>
              void toggleFullscreen()
            }
          >
            {fullscreen
              ? "Leave fullscreen"
              : "Enter fullscreen"}
          </GenericMenuButtonItem>
        )}

        {/* =================================================
            TEMPORARY MEDIA CONTROLS

            These only appear when the participant
            is currently publishing the track.
        ================================================= */}

        {remote && (
          <Restricted
            requiredGrants={[
              OwnCapability.MUTE_USERS,
            ]}
          >

            {participantHasAudio && (
              <GenericMenuButtonItem
                onClick={() =>
                  void muteAudio()
                }
              >
                <Icon icon="no-audio" />

                Mute audio
              </GenericMenuButtonItem>
            )}

            {participantHasVideo && (
              <GenericMenuButtonItem
                onClick={() =>
                  void muteVideo()
                }
              >
                <Icon icon="camera-off-outline" />

                Turn off video
              </GenericMenuButtonItem>
            )}

            {participantSharing && (
              <GenericMenuButtonItem
                onClick={() =>
                  void muteScreenShare()
                }
              >
                <Icon icon="screen-share-off" />

                Turn off screen share
              </GenericMenuButtonItem>
            )}

          </Restricted>
        )}

        {/* =================================================
            PERMISSION CONTROLS

            IMPORTANT:

            Only ONE option for each capability
            is shown at a time.

            Audio:
              Disable audio
              OR
              Allow audio

            Video:
              Disable video
              OR
              Allow video

            Screen share:
              Disable screen sharing
              OR
              Allow screen sharing
        ================================================= */}

        {remote && (
          <Restricted
            requiredGrants={[
              OwnCapability.UPDATE_CALL_PERMISSIONS,
            ]}
          >

            {/* =============================================
                AUDIO
            ============================================= */}

            {classAudioAllowed &&
              (
                audioAllowed ? (
                  <GenericMenuButtonItem
                    onClick={() =>
                      void disableAudio()
                    }
                  >
                    Disable audio
                  </GenericMenuButtonItem>
                ) : (
                  <GenericMenuButtonItem
                    onClick={() =>
                      void allowAudio()
                    }
                  >
                    Allow audio
                  </GenericMenuButtonItem>
                )
              )}

            {/* =============================================
                VIDEO
            ============================================= */}

            {classVideoAllowed &&
              (
                videoAllowed ? (
                  <GenericMenuButtonItem
                    onClick={() =>
                      void disableVideo()
                    }
                  >
                    Disable video
                  </GenericMenuButtonItem>
                ) : (
                  <GenericMenuButtonItem
                    onClick={() =>
                      void allowVideo()
                    }
                  >
                    Allow video
                  </GenericMenuButtonItem>
                )
              )}

            {/* =============================================
                SCREEN SHARING
            ============================================= */}

            {classShareAllowed &&
              (
                screenShareAllowed ? (
                  <GenericMenuButtonItem
                    onClick={() =>
                      void disableScreenShare()
                    }
                  >
                    Disable screen sharing
                  </GenericMenuButtonItem>
                ) : (
                  <GenericMenuButtonItem
                    onClick={() =>
                      void allowScreenShare()
                    }
                  >
                    Allow screen sharing
                  </GenericMenuButtonItem>
                )
              )}

          </Restricted>
        )}

      </GenericMenu>
    );
  };

/* =========================================================
   SPOTLIGHT PARTICIPANT UI
========================================================= */

export const CohivaParticipantSpotlightUI =
  () => {
    return (
      <DefaultParticipantViewUI
        ParticipantActionsContextMenu={
          CohivaParticipantActionsMenu
        }
      />
    );
  };

/* =========================================================
   PARTICIPANT BAR UI

   Menu opens upward because participant
   bar tiles can sit close to the bottom.
========================================================= */

export const CohivaParticipantBarUI =
  () => {
    return (
      <DefaultParticipantViewUI
        menuPlacement="top-end"
        ParticipantActionsContextMenu={
          CohivaParticipantActionsMenu
        }
      />
    );
  };