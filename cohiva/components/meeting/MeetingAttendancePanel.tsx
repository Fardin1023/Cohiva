"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

type MeetingAttendancePanelProps = {
  open: boolean;

  onClose: () => void;

  callId: string;
};

type AttendanceRow = {
  userId: string;

  name: string;

  image: string;

  firstJoinedAt: string;

  lastJoinedAt: string;

  lastLeftAt:
    | string
    | null;

  totalSeconds: number;

  joinCount: number;

  isPresent: boolean;
};

const formatDuration = (
  seconds: number
) => {
  const safe =
    Math.max(
      0,
      Math.floor(
        seconds
      )
    );

  const hours =
    Math.floor(
      safe / 3600
    );

  const minutes =
    Math.floor(
      (
        safe % 3600
      ) / 60
    );

  const secs =
    safe % 60;

  if (
    hours > 0
  ) {
    return `${hours}h ${minutes}m ${secs}s`;
  }

  if (
    minutes > 0
  ) {
    return `${minutes}m ${secs}s`;
  }

  return `${secs}s`;
};

const formatTime = (
  value:
    string |
    null |
    undefined
) => {
  if (!value) {
    return "—";
  }

  return new Intl
    .DateTimeFormat(
      undefined,
      {
        hour:
          "2-digit",

        minute:
          "2-digit",

        second:
          "2-digit",
      }
    )
    .format(
      new Date(
        value
      )
    );
};

