"use client";

import { useUser } from "@clerk/nextjs";

import {
  useStreamVideoClient,
} from "@stream-io/video-react-sdk";

import dynamic from "next/dynamic";
import Image from "next/image";
import { useRouter } from "next/navigation";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import { useSmartPolling } from "@/lib/useSmartPolling";
import {
  COHIVA_CALL_TYPE,
  COHIVA_DEFAULT_DURATION_MINUTES,
  COHIVA_DEFAULT_PARTICIPANTS,
} from "@/lib/cohivaMeetingConfig";

import ActionModal from "./ActionModal";
import MeetingLimitFields from "./meeting/MeetingLimitFields";

const ScheduleMeetingForm = dynamic(
  () => import("./meeting/ScheduleMeetingForm"),
  {
    loading: () => (
      <div className="flex min-h-40 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#CC3A63]/20 border-t-[#CC3A63]" />
      </div>
    ),
  }
);

type ModalType =
  | "new"
  | "join"
  | "schedule"
  | null;

type UpcomingMeetingInfo = {
  id: string;
  title: string;
  startsAt: Date;
};

/* =========================================================
   DATE LABEL
========================================================= */

const getMeetingDateLabel = (
  meetingDate: Date
) => {
  const now = new Date();

  const today = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate()
  );

  const meetingDay = new Date(
    meetingDate.getFullYear(),
    meetingDate.getMonth(),
    meetingDate.getDate()
  );

  const difference =
    meetingDay.getTime() -
    today.getTime();

  const dayDifference =
    Math.round(
      difference /
        (1000 * 60 * 60 * 24)
    );

  if (dayDifference === 0) {
    return "Today";
  }

  if (dayDifference === 1) {
    return "Tomorrow";
  }

  return meetingDate.toLocaleDateString(
    [],
    {
      month: "short",
      day: "numeric",
    }
  );
};

/* =========================================================
   LOCAL CLOCK

   Kept in its own component so the large dashboard does not
   re-render every time the clock changes. The UI only shows
   minutes, so a 30-second tick is more than enough.
========================================================= */

const LocalClock = () => {
  const [now, setNow] =
    useState<Date | null>(null);

  useEffect(() => {
    const update = () =>
      setNow(new Date());

    update();

    const timer =
      window.setInterval(
        update,
        30_000
      );

    return () =>
      window.clearInterval(timer);
  }, []);

  const time = now
    ? now.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      })
    : "--:--";

  const date = now
    ? now.toLocaleDateString([], {
        weekday: "long",
        month: "long",
        day: "numeric",
        year: "numeric",
      })
    : "";

  return (
    <div className="cohiva-float w-full rounded-[26px] border border-white/70 bg-[#FFF7EB]/80 px-5 py-5 shadow-xl backdrop-blur-xl sm:px-7 sm:py-6 md:w-auto md:min-w-[285px] md:text-right">
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
  );
};

/* =========================================================
   HOME DASHBOARD
========================================================= */

