"use client";

import {
  useCall,
} from "@stream-io/video-react-sdk";

import {
  useRouter,
} from "next/navigation";

import {
  useEffect,
  useState,
} from "react";

const CohivaLeaveCallControl = () => {
  const call =
    useCall();

  const router =
    useRouter();

  const teacher =
    Boolean(
      call?.isCreatedByMe
    );

  const [
    modalOpen,
    setModalOpen,
  ] =
    useState(false);

  const [
    action,
    setAction,
  ] =
    useState<
      | "leave"
      | "end"
      | null
    >(null);

  const [
    error,
    setError,
  ] =
    useState("");

  const busy =
    action !== null;

  /* =====================================================
     ESCAPE TO CLOSE
  ===================================================== */

  useEffect(() => {
    if (
      !modalOpen
    ) {
      return;
    }

    const onKeyDown = (
      event: KeyboardEvent
    ) => {
      if (
        event.key ===
          "Escape" &&
        !busy
      ) {
        setModalOpen(
          false
        );

        setError("");
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
    modalOpen,
    busy,
  ]);

  /* =====================================================
     MAIN RED BUTTON

     Student:
       leave immediately.

     Teacher / host:
       show two-option modal.
  ===================================================== */

  const handleMainButton =
    async () => {
      if (
        !call ||
        busy
      ) {
        return;
      }

      if (
        teacher
      ) {
        setError("");
        setModalOpen(true);
        return;
      }

      try {
        setAction("leave");
        setError("");

        await call.leave();

        router.replace("/");
      } catch (
        leaveError
      ) {
        console.error(
          "Leave call error:",
          leaveError
        );

        setError(
          leaveError instanceof
            Error
            ? leaveError.message
            : "Unable to leave the meeting."
        );

        setAction(null);
      }
    };

  /* =====================================================
     HOST: LEAVE ROOM ONLY

     The meeting remains active for everybody else.
  ===================================================== */

  const leaveRoom =
    async () => {
      if (
        !call ||
        busy
      ) {
        return;
      }

      try {
        setAction("leave");
        setError("");

        await call.leave();

        setModalOpen(false);

        router.replace("/");
      } catch (
        leaveError
      ) {
        console.error(
          "Host leave call error:",
          leaveError
        );

        setError(
          leaveError instanceof
            Error
            ? leaveError.message
            : "Unable to leave the room."
        );

        setAction(null);
      }
    };

  /* =====================================================
     HOST: END FOR EVERYONE

     IMPORTANT:
     Do not redirect manually here.

     MeetingRoom already listens for:
       call.ended

     That event redirects every connected client home.
  ===================================================== */

  const endForEveryone =
    async () => {
      if (
        !call ||
        !teacher ||
        busy
      ) {
        return;
      }

      try {
        setAction("end");
        setError("");

        await call.endCall();

        /*
         * Keep the modal in its ending state until
         * MeetingRoom receives call.ended and redirects.
         */
      } catch (
        endError
      ) {
        console.error(
          "End call error:",
          endError
        );

        setError(
          endError instanceof
            Error
            ? endError.message
            : "Unable to end the meeting."
        );

        setAction(null);
      }
    };

  return (
    <>
      {/* =================================================
          RED LEAVE BUTTON
      ================================================= */}

      <button
        type="button"
        aria-label={
          teacher
            ? "Leave or end meeting"
            : "Leave meeting"
        }
        title={
          teacher
            ? "Leave or end meeting"
            : "Leave meeting"
        }
        disabled={
          busy
        }
        onClick={() =>
          void handleMainButton()
        }
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#E34848] text-lg text-white shadow-sm transition hover:bg-[#C93434] focus:outline-none focus:ring-2 focus:ring-white/70 disabled:cursor-wait disabled:opacity-60"
      >
        <span
          aria-hidden="true"
          className="rotate-[135deg] text-[17px] leading-none"
        >
          ☎
        </span>
      </button>

      {/* =================================================
          HOST LEAVE / END MODAL
      ================================================= */}

      {teacher &&
        modalOpen && (
        <div
          className="fixed inset-0 z-[700] flex items-center justify-center bg-black/55 px-4 backdrop-blur-[2px]"
          role="presentation"
          onMouseDown={(event) => {
            if (
              event.target ===
                event.currentTarget &&
              !busy
            ) {
              setModalOpen(false);
              setError("");
            }
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="cohiva-leave-title"
            className="w-full max-w-[430px] overflow-hidden rounded-[28px] border border-[#403A35]/10 bg-[#FFF7EB] text-[#3D3732] shadow-[0_28px_100px_rgba(0,0,0,0.45)]"
          >
            <header className="border-b border-[#403A35]/10 px-6 pb-5 pt-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-[9px] font-black uppercase tracking-[0.18em] text-[#CC3A63]">
                    Cohiva Meeting
                  </p>

                  <h2
                    id="cohiva-leave-title"
                    className="mt-1 text-xl font-black"
                  >
                    Leave this meeting?
                  </h2>

                  <p className="mt-2 text-sm leading-5 text-[#756E64]">
                    You are the host. Choose whether the class should continue without you or end for everyone.
                  </p>
                </div>

                <button
                  type="button"
                  aria-label="Close"
                  disabled={busy}
                  onClick={() => {
                    setModalOpen(false);
                    setError("");
                  }}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#F9F0E0] text-base font-black text-[#756E64] transition hover:bg-[#CC3A63]/10 hover:text-[#CC3A63] disabled:opacity-50"
                >
                  ×
                </button>
              </div>
            </header>

            <div className="space-y-3 p-5 sm:p-6">
              {error && (
                <div
                  role="alert"
                  className="rounded-2xl bg-[#CC3A63]/10 px-4 py-3 text-xs font-bold text-[#CC3A63]"
                >
                  {error}
                </div>
              )}

              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  void endForEveryone()
                }
                className="flex w-full items-center gap-4 rounded-[20px] border border-[#CC3A63]/20 bg-[#CC3A63] p-4 text-left text-white transition hover:bg-[#B83259] disabled:cursor-wait disabled:opacity-60"
              >
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white/15 text-xl">
                  ⏹
                </span>

                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-black">
                    {action === "end"
                      ? "Ending meeting..."
                      : "End the call for everyone"}
                  </span>

                  <span className="mt-1 block text-[11px] leading-4 text-white/80">
                    Disconnect everyone and finish this Cohiva meeting.
                  </span>
                </span>
              </button>

              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  void leaveRoom()
                }
                className="flex w-full items-center gap-4 rounded-[20px] border border-[#403A35]/10 bg-white p-4 text-left transition hover:border-[#A2AB73]/50 hover:bg-[#A2AB73]/5 disabled:cursor-wait disabled:opacity-60"
              >
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#A2AB73]/15 text-xl">
                  🚪
                </span>

                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-black text-[#3D3732]">
                    {action === "leave"
                      ? "Leaving room..."
                      : "Leave the room"}
                  </span>

                  <span className="mt-1 block text-[11px] leading-4 text-[#756E64]">
                    Only you leave. The meeting stays active for the other participants.
                  </span>
                </span>
              </button>

              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  setModalOpen(false);
                  setError("");
                }}
                className="w-full rounded-[16px] px-4 py-3 text-xs font-black text-[#756E64] transition hover:bg-[#403A35]/5 disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          </section>
        </div>
      )}
    </>
  );
};

export default CohivaLeaveCallControl;
