"use client";

import { CircleStop, Disc3, LoaderCircle } from "lucide-react";

import { useCohivaRtc } from "./CohivaRtcProvider";

const controlClass =
  "flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white shadow-sm transition focus:outline-none focus:ring-2 focus:ring-white/70 disabled:cursor-not-allowed disabled:opacity-45";

export default function CohivaRecordingControl() {
  const {
    selfRole,
    status,
    recordingActive,
    recordingSaving,
    recordingError,
    startRecording,
    stopRecording,
  } = useCohivaRtc();

  if (selfRole !== "host") return null;

  const ready = status === "joined";

  const toggle = async () => {
    try {
      if (recordingActive) {
        await stopRecording();
      } else {
        await startRecording();
      }
    } catch (error) {
      console.error("Cohiva recording control error:", error);
    }
  };

  const label = recordingSaving
    ? "Saving recording"
    : recordingActive
      ? "Stop recording"
      : "Start recording";

  return (
    <button
      type="button"
      onClick={() => void toggle()}
      disabled={!ready || recordingSaving}
      aria-label={label}
      title={recordingError || label}
      className={`${controlClass} ${
        recordingActive
          ? "bg-[#CC3A63] hover:bg-[#B72E55]"
          : "bg-[#4A4540] hover:bg-[#5A544E]"
      }`}
    >
      {recordingSaving ? (
        <LoaderCircle size={18} className="animate-spin" />
      ) : recordingActive ? (
        <CircleStop size={18} />
      ) : (
        <Disc3 size={18} />
      )}
    </button>
  );
}
