"use client";

import {
  useEffect,
  useMemo,
  useState,
} from "react";

import MeetingAccessSettings from "./MeetingAccessSettings";
import MeetingLimitsSettings from "./MeetingLimitsSettings";

import {
  useOptionalCohivaRtc,
} from "@/components/rtc/CohivaRtcProvider";

/* =========================================================
   TYPES
========================================================= */

type MeetingPermissionsPanelProps = {
  open: boolean;
  onClose: () => void;
  callId: string;
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
  studentRecording: false,
  studentWhiteboard: false,
};

const normalizePermissions = (
  value: unknown
): CohivaPermissions => {
  const raw =
    value &&
    typeof value === "object" &&
    !Array.isArray(value)
      ? value as Partial<CohivaPermissions>
      : {};

  return {
    ...DEFAULT_COHIVA_PERMISSIONS,
    ...raw,
    studentRecording: false,
  };
};

/* =========================================================
   PANEL
========================================================= */

const MeetingPermissionsPanel = ({
  open,
  onClose,
  callId,
}: MeetingPermissionsPanelProps) => {
  const rtc =
    useOptionalCohivaRtc();

  const [
    permissions,
    setPermissions,
  ] =
    useState<CohivaPermissions>(
      DEFAULT_COHIVA_PERMISSIONS
    );

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

  const studentIds =
    useMemo(
      () =>
        Array.from(
          new Set(
            (rtc?.participants ?? [])
              .filter(
                (
                  participant
                ) =>
                  !participant.isHost &&
                  participant.userId !==
                    rtc?.selfUserId
              )
              .map(
                (
                  participant
                ) =>
                  participant.userId
              )
              .filter(Boolean)
          )
        ),
      [
        rtc?.participants,
        rtc?.selfUserId,
      ]
    );

  const loadPermissions =
    async () => {
      try {
        const response =
          await fetch(
            `/api/meetings/permissions?callId=${encodeURIComponent(
              callId
            )}`,
            {
              cache:
                "no-store",
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
              "Unable to read meeting permissions."
          );
        }

        setPermissions(
          normalizePermissions(
            result?.permissions
          )
        );
      } catch (
        permissionError
      ) {
        console.error(
          "Read Cohiva permissions error:",
          permissionError
        );

        setError(
          permissionError instanceof
            Error
            ? permissionError.message
            : "Unable to read meeting permissions."
        );
      }
    };

  useEffect(() => {
    if (
      !open ||
      rtc?.selfRole !==
        "host"
    ) {
      return;
    }

    setError(
      ""
    );

    void loadPermissions();
  }, [
    open,
    callId,
    rtc?.selfRole,
  ]);

  useEffect(() => {
    if (!rtc) {
      return;
    }

    return rtc.subscribeEvent(
      "call.updated",
      (
        data
      ) => {
        const next =
          data?.call?.custom
            ?.cohiva_permissions;

        if (
          next &&
          typeof next ===
            "object"
        ) {
          setPermissions(
            normalizePermissions(
              next
            )
          );
        }
      }
    );
  }, [
    rtc,
  ]);

  const changePermission =
    async (
      key:
        | "studentMic"
        | "studentCamera"
        | "studentScreenShare"
        | "studentWhiteboard"
    ) => {
      if (
        rtc?.selfRole !==
          "host" ||
        saving
      ) {
        return;
      }

      const nextPermissions:
        CohivaPermissions = {
        ...permissions,
        [key]:
          !permissions[
            key
          ],
        studentRecording:
          false,
      };

      try {
        setSaving(
          true
        );

        setError(
          ""
        );

        const response =
          await fetch(
            "/api/meetings/permissions",
            {
              method:
                "PUT",

              headers: {
                "Content-Type":
                  "application/json",
              },

              body:
                JSON.stringify({
                  callId,
                  permissions:
                    nextPermissions,
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
              "Cohiva could not update this permission."
          );
        }

        const saved =
          normalizePermissions(
            result?.permissions ??
              nextPermissions
          );

        setPermissions(
          saved
        );

        if (
          key ===
            "studentMic" ||
          key ===
            "studentCamera" ||
          key ===
            "studentScreenShare"
        ) {
          const rtcField =
            key ===
            "studentMic"
              ? "studentMic"
              : key ===
                  "studentCamera"
                ? "studentCamera"
                : "studentScreenShare";

          await rtc.updateRoomPermission(
            rtcField,
            saved[
              rtcField
            ]
          );
        }
      } catch (
        permissionError
      ) {
        console.error(
          "Update Cohiva permissions error:",
          permissionError
        );

        setError(
          permissionError instanceof
            Error
            ? permissionError.message
            : "Cohiva could not update this permission."
        );
      } finally {
        setSaving(
          false
        );
      }
    };

  /* =====================================================
     HIDDEN
  ===================================================== */

  if (
    !open ||
    rtc?.selfRole !== "host"
  ) {
    return null;
  }

  /* =====================================================
     UI
  ===================================================== */

  return (
    <div className="fixed inset-0 z-[230] flex items-center justify-center overflow-hidden bg-black/55 p-3 backdrop-blur-sm">

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

      <section className="relative z-10 flex max-h-[calc(100dvh-24px)] w-full max-w-[950px] flex-col overflow-hidden rounded-[28px] bg-[#FFF7EB] shadow-2xl">

        {/* =================================================
            HEADER
        ================================================= */}

        <div className="flex shrink-0 items-center justify-between border-b border-[#403A35]/10 px-5 py-4">

          <div>

            <p className="text-[9px] font-black uppercase tracking-[0.2em] text-[#CC3A63]">
              Teacher Controls
            </p>

            <h2 className="mt-1 text-xl font-black text-[#3D3732]">
              Meeting Settings
            </h2>

            <p className="mt-1 text-xs font-semibold text-[#756E64]">
              Control who can enter and what students can do.
            </p>

          </div>

          <button
            type="button"
            aria-label="Close meeting settings"
            onClick={
              onClose
            }
            className="flex h-10 w-10 items-center justify-center rounded-full bg-[#403A35]/10 text-xl font-black text-[#403A35] transition hover:bg-[#CC3A63] hover:text-white"
          >
            ×
          </button>

        </div>

        {/* =================================================
            CONTENT
        ================================================= */}

        <div className="min-h-0 flex-1 overflow-y-auto p-4">

          {/* ===============================================
              MEETING ACCESS
          =============================================== */}

          <MeetingAccessSettings
            callId={
              callId
            }
          />

          <div className="mt-4">
            <MeetingLimitsSettings
              callId={
                callId
              }
            />
          </div>

          {/* ===============================================
              CLASS PERMISSIONS
          =============================================== */}

          <div className="mt-4">

            <div className="mb-3">

              <p className="text-[9px] font-black uppercase tracking-[0.18em] text-[#CC3A63]">
                Student Permissions
              </p>

              <h3 className="mt-1 font-black text-[#3D3732]">
                What can students use?
              </h3>

            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">

              {/* MICROPHONE */}

              <PermissionToggle
                icon="🎙"
                title="Microphones"
                subtitle="Students can unmute themselves"
                enabled={
                  permissions.studentMic
                }
                disabled={
                  saving
                }
                onClick={() =>
                  void changePermission(
                    "studentMic"
                  )
                }
              />

              {/* CAMERA */}

              <PermissionToggle
                icon="🎥"
                title="Cameras"
                subtitle="Students can turn video on"
                enabled={
                  permissions.studentCamera
                }
                disabled={
                  saving
                }
                onClick={() =>
                  void changePermission(
                    "studentCamera"
                  )
                }
              />

              {/* SCREEN SHARE */}

              <PermissionToggle
                icon="🖥"
                title="Screen sharing"
                subtitle="Students can present their screen"
                enabled={
                  permissions.studentScreenShare
                }
                disabled={
                  saving
                }
                onClick={() =>
                  void changePermission(
                    "studentScreenShare"
                  )
                }
              />

              {/* WHITEBOARD */}

              <PermissionToggle
                icon="✏"
                title="Whiteboard"
                subtitle="Students can edit the class board"
                enabled={
                  permissions.studentWhiteboard
                }
                disabled={
                  saving
                }
                onClick={() =>
                  void changePermission(
                    "studentWhiteboard"
                  )
                }
              />

              {/* RECORDING */}

              <div className="flex min-h-[108px] items-center gap-3 rounded-[20px] border border-[#CC3A63]/15 bg-[#CC3A63]/5 p-4">

                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white text-xl">
                  ⏺
                </div>

                <div className="min-w-0">

                  <p className="font-black text-[#3D3732]">
                    Recording
                  </p>

                  <p className="mt-1 text-[9px] font-black uppercase tracking-wider text-[#CC3A63]">
                    Temporarily unavailable
                  </p>

                  <p className="mt-1 text-[10px] leading-4 text-[#756E64]">
                    Recording is disabled while live media is being migrated to Cohiva RTC.
                  </p>

                </div>

              </div>

              {/* INFO */}

              <div className="flex min-h-[108px] items-center gap-3 rounded-[20px] bg-[#403A35] p-4">

                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/10 text-xl">
                  🔐
                </div>

                <div>

                  <p className="font-black text-[#FFF7EB]">
                    Real blocking
                  </p>

                  <p className="mt-1 text-[10px] leading-4 text-[#FFF7EB]/60">
                    Blocked media permissions cannot simply be turned back on by students.
                  </p>

                </div>

              </div>

            </div>

          </div>

        </div>

        {/* =================================================
            ERROR
        ================================================= */}

        {error && (
          <div className="mx-4 mb-3 shrink-0 rounded-xl bg-[#CC3A63]/10 p-3 text-xs font-bold text-[#CC3A63]">
            {error}
          </div>
        )}

        {/* =================================================
            FOOTER
        ================================================= */}

        <div className="flex shrink-0 items-center justify-between border-t border-[#403A35]/10 bg-[#F9F0E0] px-5 py-3">

          <p className="text-[11px] font-semibold text-[#756E64]">
            {studentIds.length}
            {" "}
            {studentIds.length ===
            1
              ? "student connected"
              : "students connected"}
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
   TOGGLE COMPONENT
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
      disabled={
        disabled
      }
      onClick={
        onClick
      }
      aria-pressed={
        enabled
      }
      className={`flex min-h-[108px] items-center gap-3 rounded-[20px] border p-4 text-left transition disabled:cursor-not-allowed disabled:opacity-50 ${
        enabled
          ? "border-[#A2AB73]/30 bg-[#A2AB73]/10"
          : "border-[#CC3A63]/20 bg-[#CC3A63]/5"
      }`}
    >

      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white text-xl">
        {icon}
      </div>

      <div className="min-w-0 flex-1">

        <p className="font-black text-[#3D3732]">
          {title}
        </p>

        <p className="mt-0.5 text-[10px] leading-4 text-[#756E64]">
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
            : "bg-[#CC3A63]/25"
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