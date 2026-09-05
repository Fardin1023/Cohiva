"use client";

import { useSmartPolling } from "@/lib/useSmartPolling";

import {
  type Call,
  useStreamVideoClient,
} from "@stream-io/video-react-sdk";

import { useUser } from "@clerk/nextjs";

import {
  useCallback,
  useState,
} from "react";

type RecordingItem = {
  id: string;
  callId: string;
  callTitle: string;
  url: string;
  startTime: Date | null;
  endTime: Date | null;
};

/* =========================================================
   DATE PARSER
========================================================= */

const parseDate = (
  value: unknown
): Date | null => {
  if (!value) {
    return null;
  }

  const parsed =
    new Date(String(value));

  if (
    Number.isNaN(
      parsed.getTime()
    )
  ) {
    return null;
  }

  return parsed;
};

/* =========================================================
   DURATION FORMATTER
========================================================= */

const formatDuration = (
  start: Date | null,
  end: Date | null
) => {
  if (
    !start ||
    !end
  ) {
    return "";
  }

  const seconds =
    Math.max(
      0,
      Math.floor(
        (
          end.getTime() -
          start.getTime()
        ) / 1000
      )
    );

  const minutes =
    Math.floor(
      seconds / 60
    );

  const remainingSeconds =
    seconds % 60;

  if (
    minutes === 0
  ) {
    return `${remainingSeconds}s`;
  }

  return `${minutes}m ${remainingSeconds}s`;
};

/* =========================================================
   SAFE FILE NAME
========================================================= */

const createFileName = (
  recording: RecordingItem
) => {
  const safeTitle =
    recording.callTitle
      .toLowerCase()
      .replace(
        /[^a-z0-9]+/g,
        "-"
      )
      .replace(
        /^-+|-+$/g,
        ""
      );

  const date =
    recording.startTime
      ? recording.startTime
          .toISOString()
          .slice(0, 10)
      : "recording";

  return `cohiva-${
    safeTitle ||
    "meeting"
  }-${date}.mp4`;
};

/* =========================================================
   BOUNDED CONCURRENCY

   Stream recording discovery can involve many calls. Running
   all listRecordings requests at once creates a large burst.
   Small batches keep the page responsive and reduce rate-limit
   pressure without changing the returned results.
========================================================= */

async function settleInBatches<T, R>(
  items: readonly T[],
  batchSize: number,
  worker: (item: T) => Promise<R>
): Promise<PromiseSettledResult<R>[]> {
  const settled:
    PromiseSettledResult<R>[] = [];

  for (
    let index = 0;
    index < items.length;
    index += batchSize
  ) {
    const batch =
      items.slice(
        index,
        index + batchSize
      );

    settled.push(
      ...(await Promise.allSettled(
        batch.map(worker)
      ))
    );
  }

  return settled;
}

/* =========================================================
   RECORDINGS PAGE
========================================================= */

