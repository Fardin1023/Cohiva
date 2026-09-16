"use client";

import { useCallback, useRef, useState } from "react";
import { useSmartPolling } from "@/lib/useSmartPolling";
import { useOptionalCohivaRtc } from "@/components/rtc/CohivaRtcProvider";

type Props = { callId: string };
type JoinRequest = { userId: string; name: string; image: string; requestedAt: string };

const MeetingJoinRequests = ({ callId }: Props) => {
  const rtc = useOptionalCohivaRtc();
  const teacher = rtc?.selfRole === "host";
  const [accessMode, setAccessMode] = useState<"open" | "approval" | "locked">("approval");
  const [requests, setRequests] = useState<JoinRequest[]>([]);
  const [busyUserId, setBusyUserId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const previousIdsRef = useRef(new Set<string>());

  const loadRequests = useCallback(async () => {
    if (!teacher) return;
    try {
      const accessResponse = await fetch(`/api/meetings/access?callId=${encodeURIComponent(callId)}`, { cache: "no-store" });
      const accessResult = await accessResponse.json().catch(() => null);
      if (accessResponse.ok) setAccessMode(accessResult?.mode === "open" || accessResult?.mode === "locked" ? accessResult.mode : "approval");
      if (accessResult?.mode !== "approval") { setRequests([]); return; }

      const response = await fetch(`/api/meetings/join-request?callId=${encodeURIComponent(callId)}&scope=pending`, { cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Unable to load waiting room.");
      const nextRequests = Array.isArray(result.requests) ? result.requests : [];
      const previousIds = previousIdsRef.current;
      const newRequest = nextRequests.find((item: JoinRequest) => !previousIds.has(item.userId));
      previousIdsRef.current = new Set(nextRequests.map((item: JoinRequest) => item.userId));
      if (newRequest && typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted") {
        new Notification("Cohiva waiting room", { body: `${newRequest.name} wants to join your class.` });
      }
      setRequests(nextRequests);
      setError("");
    } catch (loadError) {
      console.error("Waiting room load error:", loadError);
    }
  }, [callId, teacher]);

  useSmartPolling(loadRequests, { enabled: Boolean(teacher), intervalMs: 1500 });

  const decide = async (targetUserId: string, action: "approve" | "deny") => {
    try {
      setBusyUserId(targetUserId); setError("");
      const response = await fetch("/api/meetings/join-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ callId, targetUserId, action }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Unable to update join request.");
      setRequests((current) => current.filter((item) => item.userId !== targetUserId));
    } catch (decisionError) {
      setError(decisionError instanceof Error ? decisionError.message : "Unable to update join request.");
    } finally { setBusyUserId(null); }
  };

  if (!teacher || accessMode !== "approval" || requests.length === 0) return null;

  return (
    <div className="fixed right-4 top-[76px] z-[350] w-[340px] max-w-[calc(100vw-32px)] rounded-[24px] border border-[#403A35]/10 bg-[#FFF7EB] p-4 text-[#3D3732] shadow-2xl">
      <div className="flex items-center justify-between"><div><p className="text-[9px] font-black uppercase tracking-[0.18em] text-[#CC3A63]">Waiting Room</p><h3 className="mt-1 font-black">People want to join</h3></div><span className="rounded-full bg-[#CC3A63] px-2.5 py-1 text-[10px] font-black text-white">{requests.length}</span></div>
      {error && <p className="mt-3 rounded-xl bg-[#CC3A63]/10 p-2 text-[10px] font-bold text-[#CC3A63]">{error}</p>}
      <div className="mt-3 space-y-2">
        {requests.map((request) => (
          <div key={request.userId} className="rounded-2xl bg-white p-3">
            <p className="font-black">{request.name}</p>
            <div className="mt-2 grid grid-cols-2 gap-2"><button type="button" disabled={busyUserId === request.userId} onClick={() => void decide(request.userId, "approve")} className="rounded-xl bg-[#A2AB73] px-3 py-2 text-xs font-black text-white">Approve</button><button type="button" disabled={busyUserId === request.userId} onClick={() => void decide(request.userId, "deny")} className="rounded-xl bg-[#403A35]/10 px-3 py-2 text-xs font-black">Deny</button></div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default MeetingJoinRequests;
