"use client";

import { useCohivaRtc } from "@/components/rtc/CohivaRtcProvider";

const MeetingConnectionStatus = () => {
  const rtc = useCohivaRtc();
  if (rtc.status === "joined" || rtc.status === "idle") return null;

  const message =
    rtc.status === "connecting"
      ? "Connecting to Cohiva RTC…"
      : rtc.status === "reconnecting"
        ? "Connection interrupted — reconnecting…"
        : rtc.status === "ended"
          ? "This meeting has ended."
          : rtc.error || "Unable to connect to Cohiva RTC.";

  return (
    <div className="fixed left-1/2 top-3 z-[800] max-w-[calc(100vw-24px)] -translate-x-1/2 rounded-full bg-[#302B27] px-4 py-2 text-xs font-black text-white shadow-xl">
      {message}
    </div>
  );
};

export default MeetingConnectionStatus;
