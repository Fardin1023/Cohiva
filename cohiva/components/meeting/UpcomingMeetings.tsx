"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type MeetingItem = {
  id: string;
  title: string;
  description: string;
  startsAt: string | null;
};

const UpcomingMeetings = () => {
  const router = useRouter();
  const [meetings, setMeetings] = useState<MeetingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        setLoading(true); setError("");
        const response = await fetch("/api/meetings/list?scope=upcoming", { cache: "no-store" });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Cohiva could not load your upcoming meetings.");
        if (!cancelled) setMeetings(Array.isArray(result.meetings) ? result.meetings : []);
      } catch (loadError) {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : "Cohiva could not load your upcoming meetings.");
      } finally { if (!cancelled) setLoading(false); }
    };
    void load();
    return () => { cancelled = true; };
  }, []);

  const copyLink = async (callId: string) => {
    try { await navigator.clipboard.writeText(`${window.location.origin}/meeting/${callId}`); setCopiedId(callId); window.setTimeout(() => setCopiedId(null), 1800); } catch {}
  };

  if (loading) return <div className="flex min-h-[450px] items-center justify-center"><div className="text-center"><div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-[#CC3A63]/20 border-t-[#CC3A63]" /><p className="mt-4 font-semibold text-[#756E64]">Loading meetings...</p></div></div>;

  return (
    <section className="w-full pb-10">
      <div className="mb-8"><p className="text-xs font-black uppercase tracking-[0.22em] text-[#A2AB73]">Your schedule</p><h1 className="mt-2 text-3xl font-black tracking-tight text-[#3D3732] sm:text-4xl">Upcoming Meetings</h1><p className="mt-3 text-[#756E64]">All your scheduled Cohiva meetings in one place.</p></div>
      {error && <div className="rounded-[24px] bg-[#CC3A63]/10 p-5 font-semibold text-[#CC3A63]">{error}</div>}
      {!error && meetings.length === 0 && <div className="rounded-[30px] border border-[#403A35]/10 bg-[#FFF7EB] p-12 text-center shadow-sm"><div className="text-4xl">◫</div><h2 className="mt-6 text-2xl font-black text-[#3D3732]">Nothing scheduled yet</h2><p className="mx-auto mt-3 max-w-md text-sm leading-6 text-[#756E64]">Schedule a meeting from the dashboard and it will appear here.</p><button type="button" onClick={() => router.push("/")} className="mt-7 rounded-2xl bg-[#CC3A63] px-6 py-3 font-bold text-white">Back to Dashboard</button></div>}
      <div className="grid gap-5 lg:grid-cols-2">
        {meetings.map((meeting) => {
          const startsAt = meeting.startsAt ? new Date(meeting.startsAt) : null;
          return <article key={meeting.id} className="overflow-hidden rounded-[30px] border border-[#403A35]/10 bg-[#FFF7EB] shadow-sm"><div className="h-2 bg-[#B9687C]" /><div className="p-6 sm:p-7"><span className="inline-flex rounded-full bg-[#A2AB73]/15 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.16em] text-[#737C4C]">Scheduled</span><h2 className="mt-4 text-2xl font-black text-[#3D3732]">{meeting.title || "Cohiva Meeting"}</h2>{meeting.description && <p className="mt-3 line-clamp-2 text-sm leading-6 text-[#756E64]">{meeting.description}</p>}<div className="mt-6 rounded-2xl bg-[#F9F0E0] p-5"><p className="text-sm font-black text-[#3D3732]">{startsAt ? startsAt.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric", year: "numeric" }) : "Date not set"}</p><p className="mt-1 text-lg font-black text-[#CC3A63]">{startsAt ? startsAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : ""}</p></div><div className="mt-5 grid grid-cols-2 gap-3"><button type="button" onClick={() => router.push(`/meeting/${meeting.id}`)} className="rounded-2xl bg-[#CC3A63] px-4 py-3.5 text-sm font-bold text-white">Open Meeting</button><button type="button" onClick={() => void copyLink(meeting.id)} className="rounded-2xl bg-[#F9F0E0] px-4 py-3.5 text-sm font-bold text-[#3D3732]">{copiedId === meeting.id ? "Copied ✓" : "Copy Link"}</button></div></div></article>;
        })}
      </div>
    </section>
  );
};

export default UpcomingMeetings;
