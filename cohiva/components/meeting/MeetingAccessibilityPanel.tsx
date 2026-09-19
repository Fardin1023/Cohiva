"use client";

import { useEffect } from "react";
import type { AccessibilitySettings } from "./meetingAccessibilityTypes";

type Props = { open: boolean; onClose: () => void; settings: AccessibilitySettings; onChange: (settings: AccessibilitySettings) => void };

const MeetingAccessibilityPanel = ({ open, onClose, settings, onChange }: Props) => {
  const update = <K extends keyof AccessibilitySettings>(key: K, value: AccessibilitySettings[K]) => onChange({ ...settings, [key]: value });

  useEffect(() => {
    if (!open) return;
    const handler = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  if (!open) return null;

  const switchRow = (key: "highContrast" | "reduceMotion" | "hideReactions", title: string, description: string, icon: string) => (
    <button type="button" role="switch" aria-checked={settings[key]} onClick={() => update(key, !settings[key])} className="flex w-full items-center gap-3 rounded-[17px] border border-[#403A35]/10 bg-white p-3.5 text-left transition hover:bg-[#F9F0E0]">
      <div className="flex h-11 w-11 items-center justify-center rounded-[14px] bg-[#F9F0E0]">{icon}</div>
      <div className="min-w-0 flex-1"><p className="text-xs font-black text-[#3D3732]">{title}</p><p className="mt-1 text-[9px] leading-4 text-[#756E64]">{description}</p></div>
      <div className={`relative h-6 w-11 rounded-full ${settings[key] ? "bg-[#A2AB73]" : "bg-[#403A35]/15"}`}><div className={`absolute top-1 h-4 w-4 rounded-full bg-white transition-all ${settings[key] ? "left-6" : "left-1"}`} /></div>
    </button>
  );

  return (
    <div className="fixed inset-0 z-[300] flex justify-end bg-black/45 backdrop-blur-sm">
      <button type="button" onClick={onClose} className="absolute inset-0" aria-label="Close accessibility" />
      <aside className="relative z-10 h-full w-full max-w-[430px] overflow-y-auto bg-[#FFF7EB] p-5 text-[#3D3732] shadow-2xl">
        <div className="flex items-start justify-between"><div><p className="text-[9px] font-black uppercase tracking-[0.18em] text-[#A2AB73]">Accessibility</p><h2 className="mt-1 text-xl font-black">Meeting display</h2></div><button type="button" onClick={onClose} className="h-9 w-9 rounded-full bg-[#403A35]/10 font-black">×</button></div>
        <div className="mt-5 rounded-2xl bg-[#F9F0E0] p-4"><p className="text-xs font-black">Live captions</p><p className="mt-1 text-[10px] leading-4 text-[#756E64]">Live captions are not enabled in this version of Cohiva. The rest of the accessibility controls work normally.</p></div>
        <div className="mt-4 space-y-3">{switchRow("highContrast", "High contrast", "Increase visual separation inside the meeting interface.", "◐")}{switchRow("reduceMotion", "Reduce motion", "Reduce decorative meeting animations.", "↔")}{switchRow("hideReactions", "Hide reactions", "Do not show floating emoji reactions on your screen.", "😀")}</div>
      </aside>
    </div>
  );
};

export default MeetingAccessibilityPanel;