const MeetingAttendancePanel = ({
  open,
  onClose,
  callId,
}: MeetingAttendancePanelProps) => {
  const [
    attendance,
    setAttendance,
  ] =
    useState<
      AttendanceRow[]
    >([]);

  const [
    loading,
    setLoading,
  ] =
    useState(false);

  const [
    error,
    setError,
  ] =
    useState("");

  const [
    search,
    setSearch,
  ] =
    useState("");

  /* =====================================================
     LOAD
  ===================================================== */

  const loadAttendance =
    useCallback(
      async (
        silent =
          false
      ) => {
        try {
          if (
            !silent
          ) {
            setLoading(
              true
            );
          }

          const response =
            await fetch(
              `/api/meetings/attendance?callId=${encodeURIComponent(
                callId
              )}`,
              {
                cache:
                  "no-store",
              }
            );

          const result =
            await response.json();

          if (
            !response.ok
          ) {
            throw new Error(
              result.error ||
                "Unable to load attendance."
            );
          }

          setAttendance(
            Array.isArray(
              result.attendance
            )
              ? result.attendance
              : []
          );

          setError("");
        } catch (
          loadError
        ) {
          console.error(
            "Attendance panel error:",
            loadError
          );

          if (
            !silent
          ) {
            setError(
              loadError instanceof
                Error
                ? loadError.message
                : "Unable to load attendance."
            );
          }
        } finally {
          if (
            !silent
          ) {
            setLoading(
              false
            );
          }
        }
      },
      [
        callId,
      ]
    );

  /* =====================================================
     AUTO REFRESH WHILE OPEN
  ===================================================== */

  useEffect(() => {
    if (!open) {
      return;
    }

    void loadAttendance();

    const timer =
      window.setInterval(
        () => {
          void loadAttendance(
            true
          );
        },
        5000
      );

    return () => {
      window.clearInterval(
        timer
      );
    };
  }, [
    open,
    loadAttendance,
  ]);

  /* =====================================================
     FILTER
  ===================================================== */

  const filtered =
    useMemo(
      () => {
        const query =
          search
            .trim()
            .toLowerCase();

        if (!query) {
          return attendance;
        }

        return attendance.filter(
          (
            row
          ) =>
            row.name
              .toLowerCase()
              .includes(
                query
              )
        );
      },
      [
        attendance,
        search,
      ]
    );

  const presentCount =
    attendance.filter(
      (
        row
      ) =>
        row.isPresent
    ).length;

  /* =====================================================
     EXPORT CSV
  ===================================================== */

  const exportCsv =
    () => {
      const rows = [
        [
          "Name",
          "Status",
          "First joined",
          "Last joined",
          "Last left",
          "Join count",
          "Total duration",
        ],

        ...attendance.map(
          (
            row
          ) => [
            row.name,

            row.isPresent
              ? "Present"
              : "Left",

            new Date(
              row.firstJoinedAt
            ).toLocaleString(),

            new Date(
              row.lastJoinedAt
            ).toLocaleString(),

            row.lastLeftAt
              ? new Date(
                  row.lastLeftAt
                ).toLocaleString()
              : "",

            String(
              row.joinCount
            ),

            formatDuration(
              row.totalSeconds
            ),
          ]
        ),
      ];

      const csv =
        rows
          .map(
            (
              row
            ) =>
              row
                .map(
                  (
                    cell
                  ) =>
                    `"${String(
                      cell
                    ).replaceAll(
                      '"',
                      '""'
                    )}"`
                )
                .join(",")
          )
          .join("\n");

      const blob =
        new Blob(
          [
            "\uFEFF",
            csv,
          ],
          {
            type:
              "text/csv;charset=utf-8",
          }
        );

      const url =
        URL.createObjectURL(
          blob
        );

      const anchor =
        document.createElement(
          "a"
        );

      anchor.href =
        url;

      anchor.download =
        `cohiva-attendance-${callId}.csv`;

      document.body.appendChild(
        anchor
      );

      anchor.click();

      anchor.remove();

      URL.revokeObjectURL(
        url
      );
    };

  if (!open) {
    return null;
  }

  return (
    <aside className="fixed bottom-[76px] right-0 top-[64px] z-[250] flex w-full flex-col overflow-hidden border-l border-[#403A35]/10 bg-[#FFF7EB] text-[#3D3732] shadow-[-18px_0_55px_rgba(0,0,0,0.2)] sm:w-[460px]">

      {/* HEADER */}

      <header className="shrink-0 border-b border-[#403A35]/10 bg-white p-4">

        <div className="flex items-start justify-between">

          <div>

            <p className="text-[9px] font-black uppercase tracking-[0.18em] text-[#CC3A63]">
              Cohiva Classroom
            </p>

            <h2 className="mt-1 text-lg font-black">
              Attendance
            </h2>

            <div className="mt-2 flex gap-2">

              <span className="rounded-full bg-[#A2AB73]/15 px-2.5 py-1 text-[9px] font-black text-[#737C4C]">
                ● {presentCount} present
              </span>

              <span className="rounded-full bg-[#403A35]/8 px-2.5 py-1 text-[9px] font-black text-[#756E64]">
                {attendance.length} total
              </span>

            </div>

          </div>

          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#F9F0E0] text-lg font-black"
          >
            ×
          </button>

        </div>

        <div className="mt-4 flex gap-2">

          <input
            value={search}
            onChange={(
              event
            ) =>
              setSearch(
                event.target.value
              )
            }
            placeholder="Search students..."
            className="h-10 min-w-0 flex-1 rounded-xl border border-[#403A35]/10 bg-[#FFF7EB] px-3 text-xs font-semibold outline-none"
          />

          <button
            type="button"
            onClick={exportCsv}
            disabled={
              attendance.length ===
              0
            }
            className="rounded-xl bg-[#A2AB73] px-3 text-[10px] font-black text-white disabled:opacity-40"
          >
            ↓ CSV
          </button>

        </div>

      </header>

      {/* ERROR */}

      {error && (
        <div className="bg-[#CC3A63]/10 px-4 py-2.5 text-xs font-bold text-[#CC3A63]">
          {error}
        </div>
      )}

      {/* CONTENT */}

      <div className="min-h-0 flex-1 overflow-y-auto p-3">

        {loading &&
          attendance.length ===
            0 && (
            <div className="flex h-full items-center justify-center">

              <p className="text-xs font-bold text-[#756E64]">
                Loading attendance...
              </p>

            </div>
          )}

        {!loading &&
          filtered.length ===
            0 && (
            <div className="flex h-full items-center justify-center text-center">

              <div>

                <div className="text-4xl">
                  📋
                </div>

                <p className="mt-3 font-black">
                  No attendance yet
                </p>

              </div>

            </div>
          )}

        <div className="space-y-2.5">

          {filtered.map(
            (
              row
            ) => (
              <article
                key={
                  row.userId
                }
                className="rounded-[18px] border border-[#403A35]/8 bg-white p-3"
              >

                <div className="flex items-center gap-3">

                  {row.image ? (
                    <img
                      src={
                        row.image
                      }
                      alt=""
                      className="h-10 w-10 rounded-full object-cover"
                    />
                  ) : (
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#403A35] text-xs font-black text-white">
                      {row.name
                        .charAt(
                          0
                        )
                        .toUpperCase()}
                    </div>
                  )}

                  <div className="min-w-0 flex-1">

                    <p className="truncate text-sm font-black">
                      {row.name}
                    </p>

                    <span
                      className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-[8px] font-black ${
                        row.isPresent
                          ? "bg-[#A2AB73]/15 text-[#737C4C]"
                          : "bg-[#403A35]/8 text-[#756E64]"
                      }`}
                    >
                      {row.isPresent
                        ? "● Present"
                        : "Left"}
                    </span>

                  </div>

                  <div className="text-right">

                    <p className="text-[8px] font-black uppercase text-[#756E64]/65">
                      Duration
                    </p>

                    <p className="mt-1 text-xs font-black text-[#CC3A63]">
                      {formatDuration(
                        row.totalSeconds
                      )}
                    </p>

                  </div>

                </div>

                <div className="mt-3 grid grid-cols-3 gap-2 rounded-xl bg-[#F9F0E0] p-2.5">

                  <div>

                    <p className="text-[7px] font-black uppercase text-[#756E64]/60">
                      First joined
                    </p>

                    <p className="mt-1 text-[9px] font-bold">
                      {formatTime(
                        row.firstJoinedAt
                      )}
                    </p>

                  </div>

                  <div>

                    <p className="text-[7px] font-black uppercase text-[#756E64]/60">
                      Last joined
                    </p>

                    <p className="mt-1 text-[9px] font-bold">
                      {formatTime(
                        row.lastJoinedAt
                      )}
                    </p>

                  </div>

                  <div>

                    <p className="text-[7px] font-black uppercase text-[#756E64]/60">
                      Joins
                    </p>

                    <p className="mt-1 text-[9px] font-bold">
                      {row.joinCount}
                    </p>

                  </div>

                </div>

              </article>
            )
          )}

        </div>

      </div>

      <footer className="shrink-0 border-t border-[#403A35]/10 bg-white p-3">

        <button
          type="button"
          onClick={() =>
            void loadAttendance()
          }
          className="w-full rounded-xl bg-[#F9F0E0] py-2.5 text-[10px] font-black text-[#3D3732]"
        >
          ↻ Refresh attendance
        </button>

      </footer>

    </aside>
  );
};

export default MeetingAttendancePanel;