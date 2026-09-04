"use client";

import {
  useEffect,
  useState,
} from "react";

type MeetingAttendancePanelProps = {
  open: boolean;
  onClose: () => void;
  callId: string;
};

type AttendanceRecord = {
  userId: string;
  name: string;
  image: string;
  firstJoinedAt: string;
  lastJoinedAt: string;
  lastLeftAt: string | null;
  totalSeconds: number;
  sessionCount: number;
  active: boolean;
};

const formatDuration =
  (
    seconds:
      number
  ) => {
    const minutes =
      Math.floor(
        seconds /
          60
      );

    const remainingSeconds =
      seconds %
      60;

    if (
      minutes >=
      60
    ) {
      const hours =
        Math.floor(
          minutes /
            60
        );

      const mins =
        minutes %
        60;

      return `${hours}h ${mins}m`;
    }

    return `${minutes}m ${remainingSeconds}s`;
  };

const MeetingAttendancePanel = ({
  open,
  onClose,
  callId,
}: MeetingAttendancePanelProps) => {
  const [
    records,
    setRecords,
  ] =
    useState<
      AttendanceRecord[]
    >(
      []
    );

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

  const loadAttendance =
    async () => {
      try {
        setLoading(true);
        setError("");

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

        setRecords(
          Array.isArray(
            result.records
          )
            ? result.records
            : []
        );
      } catch (error) {
        console.error(
          "Attendance panel error:",
          error
        );

        setError(
          "Unable to load attendance."
        );
      } finally {
        setLoading(false);
      }
    };

  useEffect(() => {
    if (!open) {
      return;
    }

    void loadAttendance();
  }, [
    open,
    callId,
  ]);

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[220] bg-black/45 backdrop-blur-sm">

      <button
        type="button"
        aria-label="Close attendance"
        onClick={onClose}
        className="absolute inset-0"
      />

      <aside className="absolute bottom-3 right-3 top-3 z-10 flex w-[calc(100%-24px)] max-w-[440px] flex-col overflow-hidden rounded-[28px] bg-[#FFF7EB] shadow-2xl">

        <div className="flex shrink-0 items-center justify-between border-b border-[#403A35]/10 px-5 py-4">

          <div>
            <p className="text-[9px] font-black uppercase tracking-[0.18em] text-[#CC3A63]">
              Teacher Report
            </p>

            <h2 className="mt-1 text-xl font-black text-[#3D3732]">
              Attendance
            </h2>

            <p className="mt-1 text-xs font-semibold text-[#756E64]">
              {records.length}
              {" "}
              recorded
            </p>
          </div>

          <div className="flex gap-2">

            <button
              type="button"
              onClick={() =>
                void loadAttendance()
              }
              className="rounded-xl bg-[#A2AB73]/15 px-3 py-2 text-xs font-black text-[#737C4C]"
            >
              ↻
            </button>

            <button
              type="button"
              onClick={onClose}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-[#403A35]/10 text-xl font-black text-[#403A35] hover:bg-[#CC3A63] hover:text-white"
            >
              ×
            </button>

          </div>

        </div>

        {error && (
          <div className="mx-4 mt-3 rounded-xl bg-[#CC3A63]/10 p-3 text-xs font-bold text-[#CC3A63]">
            {error}
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto p-3">

          {loading && (
            <p className="py-10 text-center text-sm font-bold text-[#756E64]">
              Loading attendance...
            </p>
          )}

          {!loading &&
            records.length ===
              0 && (
              <p className="py-10 text-center text-sm font-bold text-[#756E64]">
                No attendance yet.
              </p>
            )}

          <div className="space-y-2">

            {records.map(
              (
                record
              ) => (
                <div
                  key={
                    record.userId
                  }
                  className="rounded-[20px] border border-[#403A35]/10 bg-white p-4"
                >

                  <div className="flex items-center gap-3">

                    {record.image ? (
                      <img
                        src={
                          record.image
                        }
                        alt={
                          record.name
                        }
                        className="h-10 w-10 rounded-full object-cover"
                      />
                    ) : (
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#403A35] font-black text-white">
                        {record.name
                          .charAt(
                            0
                          )
                          .toUpperCase()}
                      </div>
                    )}

                    <div className="min-w-0 flex-1">

                      <div className="flex items-center gap-2">

                        <p className="truncate text-sm font-black text-[#3D3732]">
                          {record.name}
                        </p>

                        <span
                          className={`rounded-full px-2 py-0.5 text-[8px] font-black uppercase ${
                            record.active
                              ? "bg-[#A2AB73]/15 text-[#737C4C]"
                              : "bg-[#403A35]/10 text-[#756E64]"
                          }`}
                        >
                          {record.active
                            ? "Present"
                            : "Left"}
                        </span>

                      </div>

                      <p className="mt-1 text-[10px] text-[#756E64]">
                        Joined{" "}
                        {new Date(
                          record.firstJoinedAt
                        ).toLocaleTimeString(
                          [],
                          {
                            hour:
                              "2-digit",

                            minute:
                              "2-digit",
                          }
                        )}
                      </p>

                    </div>

                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-2">

                    <div className="rounded-xl bg-[#F9F0E0] p-2.5">
                      <p className="text-[9px] font-black uppercase text-[#756E64]">
                        Time
                      </p>

                      <p className="mt-1 text-xs font-black text-[#3D3732]">
                        {formatDuration(
                          record.totalSeconds
                        )}
                      </p>
                    </div>

                    <div className="rounded-xl bg-[#F9F0E0] p-2.5">
                      <p className="text-[9px] font-black uppercase text-[#756E64]">
                        Joins
                      </p>

                      <p className="mt-1 text-xs font-black text-[#3D3732]">
                        {record.sessionCount}
                      </p>
                    </div>

                  </div>

                </div>
              )
            )}

          </div>

        </div>

      </aside>

    </div>
  );
};

export default MeetingAttendancePanel;