"use client";

import { useEffect, useState } from "react";

export type MeetingAccessMode = "open" | "approval" | "locked";

type Props = { callId: string };

const options: Array<{ mode: MeetingAccessMode; icon: string; title: string; description: string }> = [
  { mode: "open", icon: "🌐", title: "Open", description: "Anyone signed in with the meeting link can enter immediately." },
  { mode: "approval", icon: "✋", title: "Ask to join", description: "People wait until the host approves them." },
  { mode: "locked", icon: "🔒", title: "Locked", description: "No new participants can enter until you change this setting." },
];

const MeetingAccessSettings = ({ callId }: Props) => {
  const [selectedMode, setSelectedMode] = useState<MeetingAccessMode>("approval");
  const [teacher, setTeacher] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const response = await fetch(`/api/meetings/access?callId=${encodeURIComponent(callId)}`, { cache: "no-store" });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Unable to load access settings.");
        if (!cancelled) {
          setTeacher(Boolean(result.teacher));
          setSelectedMode(result.mode === "open" || result.mode === "locked" ? result.mode : "approval");
        }
      } catch (loadError) {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : "Unable to load access settings.");
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [callId]);

  if (!teacher) return null;

  const changeMode = async (nextMode: MeetingAccessMode) => {
    if (saving || nextMode === selectedMode) return;
    const previous = selectedMode;
    setSelectedMode(nextMode);
    setSaving(true);
    setSaved(false);
    setError("");
    try {
      const response = await fetch("/api/meetings/access", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ callId, mode: nextMode }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Unable to change meeting access.");
      setSelectedMode(result.mode);
      setSaved(true);
      window.setTimeout(() => setSaved(false), 1500);
    } catch (updateError) {
      setSelectedMode(previous);
      setError(updateError instanceof Error ? updateError.message : "Unable to change meeting access.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="rounded-[20px] border border-[#403A35]/10 bg-white p-3 sm:p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[9px] font-black uppercase tracking-[0.18em] text-[#CC3A63]">Meeting Access</p>
          <h3 className="mt-1 text-sm font-black text-[#3D3732] sm:text-base">Who can enter?</h3>
          <p className="mt-1 text-[10px] leading-4 text-[#756E64]">Choose how people with the meeting link enter your classroom.</p>
        </div>
        {saving ? <span className="rounded-full bg-[#F9F0E0] px-3 py-1.5 text-[9px] font-black text-[#756E64]">Saving...</span> : saved ? <span className="rounded-full bg-[#A2AB73]/15 px-3 py-1.5 text-[9px] font-black text-[#737C4C]">✓ Saved</span> : null}
      </div>
      <div className="mt-3 grid gap-2">
        {options.map((option) => (
          <button key={option.mode} type="button" disabled={saving} onClick={() => void changeMode(option.mode)} className={`flex items-center gap-3 rounded-2xl border p-3 text-left transition ${selectedMode === option.mode ? "border-[#A2AB73] bg-[#A2AB73]/10" : "border-[#403A35]/10 bg-[#FFF7EB] hover:bg-[#F9F0E0]"}`}>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-lg">{option.icon}</div>
            <div className="min-w-0 flex-1"><p className="text-sm font-black text-[#3D3732]">{option.title}</p><p className="mt-0.5 text-[10px] leading-4 text-[#756E64]">{option.description}</p></div>
            {selectedMode === option.mode && <span className="font-black text-[#737C4C]">✓</span>}
          </button>
        ))}
      </div>
      {error && <p className="mt-3 rounded-xl bg-[#CC3A63]/10 p-3 text-[10px] font-bold text-[#CC3A63]">{error}</p>}
    </section>
  );
};

export default MeetingAccessSettings;
