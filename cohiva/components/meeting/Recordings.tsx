"use client";

import { Download, Film, RefreshCw, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

type RecordingItem = {
  id: string;
  callId: string;
  title: string;
  mimeType: string;
  sizeBytes: number;
  durationMs: number;
  createdAt: string;
};

const formatDuration = (durationMs: number) => {
  const totalSeconds = Math.max(0, Math.round(durationMs / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
    : `${minutes}:${String(seconds).padStart(2, "0")}`;
};

const formatBytes = (bytes: number) => {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 MB";
  const mb = bytes / (1024 * 1024);
  return mb >= 1000
    ? `${(mb / 1024).toFixed(1)} GB`
    : `${mb.toFixed(mb >= 10 ? 0 : 1)} MB`;
};

const Recordings = () => {
  const [recordings, setRecordings] = useState<RecordingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      const response = await fetch("/api/recordings", { cache: "no-store" });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || "Cohiva could not load your recordings.");
      }
      setRecordings(Array.isArray(result.recordings) ? result.recordings : []);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Cohiva could not load your recordings."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const removeRecording = async (recording: RecordingItem) => {
    if (!window.confirm(`Delete the recording of “${recording.title}”?`)) return;

    try {
      setDeletingId(recording.id);
      setError("");
      const response = await fetch(
        `/api/recordings/${encodeURIComponent(recording.id)}`,
        { method: "DELETE" }
      );
      const result = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(result?.error || "Unable to delete the recording.");
      }
      setRecordings((current) =>
        current.filter((item) => item.id !== recording.id)
      );
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : "Unable to delete the recording."
      );
    } finally {
      setDeletingId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[450px] items-center justify-center">
        <div className="text-center">
          <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-[#CC3A63]/20 border-t-[#CC3A63]" />
          <p className="mt-4 font-semibold text-[#756E64]">Loading recordings...</p>
        </div>
      </div>
    );
  }

  return (
    <section className="w-full pb-10">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.22em] text-[#B9687C]">
            Host media
          </p>
          <h1 className="mt-2 text-3xl font-black tracking-tight text-[#3D3732] sm:text-4xl">
            Recordings
          </h1>
          <p className="mt-3 max-w-2xl text-[#756E64]">
            Only meetings that you hosted and recorded appear here. Participants cannot access the host recording library.
          </p>
        </div>

        <button
          type="button"
          onClick={() => void load()}
          className="inline-flex items-center gap-2 rounded-2xl bg-[#403A35] px-4 py-3 text-sm font-black text-white"
        >
          <RefreshCw size={16} /> Refresh
        </button>
      </div>

      {error && (
        <div className="mb-6 rounded-[24px] bg-[#CC3A63]/10 p-5 font-semibold text-[#CC3A63]">
          {error}
        </div>
      )}

      {!error && recordings.length === 0 && (
        <div className="rounded-[30px] border border-[#403A35]/10 bg-[#FFF7EB] p-12 text-center shadow-sm">
          <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-[#B9687C]/15 text-[#B9687C]">
            <Film size={34} />
          </div>
          <h2 className="mt-6 text-2xl font-black text-[#3D3732]">No host recordings yet</h2>
          <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-[#756E64]">
            When you host a meeting, use the recording button in the meeting controls. After you stop recording, the saved video will appear here.
          </p>
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-2">
        {recordings.map((recording) => {
          const createdAt = new Date(recording.createdAt);
          const videoUrl = `/api/recordings/${encodeURIComponent(recording.id)}`;
          const downloadUrl = `${videoUrl}?download=1`;

          return (
            <article
              key={recording.id}
              className="overflow-hidden rounded-[30px] border border-[#403A35]/10 bg-[#FFF7EB] shadow-sm"
            >
              <div className="aspect-video bg-[#181614]">
                <video
                  controls
                  preload="metadata"
                  src={videoUrl}
                  className="h-full w-full bg-black object-contain"
                />
              </div>

              <div className="p-6 sm:p-7">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <span className="inline-flex rounded-full bg-[#CC3A63]/10 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.16em] text-[#CC3A63]">
                      Host recording
                    </span>
                    <h2 className="mt-3 text-2xl font-black text-[#3D3732]">
                      {recording.title || "Cohiva Meeting"}
                    </h2>
                  </div>

                  <div className="rounded-2xl bg-[#F9F0E0] px-4 py-3 text-right">
                    <p className="text-xs font-black text-[#3D3732]">
                      {formatDuration(recording.durationMs)}
                    </p>
                    <p className="mt-1 text-[10px] font-bold text-[#756E64]">
                      {formatBytes(recording.sizeBytes)}
                    </p>
                  </div>
                </div>

                <p className="mt-4 text-sm font-bold text-[#756E64]">
                  {createdAt.toLocaleDateString([], {
                    weekday: "long",
                    month: "long",
                    day: "numeric",
                    year: "numeric",
                  })}{" "}
                  ·{" "}
                  {createdAt.toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </p>

                <div className="mt-6 grid grid-cols-2 gap-3">
                  <a
                    href={downloadUrl}
                    className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[#403A35] px-4 py-3.5 text-sm font-bold text-white"
                  >
                    <Download size={16} /> Download
                  </a>
                  <button
                    type="button"
                    disabled={deletingId === recording.id}
                    onClick={() => void removeRecording(recording)}
                    className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[#CC3A63]/10 px-4 py-3.5 text-sm font-bold text-[#CC3A63] disabled:opacity-50"
                  >
                    <Trash2 size={16} />
                    {deletingId === recording.id ? "Deleting..." : "Delete"}
                  </button>
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
};

export default Recordings;
