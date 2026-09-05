"use client";

import { useUser } from "@clerk/nextjs";
import Image from "next/image";
import { useEffect, useState } from "react";

const HomeBanner = () => {
  const { user, isLoaded } = useUser();
  const [currentTime, setCurrentTime] = useState<Date | null>(null);

  useEffect(() => {
    setCurrentTime(new Date());

    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 30_000);

    return () => clearInterval(timer);
  }, []);

  // User name from Clerk
  const userName =
    user?.firstName ||
    user?.fullName ||
    user?.username ||
    "User";

  // --------------------------------------------------
  // SAMPLE DATA
  // Later this will come from your meeting database
  // --------------------------------------------------

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

  // --------------------------------------------------

  const time = currentTime
    ? currentTime.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      })
    : "--:--";

  const day = currentTime
    ? currentTime.toLocaleDateString([], {
        weekday: "long",
      })
    : "";

  const date = currentTime
    ? currentTime.toLocaleDateString([], {
        month: "long",
        day: "numeric",
        year: "numeric",
      })
    : "";

  return (
    <section className="relative min-h-[390px] w-full overflow-hidden rounded-[26px]">
      {/* Background */}
      <Image
        src="/images/bg.webp"
        alt="Cohiva home background"
        fill
        priority
        sizes="(max-width: 767px) 100vw, calc(100vw - 264px)"
        className="object-cover object-center"
      />  

      {/* Soft overlay */}
      <div className="absolute inset-0 bg-[#FFF7EB]/10" />

      {/* Main content */}
      <div className="relative z-10 flex min-h-[390px] flex-col justify-between gap-6 p-5 sm:p-7 md:flex-row md:items-center lg:p-9">

        {/* ==================================================
            LEFT SIDE
            ================================================== */}

        <div className="w-full md:max-w-[520px]">
          {/* User greeting */}
          <div className="mb-4">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#A2AB73]">
              Welcome back
            </p>

            <h1 className="mt-1 text-3xl font-bold text-[#3D3732]">
              {isLoaded ? `Hi, ${userName} 👋` : "Welcome to Cohiva"}
            </h1>

            <p className="mt-1 text-sm text-[#756E64]">
              Here&apos;s what&apos;s happening with your meetings.
            </p>
          </div>

          {/* Notification box */}
          <div className="rounded-[24px] border border-white/60 bg-[#FFF7EB]/85 p-5 shadow-lg backdrop-blur-md">

            {/* Upcoming */}
            <div>
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="relative flex h-3 w-3">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#CC3A63] opacity-40" />

                    <span className="relative inline-flex h-3 w-3 rounded-full bg-[#CC3A63]" />
                  </span>

                  <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#CC3A63]">
                    Upcoming Meeting
                  </p>
                </div>

                <span className="rounded-full bg-[#A2AB73]/20 px-3 py-1 text-xs font-semibold text-[#737C4C]">
                  Next
                </span>
              </div>

              <h2 className="mt-3 text-xl font-bold text-[#3D3732]">
                {upcomingMeeting.title}
              </h2>

              <div className="mt-2 flex flex-wrap items-center gap-2 text-sm font-medium text-[#756E64]">
                <span>{upcomingMeeting.date}</span>

                <span className="h-1 w-1 rounded-full bg-[#A2AB73]" />

                <span>{upcomingMeeting.time}</span>
              </div>

              <button
                type="button"
                className="mt-4 rounded-xl bg-[#CC3A63] px-5 py-2.5 text-sm font-semibold text-white transition-all duration-200 hover:-translate-y-0.5 hover:bg-[#B83057] hover:shadow-lg"
              >
                Join Meeting
              </button>
            </div>

            {/* Divider */}
            <div className="my-5 h-px bg-[#403A35]/10" />

            {/* Missed meetings */}
            <div>
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold uppercase tracking-[0.17em] text-[#756E64]">
                  Missed Meetings
                </p>

                {missedMeetings.length > 0 && (
                  <span className="rounded-full bg-[#CC3A63]/10 px-3 py-1 text-xs font-bold text-[#CC3A63]">
                    {missedMeetings.length} missed
                  </span>
                )}
              </div>

              {missedMeetings.length > 0 ? (
                <div className="mt-3 space-y-2">
                  {missedMeetings.slice(0, 2).map((meeting) => (
                    <div
                      key={meeting.id}
                      className="flex items-center justify-between gap-4 rounded-xl bg-white/45 px-4 py-3 transition-colors hover:bg-white/70"
                    >
                      <div>
                        <p className="text-sm font-semibold text-[#3D3732]">
                          {meeting.title}
                        </p>

                        <p className="mt-1 text-xs text-[#756E64]">
                          {meeting.date} • {meeting.time}
                        </p>
                      </div>

                      <span className="shrink-0 rounded-lg bg-[#CC3A63]/10 px-2.5 py-1 text-xs font-semibold text-[#CC3A63]">
                        Missed
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-3 text-sm font-medium text-[#756E64]">
                  You haven&apos;t missed any meetings 🎉
                </p>
              )}
            </div>
          </div>
        </div>

        {/* ==================================================
            RIGHT SIDE - LIVE TIME
            ================================================== */}

        <div className="flex w-full justify-start md:w-auto md:justify-end">
          <div className="min-w-[260px] rounded-[24px] border border-white/60 bg-[#FFF7EB]/80 px-7 py-6 shadow-lg backdrop-blur-md md:text-right">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#A2AB73]">
              Current Time
            </p>

            <h2 className="mt-2 text-4xl font-bold tracking-tight text-[#3D3732] sm:text-5xl">
              {time}
            </h2>

            <p className="mt-4 text-lg font-bold text-[#CC3A63]">
              {day}
            </p>

            <p className="mt-1 text-sm font-medium text-[#756E64]">
              {date}
            </p>

            <div className="mt-5 rounded-xl bg-[#A2AB73]/15 px-4 py-3">
              <p className="text-xs font-medium text-[#737C4C]">
                Your local time
              </p>
            </div>
          </div>
        </div>

      </div>
    </section>
  );
};

export default HomeBanner;