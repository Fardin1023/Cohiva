"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

type MeetingItem = {
  id: string;
  title: string;
  description: string;
  startsAt: string | null;
  endedAt: string | null;
  updatedAt: string;
};

const PreviousMeetings = () => {
  const router = useRouter();
  const [meetings, setMeetings] = useState<MeetingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [clearing, setClearing] = useState(false);

  const load = useCallback(async () => {
    try {
      setLoading(true); setError("");
      const response = await fetch("/api/meetings/list?scope=previous", { cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Cohiva could not load your previous meetings.");
      setMeetings(Array.isArray(result.meetings) ? result.meetings : []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Cohiva could not load your previous meetings.");
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const copyLink = async (callId: string) => {
    try { await navigator.clipboard.writeText(`${window.location.origin}/meeting/${callId}`); setCopiedId(callId); window.setTimeout(() => setCopiedId(null), 1800); } catch {}
  };

  const clearPrevious = async () => {
    if (!meetings.length || !window.confirm(`Clear ${meetings.length} previous meeting${meetings.length === 1 ? "" : "s"} from your history?`)) return;
    try {
      setClearing(true); setError("");
      const response = await fetch("/api/meetings/delete", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ callIds: meetings.map((item) => item.id) }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Unable to clear previous meetings.");
      setMeetings([]);
    } catch (clearError) {
      setError(clearError instanceof Error ? clearError.message : "Unable to clear previous meetings.");
    } finally { setClearing(false); }
  };

  if (loading) return <div className="flex min-h-[450px] items-center justify-center"><div className="text-center"><div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-[#CC3A63]/20 border-t-[#CC3A63]" /><p className="mt-4 font-semibold text-[#756E64]">Loading previous meetings...</p></div></div>;

  return (
    <section className="w-full pb-10">
      <div className="mb-8 flex items-end justify-between gap-5"><div><p className="text-xs font-black uppercase tracking-[0.22em] text-[#B9687C]">Meeting History</p><h1 className="mt-2 text-3xl font-black tracking-tight text-[#3D3732] sm:text-4xl">Previous Meetings</h1><p className="mt-3 text-[#756E64]">Look back at your past Cohiva meetings.</p></div>{meetings.length > 0 && <button type="button" disabled={clearing} onClick={() => void clearPrevious()} className="rounded-2xl bg-[#CC3A63]/10 px-5 py-3 text-sm font-black text-[#CC3A63]">{clearing ? "Clearing..." : "Clear Previous"}</button>}</div>
      {error && <div className="mb-6 rounded-[24px] bg-[#CC3A63]/10 p-5 font-semibold text-[#CC3A63]">{error}</div>}
      {!error && meetings.length === 0 && <div className="rounded-[30px] border border-[#403A35]/10 bg-[#FFF7EB] p-12 text-center shadow-sm"><div className="text-4xl">↶</div><h2 className="mt-6 text-2xl font-black text-[#3D3732]">No previous meetings</h2><p className="mt-3 text-sm text-[#756E64]">Your Cohiva meeting history is currently empty.</p></div>}
      <div className="grid gap-5 lg:grid-cols-2">{meetings.map((meeting) => { const displayDate = new Date(meeting.endedAt || meeting.startsAt || meeting.updatedAt); return <article key={meeting.id} className="overflow-hidden rounded-[30px] border border-[#403A35]/10 bg-[#FFF7EB] shadow-sm"><div className="h-2 bg-[#403A35]" /><div className="p-6 sm:p-7"><span className="inline-flex rounded-full bg-[#403A35]/10 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.16em] text-[#403A35]">{meeting.endedAt ? "Ended" : "Past Meeting"}</span><h2 className="mt-4 text-2xl font-black text-[#3D3732]">{meeting.title || "Cohiva Meeting"}</h2>{meeting.description && <p className="mt-3 line-clamp-2 text-sm leading-6 text-[#756E64]">{meeting.description}</p>}<div className="mt-6 rounded-2xl bg-[#F9F0E0] p-5"><p className="text-sm font-black text-[#3D3732]">{displayDate.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric", year: "numeric" })}</p><p className="mt-1 text-lg font-black text-[#B9687C]">{displayDate.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</p></div><div className="mt-5 grid grid-cols-2 gap-3"><button type="button" onClick={() => router.push(`/meeting/${meeting.id}`)} className="rounded-2xl bg-[#403A35] px-4 py-3.5 text-sm font-bold text-white">Open Meeting</button><button type="button" onClick={() => void copyLink(meeting.id)} className="rounded-2xl bg-[#F9F0E0] px-4 py-3.5 text-sm font-bold text-[#3D3732]">{copiedId === meeting.id ? "Copied ✓" : "Copy Link"}</button></div></div></article>; })}</div>
    </section>
  );
};

export default PreviousMeetings;
