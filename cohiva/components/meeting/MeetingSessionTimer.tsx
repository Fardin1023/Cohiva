"use client";

import { useCohivaRtc } from "@/components/rtc/CohivaRtcProvider";
import { useEffect, useRef, useState } from "react";

const formatRemaining = (totalSeconds: number) => {
  const safe = Math.max(0, totalSeconds);
  return `${Math.floor(safe / 60)}:${(safe % 60).toString().padStart(2, "0")}`;
};

const MeetingSessionTimer = () => {
  const { timerEndsAt } = useCohivaRtc();
  const [remainingSeconds, setRemainingSeconds] = useState<number | null>(null);
  const [notice, setNotice] = useState("");
  const previousRef = useRef<number | null>(null);
  const firedRef = useRef(new Set<number>());

  useEffect(() => {
    if (!timerEndsAt) {
      setRemainingSeconds(null);
      previousRef.current = null;
      firedRef.current.clear();
      return;
    }
    const endTime = new Date(timerEndsAt).getTime();
    const update = () => {
      const next = Math.max(0, Math.ceil((endTime - Date.now()) / 1000));
      const previous = previousRef.current;
      setRemainingSeconds(next);
      for (const threshold of [600, 300, 60]) {
        if (previous !== null && previous > threshold && next <= threshold && !firedRef.current.has(threshold)) {
          firedRef.current.add(threshold);
          setNotice(threshold === 60 ? "Class ends in 1 minute" : `Class ends in ${Math.round(threshold / 60)} minutes`);
          window.setTimeout(() => setNotice(""), 5000);
        }
      }
      previousRef.current = next;
    };
    update();
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [timerEndsAt]);

  if (remainingSeconds === null) return null;
  const urgent = remainingSeconds <= 60;
  const warning = remainingSeconds <= 300;

  return (
    <>
      <div className={`rounded-lg px-3 py-2 text-xs font-black tabular-nums ${urgent ? "bg-[#CC3A63] text-white" : warning ? "bg-[#FACC15] text-[#403A35]" : "bg-white/10 text-white"}`}>
        ⏱ {formatRemaining(remainingSeconds)}
      </div>
      {notice && <div className="fixed left-1/2 top-[78px] z-[420] -translate-x-1/2 rounded-[20px] bg-[#FFF7EB] p-4 text-sm font-black text-[#3D3732] shadow-xl">⏱ {notice}</div>}
    </>
  );
};

export default MeetingSessionTimer;