const Recordings = () => {
  const {
    user,
  } = useUser();

  const client =
    useStreamVideoClient();

  const userId =
    user?.id;

  const [
    recordings,
    setRecordings,
  ] =
    useState<
      RecordingItem[]
    >([]);

  const [
    loading,
    setLoading,
  ] =
    useState(true);

  const [
    refreshing,
    setRefreshing,
  ] =
    useState(false);

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

  const [
    downloadingId,
    setDownloadingId,
  ] =
    useState<
      string | null
    >(null);

  /* =====================================================
     LOAD RECORDINGS
  ===================================================== */

  const loadRecordings =
    useCallback(
      async (
        showRefreshLoader =
          false
      ) => {
        if (
          !client ||
          !userId
        ) {
          return;
        }

        try {
          if (
            showRefreshLoader
          ) {
            setRefreshing(
              true
            );
          } else {
            setLoading(
              true
            );
          }

          setError("");

          const response =
            await client.queryCalls({
              filter_conditions: {
                type: {
                  $eq:
                    "development",
                },

                $or: [
                  {
                    created_by_user_id:
                      {
                        $eq:
                          userId,
                      },
                  },

                  {
                    members: {
                      $in: [
                        userId,
                      ],
                    },
                  },
                ],
              },

              sort: [
                {
                  field:
                    "updated_at",

                  direction:
                    -1,
                },
              ],

              limit: 50,

              watch: false,
            });

          /*
           * Load recordings for
           * each matching meeting.
           */
          const results =
            await settleInBatches(
              response.calls,
              8,
              async (
                call: Call
              ) => {
                const result =
                  await call.listRecordings();

                const custom =
                  call.state
                    .custom;

                const title =
                  typeof custom
                    ?.title ===
                  "string"
                    ? custom.title
                    : call.id.startsWith(
                          "personal-"
                        )
                      ? "Personal Room"
                      : "Cohiva Meeting";

                return result.recordings.map(
                  (
                    recording,
                    index
                  ): RecordingItem => {
                    const startTime =
                      parseDate(
                        recording.start_time
                      );

                    const endTime =
                      parseDate(
                        recording.end_time
                      );

                    return {
                      id:
                        `${call.cid}-${String(
                          recording.start_time
                        )}-${index}`,

                      callId:
                        call.id,

                      callTitle:
                        title,

                      url:
                        recording.url,

                      startTime,

                      endTime,
                    };
                  }
                );
              }
            );

          const loadedRecordings =
            results.flatMap(
              (
                result
              ) => {
                if (
                  result.status ===
                  "fulfilled"
                ) {
                  return result.value;
                }

                console.error(
                  "Unable to load recordings for a call:",
                  result.reason
                );

                return [];
              }
            );

          /*
           * Newest first.
           */
          loadedRecordings.sort(
            (
              first,
              second
            ) => {
              const firstTime =
                first.startTime
                  ?.getTime() ??
                0;

              const secondTime =
                second.startTime
                  ?.getTime() ??
                0;

              return (
                secondTime -
                firstTime
              );
            }
          );

          setRecordings(
            loadedRecordings
          );
        } catch (err) {
          console.error(
            "Recordings loading error:",
            err
          );

          setError(
            "Cohiva could not load your recordings."
          );
        } finally {
          setLoading(
            false
          );

          setRefreshing(
            false
          );
        }
      },
      [
        client,
        userId,
      ]
    );

  /* =====================================================
     INITIAL LOAD + AUTO REFRESH

     Recording discovery is expensive because each matching
     call can require a listRecordings request. Refresh only
     while the page is visible and at a calmer cadence.
  ===================================================== */

  useSmartPolling(
    () =>
      loadRecordings(
        true
      ),
    {
      enabled:
        Boolean(
          client &&
          userId
        ),
      intervalMs:
        120_000,
    }
  );

  /* =====================================================
     COPY RECORDING LINK
  ===================================================== */

  const copyRecordingLink =
    async (
      recording:
        RecordingItem
    ) => {
      try {
        await navigator.clipboard.writeText(
          recording.url
        );

        setCopiedId(
          recording.id
        );

        window.setTimeout(
          () => {
            setCopiedId(
              null
            );
          },
          1800
        );
      } catch (
        err
      ) {
        console.error(
          "Copy recording link error:",
          err
        );

        setError(
          "Cohiva could not copy the recording link."
        );
      }
    };

  /* =====================================================
     DOWNLOAD RECORDING
  ===================================================== */

  const downloadRecording =
    async (
      recording:
        RecordingItem
    ) => {
      try {
        setError("");

        setDownloadingId(
          recording.id
        );

        /*
         * Download the MP4 from
         * Stream into the browser.
         */
        const response =
          await fetch(
            recording.url
          );

        if (
          !response.ok
        ) {
          throw new Error(
            "Recording download failed."
          );
        }

        const blob =
          await response.blob();

        const blobUrl =
          URL.createObjectURL(
            blob
          );

        const link =
          document.createElement(
            "a"
          );

        link.href =
          blobUrl;

        link.download =
          createFileName(
            recording
          );

        document.body.appendChild(
          link
        );

        link.click();

        document.body.removeChild(
          link
        );

        /*
         * Free browser memory.
         */
        window.setTimeout(
          () => {
            URL.revokeObjectURL(
              blobUrl
            );
          },
          1000
        );
      } catch (err) {
        console.error(
          "Download recording error:",
          err
        );

        /*
         * Fallback:
         * open the Stream recording
         * URL in a new browser tab.
         */
        window.open(
          recording.url,
          "_blank",
          "noopener,noreferrer"
        );

        setError(
          "Automatic download was blocked. The recording was opened in a new tab instead."
        );
      } finally {
        setDownloadingId(
          null
        );
      }
    };

  /* =====================================================
     LOADING
  ===================================================== */

  if (loading) {
    return (
      <div className="flex min-h-[500px] items-center justify-center">

        <div className="text-center">

          <div className="mx-auto h-11 w-11 animate-spin rounded-full border-4 border-[#CC3A63]/20 border-t-[#CC3A63]" />

          <p className="mt-4 font-bold text-[#756E64]">
            Loading recordings...
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

          <p className="text-xs font-black uppercase tracking-[0.22em] text-[#CC3A63]">
            Saved Moments
          </p>

          <h1 className="mt-2 text-3xl font-black tracking-tight text-[#3D3732] sm:text-4xl">
            Recordings
          </h1>

          <p className="mt-3 max-w-2xl text-[#756E64]">
            Watch, download and
            revisit your recorded
            Cohiva conversations.
          </p>

        </div>

        {/* REFRESH */}

        <button
          type="button"
          onClick={() =>
            void loadRecordings(
              true
            )
          }
          disabled={
            refreshing
          }
          className="rounded-2xl border border-[#403A35]/10 bg-[#FFF7EB] px-5 py-3 text-sm font-black text-[#3D3732] transition-all hover:-translate-y-0.5 hover:bg-[#F1E6D4] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {refreshing
            ? "Checking..."
            : "↻ Refresh"}
        </button>

      </div>

      {/* =================================================
          PROCESSING NOTICE
      ================================================= */}

      <div className="mb-6 flex gap-4 rounded-[24px] border border-[#A2AB73]/20 bg-[#A2AB73]/10 p-5">

        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[#A2AB73]/20 text-lg">
          ◷
        </div>

        <div>

          <p className="font-black text-[#3D3732]">
            Just stopped a recording?
          </p>

          <p className="mt-1 text-sm leading-6 text-[#756E64]">
            Stream may need some
            time to process it.
            Press Refresh if your
            recording doesn&apos;t
            appear immediately.
          </p>

        </div>

      </div>

      {/* ERROR */}

      {error && (
        <div className="mb-6 rounded-[24px] bg-[#CC3A63]/10 p-5 text-sm font-semibold text-[#CC3A63]">
          {error}
        </div>
      )}

      {/* =================================================
          EMPTY
      ================================================= */}

      {!error &&
        recordings.length ===
          0 && (
          <div className="rounded-[32px] border border-[#403A35]/10 bg-[#FFF7EB] p-12 text-center shadow-sm">

            <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-[#CC3A63]/10 text-3xl">
              ▶
            </div>

            <h2 className="mt-6 text-2xl font-black text-[#3D3732]">
              No recordings yet
            </h2>

            <p className="mx-auto mt-3 max-w-lg text-sm leading-6 text-[#756E64]">
              Record one of your
              Cohiva meetings and
              it will appear here
              once processing is
              complete.
            </p>

          </div>
        )}

      {/* =================================================
          RECORDINGS
      ================================================= */}

      <div className="grid gap-6 xl:grid-cols-2">

        {recordings.map(
          (
            recording
          ) => {
            const dateText =
              recording.startTime
                ? recording.startTime.toLocaleDateString(
                    [],
                    {
                      weekday:
                        "short",

                      month:
                        "long",

                      day:
                        "numeric",

                      year:
                        "numeric",
                    }
                  )
                : "Recording";

            const timeText =
              recording.startTime
                ? recording.startTime.toLocaleTimeString(
                    [],
                    {
                      hour:
                        "2-digit",

                      minute:
                        "2-digit",
                    }
                  )
                : "";

            const duration =
              formatDuration(
                recording.startTime,
                recording.endTime
              );

            const downloading =
              downloadingId ===
              recording.id;

            return (
              <article
                key={
                  recording.id
                }
                className="overflow-hidden rounded-[30px] border border-[#403A35]/10 bg-[#FFF7EB] shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-xl"
              >

                {/* =========================================
                    VIDEO PLAYER
                ========================================= */}

                <div className="relative aspect-video overflow-hidden bg-[#24211F]">

                  <video
                    src={
                      recording.url
                    }
                    controls
                    preload="metadata"
                    className="h-full w-full object-contain"
                  >
                    Your browser does
                    not support video
                    playback.
                  </video>

                  <div className="pointer-events-none absolute left-4 top-4 rounded-full bg-[#CC3A63] px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.15em] text-white">
                    Recording
                  </div>

                </div>

                {/* =========================================
                    DETAILS
                ========================================= */}

                <div className="p-6">

                  <div className="flex items-start justify-between gap-4">

                    <div>

                      <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#A2AB73]">
                        Cohiva Meeting
                      </p>

                      <h2 className="mt-2 text-xl font-black text-[#3D3732]">
                        {
                          recording.callTitle
                        }
                      </h2>

                    </div>

                    {duration && (
                      <span className="shrink-0 rounded-full bg-[#403A35]/10 px-3 py-1.5 text-xs font-bold text-[#756E64]">
                        {duration}
                      </span>
                    )}

                  </div>

                  {/* DATE */}

                  <div className="mt-5 rounded-2xl bg-[#F9F0E0] p-4">

                    <p className="font-bold text-[#3D3732]">
                      {dateText}
                    </p>

                    {timeText && (
                      <p className="mt-1 text-sm font-bold text-[#CC3A63]">
                        {timeText}
                      </p>
                    )}

                  </div>

                  {/* =========================================
                      ACTION BUTTONS
                  ========================================= */}

                  <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">

                    {/* OPEN */}

                    <a
                      href={
                        recording.url
                      }
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center justify-center rounded-2xl bg-[#403A35] px-4 py-3.5 text-center text-sm font-bold text-[#FFF7EB] transition-all hover:-translate-y-0.5 hover:bg-[#302B27]"
                    >
                      Open
                    </a>

                    {/* DOWNLOAD */}

                    <button
                      type="button"
                      onClick={() =>
                        downloadRecording(
                          recording
                        )
                      }
                      disabled={
                        downloading
                      }
                      className="flex items-center justify-center gap-2 rounded-2xl bg-[#CC3A63] px-4 py-3.5 text-sm font-bold text-white transition-all hover:-translate-y-0.5 hover:bg-[#B83057] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <span>
                        ↓
                      </span>

                      {downloading
                        ? "Downloading..."
                        : "Download"}
                    </button>

                    {/* COPY */}

                    <button
                      type="button"
                      onClick={() =>
                        copyRecordingLink(
                          recording
                        )
                      }
                      className="rounded-2xl border border-[#403A35]/10 bg-[#F9F0E0] px-4 py-3.5 text-sm font-bold text-[#3D3732] transition hover:bg-[#F1E6D4]"
                    >
                      {copiedId ===
                      recording.id
                        ? "Copied ✓"
                        : "Copy Link"}
                    </button>

                  </div>

                  {/* CALL ID */}

                  <div className="mt-5 border-t border-[#403A35]/10 pt-4">

                    <p className="text-[10px] font-bold uppercase tracking-wider text-[#756E64]/60">
                      Meeting ID
                    </p>

                    <p className="mt-1 truncate font-mono text-[11px] text-[#756E64]">
                      {
                        recording.callId
                      }
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

export default Recordings;