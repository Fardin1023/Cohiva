"use client";

import { useUser } from "@clerk/nextjs";
import Image from "next/image";
import { useEffect, useState } from "react";

import ActionModal from "./ui/ActionModal";

type ModalType =
  | "new"
  | "join"
  | "schedule"
  | "recordings"
  | null;

const HomeDashboard = () => {
  const { user, isLoaded } = useUser();

  const [currentTime, setCurrentTime] = useState<Date | null>(null);

  const [activeModal, setActiveModal] =
    useState<ModalType>(null);

  /* =====================================================
     LIVE TIME
  ===================================================== */

  useEffect(() => {
    setCurrentTime(new Date());

    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  /* =====================================================
     USER INFORMATION
  ===================================================== */

  const userName =
    user?.firstName ||
    user?.fullName ||
    user?.username ||
    "there";

  /* =====================================================
     TIME + DATE
  ===================================================== */

  const time = currentTime
    ? currentTime.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      })
    : "--:--";

  const date = currentTime
    ? currentTime.toLocaleDateString([], {
        weekday: "long",
        month: "long",
        day: "numeric",
        year: "numeric",
      })
    : "";

  /* =====================================================
     SAMPLE MEETING DATA

     Later we will replace this with actual database data.
  ===================================================== */

  const upcomingMeeting = {
    title: "Team Weekly Meeting",
    date: "Today",
    time: "3:30 PM",
  };

  const missedMeetings = [
    {
      id: 1,
      title: "Project Discussion",
      date: "Yesterday",
      time: "4:00 PM",
    },
    {
      id: 2,
      title: "Design Review",
      date: "August 30",
      time: "11:30 AM",
    },
  ];

  return (
    <>
      <div className="w-full space-y-7 pb-10">

        {/* =====================================================
            HERO BANNER
        ===================================================== */}

        <section className="relative min-h-[300px] overflow-hidden rounded-[30px]">
          {/* Background */}
          <Image
            src="/images/bg.png"
            alt="Cohiva dashboard background"
            fill
            priority
            className="object-cover object-center"
          />

          {/* Soft overlay */}
          <div className="absolute inset-0 bg-gradient-to-r from-[#FFF7EB]/90 via-[#FFF7EB]/55 to-[#FFF7EB]/20" />

          {/* Decorative glow */}
          <div className="absolute -left-12 -top-16 h-48 w-48 rounded-full bg-[#CC3A63]/15 blur-3xl" />

          <div className="absolute -bottom-16 right-[25%] h-52 w-52 rounded-full bg-[#A2AB73]/20 blur-3xl" />

          {/* Banner content */}
          <div className="relative z-10 flex min-h-[300px] flex-col justify-between gap-7 p-6 sm:p-8 md:flex-row md:items-center lg:p-10">

            {/* ==========================
                LEFT SIDE
            ========================== */}

            <div className="max-w-[620px]">
              <p className="text-xs font-bold uppercase tracking-[0.22em] text-[#8F9960]">
                Your Cohiva Space
              </p>

              <h1 className="mt-2 text-3xl font-black tracking-tight text-[#3D3732] sm:text-4xl lg:text-5xl">
                {isLoaded
                  ? `Hey, ${userName} 👋`
                  : "Welcome to Cohiva"}
              </h1>

              <p className="mt-3 text-sm font-medium text-[#756E64] sm:text-base">
                Your meetings, your people, your space.
              </p>

              {/* Notifications */}
              <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:flex-wrap">

                {/* Upcoming meeting */}
                <div className="group flex items-center gap-3 rounded-2xl border border-white/70 bg-[#FFF7EB]/85 px-4 py-3 shadow-md backdrop-blur-md transition-all duration-300 hover:-translate-y-1 hover:shadow-lg">
                  {/* Live notification */}
                  <span className="relative flex h-3 w-3 shrink-0">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#CC3A63] opacity-40" />

                    <span className="relative inline-flex h-3 w-3 rounded-full bg-[#CC3A63]" />
                  </span>

                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-wider text-[#CC3A63]">
                      Upcoming
                    </p>

                    <p className="mt-0.5 text-sm font-bold text-[#3D3732]">
                      {upcomingMeeting.title}
                    </p>

                    <p className="mt-0.5 text-xs font-medium text-[#756E64]">
                      {upcomingMeeting.date} •{" "}
                      {upcomingMeeting.time}
                    </p>
                  </div>
                </div>

                {/* Missed meetings */}
                {missedMeetings.length > 0 && (
                  <div className="group flex items-center gap-3 rounded-2xl border border-[#CC3A63]/15 bg-[#CC3A63]/10 px-4 py-3 backdrop-blur-md transition-all duration-300 hover:-translate-y-1 hover:bg-[#CC3A63]/15">
                    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#CC3A63] text-sm font-bold text-white">
                      {missedMeetings.length}
                    </div>

                    <div>
                      <p className="text-[11px] font-bold uppercase tracking-wider text-[#756E64]">
                        Missed
                      </p>

                      <p className="mt-0.5 text-sm font-bold text-[#CC3A63]">
                        Previous Meetings
                      </p>

                      <p className="mt-0.5 text-xs text-[#756E64]">
                        Tap recordings or history
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* ==========================
                RIGHT SIDE - CLOCK
            ========================== */}

            <div className="cohiva-float w-full rounded-[26px] border border-white/70 bg-[#FFF7EB]/80 px-7 py-6 shadow-xl backdrop-blur-xl md:w-auto md:min-w-[285px] md:text-right">
              <p className="text-xs font-bold uppercase tracking-[0.22em] text-[#8F9960]">
                Local Time
              </p>

              <h2 className="mt-2 text-4xl font-black tracking-tight text-[#3D3732] sm:text-5xl">
                {time}
              </h2>

              <p className="mt-4 text-sm font-bold leading-6 text-[#CC3A63]">
                {date}
              </p>

              <div className="mt-5 inline-flex rounded-full bg-[#A2AB73]/15 px-4 py-2 text-xs font-semibold text-[#737C4C]">
                Your local timezone
              </div>
            </div>
          </div>
        </section>

        {/* =====================================================
            QUICK ACTION HEADING
        ===================================================== */}

        <section>
          <div className="mb-5 flex items-end justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.22em] text-[#8F9960]">
                Quick Actions
              </p>

              <h2 className="mt-1 text-2xl font-bold text-[#3D3732] sm:text-3xl">
                What are we doing today?
              </h2>
            </div>

            <p className="hidden text-sm font-medium text-[#756E64] md:block">
              Pick one and jump right in ✨
            </p>
          </div>

          {/* =====================================================
              ACTION CARDS
          ===================================================== */}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">

            {/* ========================
                NEW MEETING
            ======================== */}

            <button
              type="button"
              onClick={() => setActiveModal("new")}
              className="cohiva-action-card cohiva-card-delay-1 group relative min-h-[220px] overflow-hidden rounded-[28px] bg-[#CC3A63] p-6 text-left text-white"
            >
              <div className="cohiva-shine" />

              <div className="relative z-10 flex h-full min-h-[170px] flex-col justify-between">
                <div className="cohiva-icon-bounce flex h-14 w-14 items-center justify-center rounded-2xl bg-white/20 text-4xl font-light backdrop-blur">
                  +
                </div>

                <div>
                  <p className="text-2xl font-bold">
                    New Meeting
                  </p>

                  <p className="mt-2 text-sm font-medium text-white/80">
                    Start instantly
                  </p>
                </div>
              </div>

              <div className="absolute -bottom-10 -right-10 h-32 w-32 rounded-full bg-white/10" />
            </button>

            {/* ========================
                JOIN MEETING
            ======================== */}

            <button
              type="button"
              onClick={() => setActiveModal("join")}
              className="cohiva-action-card cohiva-card-delay-2 group relative min-h-[220px] overflow-hidden rounded-[28px] bg-[#A2AB73] p-6 text-left text-white"
            >
              <div className="cohiva-shine" />

              <div className="relative z-10 flex h-full min-h-[170px] flex-col justify-between">
                <div className="cohiva-icon-bounce flex h-14 w-14 items-center justify-center rounded-2xl bg-white/20 text-3xl backdrop-blur">
                  ↗
                </div>

                <div>
                  <p className="text-2xl font-bold">
                    Join Meeting
                  </p>

                  <p className="mt-2 text-sm font-medium text-white/80">
                    Enter an invitation link
                  </p>
                </div>
              </div>

              <div className="absolute -right-8 top-4 h-28 w-28 rotate-12 rounded-[36px] border-2 border-white/15" />
            </button>

            {/* ========================
                SCHEDULE MEETING
            ======================== */}

            <button
              type="button"
              onClick={() => setActiveModal("schedule")}
              className="cohiva-action-card cohiva-card-delay-3 group relative min-h-[220px] overflow-hidden rounded-[28px] bg-[#B9687C] p-6 text-left text-white"
            >
              <div className="cohiva-shine" />

              <div className="relative z-10 flex h-full min-h-[170px] flex-col justify-between">
                <div className="cohiva-icon-bounce flex h-14 w-14 items-center justify-center rounded-2xl bg-white/20 text-3xl backdrop-blur">
                  ◫
                </div>

                <div>
                  <p className="text-2xl font-bold">
                    Schedule
                  </p>

                  <p className="mt-2 text-sm font-medium text-white/80">
                    Plan your meeting
                  </p>
                </div>
              </div>

              <div className="absolute -bottom-14 left-5 h-32 w-32 rounded-full border-[18px] border-white/10" />
            </button>

            {/* ========================
                RECORDINGS
            ======================== */}

            <button
              type="button"
              onClick={() =>
                setActiveModal("recordings")
              }
              className="cohiva-action-card cohiva-card-delay-4 group relative min-h-[220px] overflow-hidden rounded-[28px] bg-[#403A35] p-6 text-left text-[#FFF7EB]"
            >
              <div className="cohiva-shine" />

              <div className="relative z-10 flex h-full min-h-[170px] flex-col justify-between">
                <div className="cohiva-icon-bounce flex h-14 w-14 items-center justify-center rounded-2xl bg-[#FFF7EB]/15 text-3xl backdrop-blur">
                  ▶
                </div>

                <div>
                  <p className="text-2xl font-bold">
                    Recordings
                  </p>

                  <p className="mt-2 text-sm font-medium text-[#FFF7EB]/70">
                    Rewatch your moments
                  </p>
                </div>
              </div>

              <div className="absolute right-4 top-4 h-24 w-24 rounded-full bg-[#CC3A63]/25 blur-xl" />
            </button>
          </div>
        </section>

 
      </div>

      {/* =========================================================
          NEW MEETING MODAL
      ========================================================= */}

      <ActionModal
        open={activeModal === "new"}
        onClose={() => setActiveModal(null)}
        title="Start a new meeting"
        subtitle="Create an instant Cohiva room and invite your people."
      >
        <div className="space-y-4">
          <div className="rounded-2xl bg-[#CC3A63]/10 p-4">
            <p className="font-bold text-[#3D3732]">
              Instant Meeting
            </p>

            <p className="mt-1 text-sm leading-6 text-[#756E64]">
              Your private Cohiva meeting room will be
              created immediately.
            </p>
          </div>

          <div className="flex items-center gap-3 rounded-2xl border border-[#403A35]/10 bg-white/60 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#CC3A63] text-xl text-white">
              +
            </div>

            <div>
              <p className="text-sm font-bold text-[#3D3732]">
                Ready when you are
              </p>

              <p className="text-xs text-[#756E64]">
                Camera and microphone settings come next.
              </p>
            </div>
          </div>

          <button
            type="button"
            className="w-full rounded-2xl bg-[#CC3A63] px-5 py-3.5 font-bold text-white transition-all duration-200 hover:-translate-y-0.5 hover:bg-[#B83057] hover:shadow-lg"
          >
            Start Meeting
          </button>
        </div>
      </ActionModal>

      {/* =========================================================
          JOIN MEETING MODAL
      ========================================================= */}

      <ActionModal
        open={activeModal === "join"}
        onClose={() => setActiveModal(null)}
        title="Join a meeting"
        subtitle="Paste an invitation link or enter a meeting code."
      >
        <div className="space-y-4">
          <div>
            <label
              htmlFor="meeting-link"
              className="mb-2 block text-sm font-bold text-[#3D3732]"
            >
              Meeting link or code
            </label>

            <input
              id="meeting-link"
              type="text"
              placeholder="Paste your Cohiva meeting link..."
              className="w-full rounded-2xl border border-[#403A35]/15 bg-white px-4 py-3.5 text-[#3D3732] outline-none transition-all placeholder:text-[#756E64]/50 focus:border-[#CC3A63] focus:ring-4 focus:ring-[#CC3A63]/10"
            />
          </div>

          <p className="text-xs leading-5 text-[#756E64]">
            Example: cohiva.com/meeting/abc123
          </p>

          <button
            type="button"
            className="w-full rounded-2xl bg-[#A2AB73] px-5 py-3.5 font-bold text-white transition-all duration-200 hover:-translate-y-0.5 hover:bg-[#8F9960] hover:shadow-lg"
          >
            Join Now
          </button>
        </div>
      </ActionModal>

      {/* =========================================================
          SCHEDULE MEETING MODAL
      ========================================================= */}

      <ActionModal
        open={activeModal === "schedule"}
        onClose={() => setActiveModal(null)}
        title="Schedule a meeting"
        subtitle="Choose when you want everyone to meet."
      >
        <div className="space-y-4">
          {/* Meeting title */}
          <div>
            <label
              htmlFor="meeting-title"
              className="mb-2 block text-sm font-bold text-[#3D3732]"
            >
              Meeting title
            </label>

            <input
              id="meeting-title"
              type="text"
              placeholder="Weekly project meeting"
              className="w-full rounded-2xl border border-[#403A35]/15 bg-white px-4 py-3.5 text-[#3D3732] outline-none transition-all placeholder:text-[#756E64]/50 focus:border-[#B9687C] focus:ring-4 focus:ring-[#B9687C]/10"
            />
          </div>

          {/* Date and Time */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label
                htmlFor="meeting-date"
                className="mb-2 block text-sm font-bold text-[#3D3732]"
              >
                Date
              </label>

              <input
                id="meeting-date"
                type="date"
                className="w-full rounded-2xl border border-[#403A35]/15 bg-white px-4 py-3.5 text-[#3D3732] outline-none transition focus:border-[#B9687C]"
              />
            </div>

            <div>
              <label
                htmlFor="meeting-time"
                className="mb-2 block text-sm font-bold text-[#3D3732]"
              >
                Time
              </label>

              <input
                id="meeting-time"
                type="time"
                className="w-full rounded-2xl border border-[#403A35]/15 bg-white px-4 py-3.5 text-[#3D3732] outline-none transition focus:border-[#B9687C]"
              />
            </div>
          </div>

          {/* Description */}
          <div>
            <label
              htmlFor="meeting-description"
              className="mb-2 block text-sm font-bold text-[#3D3732]"
            >
              Description
              <span className="ml-1 font-normal text-[#756E64]">
                (optional)
              </span>
            </label>

            <textarea
              id="meeting-description"
              placeholder="What's this meeting about?"
              rows={3}
              className="w-full resize-none rounded-2xl border border-[#403A35]/15 bg-white px-4 py-3.5 text-[#3D3732] outline-none transition-all placeholder:text-[#756E64]/50 focus:border-[#B9687C] focus:ring-4 focus:ring-[#B9687C]/10"
            />
          </div>

          <button
            type="button"
            className="w-full rounded-2xl bg-[#B9687C] px-5 py-3.5 font-bold text-white transition-all duration-200 hover:-translate-y-0.5 hover:bg-[#A85D70] hover:shadow-lg"
          >
            Schedule Meeting
          </button>
        </div>
      </ActionModal>

      {/* =========================================================
          RECORDINGS MODAL
      ========================================================= */}

      <ActionModal
        open={activeModal === "recordings"}
        onClose={() => setActiveModal(null)}
        title="Your recordings"
        subtitle="Revisit your previous conversations."
      >
        <div className="space-y-3">
          {/* Sample recording */}
          <div className="flex items-center justify-between gap-4 rounded-2xl border border-[#403A35]/10 bg-white/70 p-4">
            <div className="min-w-0">
              <p className="truncate font-bold text-[#3D3732]">
                Project Discussion
              </p>

              <p className="mt-1 text-xs font-medium text-[#756E64]">
                August 31 • 42 minutes
              </p>
            </div>

            <button
              type="button"
              className="shrink-0 rounded-xl bg-[#403A35] px-4 py-2 text-sm font-bold text-[#FFF7EB] transition-all hover:bg-[#CC3A63]"
            >
              Watch
            </button>
          </div>

          {/* Sample recording */}
          <div className="flex items-center justify-between gap-4 rounded-2xl border border-[#403A35]/10 bg-white/70 p-4">
            <div className="min-w-0">
              <p className="truncate font-bold text-[#3D3732]">
                Weekly Design Review
              </p>

              <p className="mt-1 text-xs font-medium text-[#756E64]">
                August 28 • 28 minutes
              </p>
            </div>

            <button
              type="button"
              className="shrink-0 rounded-xl bg-[#403A35] px-4 py-2 text-sm font-bold text-[#FFF7EB] transition-all hover:bg-[#CC3A63]"
            >
              Watch
            </button>
          </div>

          <button
            type="button"
            className="mt-2 w-full rounded-2xl bg-[#403A35] px-5 py-3.5 font-bold text-[#FFF7EB] transition-all duration-200 hover:-translate-y-0.5 hover:bg-[#514940] hover:shadow-lg"
          >
            View All Recordings
          </button>
        </div>
      </ActionModal>
    </>
  );
};

export default HomeDashboard;