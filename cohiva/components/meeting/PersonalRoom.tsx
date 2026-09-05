"use client";

import {
  COHIVA_DEFAULT_DURATION_MINUTES,
  COHIVA_DEFAULT_PARTICIPANTS,
} from "@/lib/cohivaMeetingConfig";

import { useUser } from "@clerk/nextjs";

import {
  useRouter,
} from "next/navigation";

import {
  useEffect,
  useMemo,
  useState,
} from "react";

const PersonalRoom = () => {
  const router =
    useRouter();

  const {
    user,
    isLoaded,
  } = useUser();

  const [
    roomReady,
    setRoomReady,
  ] =
    useState(false);

  const [
    loading,
    setLoading,
  ] =
    useState(true);

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

  /* =====================================================
     PERMANENT ROOM ID
  ===================================================== */

  const personalRoomId =
    useMemo(() => {
      if (!user?.id) {
        return "";
      }

      /*
       * Every Clerk user receives
       * one permanent Cohiva room.
       *
       * Example:
       * personal-user_123abc
       */
      return `personal-${user.id}`;
    }, [
      user?.id,
    ]);

  /* =====================================================
     CREATE / LOAD PERSONAL ROOM
  ===================================================== */

  useEffect(() => {
    if (
      !user ||
      !personalRoomId
    ) {
      return;
    }

    let cancelled =
      false;

    const prepareRoom =
      async () => {
        try {
          setLoading(
            true
          );

          setError(
            ""
          );

          const response =
            await fetch(
              "/api/meetings/create",
              {
                method: "POST",
                headers: {
                  "Content-Type":
                    "application/json",
                },
                body: JSON.stringify({
                  kind: "personal",
                  callId:
                    personalRoomId,
                  title:
                    `${
                      user.firstName ||
                      user.username ||
                      "Cohiva"
                    }'s Personal Room`,
                  description:
                    "Permanent Cohiva personal meeting room",
                  durationMinutes:
                    COHIVA_DEFAULT_DURATION_MINUTES,
                  maxParticipants:
                    COHIVA_DEFAULT_PARTICIPANTS,
                }),
              }
            );

          const result =
            await response.json();

          if (!response.ok) {
            throw new Error(
              result.error ||
                "Cohiva could not prepare your personal room."
            );
          }

          if (!cancelled) {
            setRoomReady(
              true
            );
          }
        } catch (err) {
          console.error(
            "Personal room error:",
            err
          );

          if (!cancelled) {
            setRoomReady(
              false
            );

            setError(
              err instanceof Error
                ? err.message
                : "Cohiva could not prepare your personal room."
            );
          }
        } finally {
          if (!cancelled) {
            setLoading(
              false
            );
          }
        }
      };

    void prepareRoom();

    return () => {
      cancelled =
        true;
    };
  }, [
    user,
    personalRoomId,
  ]);

  /* =====================================================
     ROOM LINK
  ===================================================== */

  const getRoomLink =
    () => {
      if (
        typeof window ===
        "undefined"
      ) {
        return "";
      }

      return `${window.location.origin}/meeting/${personalRoomId}`;
    };

  /* =====================================================
     START PERSONAL ROOM
  ===================================================== */

  const startMeeting =
    () => {
      if (
        !personalRoomId ||
        !roomReady
      ) {
        return;
      }

      /*
       * The room has already been
       * created above, so the meeting
       * page only needs to load it.
       */
      router.push(
        `/meeting/${personalRoomId}`
      );
    };

  /* =====================================================
     COPY INVITATION
  ===================================================== */

  const copyInviteLink =
    async () => {
      if (
        !personalRoomId
      ) {
        return;
      }

      try {
        const link =
          getRoomLink();

        await navigator.clipboard.writeText(
          link
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
      } catch (err) {
        console.error(
          "Copy personal room link error:",
          err
        );

        setError(
          "Cohiva could not copy your room link."
        );
      }
    };

  /* =====================================================
     SHARE USING BROWSER
  ===================================================== */

  const shareRoom =
    async () => {
      if (
        !personalRoomId
      ) {
        return;
      }

      const link =
        getRoomLink();

      try {
        if (
          navigator.share
        ) {
          await navigator.share({
            title:
              "Join my Cohiva room",

            text:
              "Join me in my personal Cohiva meeting room.",

            url:
              link,
          });

          return;
        }

        /*
         * Desktop browsers that don't
         * support navigator.share:
         * copy instead.
         */
        await navigator.clipboard.writeText(
          link
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
      } catch (err) {
        /*
         * Ignore user cancelling
         * the native share dialog.
         */
        console.log(
          "Share room:",
          err
        );
      }
    };

  /* =====================================================
     CLERK LOADING
  ===================================================== */

  if (!isLoaded) {
    return (
      <PersonalRoomLoading />
    );
  }

  /* =====================================================
     STREAM / ROOM LOADING
  ===================================================== */

  if (
    loading
  ) {
    return (
      <PersonalRoomLoading />
    );
  }

  return (
    <section className="w-full pb-10">

      {/* =================================================
          PAGE HEADER
      ================================================= */}

      <div className="mb-8">

        <p className="text-xs font-black uppercase tracking-[0.22em] text-[#A2AB73]">
          Your permanent space
        </p>

        <h1 className="mt-2 text-3xl font-black tracking-tight text-[#3D3732] sm:text-4xl">
          Personal Room
        </h1>

        <p className="mt-3 max-w-2xl text-[#756E64]">
          Your own reusable Cohiva
          meeting room. The link stays
          the same, so you can share it
          whenever you want.
        </p>

      </div>

      {/* =================================================
          ERROR
      ================================================= */}

      {error && (
        <div className="mb-6 rounded-[24px] bg-[#CC3A63]/10 p-5 text-sm font-semibold text-[#CC3A63]">
          {error}
        </div>
      )}

      {/* =================================================
          MAIN PERSONAL ROOM CARD
      ================================================= */}

      <div className="overflow-hidden rounded-[34px] border border-[#403A35]/10 bg-[#FFF7EB] shadow-[0_20px_60px_rgba(61,55,50,0.10)]">

        <div className="grid lg:grid-cols-[1fr_0.75fr]">

          {/* =============================================
              LEFT
          ============================================= */}

          <div className="relative overflow-hidden bg-[#403A35] p-8 text-[#FFF7EB] sm:p-10 lg:p-12">

            {/* DECORATION */}

            <div className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-[#CC3A63]/25 blur-3xl" />

            <div className="pointer-events-none absolute -bottom-24 -left-20 h-72 w-72 rounded-full bg-[#A2AB73]/20 blur-3xl" />

            <div className="relative z-10">

              {/* OWNER */}

              <div className="flex items-center gap-4">

                {user?.imageUrl ? (
                  <img
                    src={
                      user.imageUrl
                    }
                    alt={
                      user.fullName ||
                      "Cohiva user"
                    }
                    className="h-16 w-16 rounded-2xl border-2 border-[#FFF7EB]/20 object-cover"
                  />
                ) : (
                  <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[#CC3A63] text-2xl font-black">
                    C
                  </div>
                )}

                <div>

                  <p className="text-xs font-black uppercase tracking-[0.18em] text-[#A2AB73]">
                    Room owner
                  </p>

                  <h2 className="mt-1 text-xl font-black">
                    {user?.fullName ||
                      user?.username ||
                      user?.firstName ||
                      "Cohiva User"}
                  </h2>

                </div>
              </div>

              {/* TITLE */}

              <div className="mt-12">

                <div className="inline-flex rounded-full bg-[#CC3A63]/20 px-4 py-2 text-xs font-black uppercase tracking-[0.16em] text-[#FFF7EB]">
                  Always yours
                </div>

                <h2 className="mt-5 max-w-xl text-3xl font-black leading-tight sm:text-4xl">
                  Meet whenever you want.
                  Same room. Same link.
                </h2>

                <p className="mt-5 max-w-xl text-sm leading-7 text-[#FFF7EB]/65 sm:text-base">
                  Unlike instant meetings,
                  your personal room ID stays
                  attached to your Cohiva
                  account.
                </p>

              </div>

              {/* ROOM ID */}

              <div className="mt-10 rounded-[22px] border border-white/10 bg-white/5 p-5 backdrop-blur-sm">

                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#A2AB73]">
                  Personal Room ID
                </p>

                <p className="mt-2 break-all font-mono text-sm text-[#FFF7EB]">
                  {personalRoomId}
                </p>

              </div>

            </div>
          </div>

          {/* =============================================
              RIGHT ACTION PANEL
          ============================================= */}

          <div className="flex flex-col justify-center p-7 sm:p-10 lg:p-12">

            {/* STATUS */}

            <div
              className={`inline-flex w-fit items-center gap-2 rounded-full px-4 py-2 text-xs font-black ${
                roomReady
                  ? "bg-[#A2AB73]/15 text-[#737C4C]"
                  : "bg-[#CC3A63]/10 text-[#CC3A63]"
              }`}
            >
              <span
                className={`h-2.5 w-2.5 rounded-full ${
                  roomReady
                    ? "bg-[#A2AB73]"
                    : "bg-[#CC3A63]"
                }`}
              />

              {roomReady
                ? "Room ready"
                : "Room unavailable"}
            </div>

            <h3 className="mt-5 text-2xl font-black text-[#3D3732]">
              Your room is ready when you are.
            </h3>

            <p className="mt-3 text-sm leading-6 text-[#756E64]">
              Start the meeting yourself,
              or copy the permanent invitation
              link and send it to someone.
            </p>

            {/* START */}

            <button
              type="button"
              onClick={
                startMeeting
              }
              disabled={
                !roomReady
              }
              className="mt-8 w-full rounded-2xl bg-[#CC3A63] px-5 py-4 text-base font-black text-white shadow-[0_12px_28px_rgba(204,58,99,0.22)] transition-all duration-200 hover:-translate-y-0.5 hover:bg-[#B83057] hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-50"
            >
              Start Personal Meeting
            </button>

            {/* COPY */}

            <button
              type="button"
              onClick={
                copyInviteLink
              }
              disabled={
                !roomReady
              }
              className="mt-3 w-full rounded-2xl border border-[#403A35]/10 bg-[#F9F0E0] px-5 py-3.5 text-sm font-bold text-[#3D3732] transition-all hover:bg-[#F1E6D4] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {copied
                ? "✓ Personal link copied"
                : "Copy Personal Room Link"}
            </button>

            {/* SHARE */}

            <button
              type="button"
              onClick={
                shareRoom
              }
              disabled={
                !roomReady
              }
              className="mt-3 w-full rounded-2xl border border-[#A2AB73]/25 bg-[#A2AB73]/10 px-5 py-3.5 text-sm font-bold text-[#737C4C] transition-all hover:bg-[#A2AB73]/20 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Share Room
            </button>

            {/* INFO */}

            <div className="mt-7 rounded-2xl bg-[#B9687C]/10 p-4">

              <p className="text-xs font-black uppercase tracking-[0.15em] text-[#B9687C]">
                Permanent link
              </p>

              <p className="mt-2 text-xs leading-5 text-[#756E64]">
                You don&apos;t need to create
                a new meeting code every time.
                Reuse this room whenever you
                need a quick call.
              </p>

            </div>

          </div>
        </div>
      </div>

      {/* =================================================
          SMALL FEATURE CARDS
      ================================================= */}

      <div className="mt-6 grid gap-4 sm:grid-cols-3">

        <div className="rounded-[24px] border border-[#403A35]/10 bg-[#FFF7EB] p-5">

          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#CC3A63]/10 text-xl">
            ∞
          </div>

          <p className="mt-4 font-black text-[#3D3732]">
            Reusable
          </p>

          <p className="mt-2 text-sm leading-6 text-[#756E64]">
            Your personal meeting ID
            does not change.
          </p>

        </div>

        <div className="rounded-[24px] border border-[#403A35]/10 bg-[#FFF7EB] p-5">

          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#A2AB73]/15 text-xl">
            ↗
          </div>

          <p className="mt-4 font-black text-[#3D3732]">
            Easy to share
          </p>

          <p className="mt-2 text-sm leading-6 text-[#756E64]">
            Copy one link and keep
            sending the same one.
          </p>

        </div>

        <div className="rounded-[24px] border border-[#403A35]/10 bg-[#FFF7EB] p-5">

          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#B9687C]/15 text-xl">
            ◉
          </div>

          <p className="mt-4 font-black text-[#3D3732]">
            Instant access
          </p>

          <p className="mt-2 text-sm leading-6 text-[#756E64]">
            Open your lobby whenever
            you&apos;re ready to meet.
          </p>

        </div>

      </div>
    </section>
  );
};

/* =========================================================
   LOADING
========================================================= */

const PersonalRoomLoading =
  () => {
    return (
      <div className="flex min-h-[500px] items-center justify-center">

        <div className="text-center">

          <div className="mx-auto h-11 w-11 animate-spin rounded-full border-4 border-[#CC3A63]/20 border-t-[#CC3A63]" />

          <p className="mt-4 font-bold text-[#756E64]">
            Preparing your personal room...
          </p>

        </div>
      </div>
    );
  };

export default PersonalRoom;