const HomeDashboard = () => {
  const router = useRouter();

  const {
    user,
    isLoaded,
  } = useUser();

  const client =
    useStreamVideoClient();

  const userId =
    user?.id;


  const [
    activeModal,
    setActiveModal,
  ] =
    useState<ModalType>(
      null
    );

  const [
    meetingLink,
    setMeetingLink,
  ] =
    useState("");

  const [
    joinError,
    setJoinError,
  ] =
    useState("");

  const [
    instantDurationMinutes,
    setInstantDurationMinutes,
  ] = useState(
    COHIVA_DEFAULT_DURATION_MINUTES
  );

  const [
    instantMaxParticipants,
    setInstantMaxParticipants,
  ] = useState(
    COHIVA_DEFAULT_PARTICIPANTS
  );

  const [
    instantMeetingError,
    setInstantMeetingError,
  ] = useState("");

  const [
    startingInstantMeeting,
    setStartingInstantMeeting,
  ] = useState(false);

  const [
    upcomingMeeting,
    setUpcomingMeeting,
  ] =
    useState<UpcomingMeetingInfo | null>(
      null
    );

  const [
    previousMeetingCount,
    setPreviousMeetingCount,
  ] =
    useState(0);

  const [
    meetingsLoading,
    setMeetingsLoading,
  ] =
    useState(true);

  const dashboardLoadedRef =
    useRef(false);


  /* =====================================================
     LOAD REAL STREAM MEETING DATA
  ===================================================== */

  const loadDashboardMeetings =
    useCallback(
      async () => {
        if (
          !client ||
          !userId
        ) {
          return;
        }

        try {
          if (
            !dashboardLoadedRef.current
          ) {
            setMeetingsLoading(
              true
            );
          }

          const response =
            await client.queryCalls({
              filter_conditions: {
                type: {
                  $eq:
                    COHIVA_CALL_TYPE,
                },

                members: {
                  $in: [
                    userId,
                  ],
                },
              },

              limit: 100,

              watch: false,
            });

          const now =
            Date.now();

          /* =============================================
             UPCOMING
          ============================================= */

          const futureCalls =
            response.calls
              .filter(
                (call) => {
                  const startsAt =
                    call.state
                      .startsAt;

                  const custom =
                    call.state
                      .custom;

                  const meetingType =
                    typeof custom
                      ?.cohiva_type ===
                    "string"
                      ? custom
                          .cohiva_type
                      : "";

                  return (
                    meetingType ===
                      "scheduled" &&
                    startsAt &&
                    startsAt.getTime() >
                      now
                  );
                }
              )
              .sort(
                (
                  first,
                  second
                ) => {
                  const firstTime =
                    first.state
                      .startsAt
                      ?.getTime() ??
                    Infinity;

                  const secondTime =
                    second.state
                      .startsAt
                      ?.getTime() ??
                    Infinity;

                  return (
                    firstTime -
                    secondTime
                  );
                }
              );

          const nextCall =
            futureCalls[0];

          if (
            nextCall &&
            nextCall.state
              .startsAt
          ) {
            const custom =
              nextCall.state
                .custom;

            const title =
              typeof custom
                ?.title ===
              "string"
                ? custom.title
                : "Cohiva Meeting";

            setUpcomingMeeting({
              id:
                nextCall.id,

              title,

              startsAt:
                nextCall.state
                  .startsAt,
            });
          } else {
            setUpcomingMeeting(
              null
            );
          }

          /* =============================================
             PREVIOUS
          ============================================= */

          const previousCalls =
            response.calls.filter(
              (call) => {
                const custom =
                  call.state
                    .custom;

                const meetingType =
                  typeof custom
                    ?.cohiva_type ===
                  "string"
                    ? custom
                        .cohiva_type
                    : "";

                /*
                 * Personal Room should
                 * never count as history.
                 */
                if (
                  meetingType ===
                  "personal"
                ) {
                  return false;
                }

                const endedAt =
                  call.state
                    .endedAt;

                const startsAt =
                  call.state
                    .startsAt;

                if (endedAt) {
                  return true;
                }

                if (
                  startsAt &&
                  startsAt.getTime() <
                    now
                ) {
                  return true;
                }

                return false;
              }
            );

          setPreviousMeetingCount(
            previousCalls.length
          );
        } catch (error) {
          console.error(
            "Dashboard meeting data error:",
            error
          );

          setUpcomingMeeting(
            null
          );

          setPreviousMeetingCount(
            0
          );
        } finally {
          if (
            !dashboardLoadedRef.current
          ) {
            dashboardLoadedRef.current =
              true;

            setMeetingsLoading(
              false
            );
          }
        }
      },
      [
        client,
        userId,
      ]
    );

  useSmartPolling(
    loadDashboardMeetings,
    {
      enabled:
        Boolean(
          client &&
          userId
        ),
      intervalMs:
        60_000,
    }
  );

  /* =====================================================
     USER
  ===================================================== */

  const userName =
    user?.firstName ||
    user?.fullName ||
    user?.username ||
    "there";


  /* =====================================================
     UPCOMING DISPLAY
  ===================================================== */

  const upcomingDate =
    upcomingMeeting
      ? getMeetingDateLabel(
          upcomingMeeting.startsAt
        )
      : "";

  const upcomingTime =
    upcomingMeeting
      ? upcomingMeeting.startsAt.toLocaleTimeString(
          [],
          {
            hour:
              "2-digit",

            minute:
              "2-digit",
          }
        )
      : "";

  /* =====================================================
     START INSTANT MEETING
  ===================================================== */

  const startInstantMeeting =
    async () => {
      if (
        startingInstantMeeting
      ) {
        return;
      }

      try {
        setStartingInstantMeeting(
          true
        );

        setInstantMeetingError(
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
                kind: "instant",
                durationMinutes:
                  instantDurationMinutes,
                maxParticipants:
                  instantMaxParticipants,
              }),
            }
          );

        const result =
          await response.json();

        if (!response.ok) {
          throw new Error(
            result.error ||
              "Unable to create meeting."
          );
        }

        setActiveModal(
          null
        );

        router.push(
          `/meeting/${encodeURIComponent(
            result.callId
          )}`
        );
      } catch (error) {
        console.error(
          "Instant meeting error:",
          error
        );

        setInstantMeetingError(
          error instanceof Error
            ? error.message
            : "Unable to create meeting."
        );
      } finally {
        setStartingInstantMeeting(
          false
        );
      }
    };

  /* =====================================================
     EXTRACT MEETING ID
  ===================================================== */

  const getMeetingId = (
    value: string
  ): string | null => {
    const trimmed =
      value.trim();

    if (!trimmed) {
      return null;
    }

    try {
      const url =
        new URL(
          trimmed
        );

      const match =
        url.pathname.match(
          /\/meeting\/([^/?#]+)/
        );

      if (
        match?.[1]
      ) {
        return decodeURIComponent(
          match[1]
        );
      }
    } catch {
      /*
       * Not a complete URL.
       * Treat as meeting ID.
       */
    }

    const cleaned =
      trimmed
        .replace(
          /^\/?meeting\//,
          ""
        )
        .split(
          /[?#]/
        )[0]
        ?.trim();

    return (
      cleaned ||
      null
    );
  };

  /* =====================================================
     JOIN EXISTING MEETING
  ===================================================== */

  const joinExistingMeeting =
    () => {
      setJoinError("");

      const meetingId =
        getMeetingId(
          meetingLink
        );

      if (!meetingId) {
        setJoinError(
          "Enter a meeting link or meeting code."
        );

        return;
      }

      setActiveModal(
        null
      );

      router.push(
        `/meeting/${encodeURIComponent(
          meetingId
        )}`
      );
    };

  return (
    <>
      <div className="w-full space-y-7 pb-10">

        {/* =================================================
            HERO
        ================================================= */}

        <section className="relative min-h-[300px] overflow-hidden rounded-[30px]">

          <Image
            src="/images/bg.webp"
            alt="Cohiva dashboard background"
            fill
            priority
            sizes="(max-width: 767px) 100vw, calc(100vw - 264px)"
            className="object-cover object-center"
          />

          <div className="absolute inset-0 bg-gradient-to-r from-[#FFF7EB]/90 via-[#FFF7EB]/55 to-[#FFF7EB]/20" />

          <div className="absolute -left-12 -top-16 h-48 w-48 rounded-full bg-[#CC3A63]/15 blur-3xl" />

          <div className="absolute -bottom-16 right-[25%] h-52 w-52 rounded-full bg-[#A2AB73]/20 blur-3xl" />

          <div className="relative z-10 flex min-h-[300px] flex-col justify-between gap-7 p-6 sm:p-8 md:flex-row md:items-center lg:p-10">

            {/* LEFT */}

            <div className="max-w-[650px]">

              <p className="text-xs font-bold uppercase tracking-[0.22em] text-[#8F9960]">
                Your Cohiva Space
              </p>

              <h1 className="mt-2 text-3xl font-black tracking-tight text-[#3D3732] sm:text-4xl lg:text-5xl">
                {isLoaded
                  ? `Hey, ${userName} 👋`
                  : "Welcome to Cohiva"}
              </h1>

              <p className="mt-3 text-sm font-medium text-[#756E64] sm:text-base">
                Your meetings,
                your people,
                your space.
              </p>

              {/* REAL MEETING DATA */}

              <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:flex-wrap">

                {/* UPCOMING */}

                <button
                  type="button"
                  onClick={() => {
                    if (
                      upcomingMeeting
                    ) {
                      router.push(
                        `/meeting/${upcomingMeeting.id}`
                      );
                    } else {
                      router.push(
                        "/upcoming"
                      );
                    }
                  }}
                  className="group flex min-w-[230px] items-center gap-3 rounded-2xl border border-white/70 bg-[#FFF7EB]/85 px-4 py-3 text-left shadow-md backdrop-blur-md transition-all duration-300 hover:-translate-y-1 hover:shadow-lg"
                >
                  <span className="relative flex h-3 w-3 shrink-0">

                    {!meetingsLoading &&
                      upcomingMeeting && (
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#CC3A63] opacity-40" />
                      )}

                    <span
                      className={`relative inline-flex h-3 w-3 rounded-full ${
                        upcomingMeeting
                          ? "bg-[#CC3A63]"
                          : "bg-[#A2AB73]"
                      }`}
                    />

                  </span>

                  <div>

                    <p className="text-[11px] font-bold uppercase tracking-wider text-[#CC3A63]">
                      Upcoming
                    </p>

                    {meetingsLoading ? (
                      <p className="mt-0.5 text-sm font-bold text-[#756E64]">
                        Checking schedule...
                      </p>
                    ) : upcomingMeeting ? (
                      <>
                        <p className="mt-0.5 max-w-[220px] truncate text-sm font-bold text-[#3D3732]">
                          {
                            upcomingMeeting.title
                          }
                        </p>

                        <p className="mt-0.5 text-xs font-medium text-[#756E64]">
                          {upcomingDate}
                          {" • "}
                          {upcomingTime}
                        </p>
                      </>
                    ) : (
                      <>
                        <p className="mt-0.5 text-sm font-bold text-[#3D3732]">
                          No upcoming meetings
                        </p>

                        <p className="mt-0.5 text-xs font-medium text-[#756E64]">
                          Schedule one anytime
                        </p>
                      </>
                    )}

                  </div>
                </button>

                {/* PREVIOUS */}

                <button
                  type="button"
                  onClick={() =>
                    router.push(
                      "/previous"
                    )
                  }
                  className="group flex items-center gap-3 rounded-2xl border border-[#CC3A63]/15 bg-[#CC3A63]/10 px-4 py-3 text-left backdrop-blur-md transition-all duration-300 hover:-translate-y-1 hover:bg-[#CC3A63]/15"
                >

                  <div className="flex h-9 min-w-9 items-center justify-center rounded-full bg-[#CC3A63] px-2 text-sm font-bold text-white">
                    {meetingsLoading
                      ? "..."
                      : previousMeetingCount}
                  </div>

                  <div>

                    <p className="text-[11px] font-bold uppercase tracking-wider text-[#756E64]">
                      Previous
                    </p>

                    <p className="mt-0.5 text-sm font-bold text-[#CC3A63]">
                      {previousMeetingCount ===
                      1
                        ? "1 Past Meeting"
                        : `${previousMeetingCount} Past Meetings`}
                    </p>

                  </div>
                </button>

              </div>
            </div>

            {/* CLOCK */}

            <LocalClock />

          </div>
        </section>

        {/* =================================================
            QUICK ACTIONS
        ================================================= */}

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
              Pick one and jump
              right in ✨
            </p>

          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">

            {/* NEW MEETING */}

            <button
              type="button"
              onClick={() =>
                setActiveModal(
                  "new"
                )
              }
              className="cohiva-action-card cohiva-card-delay-1 group relative min-h-[220px] overflow-hidden rounded-[28px] bg-[#CC3A63] p-6 text-left text-white"
            >

              <div className="cohiva-shine" />

              <div className="relative z-10 flex min-h-[170px] flex-col justify-between">

                <div className="cohiva-icon-bounce flex h-14 w-14 items-center justify-center rounded-2xl bg-white/20 text-4xl backdrop-blur">
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

            {/* JOIN */}

            <button
              type="button"
              onClick={() =>
                setActiveModal(
                  "join"
                )
              }
              className="cohiva-action-card cohiva-card-delay-2 group relative min-h-[220px] overflow-hidden rounded-[28px] bg-[#A2AB73] p-6 text-left text-white"
            >

              <div className="cohiva-shine" />

              <div className="relative z-10 flex min-h-[170px] flex-col justify-between">

                <div className="cohiva-icon-bounce flex h-14 w-14 items-center justify-center rounded-2xl bg-white/20 text-3xl backdrop-blur">
                  ↗
                </div>

                <div>

                  <p className="text-2xl font-bold">
                    Join Meeting
                  </p>

                  <p className="mt-2 text-sm font-medium text-white/80">
                    Enter invitation link
                  </p>

                </div>

              </div>

            </button>

            {/* SCHEDULE */}

            <button
              type="button"
              onClick={() =>
                setActiveModal(
                  "schedule"
                )
              }
              className="cohiva-action-card cohiva-card-delay-3 group relative min-h-[220px] overflow-hidden rounded-[28px] bg-[#B9687C] p-6 text-left text-white"
            >

              <div className="cohiva-shine" />

              <div className="relative z-10 flex min-h-[170px] flex-col justify-between">

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

            </button>

            {/* RECORDINGS */}

            <button
              type="button"
              onClick={() =>
                router.push(
                  "/recordings"
                )
              }
              className="cohiva-action-card cohiva-card-delay-4 group relative min-h-[220px] overflow-hidden rounded-[28px] bg-[#403A35] p-6 text-left text-[#FFF7EB]"
            >

              <div className="cohiva-shine" />

              <div className="relative z-10 flex min-h-[170px] flex-col justify-between">

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

      {/* =================================================
          NEW MEETING MODAL
      ================================================= */}

      <ActionModal
        open={
          activeModal ===
          "new"
        }
        onClose={() =>
          setActiveModal(
            null
          )
        }
        title="Start a new meeting"
        subtitle="Create an instant Cohiva room and invite your people."
      >

        <div className="space-y-4">

          <div className="rounded-2xl bg-[#CC3A63]/10 p-4">
            <p className="font-bold text-[#3D3732]">
              Instant Meeting
            </p>

            <p className="mt-1 text-sm leading-6 text-[#756E64]">
              Choose the room limits, then Cohiva will create the meeting immediately.
            </p>
          </div>

          <MeetingLimitFields
            durationMinutes={
              instantDurationMinutes
            }
            maxParticipants={
              instantMaxParticipants
            }
            onDurationChange={
              setInstantDurationMinutes
            }
            onParticipantsChange={
              setInstantMaxParticipants
            }
            disabled={
              startingInstantMeeting
            }
          />

          {instantMeetingError && (
            <div className="rounded-xl bg-[#CC3A63]/10 p-3 text-xs font-bold text-[#CC3A63]">
              {instantMeetingError}
            </div>
          )}

          <button
            type="button"
            onClick={() =>
              void startInstantMeeting()
            }
            disabled={
              startingInstantMeeting
            }
            className="w-full rounded-2xl bg-[#CC3A63] px-5 py-3.5 font-bold text-white transition hover:bg-[#B83057] disabled:cursor-wait disabled:opacity-60"
          >
            {startingInstantMeeting
              ? "Creating meeting..."
              : "Start Meeting"}
          </button>

        </div>

      </ActionModal>

      {/* =================================================
          JOIN MODAL
      ================================================= */}

      <ActionModal
        open={
          activeModal ===
          "join"
        }
        onClose={() => {
          setActiveModal(
            null
          );

          setJoinError(
            ""
          );
        }}
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
              value={
                meetingLink
              }
              onChange={(
                event
              ) => {
                setMeetingLink(
                  event.target.value
                );

                setJoinError(
                  ""
                );
              }}
              onKeyDown={(
                event
              ) => {
                if (
                  event.key ===
                  "Enter"
                ) {
                  joinExistingMeeting();
                }
              }}
              placeholder="Paste Cohiva link or meeting code..."
              className="w-full rounded-2xl border border-[#403A35]/15 bg-white px-4 py-3.5 text-[#3D3732] outline-none placeholder:text-[#756E64]/50 focus:border-[#CC3A63] focus:ring-4 focus:ring-[#CC3A63]/10"
            />

            {joinError && (
              <p className="mt-2 text-sm font-semibold text-[#CC3A63]">
                {joinError}
              </p>
            )}

          </div>

          <button
            type="button"
            onClick={
              joinExistingMeeting
            }
            className="w-full rounded-2xl bg-[#A2AB73] px-5 py-3.5 font-bold text-white transition hover:bg-[#8F9960]"
          >
            Join Now
          </button>

        </div>

      </ActionModal>

      {/* =================================================
          SCHEDULE MODAL
      ================================================= */}

      <ActionModal
        open={
          activeModal ===
          "schedule"
        }
        onClose={() =>
          setActiveModal(
            null
          )
        }
        title="Schedule a meeting"
        subtitle="Choose a date and time for your next Cohiva meeting."
      >

        <ScheduleMeetingForm
          onScheduled={() =>
            setActiveModal(
              null
            )
          }
        />

      </ActionModal>

    </>
  );
};

export default HomeDashboard;