"use client";

import {
  type Call,
  useStreamVideoClient,
} from "@stream-io/video-react-sdk";

import {
  useUser,
} from "@clerk/nextjs";

import {
  useRouter,
} from "next/navigation";

import {
  useEffect,
  useState,
} from "react";

const UpcomingMeetings = () => {
  const router =
    useRouter();

  const {
    user,
  } = useUser();

  const client =
    useStreamVideoClient();

  const userId =
    user?.id;

  const [
    calls,
    setCalls,
  ] =
    useState<Call[]>(
      []
    );

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
    copiedId,
    setCopiedId,
  ] =
    useState<
      string | null
    >(null);

  /* =====================================================
     LOAD UPCOMING MEETINGS
  ===================================================== */

  useEffect(() => {
    if (
      !client ||
      !userId
    ) {
      return;
    }

    let cancelled =
      false;

    const loadMeetings =
      async () => {
        try {
          setLoading(
            true
          );

          setError("");

          const response =
            await client.queryCalls(
              {
                filter_conditions:
                  {
                    type: {
                      $eq:
                        "development",
                    },

                    members: {
                      $in: [
                        userId,
                      ],
                    },

                    starts_at: {
                      $gte:
                        new Date().toISOString(),
                    },
                  },

                sort: [
                  {
                    field:
                      "starts_at",

                    direction:
                      1,
                  },
                ],

                limit:
                  50,

                watch:
                  true,
              }
            );

          if (!cancelled) {
            setCalls(
              response.calls
            );
          }
        } catch (err) {
          console.error(
            "Upcoming meetings error:",
            err
          );

          if (!cancelled) {
            setError(
              "Cohiva could not load your upcoming meetings."
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

    void loadMeetings();

    return () => {
      cancelled = true;
    };
  }, [
    client,
    userId,
  ]);

  /* =====================================================
     COPY INVITE LINK
  ===================================================== */

  const copyLink =
    async (
      callId: string
    ) => {
      try {
        const link =
          `${window.location.origin}/meeting/${callId}`;

        await navigator.clipboard.writeText(
          link
        );

        setCopiedId(
          callId
        );

        window.setTimeout(
          () => {
            setCopiedId(
              null
            );
          },
          1800
        );
      } catch (err) {
        console.error(
          "Copy meeting link error:",
          err
        );
      }
    };

  /* =====================================================
     LOADING
  ===================================================== */

  if (loading) {
    return (
      <div className="flex min-h-[450px] items-center justify-center">

        <div className="text-center">

          <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-[#CC3A63]/20 border-t-[#CC3A63]" />

          <p className="mt-4 font-semibold text-[#756E64]">
            Loading meetings...
          </p>

        </div>
      </div>
    );
  }

  return (
    <section className="w-full pb-10">

      {/* =================================================
          HEADER
      ================================================= */}

      <div className="mb-8">

        <p className="text-xs font-black uppercase tracking-[0.22em] text-[#A2AB73]">
          Your schedule
        </p>

        <h1 className="mt-2 text-3xl font-black tracking-tight text-[#3D3732] sm:text-4xl">
          Upcoming Meetings
        </h1>

        <p className="mt-3 text-[#756E64]">
          All your scheduled Cohiva
          meetings in one place.
        </p>

      </div>

      {/* =================================================
          ERROR
      ================================================= */}

      {error && (
        <div className="rounded-[24px] bg-[#CC3A63]/10 p-5 font-semibold text-[#CC3A63]">
          {error}
        </div>
      )}

      {/* =================================================
          EMPTY
      ================================================= */}

      {!error &&
        calls.length ===
          0 && (
          <div className="rounded-[30px] border border-[#403A35]/10 bg-[#FFF7EB] p-12 text-center shadow-sm">

            <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-[#A2AB73]/15 text-4xl">
              ◫
            </div>

            <h2 className="mt-6 text-2xl font-black text-[#3D3732]">
              Nothing scheduled yet
            </h2>

            <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-[#756E64]">
              Schedule a meeting
              from the Cohiva
              dashboard and it
              will automatically
              appear here.
            </p>

            <button
              type="button"
              onClick={() =>
                router.push(
                  "/"
                )
              }
              className="mt-7 rounded-2xl bg-[#CC3A63] px-6 py-3 font-bold text-white transition-all hover:-translate-y-0.5 hover:bg-[#B83057]"
            >
              Back to Dashboard
            </button>
          </div>
        )}

      {/* =================================================
          MEETING CARDS
      ================================================= */}

      <div className="grid gap-5 lg:grid-cols-2">

        {calls.map(
          (call) => {
            const custom =
              call.state
                .custom;

            const title =
              typeof custom
                ?.title ===
              "string"
                ? custom.title
                : "Cohiva Meeting";

            const description =
              typeof custom
                ?.description ===
              "string"
                ? custom.description
                : "";

            const startsAt =
              call.state
                .startsAt;

            const dateText =
              startsAt
                ? startsAt.toLocaleDateString(
                    [],
                    {
                      weekday:
                        "long",

                      month:
                        "long",

                      day:
                        "numeric",

                      year:
                        "numeric",
                    }
                  )
                : "Date not set";

            const timeText =
              startsAt
                ? startsAt.toLocaleTimeString(
                    [],
                    {
                      hour:
                        "2-digit",

                      minute:
                        "2-digit",
                    }
                  )
                : "";

            return (
              <article
                key={
                  call.cid
                }
                className="group overflow-hidden rounded-[30px] border border-[#403A35]/10 bg-[#FFF7EB] shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-xl"
              >

                {/* COLOR BAR */}

                <div className="h-2 bg-[#B9687C]" />

                <div className="p-6 sm:p-7">

                  {/* TOP */}

                  <div className="flex items-start justify-between gap-4">

                    <div>

                      <span className="inline-flex rounded-full bg-[#A2AB73]/15 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.16em] text-[#737C4C]">
                        Scheduled
                      </span>

                      <h2 className="mt-4 text-xl font-black text-[#3D3732] sm:text-2xl">
                        {title}
                      </h2>

                    </div>

                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#B9687C]/10 text-2xl text-[#B9687C]">
                      ◫
                    </div>

                  </div>

                  {/* DESCRIPTION */}

                  {description && (
                    <p className="mt-3 line-clamp-2 text-sm leading-6 text-[#756E64]">
                      {
                        description
                      }
                    </p>
                  )}

                  {/* DATE */}

                  <div className="mt-6 rounded-2xl bg-[#F9F0E0] p-5">

                    <p className="text-sm font-black text-[#3D3732]">
                      {dateText}
                    </p>

                    <p className="mt-1 text-lg font-black text-[#CC3A63]">
                      {timeText}
                    </p>

                  </div>

                  {/* BUTTONS */}

                  <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">

                    <button
                      type="button"
                      onClick={() =>
                        router.push(
                          `/meeting/${call.id}`
                        )
                      }
                      className="rounded-2xl bg-[#CC3A63] px-4 py-3.5 text-sm font-bold text-white transition-all hover:-translate-y-0.5 hover:bg-[#B83057]"
                    >
                      Open Meeting
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        copyLink(
                          call.id
                        )
                      }
                      className="rounded-2xl border border-[#403A35]/10 bg-[#F9F0E0] px-4 py-3.5 text-sm font-bold text-[#3D3732] transition-all hover:bg-[#F1E6D4]"
                    >
                      {copiedId ===
                      call.id
                        ? "Copied ✓"
                        : "Copy Link"}
                    </button>

                  </div>

                  {/* MEETING ID */}

                  <div className="mt-5 border-t border-[#403A35]/10 pt-4">

                    <p className="text-[10px] font-bold uppercase tracking-wider text-[#756E64]/60">
                      Meeting ID
                    </p>

                    <p className="mt-1 truncate font-mono text-[11px] text-[#756E64]">
                      {call.id}
                    </p>

                  </div>

                </div>
              </article>
            );
          }
        )}
      </div>
    </section>
  );
};

export default UpcomingMeetings;