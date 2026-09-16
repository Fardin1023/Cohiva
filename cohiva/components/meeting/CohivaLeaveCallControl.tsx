"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useCohivaRtc } from "@/components/rtc/CohivaRtcProvider";

const CohivaLeaveCallControl = () => {
  const rtc = useCohivaRtc();
  const router = useRouter();
  const teacher = rtc.selfRole === "host";
  const [modalOpen, setModalOpen] = useState(false);
  const [action, setAction] = useState<"leave" | "end" | null>(null);
  const [error, setError] = useState("");
  const busy = action !== null;

  const leaveRoom = async () => {
    try {
      setAction("leave");
      setError("");
      await rtc.disconnect();
      router.replace("/");
    } catch (leaveError) {
      setError(leaveError instanceof Error ? leaveError.message : "Unable to leave the meeting.");
      setAction(null);
    }
  };

  const endForEveryone = async () => {
    try {
      setAction("end");
      setError("");
      if (rtc.recordingActive || rtc.recordingSaving) {
        await rtc.stopRecording();
      }
      const response = await fetch("/api/meetings/end", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ callId: rtc.callId }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(result?.error || "Unable to end the meeting.");
      await rtc.disconnect();
      router.replace("/");
    } catch (endError) {
      setError(endError instanceof Error ? endError.message : "Unable to end the meeting.");
      setAction(null);
    }
  };

  const handleMainButton = async () => {
    if (teacher) {
      setModalOpen(true);
      return;
    }
    await leaveRoom();
  };

  return (
    <>
      <button
        type="button"
        aria-label={teacher ? "Leave or end meeting" : "Leave meeting"}
        title={teacher ? "Leave or end meeting" : "Leave meeting"}
        disabled={busy}
        onClick={() => void handleMainButton()}
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#E34848] text-lg text-white shadow-sm transition hover:bg-[#C93434] focus:outline-none focus:ring-2 focus:ring-white/70 disabled:cursor-wait disabled:opacity-60"
      >
        <span aria-hidden="true" className="rotate-[135deg] text-[17px] leading-none">☎</span>
      </button>

      {teacher && modalOpen && (
        <div
          className="fixed inset-0 z-[700] flex items-center justify-center bg-black/55 px-4 backdrop-blur-[2px]"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !busy) {
              setModalOpen(false);
              setError("");
            }
          }}
        >
          <section className="w-full max-w-[430px] overflow-hidden rounded-[28px] border border-[#403A35]/10 bg-[#FFF7EB] text-[#3D3732] shadow-[0_28px_100px_rgba(0,0,0,0.45)]">
            <header className="border-b border-[#403A35]/10 px-6 pb-5 pt-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-[9px] font-black uppercase tracking-[0.18em] text-[#CC3A63]">Cohiva Meeting</p>
                  <h2 className="mt-1 text-xl font-black">Leave this meeting?</h2>
                  <p className="mt-2 text-sm leading-5 text-[#756E64]">You are the host. Leave only yourself, or end the room for everyone.</p>
                </div>
                <button type="button" disabled={busy} onClick={() => setModalOpen(false)} className="flex h-9 w-9 items-center justify-center rounded-full bg-[#F9F0E0] font-black">×</button>
              </div>
            </header>
            <div className="space-y-3 p-5 sm:p-6">
              {error && <div className="rounded-2xl bg-[#CC3A63]/10 px-4 py-3 text-xs font-bold text-[#CC3A63]">{error}</div>}
              <button type="button" disabled={busy} onClick={() => void endForEveryone()} className="w-full rounded-[20px] bg-[#CC3A63] p-4 text-left font-black text-white disabled:opacity-60">
                {action === "end" ? "Ending meeting..." : "⏹ End the call for everyone"}
              </button>
              <button type="button" disabled={busy} onClick={() => void leaveRoom()} className="w-full rounded-[20px] border border-[#403A35]/10 bg-white p-4 text-left font-black disabled:opacity-60">
                {action === "leave" ? "Leaving room..." : "🚪 Leave the room"}
              </button>
              <button type="button" disabled={busy} onClick={() => setModalOpen(false)} className="w-full rounded-[16px] px-4 py-3 text-xs font-black text-[#756E64]">Cancel</button>
            </div>
          </section>
        </div>
      )}
    </>
  );
};

export default CohivaLeaveCallControl;
