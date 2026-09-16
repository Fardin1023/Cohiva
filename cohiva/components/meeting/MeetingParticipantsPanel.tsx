"use client";

import { useMemo, useState } from "react";
import { useCohivaRtc } from "@/components/rtc/CohivaRtcProvider";
import type { CohivaPermissions } from "./MeetingPermissionsPanel";

type Props = { open: boolean; onClose: () => void; raisedHands: ReadonlySet<string>; classPermissions: CohivaPermissions };

const MeetingParticipantsPanel = ({ open, onClose, raisedHands, classPermissions }: Props) => {
  const rtc = useCohivaRtc();
  const teacher = rtc.selfRole === "host";
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");

  const participants = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return rtc.participants.filter((participant) => !needle || participant.name.toLowerCase().includes(needle));
  }, [rtc.participants, search]);

  if (!open) return null;

  const moderate = async (userId: string, control: "audio" | "video" | "screenshare" | "kick" | "block") => {
    try {
      setBusy(`${userId}:${control}`); setError("");
      await rtc.moderateParticipant(userId, control);
    } catch (moderationError) {
      setError(moderationError instanceof Error ? moderationError.message : "Unable to moderate this participant.");
    } finally { setBusy(null); }
  };

  return (
    <div className="fixed inset-0 z-[260] flex justify-end bg-black/40 backdrop-blur-sm">
      <button type="button" aria-label="Close participants" onClick={onClose} className="absolute inset-0" />
      <aside className="relative z-10 h-full w-full max-w-[430px] overflow-y-auto bg-[#FFF7EB] p-5 text-[#3D3732] shadow-2xl">
        <div className="flex items-start justify-between gap-3"><div><p className="text-[9px] font-black uppercase tracking-[0.18em] text-[#A2AB73]">Classroom</p><h2 className="mt-1 text-xl font-black">Participants ({rtc.participants.length})</h2></div><button type="button" onClick={onClose} className="h-9 w-9 rounded-full bg-[#403A35]/10 font-black">×</button></div>
        <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search participants" className="mt-4 w-full rounded-2xl border border-[#403A35]/10 bg-white px-4 py-3 text-sm outline-none" />
        {error && <p className="mt-3 rounded-xl bg-[#CC3A63]/10 p-3 text-xs font-bold text-[#CC3A63]">{error}</p>}
        {teacher && <div className="mt-4 grid grid-cols-3 gap-2"><button type="button" onClick={() => void rtc.muteOthers("audio")} className="rounded-xl bg-[#403A35] p-2 text-[10px] font-black text-white">Mute all</button><button type="button" onClick={() => void rtc.muteOthers("video")} className="rounded-xl bg-[#403A35] p-2 text-[10px] font-black text-white">Cameras off</button><button type="button" onClick={() => void rtc.muteOthers("screenshare")} className="rounded-xl bg-[#403A35] p-2 text-[10px] font-black text-white">Stop shares</button></div>}
        <div className="mt-4 space-y-3">
          {participants.map((participant) => {
            const state = rtc.mediaStateByUser[participant.userId] || { audio: false, video: false, screenShare: false };
            const isSelf = participant.userId === rtc.selfUserId;
            return (
              <div key={participant.userId} className="rounded-2xl border border-[#403A35]/10 bg-white p-4">
                <div className="flex items-center justify-between gap-3"><div className="min-w-0"><div className="flex items-center gap-2"><p className="truncate font-black">{participant.name}</p>{participant.isHost && <span className="rounded-full bg-[#A2AB73]/15 px-2 py-1 text-[8px] font-black text-[#737C4C]">HOST</span>}{raisedHands.has(participant.userId) && <span>✋</span>}</div><p className="mt-1 text-[10px] text-[#756E64]">{state.audio ? "🎙 on" : "🔇 off"} · {state.video ? "📷 on" : "📷 off"}{state.screenShare ? " · 🖥 sharing" : ""}</p></div></div>
                {teacher && !isSelf && !participant.isHost && <div className="mt-3 grid grid-cols-2 gap-2"><button type="button" disabled={busy !== null || !state.audio} onClick={() => void moderate(participant.userId, "audio")} className="rounded-xl bg-[#F9F0E0] p-2 text-[10px] font-black disabled:opacity-40">Mute mic</button><button type="button" disabled={busy !== null || !state.video} onClick={() => void moderate(participant.userId, "video")} className="rounded-xl bg-[#F9F0E0] p-2 text-[10px] font-black disabled:opacity-40">Camera off</button><button type="button" disabled={busy !== null || !state.screenShare} onClick={() => void moderate(participant.userId, "screenshare")} className="rounded-xl bg-[#F9F0E0] p-2 text-[10px] font-black disabled:opacity-40">Stop share</button><button type="button" disabled={busy !== null} onClick={() => void moderate(participant.userId, "kick")} className="rounded-xl bg-[#CC3A63]/10 p-2 text-[10px] font-black text-[#CC3A63]">Remove</button></div>}
              </div>
            );
          })}
        </div>
        <p className="mt-5 text-[9px] leading-4 text-[#756E64]">Class defaults: mic {classPermissions.studentMic ? "allowed" : "blocked"}, camera {classPermissions.studentCamera ? "allowed" : "blocked"}, sharing {classPermissions.studentScreenShare ? "allowed" : "blocked"}.</p>
      </aside>
    </div>
  );
};

export default MeetingParticipantsPanel;
