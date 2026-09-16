"use client";

import { useSmartPolling } from "@/lib/useSmartPolling";
import { useCallback, useEffect, useMemo, useState } from "react";

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
  lastLeftAt: string | null;
  totalSeconds: number;
  joinCount: number;
  isPresent: boolean;
};

const formatDuration = (seconds: number) => {
  const safe = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const secs = safe % 60;

  if (hours > 0) return `${hours}h ${minutes}m ${secs}s`;
  if (minutes > 0) return `${minutes}m ${secs}s`;
  return `${secs}s`;
};

const formatTime = (value: string | null | undefined) => {
  if (!value) return "—";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "—";

  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(date);
};

const MeetingAttendancePanel = ({
  open,
  onClose,
  callId,
}: MeetingAttendancePanelProps) => {
  const [attendance, setAttendance] = useState<AttendanceRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [snapshotAt, setSnapshotAt] = useState(() => Date.now());
  const [clock, setClock] = useState(() => Date.now());

  const loadAttendance = useCallback(
    async (silent = false) => {
      try {
        if (!silent) setLoading(true);

        const response = await fetch(
          `/api/meetings/attendance?callId=${encodeURIComponent(callId)}`,
          { cache: "no-store" }
        );
        const result = await response.json();

        if (!response.ok) {
          throw new Error(result.error || "Unable to load attendance.");
        }

        setAttendance(Array.isArray(result.attendance) ? result.attendance : []);
        const now = Date.now();
        setSnapshotAt(now);
        setClock(now);
        setError("");
      } catch (loadError) {
        console.error("Attendance panel error:", loadError);
        if (!silent) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Unable to load attendance."
          );
        }
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [callId]
  );

  useSmartPolling(loadAttendance, {
    enabled: open,
    intervalMs: 10_000,
  });

  useEffect(() => {
    if (!open) return;
    const timer = window.setInterval(() => setClock(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [open]);

  const displaySeconds = useCallback(
    (row: AttendanceRow) => {
      if (!row.isPresent) return Math.max(0, Number(row.totalSeconds || 0));
      return (
        Math.max(0, Number(row.totalSeconds || 0)) +
        Math.max(0, Math.floor((clock - snapshotAt) / 1000))
      );
    },
    [clock, snapshotAt]
  );

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return attendance;
    return attendance.filter((row) => row.name.toLowerCase().includes(query));
  }, [attendance, search]);

  const presentCount = attendance.filter((row) => row.isPresent).length;
  const totalDuration = attendance.reduce(
    (sum, row) => sum + displaySeconds(row),
    0
  );
  const averageDuration = attendance.length
    ? Math.floor(totalDuration / attendance.length)
    : 0;

  const exportCsv = async () => {
    try {
      setExporting(true);
      setError("");

      const response = await fetch(
        `/api/meetings/attendance/export?callId=${encodeURIComponent(callId)}`,
        { cache: "no-store" }
      );

      if (!response.ok) {
        const result = await response.json().catch(() => null);
        throw new Error(result?.error || "Unable to export attendance.");
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      const disposition = response.headers.get("content-disposition") || "";
      const filenameMatch = disposition.match(/filename="([^"]+)"/i);

      anchor.href = url;
      anchor.download = filenameMatch?.[1] || `cohiva-attendance-${callId}.csv`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch (exportError) {
      setError(
        exportError instanceof Error
          ? exportError.message
          : "Unable to export attendance."
      );
    } finally {
      setExporting(false);
    }
  };

  if (!open) return null;

  return (
    <aside className="fixed bottom-[76px] right-0 top-[64px] z-[250] flex w-full flex-col overflow-hidden border-l border-[#403A35]/10 bg-[#FFF7EB] text-[#3D3732] shadow-[-18px_0_55px_rgba(0,0,0,0.2)] sm:w-[480px]">
      <header className="shrink-0 border-b border-[#403A35]/10 bg-white p-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[9px] font-black uppercase tracking-[0.18em] text-[#CC3A63]">
              Cohiva Classroom
            </p>
            <h2 className="mt-1 text-lg font-black">Attendance</h2>
            <div className="mt-2 flex flex-wrap gap-2">
              <span className="rounded-full bg-[#A2AB73]/15 px-2.5 py-1 text-[9px] font-black text-[#737C4C]">
                ● {presentCount} present
              </span>
              <span className="rounded-full bg-[#403A35]/8 px-2.5 py-1 text-[9px] font-black text-[#756E64]">
                {attendance.length} total
              </span>
              <span className="rounded-full bg-[#CC3A63]/10 px-2.5 py-1 text-[9px] font-black text-[#CC3A63]">
                Avg {formatDuration(averageDuration)}
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close attendance"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#F9F0E0] text-lg font-black"
          >
            ×
          </button>
        </div>

        <div className="mt-4 flex gap-2">
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search students..."
            className="h-10 min-w-0 flex-1 rounded-xl border border-[#403A35]/10 bg-[#FFF7EB] px-3 text-xs font-semibold outline-none focus:border-[#A2AB73]"
          />
          <button
            type="button"
            onClick={() => void exportCsv()}
            disabled={attendance.length === 0 || exporting}
            className="rounded-xl bg-[#A2AB73] px-3 text-[10px] font-black text-white disabled:cursor-not-allowed disabled:opacity-40"
          >
            {exporting ? "Saving..." : "↓ CSV"}
          </button>
        </div>
      </header>

      {error && (
        <div className="bg-[#CC3A63]/10 px-4 py-2.5 text-xs font-bold text-[#CC3A63]">
          {error}
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {loading && attendance.length === 0 && (
          <div className="flex h-full items-center justify-center">
            <p className="text-xs font-bold text-[#756E64]">Loading attendance...</p>
          </div>
        )}

        {!loading && filtered.length === 0 && (
          <div className="flex h-full items-center justify-center text-center">
            <div>
              <div className="text-4xl">📋</div>
              <p className="mt-3 font-black">
                {attendance.length === 0 ? "No attendance yet" : "No matching student"}
              </p>
            </div>
          </div>
        )}

        <div className="space-y-2.5">
          {filtered.map((row) => {
            const duration = displaySeconds(row);

            return (
              <article
                key={row.userId || `${row.name}-${row.firstJoinedAt}`}
                className="rounded-2xl border border-[#403A35]/10 bg-white p-3 shadow-sm"
              >
                <div className="flex items-center gap-3">
                  {row.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={row.image}
                      alt=""
                      className="h-10 w-10 rounded-full object-cover"
                    />
                  ) : (
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#403A35] text-xs font-black text-white">
                      {row.name.charAt(0).toUpperCase()}
                    </div>
                  )}

                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-black">{row.name}</p>
                    <span
                      className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-[8px] font-black ${
                        row.isPresent
                          ? "bg-[#A2AB73]/15 text-[#737C4C]"
                          : "bg-[#403A35]/8 text-[#756E64]"
                      }`}
                    >
                      {row.isPresent ? "● Present" : "Left"}
                    </span>
                  </div>

                  <div className="text-right">
                    <p className="text-[8px] font-black uppercase text-[#756E64]/65">
                      Total time
                    </p>
                    <p className="mt-1 text-xs font-black text-[#CC3A63]">
                      {formatDuration(duration)}
                    </p>
                  </div>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-2 rounded-xl bg-[#F9F0E0] p-2.5 sm:grid-cols-4">
                  <div>
                    <p className="text-[7px] font-black uppercase text-[#756E64]/60">
                      First joined
                    </p>
                    <p className="mt-1 text-[9px] font-bold">
                      {formatTime(row.firstJoinedAt)}
                    </p>
                  </div>

                  <div>
                    <p className="text-[7px] font-black uppercase text-[#756E64]/60">
                      Last joined
                    </p>
                    <p className="mt-1 text-[9px] font-bold">
                      {formatTime(row.lastJoinedAt)}
                    </p>
                  </div>

                  <div>
                    <p className="text-[7px] font-black uppercase text-[#756E64]/60">
                      Last left
                    </p>
                    <p className="mt-1 text-[9px] font-bold">
                      {row.isPresent ? "Still here" : formatTime(row.lastLeftAt)}
                    </p>
                  </div>

                  <div>
                    <p className="text-[7px] font-black uppercase text-[#756E64]/60">
                      Joins
                    </p>
                    <p className="mt-1 text-[9px] font-bold">{row.joinCount}</p>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </div>

      <footer className="shrink-0 border-t border-[#403A35]/10 bg-white p-3">
        <button
          type="button"
          onClick={() => void loadAttendance()}
          disabled={loading}
          className="w-full rounded-xl bg-[#F9F0E0] py-2.5 text-[10px] font-black text-[#3D3732] disabled:opacity-50"
        >
          {loading ? "Refreshing..." : "↻ Refresh attendance"}
        </button>
      </footer>
    </aside>
  );
};

export default MeetingAttendancePanel;
