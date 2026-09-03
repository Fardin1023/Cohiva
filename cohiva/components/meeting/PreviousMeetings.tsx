"use client";

import {
  type Call,
  useStreamVideoClient,
} from "@stream-io/video-react-sdk";

import { useUser } from "@clerk/nextjs";
import { useRouter } from "next/navigation";

import {
  useCallback,
  useEffect,
  useState,
} from "react";

const PreviousMeetings = () => {
  const router = useRouter();

  const { user } = useUser();

  const client =
    useStreamVideoClient();

  const userId =
    user?.id;

  const [calls, setCalls] =
    useState<Call[]>([]);

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState("");

  const [copiedId, setCopiedId] =
    useState<string | null>(
      null
    );

  const [clearing, setClearing] =
    useState(false);

  /* =====================================================
     LOAD PREVIOUS MEETINGS
  ===================================================== */

  const loadPreviousMeetings =
    useCallback(
      async () => {
        if (
          !client ||
          !userId
        ) {
          return;
        }

        try {
          setLoading(true);
          setError("");

          const response =
            await client.queryCalls({
              filter_conditions: {
                type: {
                  $eq:
                    "development",
                },

                members: {
                  $in: [
                    userId,
                  ],
                },
              },

              sort: [
                {
                  field:
                    "updated_at",

                  direction:
                    -1,
                },
              ],

              limit: 100,

              watch: true,
            });

          const now =
            Date.now();

          const previousCalls =
            response.calls
              .filter(
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
                   * Never show Personal Room
                   * inside Previous Meetings.
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

                  /*
                   * Call actually ended.
                   */
                  if (endedAt) {
                    return true;
                  }

                  /*
                   * Scheduled meeting whose
                   * scheduled time has passed.
                   */
                  if (
                    startsAt &&
                    startsAt.getTime() <
                      now
                  ) {
                    return true;
                  }

                  return false;
                }
              )
              .sort(
                (
                  first,
                  second
                ) => {
                  const firstDate =
                    first.state
                      .endedAt ??
                    first.state
                      .startsAt ??
                    first.state
                      .updatedAt;

                  const secondDate =
                    second.state
                      .endedAt ??
                    second.state
                      .startsAt ??
                    second.state
                      .updatedAt;

                  return (
                    secondDate.getTime() -
                    firstDate.getTime()
                  );
                }
              );

          setCalls(
            previousCalls
          );
        } catch (err) {
          console.error(
            "Previous meetings error:",
            err
          );

          setError(
            "Cohiva could not load your previous meetings."
          );
        } finally {
          setLoading(false);
        }
      },
      [
        client,
        userId,
      ]
    );

  useEffect(() => {
    void loadPreviousMeetings();
  }, [
    loadPreviousMeetings,
  ]);

  /* =====================================================
     DELETE THROUGH SERVER
  ===================================================== */

  const deleteMeetings =
    async (
      callIds: string[]
    ) => {
      const response =
        await fetch(
          "/api/meetings/delete",
          {
            method: "POST",

            headers: {
              "Content-Type":
                "application/json",
            },

            body:
              JSON.stringify({
                callIds,
              }),
          }
        );

      const data =
        await response.json();

      if (!response.ok) {
        throw new Error(
          data.error ||
            "Unable to clear previous meetings."
        );
      }

      return data;
    };

  /* =====================================================
     COPY MEETING LINK
  ===================================================== */

  const copyMeetingLink =
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
     CLEAR ALL PREVIOUS MEETINGS
  ===================================================== */

  const clearPreviousMeetings =
    async () => {
      if (
        calls.length ===
        0
      ) {
        return;
      }

      const confirmed =
        window.confirm(
          `Clear ${calls.length} previous meeting${
            calls.length === 1
              ? ""
              : "s"
          }?\n\nThey will be removed from your Cohiva meeting history.`
        );

      if (!confirmed) {
        return;
      }

      try {
        setError("");
        setClearing(true);

        const callIds =
          calls.map(
            (call) =>
              call.id
          );

        await deleteMeetings(
          callIds
        );

        /*
         * Remove everything
         * immediately from UI.
         */
        setCalls([]);
      } catch (err) {
        console.error(
          "Clear previous meetings error:",
          err
        );

        setError(
          err instanceof Error
            ? err.message
            : "Cohiva could not clear previous meetings."
        );

        /*
         * Refresh in case some
         * meetings were removed.
         */
        await loadPreviousMeetings();
      } finally {
        setClearing(false);
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
            Loading previous meetings...
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

      <div className="mb-8 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">

        <div>
          <p className="text-xs font-black uppercase tracking-[0.22em] text-[#B9687C]">
            Meeting History
          </p>

          <h1 className="mt-2 text-3xl font-black tracking-tight text-[#3D3732] sm:text-4xl">
            Previous Meetings
          </h1>

          <p className="mt-3 max-w-xl text-[#756E64]">
            Look back at your past
            Cohiva meetings and manage
            your meeting history.
          </p>
        </div>

        {/* CLEAR PREVIOUS */}

        {calls.length > 0 && (
          <button
            type="button"
            onClick={
              clearPreviousMeetings
            }
            disabled={
              clearing
            }
            className="inline-flex items-center justify-center gap-2 rounded-2xl border border-[#CC3A63]/20 bg-[#CC3A63]/10 px-5 py-3 text-sm font-black text-[#CC3A63] transition-all hover:-translate-y-0.5 hover:bg-[#CC3A63] hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            <span>
              🗑
            </span>

            {clearing
              ? "Clearing..."
              : "Clear Previous"}
          </button>
        )}

      </div>

      {/* =================================================
          ERROR
      ================================================= */}

      {error && (
        <div className="mb-6 rounded-[24px] bg-[#CC3A63]/10 p-5 font-semibold text-[#CC3A63]">
          {error}
        </div>
      )}

      {/* =================================================
          EMPTY STATE
      ================================================= */}

      {!error &&
        calls.length === 0 && (
          <div className="rounded-[30px] border border-[#403A35]/10 bg-[#FFF7EB] p-12 text-center shadow-sm">

            <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-[#B9687C]/15 text-4xl">
              ↶
            </div>

            <h2 className="mt-6 text-2xl font-black text-[#3D3732]">
              No previous meetings
            </h2>

            <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-[#756E64]">
              Your Cohiva meeting history
              is currently empty.
            </p>

            <button
              type="button"
              onClick={() =>
                router.push("/")
              }
              className="mt-7 rounded-2xl bg-[#CC3A63] px-6 py-3 font-bold text-white transition-all hover:-translate-y-0.5 hover:bg-[#B83057]"
            >
              Back to Dashboard
            </button>

          </div>
        )}

      {/* =================================================
          PREVIOUS MEETING CARDS
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
                ? custom
                    .description
                : "";

            const startsAt =
              call.state
                .startsAt;

            const endedAt =
              call.state
                .endedAt;

            const displayDate =
              endedAt ??
              startsAt ??
              call.state
                .updatedAt;

            const dateText =
              displayDate.toLocaleDateString(
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
              );

            const timeText =
              displayDate.toLocaleTimeString(
                [],
                {
                  hour:
                    "2-digit",

                  minute:
                    "2-digit",
                }
              );

            const actuallyEnded =
              Boolean(
                endedAt
              );

            return (
              <article
                key={
                  call.cid
                }
                className="group overflow-hidden rounded-[30px] border border-[#403A35]/10 bg-[#FFF7EB] shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-xl"
              >

                {/* TOP BAR */}

                <div className="h-2 bg-[#403A35]" />

                <div className="p-6 sm:p-7">

                  {/* TITLE */}

                  <div>
                    <span
                      className={`inline-flex rounded-full px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.16em] ${
                        actuallyEnded
                          ? "bg-[#403A35]/10 text-[#403A35]"
                          : "bg-[#B9687C]/15 text-[#A8566B]"
                      }`}
                    >
                      {actuallyEnded
                        ? "Ended"
                        : "Past Meeting"}
                    </span>

                    <h2 className="mt-4 text-xl font-black text-[#3D3732] sm:text-2xl">
                      {title}
                    </h2>
                  </div>

                  {/* DESCRIPTION */}

                  {description && (
                    <p className="mt-3 line-clamp-2 text-sm leading-6 text-[#756E64]">
                      {description}
                    </p>
                  )}

                  {/* DATE + TIME */}

                  <div className="mt-6 rounded-2xl bg-[#F9F0E0] p-5">

                    <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#756E64]">
                      {actuallyEnded
                        ? "Ended"
                        : "Scheduled"}
                    </p>

                    <p className="mt-2 text-sm font-black text-[#3D3732]">
                      {dateText}
                    </p>

                    <p className="mt-1 text-lg font-black text-[#B9687C]">
                      {timeText}
                    </p>

                  </div>

                  {/* ACTION BUTTONS */}

                  <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">

                    <button
                      type="button"
                      onClick={() =>
                        router.push(
                          `/meeting/${call.id}`
                        )
                      }
                      className="rounded-2xl bg-[#403A35] px-4 py-3.5 text-sm font-bold text-[#FFF7EB] transition-all hover:-translate-y-0.5 hover:bg-[#302B27]"
                    >
                      Open Meeting
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        copyMeetingLink(
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

export default PreviousMeetings;