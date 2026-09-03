"use client";

import {
  OwnCapability,
  useCall,
  useCallStateHooks,
} from "@stream-io/video-react-sdk";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

/* =========================================================
   TYPES
========================================================= */

type MeetingPermissionsPanelProps = {
  open: boolean;
  onClose: () => void;
};

export type CohivaPermissions = {
  studentMic: boolean;
  studentCamera: boolean;
  studentScreenShare: boolean;
  studentRecording: boolean;
  studentWhiteboard: boolean;
};

/* =========================================================
   DEFAULTS
========================================================= */

export const DEFAULT_COHIVA_PERMISSIONS:
  CohivaPermissions = {
  studentMic: true,
  studentCamera: true,
  studentScreenShare: true,

  /*
   * Recording is controlled by Cohiva UI.
   *
   * IMPORTANT:
   * Stream's updateUserPermissions API
   * does NOT accept recording capabilities.
   */
  studentRecording: false,

  studentWhiteboard: false,
};

/* =========================================================
   PANEL
========================================================= */

const MeetingPermissionsPanel = ({
  open,
  onClose,
}: MeetingPermissionsPanelProps) => {
  const call =
    useCall();

  const {
    useCallCustomData,
    useRemoteParticipants,
  } =
    useCallStateHooks();

  const custom =
    useCallCustomData();

  const remoteParticipants =
    useRemoteParticipants();

  /* =====================================================
     CURRENT COHIVA POLICY
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

  const permissionsRef =
    useRef<CohivaPermissions>(
      permissions
    );

  permissionsRef.current =
    permissions;

  /* =====================================================
     STUDENT IDS
  ===================================================== */

  const remoteUserIds =
    useMemo(
      () =>
        Array.from(
          new Set(
            remoteParticipants
              .map(
                (
                  participant
                ) =>
                  participant.userId
              )
              .filter(
                (
                  id
                ): id is string =>
                  Boolean(id)
              )
          )
        ),
      [
        remoteParticipants,
      ]
    );

  const remoteUserKey =
    remoteUserIds
      .slice()
      .sort()
      .join("|");

  /* =====================================================
     STATE
  ===================================================== */

  const [
    saving,
    setSaving,
  ] =
    useState(false);

  const [
    error,
    setError,
  ] =
    useState("");

  const [
    muting,
    setMuting,
  ] =
    useState(false);

  /* =====================================================
     APPLY STREAM MEDIA PERMISSIONS

     IMPORTANT:
     Stream only allows dynamic moderation of:

     - SEND_AUDIO
     - SEND_VIDEO
     - SCREENSHARE

     Recording is NOT included here.
  ===================================================== */

  const applyStreamPermissions =
    async (
      userIds: string[],
      settings:
        CohivaPermissions
    ) => {
      if (!call) {
        return;
      }

      await Promise.all(
        userIds.map(
          async (
            userId
          ) => {
            const grant:
              OwnCapability[] =
              [];

            const revoke:
              OwnCapability[] =
              [];

            /* ===========================================
               MICROPHONE
            =========================================== */

            if (
              settings.studentMic
            ) {
              grant.push(
                OwnCapability.SEND_AUDIO
              );
            } else {
              revoke.push(
                OwnCapability.SEND_AUDIO
              );
            }

            /* ===========================================
               CAMERA
            =========================================== */

            if (
              settings.studentCamera
            ) {
              grant.push(
                OwnCapability.SEND_VIDEO
              );
            } else {
              revoke.push(
                OwnCapability.SEND_VIDEO
              );
            }

            /* ===========================================
               SCREEN SHARE
            =========================================== */

            if (
              settings.studentScreenShare
            ) {
              grant.push(
                OwnCapability.SCREENSHARE
              );
            } else {
              revoke.push(
                OwnCapability.SCREENSHARE
              );
            }

            /*
             * DO NOT put:
             *
             * START_RECORD_CALL
             * STOP_RECORD_CALL
             *
             * here.
             */

            await call.updateUserPermissions({
              user_id:
                userId,

              grant_permissions:
                grant,

              revoke_permissions:
                revoke,
            });
          }
        )
      );
    };

  /* =====================================================
     APPLY CURRENT RULES TO NEW STUDENTS
  ===================================================== */

  useEffect(() => {
    if (
      !call ||
      !call.isCreatedByMe ||
      !remoteUserKey
    ) {
      return;
    }

    const ids =
      remoteUserKey.split(
        "|"
      );

    void applyStreamPermissions(
      ids,
      permissionsRef.current
    ).catch(
      (
        permissionError
      ) => {
        /*
         * Don't crash or disconnect
         * the meeting because a
         * moderation API failed.
         */
        console.error(
          "New participant permission error:",
          permissionError
        );
      }
    );
  }, [
    call,
    remoteUserKey,
  ]);

  /* =====================================================
     CHANGE SETTING
  ===================================================== */

  const changePermission =
    async (
      key:
        keyof CohivaPermissions
    ) => {
      if (
        !call ||
        !call.isCreatedByMe ||
        saving
      ) {
        return;
      }

      const next:
        CohivaPermissions = {
        ...permissions,

        [key]:
          !permissions[
            key
          ],
      };

      try {
        setSaving(
          true
        );

        setError(
          ""
        );

        /* =============================================
           SAVE COHIVA POLICY
        ============================================= */

        await call.update({
          custom: {
            ...(custom ?? {}),

            cohiva_permissions:
              next,
          },
        });

        /* =============================================
           STREAM MEDIA PERMISSIONS

           Whiteboard and recording
           are Cohiva application
           permissions, not these
           dynamic Stream permissions.
        ============================================= */

        if (
          key ===
            "studentMic" ||
          key ===
            "studentCamera" ||
          key ===
            "studentScreenShare"
        ) {
          await applyStreamPermissions(
            remoteUserIds,
            next
          );
        }
      } catch (
        permissionError
      ) {
        console.error(
          "Cohiva permission update error:",
          permissionError
        );

        setError(
          "Cohiva could not update this permission."
        );
      } finally {
        setSaving(
          false
        );
      }
    };

  /* =====================================================
     MUTE EVERYONE
  ===================================================== */

  const muteEveryone =
    async () => {
      if (
        !call ||
        !call.isCreatedByMe ||
        muting
      ) {
        return;
      }

      try {
        setMuting(
          true
        );

        setError(
          ""
        );

        await call.muteOthers(
          "audio"
        );

        window.setTimeout(
          () => {
            setMuting(
              false
            );
          },
          1200
        );
      } catch (
        muteError
      ) {
        console.error(
          "Mute class error:",
          muteError
        );

        setMuting(
          false
        );

        setError(
          "Cohiva could not mute the class."
        );
      }
    };

  /* =====================================================
     HIDDEN
  ===================================================== */

  if (
    !open ||
    !call?.isCreatedByMe
  ) {
    return null;
  }

  /* =====================================================
     UI
  ===================================================== */

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center overflow-hidden bg-black/55 p-3 backdrop-blur-sm">

      {/* BACKDROP */}

      <button
        type="button"
        aria-label="Close permissions"
        onClick={
          onClose
        }
        className="absolute inset-0"
      />

      {/* PANEL */}

      <section className="relative z-10 flex max-h-[calc(100dvh-24px)] w-full max-w-[850px] flex-col overflow-hidden rounded-[28px] bg-[#FFF7EB] shadow-2xl">

        {/* HEADER */}

        <div className="flex shrink-0 items-center justify-between border-b border-[#403A35]/10 px-5 py-4">

          <div>

            <p className="text-[9px] font-black uppercase tracking-[0.2em] text-[#CC3A63]">
              Teacher Controls
            </p>

            <h2 className="mt-1 text-xl font-black text-[#3D3732]">
              Class Permissions
            </h2>

          </div>

          <div className="flex items-center gap-3">

            <span className="rounded-full bg-[#A2AB73]/15 px-3 py-1.5 text-xs font-black text-[#737C4C]">
              👥 {remoteUserIds.length}
              {" "}
              {remoteUserIds.length ===
              1
                ? "student"
                : "students"}
            </span>

            <button
              type="button"
              onClick={
                onClose
              }
              className="flex h-9 w-9 items-center justify-center rounded-full bg-[#403A35]/10 text-xl font-bold text-[#403A35] transition hover:bg-[#CC3A63] hover:text-white"
            >
              ×
            </button>

          </div>

        </div>

        {/* PERMISSION GRID */}

        <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3">

          <PermissionToggle
            icon="🎙"
            title="Microphone"
            subtitle="Student audio"
            enabled={
              permissions.studentMic
            }
            disabled={
              saving
            }
            onClick={() =>
              changePermission(
                "studentMic"
              )
            }
          />

          <PermissionToggle
            icon="🎥"
            title="Camera"
            subtitle="Student video"
            enabled={
              permissions.studentCamera
            }
            disabled={
              saving
            }
            onClick={() =>
              changePermission(
                "studentCamera"
              )
            }
          />

          <PermissionToggle
            icon="🖥"
            title="Screen Share"
            subtitle="Present screens"
            enabled={
              permissions.studentScreenShare
            }
            disabled={
              saving
            }
            onClick={() =>
              changePermission(
                "studentScreenShare"
              )
            }
          />

          {/* =============================================
              RECORDING

              Cohiva UI permission.
          ============================================= */}

          <PermissionToggle
            icon="⏺"
            title="Recording"
            subtitle="Show record control"
            enabled={
              permissions.studentRecording
            }
            disabled={
              saving
            }
            onClick={() =>
              changePermission(
                "studentRecording"
              )
            }
          />

          {/* WHITEBOARD */}

          <PermissionToggle
            icon="✏"
            title="Whiteboard"
            subtitle="Allow editing"
            enabled={
              permissions.studentWhiteboard
            }
            disabled={
              saving
            }
            onClick={() =>
              changePermission(
                "studentWhiteboard"
              )
            }
          />

          {/* MUTE EVERYONE */}

          <button
            type="button"
            onClick={
              muteEveryone
            }
            disabled={
              muting
            }
            className="flex min-h-[92px] items-center gap-3 rounded-[20px] bg-[#403A35] p-4 text-left transition hover:bg-[#302B27] disabled:opacity-60"
          >

            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#CC3A63]/20 text-xl">
              🔇
            </div>

            <div>

              <p className="font-black text-[#FFF7EB]">
                {muting
                  ? "Muted ✓"
                  : "Mute Everyone"}
              </p>

              <p className="mt-1 text-[11px] text-[#FFF7EB]/55">
                Mute all students
              </p>

            </div>

          </button>

        </div>

        {/* ERROR */}

        {error && (
          <div className="mx-4 mb-3 shrink-0 rounded-xl bg-[#CC3A63]/10 px-4 py-2 text-xs font-bold text-[#CC3A63]">
            {error}
          </div>
        )}

        {/* FOOTER */}

        <div className="flex shrink-0 items-center justify-between border-t border-[#403A35]/10 bg-[#F9F0E0] px-5 py-3">

          <p className="text-[11px] font-semibold text-[#756E64]">
            Changes apply immediately.
          </p>

          <button
            type="button"
            onClick={
              onClose
            }
            className="rounded-xl bg-[#CC3A63] px-5 py-2 text-xs font-black text-white"
          >
            Done
          </button>

        </div>

      </section>

    </div>
  );
};

