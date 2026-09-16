"use client";

import { useEffect, useState } from "react";
import { useOptionalCohivaRtc } from "@/components/rtc/CohivaRtcProvider";
import {
  COHIVA_DEFAULT_DURATION_MINUTES,
  COHIVA_DEFAULT_PARTICIPANTS,
  clampMeetingDurationMinutes,
  clampMeetingParticipants,
} from "@/lib/cohivaMeetingConfig";
import MeetingLimitFields from "./MeetingLimitFields";

type Props = { callId: string; compact?: boolean };

const MeetingLimitsSettings = ({ callId, compact = false }: Props) => {
  const rtc = useOptionalCohivaRtc();
  const [teacher, setTeacher] = useState(false);
  const [savedDuration, setSavedDuration] = useState(COHIVA_DEFAULT_DURATION_MINUTES);
  const [savedParticipants, setSavedParticipants] = useState(COHIVA_DEFAULT_PARTICIPANTS);
  const [durationMinutes, setDurationMinutes] = useState(COHIVA_DEFAULT_DURATION_MINUTES);
  const [maxParticipants, setMaxParticipants] = useState(COHIVA_DEFAULT_PARTICIPANTS);
  const [participantCount, setParticipantCount] = useState(0);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  const load = async () => {
    try {
      const response = await fetch(`/api/meetings/limits?callId=${encodeURIComponent(callId)}`, { cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Unable to load meeting limits.");
      const duration = clampMeetingDurationMinutes(result.durationMinutes);
      const participants = clampMeetingParticipants(result.maxParticipants);
      setTeacher(Boolean(result.teacher));
      setSavedDuration(duration);
      setSavedParticipants(participants);
      setDurationMinutes(duration);
      setMaxParticipants(participants);
      setParticipantCount(Number(result.participantCount || 0));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load meeting limits.");
    }
  };

  useEffect(() => { void load(); }, [callId]);

  if (!teacher && rtc?.selfRole !== "host") return null;
  const liveCount = rtc?.participants.length ?? participantCount;
  const changed = durationMinutes !== savedDuration || maxParticipants !== savedParticipants;

  const saveLimits = async () => {
    if (saving || !changed) return;
    try {
      setSaving(true); setSaved(false); setError("");
      const response = await fetch("/api/meetings/limits", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ callId, durationMinutes, maxParticipants }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Unable to update meeting limits.");
      await rtc?.updateLimits(result.durationMinutes, result.maxParticipants);
      setSavedDuration(result.durationMinutes);
      setSavedParticipants(result.maxParticipants);
      setSaved(true);
      window.setTimeout(() => setSaved(false), 1800);
    } catch (limitError) {
      setError(limitError instanceof Error ? limitError.message : "Unable to update meeting limits.");
    } finally { setSaving(false); }
  };

  return (
    <div className={`rounded-[24px] border border-[#403A35]/10 bg-[#F9F0E0] ${compact ? "p-3" : "p-4"}`}>
      <div className="flex items-start justify-between gap-3">
        <div><p className="text-[9px] font-black uppercase tracking-[0.18em] text-[#B9687C]">Meeting Limits</p><h3 className="mt-1 font-black text-[#3D3732]">Time & room capacity</h3><p className="mt-1 text-[10px] leading-4 text-[#756E64]">Cohiva RTC enforces these limits on your own server.</p></div>
        <div className="rounded-full bg-white px-3 py-1.5 text-[9px] font-black text-[#756E64]">👥 {liveCount}/{savedParticipants}</div>
      </div>
      <div className="mt-3"><MeetingLimitFields durationMinutes={durationMinutes} maxParticipants={maxParticipants} onDurationChange={setDurationMinutes} onParticipantsChange={setMaxParticipants} disabled={saving} compact /></div>
      {error && <div className="mt-3 rounded-xl bg-[#CC3A63]/10 p-3 text-[10px] font-bold text-[#CC3A63]">{error}</div>}
      <div className="mt-3 flex items-center justify-between gap-3"><p className="text-[9px] font-semibold text-[#756E64]">{saved ? "✓ Limits saved" : changed ? "Unsaved changes" : "Current meeting limits"}</p><button type="button" disabled={saving || !changed} onClick={() => void saveLimits()} className="rounded-xl bg-[#403A35] px-4 py-2 text-[10px] font-black text-white disabled:opacity-35">{saving ? "Saving..." : "Save limits"}</button></div>
    </div>
  );
};

export default MeetingLimitsSettings;