export default MeetingPermissionsPanel;

/* =========================================================
   PERMISSION TILE
========================================================= */

type PermissionToggleProps = {
  icon: string;
  title: string;
  subtitle: string;
  enabled: boolean;
  disabled: boolean;
  onClick: () => void;
};

const PermissionToggle = ({
  icon,
  title,
  subtitle,
  enabled,
  disabled,
  onClick,
}: PermissionToggleProps) => {
  return (
    <button
      type="button"
      onClick={
        onClick
      }
      disabled={
        disabled
      }
      className={`flex min-h-[92px] items-center gap-3 rounded-[20px] border p-4 text-left transition disabled:cursor-not-allowed disabled:opacity-60 ${
        enabled
          ? "border-[#A2AB73]/30 bg-[#A2AB73]/10"
          : "border-[#403A35]/10 bg-white"
      }`}
    >

      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#F9F0E0] text-xl">
        {icon}
      </div>

      <div className="min-w-0 flex-1">

        <p className="font-black text-[#3D3732]">
          {title}
        </p>

        <p className="mt-0.5 text-[10px] font-semibold text-[#756E64]">
          {subtitle}
        </p>

        <p
          className={`mt-1 text-[9px] font-black uppercase tracking-wider ${
            enabled
              ? "text-[#737C4C]"
              : "text-[#CC3A63]"
          }`}
        >
          {enabled
            ? "Allowed"
            : "Blocked"}
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
          className={`absolute top-1 h-4 w-4 rounded-full bg-white shadow transition-all ${
            enabled
              ? "left-6"
              : "left-1"
          }`}
        />

      </div>

    </button>
  );
};